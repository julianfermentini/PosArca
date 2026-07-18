package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"pos-fiscal/internal/models"
)

type PendientesHandler struct {
	db     *gorm.DB
	worker *Worker
}

func NuevoPendientesHandler(db *gorm.DB, worker *Worker) *PendientesHandler {
	return &PendientesHandler{db: db, worker: worker}
}

type ventaPendienteCAE struct {
	VentaID      uuid.UUID              `json:"venta_id"`
	Tipo         models.TipoComprobante `json:"tipo"`
	Numero       string                 `json:"numero"`
	CreatedAt    time.Time              `json:"created_at"`
	Total        float64                `json:"total"`
	Intentos     int                    `json:"intentos"`
	Estado       models.EstadoTarea     `json:"estado"`
	UltimoError  string                 `json:"ultimo_error,omitempty"`
	RazonSocial  string                 `json:"razon_social,omitempty"`
	CUITCliente  string                 `json:"cuit_cliente,omitempty"`
	EmailCliente string                 `json:"email_cliente,omitempty"`
}

// Listar maneja GET /api/pendientes-cae — ventas/facturas que todavía no
// consiguieron CAE: esperando a ARCA, esperando su turno (orden estricto), o
// trabadas de verdad y necesitando que alguien las anule o corrija.
func (h *PendientesHandler) Listar(c *gin.Context) {
	var tareas []models.TareaPendiente
	if err := h.db.Where("tipo = ? AND estado IN ?", models.TareaObtenerCAE,
		[]models.EstadoTarea{models.TareaEstadoPendiente, models.TareaEstadoError}).
		Order("created_at ASC").
		Find(&tareas).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	resultado := make([]ventaPendienteCAE, 0, len(tareas))
	for _, t := range tareas {
		var venta models.Venta
		if err := h.db.Preload("Items").First(&venta, "id = ?", t.VentaID).Error; err != nil {
			continue
		}
		_, _, total := models.TotalesDeItems(venta.Items)
		item := ventaPendienteCAE{
			VentaID:     venta.ID,
			Tipo:        venta.Tipo,
			Numero:      venta.Numero,
			CreatedAt:   venta.CreatedAt,
			Total:       total,
			Intentos:    t.Intentos,
			Estado:      t.Estado,
			UltimoError: t.UltimoError,
		}
		if venta.Tipo == models.TipoFactura {
			var factura models.Factura
			if h.db.First(&factura, "venta_id = ?", venta.ID).Error == nil {
				item.RazonSocial = factura.RazonSocial
				item.CUITCliente = factura.CUITCliente
				item.EmailCliente = factura.EmailCliente
			}
		}
		resultado = append(resultado, item)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": resultado})
}

type anularCAERequest struct {
	Motivo string `json:"motivo"`
}

// Anular maneja POST /api/pendientes-cae/:id/anular
func (h *PendientesHandler) Anular(c *gin.Context) {
	ventaID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id inválido"})
		return
	}
	var req anularCAERequest
	_ = c.ShouldBindJSON(&req) // motivo es opcional, no hace falta rechazar el body vacío

	if err := h.worker.AnularCAE(ventaID, req.Motivo); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

type corregirFacturaRequest struct {
	RazonSocial  string `json:"razon_social" binding:"required"`
	CUITCliente  string `json:"cuit_cliente" binding:"required"`
	EmailCliente string `json:"email_cliente" binding:"required,email"`
}

// Corregir maneja PUT /api/pendientes-cae/:id/corregir — solo para facturas.
func (h *PendientesHandler) Corregir(c *gin.Context) {
	ventaID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id inválido"})
		return
	}
	var req corregirFacturaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	if err := h.worker.CorregirYReintentarFactura(ventaID, req.RazonSocial, req.CUITCliente, req.EmailCliente); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
