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
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "fecha inválida, usar formato YYYY-MM-DD"})
			return
		}
	}

	fechaSQL := fecha.Format("2006-01-02")

	var resumen ResumenCierre

	// Total general
	h.db.Model(&models.Venta{}).
		Where("DATE(created_at) = ?", fechaSQL).
		Count(&resumen.TotalVentas)

	h.db.Model(&models.Venta{}).
		Where("DATE(created_at) = ? AND tipo = ?", fechaSQL, models.TipoTicket).
		Count(&resumen.TotalTickets)

	h.db.Model(&models.Venta{}).
		Where("DATE(created_at) = ? AND tipo = ?", fechaSQL, models.TipoFactura).
		Count(&resumen.TotalFacturas)

	// Totales monetarios
	h.db.Model(&models.Venta{}).
		Where("DATE(created_at) = ?", fechaSQL).
		Select("COALESCE(SUM(total), 0) as monto_total, COALESCE(SUM(iva), 0) as monto_iva").
		Row().Scan(&resumen.MontoTotal, &resumen.MontoIVA)

	// Por método de pago
	h.db.Model(&models.Venta{}).
		Where("DATE(created_at) = ? AND metodo_pago = ?", fechaSQL, models.PagoEfectivo).
		Select("COALESCE(SUM(total), 0)").Row().Scan(&resumen.PorMetodoPago.Efectivo)

	h.db.Model(&models.Venta{}).
		Where("DATE(created_at) = ? AND metodo_pago = ?", fechaSQL, models.PagoTarjeta).
		Select("COALESCE(SUM(total), 0)").Row().Scan(&resumen.PorMetodoPago.Tarjeta)

	h.db.Model(&models.Venta{}).
		Where("DATE(created_at) = ? AND metodo_pago = ?", fechaSQL, models.PagoBilletera).
		Select("COALESCE(SUM(total), 0)").Row().Scan(&resumen.PorMetodoPago.Billetera)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": resumen})
}
