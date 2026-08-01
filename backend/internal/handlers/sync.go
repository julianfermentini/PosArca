package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"pos-fiscal/internal/models"
)

type SyncHandler struct {
	db     *gorm.DB
	worker *Worker
}

func NuevoSyncHandler(db *gorm.DB, worker *Worker) *SyncHandler {
	return &SyncHandler{db: db, worker: worker}
}

type VentaOffline struct {
	ID             string                 `json:"id"`
	Tipo           models.TipoComprobante `json:"tipo"`
	Items          []models.ItemRequest   `json:"items"`
	MontoEfectivo  float64                `json:"monto_efectivo"`
	MontoTarjeta   float64                `json:"monto_tarjeta"`
	MontoBilletera float64                `json:"monto_billetera"`
	CreatedAt      time.Time              `json:"created_at"`
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

	empresaID := getEmpresaID(c)
	empresa, err := loadEmpresa(h.db, empresaID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "empresa no encontrada"})
		return
	}

	ctx := c.Request.Context()

	ventas := append([]VentaOffline(nil), req.Ventas...)
	sort.Slice(ventas, func(i, j int) bool { return ventas[i].CreatedAt.Before(ventas[j].CreatedAt) })

	resultados := make([]SyncResultado, len(ventas))
	for i, v := range ventas {
		resultados[i] = h.procesarOffline(ctx, v, empresaID, empresa.PuntoVenta)
	}

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

func (h *SyncHandler) procesarOffline(ctx context.Context, v VentaOffline, empresaID uuid.UUID, puntoVenta int) SyncResultado {
	ventaID, err := uuid.Parse(v.ID)
	if err != nil {
		return SyncResultado{ID: v.ID, Error: "UUID inválido", Success: false}
	}

	var existente models.Venta
	yaExiste := h.db.Where("id = ?", ventaID).First(&existente).Error == nil

	if yaExiste {
		if existente.CAE != "" {
			return SyncResultado{ID: v.ID, Numero: existente.Numero, CAE: existente.CAE, Success: true}
		}
		return h.solicitarCAEYResultado(ctx, existente)
	}

	var numero string
	err = h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		numero, err = siguienteNumero(tx, v.Tipo, empresaID, puntoVenta)
		if err != nil {
			return fmt.Errorf("número: %w", err)
		}

		venta := models.Venta{
			ID:             ventaID,
			EmpresaID:      empresaID,
			Tipo:           v.Tipo,
			Numero:         numero,
			MontoEfectivo:  v.MontoEfectivo,
			MontoTarjeta:   v.MontoTarjeta,
			MontoBilletera: v.MontoBilletera,
			CreatedAt:      v.CreatedAt,
			Sincronizado:   true,
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

	return h.solicitarCAEYResultado(ctx, models.Venta{ID: ventaID, Numero: numero})
}

func (h *SyncHandler) solicitarCAEYResultado(ctx context.Context, venta models.Venta) SyncResultado {
	cae, err := h.worker.obtenerCAE(ctx, venta.ID)
	if err != nil {
		slog.Error("CAE sync", "id", venta.ID, "err", err)
		return SyncResultado{ID: venta.ID.String(), Numero: venta.Numero, Error: "CAE: " + err.Error(), Success: false}
	}

	go h.worker.procesarPendientes(context.Background())
	return SyncResultado{ID: venta.ID.String(), Numero: venta.Numero, CAE: cae.CAE, Success: true}
}
