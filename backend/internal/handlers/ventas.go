package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"pos-fiscal/config"
	"pos-fiscal/internal/arca"
	"pos-fiscal/internal/impresora"
	"pos-fiscal/internal/models"
)

type VentasHandler struct {
	db         *gorm.DB
	cfg        *config.Config
	impresora  *impresora.Impresora
}

func NuevoVentasHandler(db *gorm.DB, cfg *config.Config, imp *impresora.Impresora) *VentasHandler {
	return &VentasHandler{db: db, cfg: cfg, impresora: imp}
}

// CrearVentaRequest define el body del POST /api/ventas
type CrearVentaRequest struct {
	Tipo       models.TipoComprobante `json:"tipo" binding:"required,oneof=TICKET FACTURA"`
	Items      []models.ItemVenta     `json:"items" binding:"required,min=1"`
	MetodoPago models.MetodoPago      `json:"metodo_pago" binding:"required,oneof=EFECTIVO TARJETA BILLETERA"`
}

// Crear maneja POST /api/ventas
func (h *VentasHandler) Crear(c *gin.Context) {
	var req CrearVentaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	subtotal, iva, total := models.CalcularTotales(req.Items)

	// Número secuencial — solo el backend lo asigna
	numero, err := h.siguienteNumero(req.Tipo)
	if err != nil {
		slog.Error("asignar número de comprobante", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error asignando número"})
		return
	}

	itemsJSON, err := json.Marshal(req.Items)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error serializando items"})
		return
	}

	venta := models.Venta{
		ID:           uuid.New(),
		Tipo:         req.Tipo,
		Numero:       numero,
		Items:        itemsJSON,
		Subtotal:     subtotal,
		IVA:          iva,
		Total:        total,
		MetodoPago:   req.MetodoPago,
		Sincronizado: false,
	}

	ctx := c.Request.Context()

	// Solicitar CAE a ARCA (tipo B = consumidor final para tickets)
	caeResult, err := h.solicitarCAE(ctx, &venta, 0, arca.TipoDocConsumidorFinal)
	if err != nil {
		slog.Error("solicitar CAE ARCA", "err", err, "numero", numero)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error obteniendo CAE: " + err.Error()})
		return
	}

	if err := h.db.Create(&venta).Error; err != nil {
		slog.Error("guardar venta en DB", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error guardando venta"})
		return
	}

	// Imprimir ticket en background (no bloqueante para la respuesta)
	go h.imprimirTicket(venta, caeResult)

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data": gin.H{
			"id":     venta.ID,
			"numero": numero,
			"cae":    caeResult.CAE,
			"cae_vto": caeResult.FchVto.Format("2006-01-02"),
			"total":  total,
		},
	})
}

// Listar maneja GET /api/ventas
func (h *VentasHandler) Listar(c *gin.Context) {
	var ventas []models.Venta
	query := h.db.Order("created_at desc").Limit(100)

	if fecha := c.Query("fecha"); fecha != "" {
		t, err := time.Parse("2006-01-02", fecha)
		if err == nil {
			query = query.Where("DATE(created_at) = ?", t.Format("2006-01-02"))
		}
	}

	if err := query.Find(&ventas).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": ventas})
}

// siguienteNumero genera el próximo número secuencial en formato "001-XXXXXXXX"
func (h *VentasHandler) siguienteNumero(tipo models.TipoComprobante) (string, error) {
	var count int64
	if err := h.db.Model(&models.Venta{}).
		Where("tipo = ?", tipo).
		Count(&count).Error; err != nil {
		return "", err
	}
	return fmt.Sprintf("%03d-%08d", h.cfg.ArcaPuntoVenta, count+1), nil
}

func (h *VentasHandler) solicitarCAE(ctx context.Context, venta *models.Venta, docNro int64, docTipo int) (*arca.ResultadoCAE, error) {
	cuitInt := parseCUIT(h.cfg.ArcaCUIT)
	token, sign, err := arca.GetToken(ctx, cuitInt, h.cfg.ArcaCertPath, h.cfg.ArcaKeyPath, h.cfg.ArcaEnv)
	if err != nil {
		return nil, err
	}

	tipoCmp := arca.TipoFacturaB
	if docTipo == arca.TipoDocCUIT {
		tipoCmp = arca.TipoFacturaA
	}

	nro, err := siguienteNroAFIP(h.db, tipoCmp, h.cfg.ArcaPuntoVenta)
	if err != nil {
		return nil, err
	}

	params := arca.SolicitarCAEParams{
		CUIT:           cuitInt,
		PuntoVenta:     h.cfg.ArcaPuntoVenta,
		TipoCmp:        tipoCmp,
		NroComprobante: nro,
		Fecha:          time.Now(),
		Subtotal:       venta.Subtotal,
		IVA:            venta.IVA,
		Total:          venta.Total,
		DocTipoRec:     docTipo,
		DocNroRec:      docNro,
	}

	return arca.SolicitarCAE(ctx, params, token, sign, h.cfg.ArcaEnv)
}

func (h *VentasHandler) imprimirTicket(venta models.Venta, cae *arca.ResultadoCAE) {
	var items []impresora.ItemTicket
	var raw []models.ItemVenta
	_ = json.Unmarshal(venta.Items, &raw)
	for _, it := range raw {
		items = append(items, impresora.ItemTicket{
			Descripcion: it.Descripcion,
			PrecioNeto:  it.PrecioNeto,
			Total:       it.Total,
		})
	}

	datos := impresora.DatosTicket{
		RazonSocial: "Bar/Restaurante",
		CUIT:        h.cfg.ArcaCUIT,
		PuntoVenta:  h.cfg.ArcaPuntoVenta,
		TipoCmp:     string(venta.Tipo),
		Numero:      venta.Numero,
		Fecha:       venta.CreatedAt,
		Items:       items,
		Subtotal:    venta.Subtotal,
		IVA:         venta.IVA,
		Total:       venta.Total,
		MetodoPago:  string(venta.MetodoPago),
		CAE:         cae.CAE,
		CAEVto:      cae.FchVto,
		QRBase64:    cae.QRData,
	}

	escpos, err := impresora.GenerarESCPOS(datos)
	if err != nil {
		slog.Error("generar ESC/POS", "err", err)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := h.impresora.Imprimir(ctx, escpos); err != nil {
		slog.Error("imprimir ticket", "err", err, "venta_id", venta.ID)
		return
	}

	h.db.Model(&venta).Update("impreso", true)
}

// parseCUIT convierte el CUIT string a int64
func parseCUIT(cuit string) int64 {
	var result int64
	for _, c := range cuit {
		if c >= '0' && c <= '9' {
			result = result*10 + int64(c-'0')
		}
	}
	return result
}

// siguienteNroAFIP consulta el último número de comprobante de AFIP y devuelve el siguiente
func siguienteNroAFIP(db *gorm.DB, tipoCmp, puntoVenta int) (int64, error) {
	var count int64
	db.Model(&models.Venta{}).Count(&count)
	// En producción, esto debería consultar FECompUltimoAutorizado en WSFE
	return count + 1, nil
}
