package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"pos-fiscal/internal/models"
)

type VentasHandler struct {
	db     *gorm.DB
	worker *Worker
}

func NuevoVentasHandler(db *gorm.DB, worker *Worker) *VentasHandler {
	return &VentasHandler{db: db, worker: worker}
}

type CrearVentaRequest struct {
	Tipo           models.TipoComprobante `json:"tipo" binding:"required,oneof=TICKET FACTURA"`
	Items          []models.ItemRequest   `json:"items" binding:"required,min=1"`
	MontoEfectivo  float64                `json:"monto_efectivo"`
	MontoTarjeta   float64                `json:"monto_tarjeta"`
	MontoBilletera float64                `json:"monto_billetera"`
}

// Crear maneja POST /api/ventas
func (h *VentasHandler) Crear(c *gin.Context) {
	var req CrearVentaRequest
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

	var ventaID uuid.UUID
	var numero string

	err = h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		numero, err = siguienteNumero(tx, req.Tipo, empresaID, empresa.PuntoVenta)
		if err != nil {
			return fmt.Errorf("asignar número: %w", err)
		}

		ventaID = uuid.New()
		venta := models.Venta{
			ID:             ventaID,
			EmpresaID:      empresaID,
			Tipo:           req.Tipo,
			Numero:         numero,
			MontoEfectivo:  req.MontoEfectivo,
			MontoTarjeta:   req.MontoTarjeta,
			MontoBilletera: req.MontoBilletera,
			Sincronizado:   false,
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

		return encolarTarea(tx, ventaID, empresaID, models.TareaObtenerCAE)
	})

	if err != nil {
		internalError(c, err)
		return
	}

	var venta models.Venta
	h.db.Preload("Items", func(db *gorm.DB) *gorm.DB {
		return db.Order("orden ASC")
	}).First(&venta, "id = ?", ventaID)
	_, _, total := models.TotalesDeItems(venta.Items)

	cae, caeErr := h.worker.obtenerCAE(ctx, ventaID)
	go h.worker.procesarPendientes(context.Background())

	data := gin.H{"id": ventaID, "numero": numero, "total": total}
	if caeErr != nil || cae == nil {
		slog.Warn("venta sin CAE — ARCA no disponible, pendiente de reintento", "venta_id", ventaID, "err", caeErr)
		data["pendiente_cae"] = true
	} else {
		data["pendiente_cae"] = false
		data["numero"] = fmt.Sprintf("%03d-%08d", empresa.PuntoVenta, cae.NroCmp)
		data["cae"] = cae.CAE
		data["cae_vto"] = cae.FchVto.Format("2006-01-02")
		data["qr_data"] = cae.QRData
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": data})
}

// DiasConVentas maneja GET /api/ventas/dias?mes=YYYY-MM
func (h *VentasHandler) DiasConVentas(c *gin.Context) {
	empresaID := getEmpresaID(c)

	inicioMes, err := time.ParseInLocation("2006-01", c.Query("mes"), zonaHoraria)
	if err != nil {
		now := time.Now().In(zonaHoraria)
		inicioMes = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, zonaHoraria)
	}
	finMes := inicioMes.AddDate(0, 1, 0)

	var fechas []string
	h.db.Raw(
		`SELECT DISTINCT TO_CHAR(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') AS fecha
		 FROM ventas
		 WHERE empresa_id = ? AND created_at >= ? AND created_at < ?
		 ORDER BY fecha ASC`,
		empresaID, inicioMes, finMes,
	).Scan(&fechas)
	if fechas == nil {
		fechas = []string{}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": fechas})
}

// Listar maneja GET /api/ventas
func (h *VentasHandler) Listar(c *gin.Context) {
	empresaID := getEmpresaID(c)

	var ventas []models.Venta
	query := h.db.Where("empresa_id = ?", empresaID).
		Preload("Items", func(db *gorm.DB) *gorm.DB {
			return db.Order("orden ASC")
		}).Order("created_at desc").Limit(100)

	if fecha := c.Query("fecha"); fecha != "" {
		t, err := time.ParseInLocation("2006-01-02", fecha, zonaHoraria)
		if err == nil {
			inicio, fin := rangoDelDia(t)
			query = query.Where("created_at >= ? AND created_at < ?", inicio, fin)
		}
	}

	if err := query.Find(&ventas).Error; err != nil {
		internalError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": ventas})
}

