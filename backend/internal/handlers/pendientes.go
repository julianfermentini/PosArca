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

// Listar maneja GET /api/pendientes-cae
func (h *PendientesHandler) Listar(c *gin.Context) {
	empresaID := getEmpresaID(c)

	var tareas []models.TareaPendiente
	if err := h.db.Where("empresa_id = ? AND tipo = ? AND estado IN ?", empresaID, models.TareaObtenerCAE,
		[]models.EstadoTarea{models.TareaEstadoPendiente, models.TareaEstadoError}).
		Order("created_at ASC").
		Find(&tareas).Error; err != nil {
		internalError(c, err)
		return
	}

	if len(tareas) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []ventaPendienteCAE{}})
		return
	}

	ventaIDs := make([]uuid.UUID, len(tareas))
	for i, t := range tareas {
		ventaIDs[i] = t.VentaID
	}
	var ventas []models.Venta
	if err := h.db.Preload("Items").Where("id IN ?", ventaIDs).Find(&ventas).Error; err != nil {
		internalError(c, err)
		return
	}
	var facturas []models.Factura
	h.db.Where("venta_id IN ?", ventaIDs).Find(&facturas)

	ventaByID := make(map[uuid.UUID]models.Venta, len(ventas))
	facturaByID := make(map[uuid.UUID]models.Factura, len(facturas))
	for _, v := range ventas {
		ventaByID[v.ID] = v
	}
	for _, f := range facturas {
		facturaByID[f.VentaID] = f
	}

	resultado := make([]ventaPendienteCAE, 0, len(tareas))
	for _, t := range tareas {
		venta, ok := ventaByID[t.VentaID]
		if !ok {
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
		if f, ok := facturaByID[venta.ID]; ok {
			item.RazonSocial = f.RazonSocial
			item.CUITCliente = f.CUITCliente
			item.EmailCliente = f.EmailCliente
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
	_ = c.ShouldBindJSON(&req)

	if err := h.worker.AnularCAE(ventaID, getEmpresaID(c), req.Motivo); err != nil {
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

// Corregir maneja PUT /api/pendientes-cae/:id/corregir
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
	if err := h.worker.CorregirYReintentarFactura(ventaID, getEmpresaID(c), req.RazonSocial, req.CUITCliente, req.EmailCliente); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
