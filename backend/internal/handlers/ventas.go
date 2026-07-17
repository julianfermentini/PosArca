package handlers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"pos-fiscal/config"
	"pos-fiscal/internal/arca"
	"pos-fiscal/internal/impresora"
	"pos-fiscal/internal/models"
)

type VentasHandler struct {
	db        *gorm.DB
	cfg       *config.Config
	impresora *impresora.Impresora
}

func NuevoVentasHandler(db *gorm.DB, cfg *config.Config, imp *impresora.Impresora) *VentasHandler {
	return &VentasHandler{db: db, cfg: cfg, impresora: imp}
}

type CrearVentaRequest struct {
	Tipo       models.TipoComprobante `json:"tipo" binding:"required,oneof=TICKET FACTURA"`
	Items      []models.ItemRequest   `json:"items" binding:"required,min=1"`
	MetodoPago models.MetodoPago      `json:"metodo_pago" binding:"required,oneof=EFECTIVO TARJETA BILLETERA"`
}

// Crear maneja POST /api/ventas
func (h *VentasHandler) Crear(c *gin.Context) {
	var req CrearVentaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	ctx := c.Request.Context()

	var ventaID uuid.UUID
	var numero string

	err := h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		numero, err = siguienteNumero(tx, req.Tipo, h.cfg.ArcaPuntoVenta)
		if err != nil {
			return fmt.Errorf("asignar número: %w", err)
		}

		ventaID = uuid.New()
		venta := models.Venta{
			ID:           ventaID,
			Tipo:         req.Tipo,
			Numero:       numero,
			MetodoPago:   req.MetodoPago,
			Sincronizado: false,
		}

		if err := tx.Create(&venta).Error; err != nil {
			return fmt.Errorf("crear venta: %w", err)
		}

		for i, itemReq := range req.Items {
			item := models.NuevoVentaItem(ventaID, itemReq, i)
			if err := tx.Create(&item).Error; err != nil {
				return fmt.Errorf("crear item %d: %w", i, err)
			}
		}

		return nil
	})

	if err != nil {
		slog.Error("crear venta", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	// Cargar venta con ítems para el ticket
	var venta models.Venta
	h.db.Preload("Items", func(db *gorm.DB) *gorm.DB {
		return db.Order("orden ASC")
	}).First(&venta, "id = ?", ventaID)

	_, iva, total := models.TotalesDeItems(venta.Items)

	caeResult, err := h.solicitarCAE(ctx, ventaID, iva, total, venta.Items, 0, arca.TipoDocConsumidorFinal)
	if err != nil {
		slog.Error("solicitar CAE ARCA", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error obteniendo CAE: " + err.Error()})
		return
	}

	// Persistir CAE para permitir reimpresión posterior
	caeVto := caeResult.FchVto
	h.db.Model(&models.Venta{}).Where("id = ?", ventaID).Updates(map[string]interface{}{
		"cae":     caeResult.CAE,
		"cae_vto": &caeVto,
	})

	go h.imprimirTicket(venta, caeResult)

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data": gin.H{
			"id":      ventaID,
			"numero":  numero,
			"cae":     caeResult.CAE,
			"cae_vto": caeResult.FchVto.Format("2006-01-02"),
			"total":   total,
		},
	})
}

