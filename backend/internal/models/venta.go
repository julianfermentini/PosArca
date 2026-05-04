package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
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

type ItemVenta struct {
	Descripcion string  `json:"descripcion"`
	PrecioNeto  float64 `json:"precio_neto"`
	IVA         float64 `json:"iva"`
	Total       float64 `json:"total"`
}

type Venta struct {
	ID            uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Tipo          TipoComprobante `gorm:"not null" json:"tipo"`
	Numero        string          `gorm:"uniqueIndex" json:"numero,omitempty"`
	Items         datatypes.JSON  `gorm:"not null" json:"items"`
	Subtotal      float64         `gorm:"not null" json:"subtotal"`
	IVA           float64         `gorm:"not null" json:"iva"`
	Total         float64         `gorm:"not null" json:"total"`
	MetodoPago    MetodoPago      `gorm:"not null" json:"metodo_pago"`
	Impreso       bool            `gorm:"default:false" json:"impreso"`
	Sincronizado  bool            `gorm:"default:false" json:"sincronizado"`
	CreatedAt     time.Time       `json:"created_at"`
}

func (Venta) TableName() string { return "ventas" }

// CalcularTotales calcula IVA 21% sobre los subtotales de los items (precios netos)
func CalcularTotales(items []ItemVenta) (subtotal, iva, total float64) {
	for _, item := range items {
		subtotal += item.PrecioNeto
	}
	iva = subtotal * 0.21
	total = subtotal + iva
	return
}
