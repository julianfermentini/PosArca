package handlers

import (
	"context"
	"fmt"
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
	ID         string                 `json:"id"`
	Tipo       models.TipoComprobante `json:"tipo"`
	Items      []models.ItemRequest   `json:"items"`
	MetodoPago models.MetodoPago      `json:"metodo_pago"`
	CreatedAt  time.Time              `json:"created_at"`
}

type SyncResultado struct {
	ID      string `json:"id"`
	Numero  string `json:"numero,omitempty"`
	CAE     string `json:"cae,omitempty"`
	Error   string `json:"error,omitempty"`
	Success bool   `json:"success"`
}

// SincronizarVentas maneja POST /api/sync/ventas
func (h *SyncHandler) SincronizarVentas(c *gin.Context) {
	var req struct {
		Ventas []VentaOffline `json:"ventas" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	resultados := make([]SyncResultado, len(req.Ventas))

	var wg sync.WaitGroup
	for i, v := range req.Ventas {
		wg.Add(1)
		go func(idx int, venta VentaOffline) {
			defer wg.Done()
			resultados[idx] = h.procesarOffline(ctx, venta)
		}(i, v)
	}
	wg.Wait()

	exitosos := 0
	for _, r := range resultados {
		if r.Success {
			exitosos++
		}
	}

	slog.Info("sync completado", "total", len(req.Ventas), "exitosos", exitosos)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"total":      len(req.Ventas),
			"exitosos":   exitosos,
			"resultados": resultados,
		},
	})
}

func (h *SyncHandler) procesarOffline(ctx context.Context, v VentaOffline) SyncResultado {
	ventaID, err := uuid.Parse(v.ID)
	if err != nil {
		return SyncResultado{ID: v.ID, Error: "UUID inválido", Success: false}
	}

	// Idempotencia — si ya existe, devolver éxito sin reprocesar
	var existente models.Venta
	if h.db.Where("id = ?", ventaID).First(&existente).Error == nil {
		return SyncResultado{ID: v.ID, Numero: existente.Numero, Success: true}
	}

	var numero string
	err = h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		numero, err = siguienteNumero(tx, v.Tipo, h.cfg.ArcaPuntoVenta)
		if err != nil {
			return fmt.Errorf("número: %w", err)
		}

		venta := models.Venta{
			ID:           ventaID,
			Tipo:         v.Tipo,
			Numero:       numero,
			MetodoPago:   v.MetodoPago,
			CreatedAt:    v.CreatedAt,
			Sincronizado: true,
		}
		if err := tx.Create(&venta).Error; err != nil {
			return err
		}

		for i, itemReq := range v.Items {
			item := models.NuevoVentaItem(ventaID, itemReq, i)
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		return SyncResultado{ID: v.ID, Error: err.Error(), Success: false}
	}

	// Calcular totales para CAE
	var items []models.VentaItem
	h.db.Where("venta_id = ?", ventaID).Order("orden ASC").Find(&items)
	_, iva, total := models.TotalesDeItems(items)

	vh := &VentasHandler{db: h.db, cfg: h.cfg}
	caeResult, err := vh.solicitarCAE(ctx, ventaID, iva, total, items, 0, arca.TipoDocConsumidorFinal)
	if err != nil {
		slog.Error("CAE sync", "id", v.ID, "err", err)
		return SyncResultado{ID: v.ID, Error: "CAE: " + err.Error(), Success: false}
	}

	return SyncResultado{ID: v.ID, Numero: numero, CAE: caeResult.CAE, Success: true}
}