// DiasConVentas maneja GET /api/ventas/dias?mes=YYYY-MM
func (h *VentasHandler) DiasConVentas(c *gin.Context) {
	mes := c.Query("mes")
	if _, err := time.Parse("2006-01", mes); err != nil {
		mes = time.Now().Format("2006-01")
	}
	var fechas []string
	h.db.Raw(
		`SELECT DISTINCT TO_CHAR(created_at, 'YYYY-MM-DD') AS fecha
		 FROM ventas
		 WHERE TO_CHAR(created_at, 'YYYY-MM') = ?
		 ORDER BY fecha ASC`,
		mes,
	).Scan(&fechas)
	if fechas == nil {
		fechas = []string{}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": fechas})
}

// Listar maneja GET /api/ventas
func (h *VentasHandler) Listar(c *gin.Context) {
	var ventas []models.Venta
	query := h.db.Preload("Items", func(db *gorm.DB) *gorm.DB {
		return db.Order("orden ASC")
	}).Order("created_at desc").Limit(100)

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

// siguienteNumero genera el próximo número secuencial de forma atómica.
// Usa un lock de fila (SELECT ... FOR UPDATE) sobre el contador de (tipo, punto_venta)
// para que transacciones concurrentes (p. ej. varias ventas de /sync/ventas en paralelo)
// no puedan calcular el mismo número — a diferencia de un COUNT(*), que no serializa nada.
func siguienteNumero(tx *gorm.DB, tipo models.TipoComprobante, puntoVenta int) (string, error) {
	contador, err := contadorConLock(tx, tipo, puntoVenta)
	if err != nil {
		return "", err
	}

	contador.Ultimo++
	if err := tx.Save(contador).Error; err != nil {
		return "", err
	}

	return fmt.Sprintf("%03d-%08d", puntoVenta, contador.Ultimo), nil
}

// contadorConLock trae (bajo SELECT ... FOR UPDATE) la fila que lleva la cuenta de
// números emitidos para (tipo, punto_venta), creándola si es la primera vez.
// Al crearla, arranca desde el conteo actual de ventas para no chocar con
// numeración ya emitida bajo el esquema anterior (COUNT(*) sin contador propio).
func contadorConLock(tx *gorm.DB, tipo models.TipoComprobante, puntoVenta int) (*models.ComprobanteContador, error) {
	var contador models.ComprobanteContador
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("tipo = ? AND punto_venta = ?", tipo, puntoVenta).
		First(&contador).Error

	if err == nil {
		return &contador, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	var existentes int64
	if err := tx.Model(&models.Venta{}).Where("tipo = ?", tipo).Count(&existentes).Error; err != nil {
		return nil, err
	}
	contador = models.ComprobanteContador{Tipo: tipo, PuntoVenta: puntoVenta, Ultimo: existentes}
	if err := tx.Create(&contador).Error; err != nil {
		return nil, err
	}
	return &contador, nil
}

func (h *VentasHandler) solicitarCAE(
	ctx context.Context,
	ventaID uuid.UUID,
	iva, total float64,
	items []models.VentaItem,
	docNro int64,
	docTipo int,
) (*arca.ResultadoCAE, error) {
	cuitInt := parseCUIT(h.cfg.ArcaCUIT)
	token, sign, err := arca.GetToken(ctx, cuitInt, h.cfg.ArcaCertPath, h.cfg.ArcaKeyPath, h.cfg.ArcaEnv)
	if err != nil {
		return nil, err
	}

	tipoCmp := arca.TipoFacturaB
	condIVA := 5 // Consumidor Final
	if docTipo == arca.TipoDocCUIT {
		tipoCmp = arca.TipoFacturaA
		condIVA = 1 // IVA Responsable Inscripto
	}

	subtotal := total - iva

	params := arca.SolicitarCAEParams{
		CUIT:                   cuitInt,
		PuntoVenta:             h.cfg.ArcaPuntoVenta,
		TipoCmp:                tipoCmp,
		Fecha:                  time.Now(),
		Subtotal:               subtotal,
		IVA:                    iva,
		Total:                  total,
		DocTipoRec:             docTipo,
		DocNroRec:              docNro,
		CondicionIVAReceptorId: condIVA,
	}

	return arca.SolicitarCAE(ctx, params, token, sign, h.cfg.ArcaEnv)
}

func (h *VentasHandler) imprimirTicket(venta models.Venta, cae *arca.ResultadoCAE) {
	// En producción con tablet Android la impresión la maneja el frontend vía WebUSB/WebBluetooth.
	// Esta función solo imprime si hay un puerto serial configurado (despliegue Linux/Raspberry Pi).
	if !h.impresora.EstaConfigurada() {
		return
	}

	var ticketItems []impresora.ItemTicket
	for _, it := range venta.Items {
		ticketItems = append(ticketItems, impresora.ItemTicket{
			Descripcion: it.Descripcion,
			PrecioNeto:  it.PrecioNeto,
			Total:       it.Total,
		})
	}

	subtotal, iva, total := models.TotalesDeItems(venta.Items)
	emp := getEmpresaConf(h.db, h.cfg)

	datos := impresora.DatosTicket{
		RazonSocial: emp.RazonSocial,
		CUIT:        h.cfg.ArcaCUIT,
		PuntoVenta:  h.cfg.ArcaPuntoVenta,
		TipoCmp:     string(venta.Tipo),
		Numero:      venta.Numero,
		Fecha:       venta.CreatedAt,
		Items:       ticketItems,
		Subtotal:    subtotal,
		IVA:         iva,
		Total:       total,
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

func parseCUIT(cuit string) int64 {
	var result int64
	for _, c := range cuit {
		if c >= '0' && c <= '9' {
			result = result*10 + int64(c-'0')
		}
	}
	return result
}

