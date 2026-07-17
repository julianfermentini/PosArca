package handlers

import (
	"log/slog"
	"net/http"

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
	db       *gorm.DB
	cfg      *config.Config
	imp      *impresora.Impresora
	emailCli *email.Cliente
	worker   *Worker
}

func NuevoFacturasHandler(db *gorm.DB, cfg *config.Config, imp *impresora.Impresora, emailCli *email.Cliente, worker *Worker) *FacturasHandler {
	return &FacturasHandler{db: db, cfg: cfg, imp: imp, emailCli: emailCli, worker: worker}
}

type CrearFacturaRequest struct {
	Items        []models.ItemRequest `json:"items" binding:"required,min=1"`
	MetodoPago   models.MetodoPago    `json:"metodo_pago" binding:"required,oneof=EFECTIVO TARJETA BILLETERA"`
	RazonSocial  string               `json:"razon_social" binding:"required"`
	CUITCliente  string               `json:"cuit_cliente" binding:"required"`
	EmailCliente string               `json:"email_cliente" binding:"required,email"`
}

// Crear maneja POST /api/facturas
func (h *FacturasHandler) Crear(c *gin.Context) {
	var req CrearFacturaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	vh := &VentasHandler{db: h.db, cfg: h.cfg, impresora: h.imp}

	var ventaID uuid.UUID
	var numero string

	err := h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		numero, err = siguienteNumero(tx, models.TipoFactura, h.cfg.ArcaPuntoVenta)
		if err != nil {
			return err
		}

		ventaID = uuid.New()
		venta := models.Venta{
			ID:         ventaID,
			Tipo:       models.TipoFactura,
			Numero:     numero,
			MetodoPago: req.MetodoPago,
		}
		if err := tx.Create(&venta).Error; err != nil {
			return err
		}

		for i, itemReq := range req.Items {
			item := models.NuevoVentaItem(ventaID, itemReq, i)
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	var venta models.Venta
	h.db.Preload("Items", func(db *gorm.DB) *gorm.DB {
		return db.Order("orden ASC")
	}).First(&venta, "id = ?", ventaID)

	_, iva, total := models.TotalesDeItems(venta.Items)

	docNro := parseCUIT(req.CUITCliente)
	docTipo := arca.TipoDocConsumidorFinal
	if docNro > 0 {
		docTipo = arca.TipoDocCUIT
	}

	caeResult, err := vh.solicitarCAE(ctx, ventaID, iva, total, venta.Items, docNro, docTipo)
	if err != nil {
		slog.Error("CAE factura", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error CAE: " + err.Error()})
		return
	}

	factura := models.Factura{
		ID:           uuid.New(),
		VentaID:      ventaID,
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

	// Persistir CAE/QR en la venta y encolar impresión + email como tareas, en vez
	// de dispararlas en una goroutine suelta que se pierde si el proceso se reinicia.
	if err := h.worker.PersistirCAEYEncolar(ventaID, caeResult, models.TareaImprimir, models.TareaEmailFactura); err != nil {
		slog.Error("factura creada pero no se pudieron encolar sus tareas", "err", err, "venta_id", ventaID)
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data": gin.H{
			"id":            factura.ID,
			"venta_id":      ventaID,
			"numero":        numero,
			"cae":           caeResult.CAE,
			"cae_vto":       caeResult.FchVto.Format("2006-01-02"),
			"total":         total,
			"email_enviado": false,
		},
	})
}

// Listar maneja GET /api/facturas
func (h *FacturasHandler) Listar(c *gin.Context) {
	var facturas []models.Factura
	if err := h.db.Preload("Venta.Items", func(db *gorm.DB) *gorm.DB {
		return db.Order("orden ASC")
	}).Order("created_at desc").Limit(100).Find(&facturas).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": facturas})
}
