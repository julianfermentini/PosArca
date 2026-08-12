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
	TotalVentas   int64 `json:"total_ventas"`
	TotalTickets  int64 `json:"total_tickets"`
	TotalFacturas int64 `json:"total_facturas"`
	PorMetodoPago struct {
		Efectivo  float64 `json:"efectivo"`
		Tarjeta   float64 `json:"tarjeta"`
		Billetera float64 `json:"billetera"`
	} `json:"por_metodo_pago"`
	MontoTotal        float64            `json:"monto_total"`
	MontoIVA          float64            `json:"monto_iva"`
	RangoComprobantes []RangoComprobante `json:"rango_comprobantes"`
}

// RangoComprobante es el primer y último Numero emitido en el período, para un
// tipo de comprobante. Usa Numero (contador local, atómico y secuencial,
// asignado al crear la venta) y no NumeroFiscal (CAE de ARCA): NumeroFiscal no
// existe para TICKET, y para FACTURA se completa async vía outbox — un MIN/MAX
// sobre él podría no reflejar lo que realmente se emitió ese día.
type RangoComprobante struct {
	Tipo    models.TipoComprobante `json:"tipo"`
	Primero string                 `json:"primero"`
	Ultimo  string                 `json:"ultimo"`
}

// CierreCaja maneja GET /api/reportes/cierre
func (h *ReportesHandler) CierreCaja(c *gin.Context) {
	empresaID := getEmpresaID(c)

	fechaStr := c.Query("fecha")
	var fecha time.Time
	var err error

	if fechaStr == "" {
		fecha = time.Now().In(zonaHoraria)
	} else {
		fecha, err = time.ParseInLocation("2006-01-02", fechaStr, zonaHoraria)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "fecha inválida, usar YYYY-MM-DD"})
			return
		}
	}

	inicio, fin := rangoDelDia(fecha)
	var resumen ResumenCierre

	h.db.Model(&models.Venta{}).Where("empresa_id = ? AND created_at >= ? AND created_at < ?", empresaID, inicio, fin).Count(&resumen.TotalVentas)
	h.db.Model(&models.Venta{}).Where("empresa_id = ? AND created_at >= ? AND created_at < ? AND tipo = ?", empresaID, inicio, fin, models.TipoTicket).Count(&resumen.TotalTickets)
	h.db.Model(&models.Venta{}).Where("empresa_id = ? AND created_at >= ? AND created_at < ? AND tipo = ?", empresaID, inicio, fin, models.TipoFactura).Count(&resumen.TotalFacturas)

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
		WHERE v.empresa_id = ? AND v.created_at >= ? AND v.created_at < ?`, empresaID, inicio, fin).Scan(&m)

	resumen.MontoTotal = m.MontoTotal
	resumen.MontoIVA = m.MontoIVA

	type montosPago struct {
		Efectivo  float64
		Tarjeta   float64
		Billetera float64
	}
	var mp montosPago
	h.db.Raw(`
		SELECT
			COALESCE(SUM(monto_efectivo),  0) AS efectivo,
			COALESCE(SUM(monto_tarjeta),   0) AS tarjeta,
			COALESCE(SUM(monto_billetera), 0) AS billetera
		FROM ventas
		WHERE empresa_id = ? AND created_at >= ? AND created_at < ?`, empresaID, inicio, fin).Scan(&mp)

	resumen.PorMetodoPago.Efectivo = mp.Efectivo
	resumen.PorMetodoPago.Tarjeta = mp.Tarjeta
	resumen.PorMetodoPago.Billetera = mp.Billetera

	var rangos []RangoComprobante
	h.db.Raw(`
		SELECT tipo, MIN(numero) AS primero, MAX(numero) AS ultimo
		FROM ventas
		WHERE empresa_id = ? AND created_at >= ? AND created_at < ?
		GROUP BY tipo
		-- TICKET antes que FACTURA (orden alfabético daría lo contrario), para
		-- coincidir con el orden ya usado en el resto de la pantalla ("X tickets
		-- · Y facturas").
		ORDER BY CASE tipo WHEN 'TICKET' THEN 0 ELSE 1 END`, empresaID, inicio, fin).Scan(&rangos)
	if rangos == nil {
		rangos = []RangoComprobante{}
	}
	resumen.RangoComprobantes = rangos

	c.JSON(http.StatusOK, gin.H{"success": true, "data": resumen})
}
