package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"pos-fiscal/config"
	"pos-fiscal/internal/models"
)

type FacturasHandler struct {
	db     *gorm.DB
	cfg    *config.Config
	worker *Worker
}

func NuevoFacturasHandler(db *gorm.DB, cfg *config.Config, worker *Worker) *FacturasHandler {
	return &FacturasHandler{db: db, cfg: cfg, worker: worker}
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

	var ventaID, facturaID uuid.UUID
	var numero string

	err := h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		numero, err = siguienteNumero(tx, models.TipoFactura, h.cfg.ArcaPuntoVenta)
		if err != nil {
			return err
		}

		ventaID = uuid.New()
		if err := tx.Create(&models.Venta{
			ID:         ventaID,
			Tipo:       models.TipoFactura,
			Numero:     numero,
			MetodoPago: req.MetodoPago,
		}).Error; err != nil {
			return err
		}

		for i, itemReq := range req.Items {
			item := models.NuevoVentaItem(ventaID, itemReq, i)
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
		}

		// La factura se crea PENDIENTE con los datos del cliente ya guardados, para
		// no perderlos si ARCA está caído; el CAE se completa cuando se autoriza.
		facturaID = uuid.New()
		if err := tx.Create(&models.Factura{
			ID:           facturaID,
			VentaID:      ventaID,
			RazonSocial:  req.RazonSocial,
			CUITCliente:  req.CUITCliente,
			EmailCliente: req.EmailCliente,
			Estado:       models.EstadoPendiente,
		}).Error; err != nil {
			return err
		}

		return encolarTarea(tx, ventaID, models.TareaObtenerCAE)
	})

	if err != nil {
		slog.Error("crear factura", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	var venta models.Venta
	h.db.Preload("Items", func(db *gorm.DB) *gorm.DB {
		return db.Order("orden ASC")
	}).First(&venta, "id = ?", ventaID)
	_, _, total := models.TotalesDeItems(venta.Items)

	// Intento inmediato del CAE (mismo criterio que el ticket): si ARCA está caído,
	// la factura queda registrada y pendiente, y el worker reintenta hasta autorizar
	// y mandar el email; el frontend imprime un comprobante no fiscal mientras tanto.
	cae, caeErr := h.worker.obtenerCAE(ctx, ventaID)
	go h.worker.procesarPendientes(context.Background())

	data := gin.H{"id": facturaID, "venta_id": ventaID, "numero": numero, "total": total, "email_enviado": false}
	if caeErr != nil || cae == nil {
		slog.Warn("factura sin CAE — ARCA no disponible, pendiente de reintento", "venta_id", ventaID, "err", caeErr)
		data["pendiente_cae"] = true
	} else {
		data["pendiente_cae"] = false
		data["numero"] = fmt.Sprintf("%03d-%08d", h.cfg.ArcaPuntoVenta, cae.NroCmp)
		data["cae"] = cae.CAE
		data["cae_vto"] = cae.FchVto.Format("2006-01-02")
		data["qr_data"] = cae.QRData
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": data})
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
