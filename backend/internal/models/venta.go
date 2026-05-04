package models

import (
	"time"

	"github.com/google/uuid"
)

type TipoComprobante string
type MetodoPago string

const (
	TipoTicket  TipoComprobante = "TICKET"
	TipoFactura TipoComprobante = "FACTURA"

	PagoEfectivo  MetodoPago = "EFECTIVO"
	PagoTarjeta   MetodoPago = "TARJETA"
	PagoBilletera MetodoPago = "BILLETERA"
)

// Venta representa un comprobante (ticket o factura).
// Los ítems y montos viven en venta_items — esta tabla no almacena totales.
type Venta struct {
	ID           uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Tipo         TipoComprobante `gorm:"not null" json:"tipo"`
	Numero       string          `gorm:"uniqueIndex" json:"numero,omitempty"`
	MetodoPago   MetodoPago      `gorm:"not null" json:"metodo_pago"`
	Impreso      bool            `gorm:"default:false" json:"impreso"`
	Sincronizado bool            `gorm:"default:false" json:"sincronizado"`
	CreatedAt    time.Time       `json:"created_at"`
	Items        []VentaItem     `gorm:"foreignKey:VentaID;constraint:OnDelete:CASCADE" json:"items,omitempty"`
}

func (Venta) TableName() string { return "ventas" }

// VentaItem es una línea de la venta — una fila por producto.
type VentaItem struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	VentaID     uuid.UUID `gorm:"type:uuid;not null;index" json:"venta_id"`
	Descripcion string    `gorm:"not null" json:"descripcion"`
	PrecioNeto  float64   `gorm:"not null" json:"precio_neto"`
	IVA         float64   `gorm:"not null" json:"iva"`
	Total       float64   `gorm:"not null" json:"total"`
	Orden       int       `gorm:"not null;default:0" json:"orden"`
}

func (VentaItem) TableName() string { return "venta_items" }

// ItemRequest es lo que llega del frontend: solo descripción y precio neto.
// El backend calcula IVA y total.
type ItemRequest struct {
	Descripcion string  `json:"descripcion" binding:"required"`
	PrecioNeto  float64 `json:"precio_neto" binding:"required,gt=0"`
}

// NuevoVentaItem construye un VentaItem aplicando IVA 21%.
func NuevoVentaItem(ventaID uuid.UUID, req ItemRequest, orden int) VentaItem {
	iva := redondear(req.PrecioNeto * 0.21)
	return VentaItem{
		ID:          uuid.New(),
		VentaID:     ventaID,
		Descripcion: req.Descripcion,
		PrecioNeto:  req.PrecioNeto,
		IVA:         iva,
		Total:       redondear(req.PrecioNeto + iva),
		Orden:       orden,
	}
}

// TotalesDeItems suma los montos de los ítems de una venta.
func TotalesDeItems(items []VentaItem) (subtotal, iva, total float64) {
	for _, it := range items {
		subtotal += it.PrecioNeto
		iva += it.IVA
		total += it.Total
	}
	return
}

func redondear(v float64) float64 {
	return float64(int64(v*100+0.5)) / 100
}
