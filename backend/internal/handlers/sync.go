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
	db     *gorm.DB
	cfg    *config.Config
	worker *Worker
}

func NuevoSyncHandler(db *gorm.DB, cfg *config.Config, worker *Worker) *SyncHandler {
	return &SyncHandler{db: db, cfg: cfg, worker: worker}
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

	// Idempotencia real: si la venta ya existe pero se quedó sin CAE (ARCA falló
	// en un intento anterior, después de crearla), hay que reintentar el CAE — no
	// alcanza con que la fila exista para considerarla sincronizada.
	var existente models.Venta
	yaExiste := h.db.Preload("Items", func(d *gorm.DB) *gorm.DB {
		return d.Order("orden ASC")
	}).Where("id = ?", ventaID).First(&existente).Error == nil

	if yaExiste {
		if existente.CAE != "" {
			return SyncResultado{ID: v.ID, Numero: existente.Numero, CAE: existente.CAE, Success: true}
		}
		return h.solicitarCAEYResultado(ctx, existente)
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

	var venta models.Venta
	h.db.Preload("Items", func(d *gorm.DB) *gorm.DB {
		return d.Order("orden ASC")
	}).First(&venta, "id = ?", ventaID)

	return h.solicitarCAEYResultado(ctx, venta)
}

// solicitarCAEYResultado pide el CAE para una venta ya persistida — recién creada
// o de un reintento — y, si lo consigue, lo persiste junto con la tarea de
// impresión. No pide número nuevo ni recrea nada: eso ya pasó antes de llamarla.
func (h *SyncHandler) solicitarCAEYResultado(ctx context.Context, venta models.Venta) SyncResultado {
	_, iva, total := models.TotalesDeItems(venta.Items)

	vh := &VentasHandler{db: h.db, cfg: h.cfg}
	caeResult, err := vh.solicitarCAE(ctx, venta.ID, iva, total, venta.Items, 0, arca.TipoDocConsumidorFinal)
	if err != nil {
		slog.Error("CAE sync", "id", venta.ID, "err", err)
		return SyncResultado{ID: venta.ID.String(), Numero: venta.Numero, Error: "CAE: " + err.Error(), Success: false}
	}

	if err := h.worker.PersistirCAEYEncolar(venta.ID, caeResult, models.TareaImprimir); err != nil {
		slog.Error("sync: no se pudo encolar impresión", "id", venta.ID, "err", err)
	}

	return SyncResultado{ID: venta.ID.String(), Numero: venta.Numero, CAE: caeResult.CAE, Success: true}
}
