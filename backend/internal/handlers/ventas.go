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
	"pos-fiscal/internal/models"
)

type VentasHandler struct {
	db     *gorm.DB
	cfg    *config.Config
	worker *Worker
}

func NuevoVentasHandler(db *gorm.DB, cfg *config.Config, worker *Worker) *VentasHandler {
	return &VentasHandler{db: db, cfg: cfg, worker: worker}
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

		// La tarea de CAE se encola en la misma transacción: si el proceso se cae
		// justo después, la venta nunca queda sin nadie que le consiga el CAE.
		return encolarTarea(tx, ventaID, models.TareaObtenerCAE)
	})

	if err != nil {
		slog.Error("crear venta", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	var venta models.Venta
	h.db.Preload("Items", func(db *gorm.DB) *gorm.DB {
		return db.Order("orden ASC")
	}).First(&venta, "id = ?", ventaID)
	_, _, total := models.TotalesDeItems(venta.Items)

	// Intento inmediato: si ARCA responde (caso normal), el ticket sale fiscal al
	// toque; si está caído, la venta queda registrada y el worker reintenta —
	// el frontend imprime un ticket no fiscal mientras tanto.
	cae, caeErr := h.worker.obtenerCAE(ctx, ventaID)
	go h.worker.procesarPendientes(context.Background())

	data := gin.H{"id": ventaID, "numero": numero, "total": total}
	if caeErr != nil || cae == nil {
		slog.Warn("venta sin CAE — ARCA no disponible, pendiente de reintento", "venta_id", ventaID, "err", caeErr)
		data["pendiente_cae"] = true
	} else {
		// numero acá se reemplaza por el número real que autorizó ARCA — el que
		// realmente hay que imprimir/mostrar, no el contador local provisorio.
		data["pendiente_cae"] = false
		data["numero"] = fmt.Sprintf("%03d-%08d", h.cfg.ArcaPuntoVenta, cae.NroCmp)
		data["cae"] = cae.CAE
		data["cae_vto"] = cae.FchVto.Format("2006-01-02")
		data["qr_data"] = cae.QRData
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": data})
}

// DiasConVentas maneja GET /api/ventas/dias?mes=YYYY-MM
func (h *VentasHandler) DiasConVentas(c *gin.Context) {
	inicioMes, err := time.Parse("2006-01", c.Query("mes"))
	if err != nil {
		now := time.Now()
		inicioMes = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	}
	finMes := inicioMes.AddDate(0, 1, 0)

	var fechas []string
	// El rango en el WHERE puede usar el índice de created_at; TO_CHAR solo se usa
	// para formatear la salida, no para filtrar.
	h.db.Raw(
		`SELECT DISTINCT TO_CHAR(created_at, 'YYYY-MM-DD') AS fecha
		 FROM ventas
		 WHERE created_at >= ? AND created_at < ?
		 ORDER BY fecha ASC`,
		inicioMes, finMes,
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
			inicio, fin := rangoDelDia(t)
			query = query.Where("created_at >= ? AND created_at < ?", inicio, fin)
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

func parseCUIT(cuit string) int64 {
	var result int64
	for _, c := range cuit {
		if c >= '0' && c <= '9' {
			result = result*10 + int64(c-'0')
		}
	}
	return result
}

