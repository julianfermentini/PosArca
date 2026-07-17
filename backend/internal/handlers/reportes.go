package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"pos-fiscal/internal/models"
)

type ReportesHandler struct {
	db *gorm.DB
}

func NuevoReportesHandler(db *gorm.DB) *ReportesHandler {
	return &ReportesHandler{db: db}
}

type ResumenCierre struct {
	TotalVentas   int64   `json:"total_ventas"`
	TotalTickets  int64   `json:"total_tickets"`
	TotalFacturas int64   `json:"total_facturas"`
	PorMetodoPago struct {
		Efectivo  float64 `json:"efectivo"`
		Tarjeta   float64 `json:"tarjeta"`
		Billetera float64 `json:"billetera"`
	} `json:"por_metodo_pago"`
	MontoTotal float64 `json:"monto_total"`
	MontoIVA   float64 `json:"monto_iva"`
}

// CierreCaja maneja GET /api/reportes/cierre
func (h *ReportesHandler) CierreCaja(c *gin.Context) {
	fechaStr := c.Query("fecha")
	var fecha time.Time
	var err error

	if fechaStr == "" {
		fecha = time.Now()
	} else {
		fecha, err = time.Parse("2006-01-02", fechaStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "fecha inválida, usar YYYY-MM-DD"})
			return
		}
	}

	inicio, fin := rangoDelDia(fecha)
	var resumen ResumenCierre

	// Conteos por tipo
	h.db.Model(&models.Venta{}).Where("created_at >= ? AND created_at < ?", inicio, fin).Count(&resumen.TotalVentas)
	h.db.Model(&models.Venta{}).Where("created_at >= ? AND created_at < ? AND tipo = ?", inicio, fin, models.TipoTicket).Count(&resumen.TotalTickets)
	h.db.Model(&models.Venta{}).Where("created_at >= ? AND created_at < ? AND tipo = ?", inicio, fin, models.TipoFactura).Count(&resumen.TotalFacturas)

	// Totales monetarios: JOIN ventas ↔ venta_items
	type montos struct {
		MontoTotal float64
		MontoIVA   float64
	}
	var m montos
	h.db.Raw(`
		SELECT
			COALESCE(SUM(vi.total), 0) AS monto_total,
			COALESCE(SUM(vi.iva),   0) AS monto_iva
		FROM ventas v
		JOIN venta_items vi ON vi.venta_id = v.id
		WHERE v.created_at >= ? AND v.created_at < ?`, inicio, fin).Scan(&m)

	resumen.MontoTotal = m.MontoTotal
	resumen.MontoIVA = m.MontoIVA

	// Por método de pago
	scanMetodo := func(metodo models.MetodoPago) float64 {
		var total float64
		h.db.Raw(`
			SELECT COALESCE(SUM(vi.total), 0)
			FROM ventas v
			JOIN venta_items vi ON vi.venta_id = v.id
			WHERE v.created_at >= ? AND v.created_at < ? AND v.metodo_pago = ?`,
			inicio, fin, metodo).Scan(&total)
		return total
	}

	resumen.PorMetodoPago.Efectivo  = scanMetodo(models.PagoEfectivo)
	resumen.PorMetodoPago.Tarjeta   = scanMetodo(models.PagoTarjeta)
	resumen.PorMetodoPago.Billetera = scanMetodo(models.PagoBilletera)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": resumen})
}
