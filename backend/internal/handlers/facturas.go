package handlers

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"pos-fiscal/config"
	"pos-fiscal/internal/arca"
	"pos-fiscal/internal/email"
	"pos-fiscal/internal/impresora"
	"pos-fiscal/internal/models"
)

type FacturasHandler struct {
	db        *gorm.DB
	cfg       *config.Config
	imp       *impresora.Impresora
	emailCli  *email.Cliente
}

func NuevoFacturasHandler(db *gorm.DB, cfg *config.Config, imp *impresora.Impresora, emailCli *email.Cliente) *FacturasHandler {
	return &FacturasHandler{db: db, cfg: cfg, imp: imp, emailCli: emailCli}
}

type CrearFacturaRequest struct {
	Items        []models.ItemVenta `json:"items" binding:"required,min=1"`
	MetodoPago   models.MetodoPago  `json:"metodo_pago" binding:"required,oneof=EFECTIVO TARJETA BILLETERA"`
	RazonSocial  string             `json:"razon_social" binding:"required"`
	CUITCliente  string             `json:"cuit_cliente" binding:"required"`
	EmailCliente string             `json:"email_cliente" binding:"required,email"`
}

// Crear maneja POST /api/facturas
func (h *FacturasHandler) Crear(c *gin.Context) {
	var req CrearFacturaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	subtotal, iva, total := models.CalcularTotales(req.Items)

	ventaHandler := &VentasHandler{db: h.db, cfg: h.cfg, impresora: h.imp}
	numero, err := ventaHandler.siguienteNumero(models.TipoFactura)
	if err != nil {
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
		Tipo:         models.TipoFactura,
		Numero:       numero,
		Items:        itemsJSON,
		Subtotal:     subtotal,
		IVA:          iva,
		Total:        total,
		MetodoPago:   req.MetodoPago,
		Sincronizado: false,
	}

	ctx := c.Request.Context()

	// Tipo A si tiene CUIT válido
	docNro := parseCUIT(req.CUITCliente)
	docTipo := arca.TipoDocConsumidorFinal
	tipoCmp := arca.TipoFacturaB
	if docNro > 0 {
		docTipo = arca.TipoDocCUIT
		tipoCmp = arca.TipoFacturaA
	}
	_ = tipoCmp

	caeResult, err := ventaHandler.solicitarCAE(ctx, &venta, docNro, docTipo)
	if err != nil {
		slog.Error("solicitar CAE para factura", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error obteniendo CAE: " + err.Error()})
		return
	}

	if err := h.db.Create(&venta).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error guardando venta"})
		return
	}

	factura := models.Factura{
		ID:           uuid.New(),
		VentaID:      venta.ID,
		RazonSocial:  req.RazonSocial,
		CUITCliente:  req.CUITCliente,
		EmailCliente: req.EmailCliente,
		CAE:          caeResult.CAE,
		Estado:       models.EstadoAutorizado,
	}
	fchVto := caeResult.FchVto
	factura.CAEVto = &fchVto

	if err := h.db.Create(&factura).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error guardando factura"})
		return
	}

	// Imprimir y enviar email en background
	go h.procesarFacturaBackground(venta, factura, caeResult, req.RazonSocial)

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data": gin.H{
			"id":            factura.ID,
			"venta_id":      venta.ID,
			"numero":        numero,
			"cae":           caeResult.CAE,
			"cae_vto":       caeResult.FchVto.Format("2006-01-02"),
			"total":         total,
			"email_enviado": false, // se envía en background
		},
	})
}

// Listar maneja GET /api/facturas
func (h *FacturasHandler) Listar(c *gin.Context) {
	var facturas []models.Factura
	if err := h.db.Preload("Venta").Order("created_at desc").Limit(100).Find(&facturas).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": facturas})
}

func (h *FacturasHandler) procesarFacturaBackground(venta models.Venta, factura models.Factura, cae *arca.ResultadoCAE, razonSocial string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Imprimir
	ventaHandler := &VentasHandler{db: h.db, cfg: h.cfg, impresora: h.imp}
	ventaHandler.imprimirTicket(venta, cae)

	// Enviar email
	datosEmail := email.DatosFactura{
		RazonSocial: razonSocial,
		CUIT:        factura.CUITCliente,
		Numero:      venta.Numero,
		Total:       venta.Total,
		CAE:         factura.CAE,
	}

	if err := h.emailCli.EnviarFactura(ctx, factura.EmailCliente, datosEmail); err != nil {
		slog.Error("enviar email factura", "err", err, "email", factura.EmailCliente)
		return
	}

	h.db.Model(&factura).Update("email_enviado", true)
	slog.Info("factura procesada", "numero", venta.Numero, "email", factura.EmailCliente)
}
