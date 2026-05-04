package handlers

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"pos-fiscal/config"
	"pos-fiscal/internal/arca"
	"pos-fiscal/internal/models"
)

type SyncHandler struct {
	db  *gorm.DB
	cfg *config.Config
}

func NuevoSyncHandler(db *gorm.DB, cfg *config.Config) *SyncHandler {
	return &SyncHandler{db: db, cfg: cfg}
}

type VentaOffline struct {
	ID          string             `json:"id"`
	Tipo        models.TipoComprobante `json:"tipo"`
	Items       []models.ItemVenta `json:"items"`
	MetodoPago  models.MetodoPago  `json:"metodo_pago"`
	CreatedAt   time.Time          `json:"created_at"`
}

type SyncRequest struct {
	Ventas []VentaOffline `json:"ventas" binding:"required"`
}

type SyncResultado struct {
	ID      string `json:"id"`
	Numero  string `json:"numero,omitempty"`
	CAE     string `json:"cae,omitempty"`
	Error   string `json:"error,omitempty"`
	Success bool   `json:"success"`
}

// SincronizarVentas maneja POST /api/sync/ventas
// Procesa ventas offline en paralelo con goroutines.
func (h *SyncHandler) SincronizarVentas(c *gin.Context) {
	var req SyncRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	resultados := make([]SyncResultado, len(req.Ventas))

	var wg sync.WaitGroup
	for i, vOffline := range req.Ventas {
		wg.Add(1)
		go func(idx int, v VentaOffline) {
			defer wg.Done()
			resultados[idx] = h.procesarVentaOffline(ctx, v)
		}(i, vOffline)
	}
	wg.Wait()

	exitosos := 0
	for _, r := range resultados {
		if r.Success {
			exitosos++
		}
	}

	slog.Info("sincronización completada", "total", len(req.Ventas), "exitosos", exitosos)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"total":     len(req.Ventas),
			"exitosos":  exitosos,
			"resultados": resultados,
		},
	})
}

func (h *SyncHandler) procesarVentaOffline(ctx context.Context, v VentaOffline) SyncResultado {
	// Verificar si ya fue procesada (idempotencia por UUID)
	ventaID, err := uuid.Parse(v.ID)
	if err != nil {
		return SyncResultado{ID: v.ID, Error: "UUID inválido", Success: false}
	}

	var existente models.Venta
	if err := h.db.Where("id = ?", ventaID).First(&existente).Error; err == nil {
		// Ya procesada — devolver éxito sin reprocesar
		return SyncResultado{ID: v.ID, Numero: existente.Numero, Success: true}
	}

	subtotal, iva, total := models.CalcularTotales(v.Items)

	ventaHandler := &VentasHandler{db: h.db, cfg: h.cfg}
	numero, err := ventaHandler.siguienteNumero(v.Tipo)
	if err != nil {
		return SyncResultado{ID: v.ID, Error: "error asignando número: " + err.Error(), Success: false}
	}

	itemsJSON, _ := json.Marshal(v.Items)
	venta := models.Venta{
		ID:           ventaID,
		Tipo:         v.Tipo,
		Numero:       numero,
		Items:        itemsJSON,
		Subtotal:     subtotal,
		IVA:          iva,
		Total:        total,
		MetodoPago:   v.MetodoPago,
		CreatedAt:    v.CreatedAt,
		Sincronizado: true,
	}

	caeResult, err := ventaHandler.solicitarCAE(ctx, &venta, 0, arca.TipoDocConsumidorFinal)
	if err != nil {
		slog.Error("CAE en sync offline", "id", v.ID, "err", err)
		return SyncResultado{ID: v.ID, Error: "error CAE: " + err.Error(), Success: false}
	}

	if err := h.db.Create(&venta).Error; err != nil {
		return SyncResultado{ID: v.ID, Error: "error DB: " + err.Error(), Success: false}
	}

	return SyncResultado{ID: v.ID, Numero: numero, CAE: caeResult.CAE, Success: true}
}
