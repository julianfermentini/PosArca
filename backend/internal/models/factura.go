package models

import (
	"time"

	"github.com/google/uuid"
)

type EstadoFactura string

const (
	EstadoPendiente  EstadoFactura = "PENDIENTE"
	EstadoAutorizado EstadoFactura = "AUTORIZADO"
	EstadoError      EstadoFactura = "ERROR"
)

type Factura struct {
	ID             uuid.UUID     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	VentaID        uuid.UUID     `gorm:"type:uuid;not null" json:"venta_id"`
	Venta          Venta         `gorm:"foreignKey:VentaID" json:"-"`
	RazonSocial    string        `gorm:"not null" json:"razon_social"`
	CUITCliente    string        `gorm:"not null" json:"cuit_cliente"`
	EmailCliente   string        `gorm:"not null" json:"email_cliente"`
	CAE            string        `json:"cae,omitempty"`
	CAEVto         *time.Time    `json:"cae_vto,omitempty"`
	Estado         EstadoFactura `gorm:"default:'PENDIENTE'" json:"estado"`
	PDFPath        string        `json:"pdf_path,omitempty"`
	EmailEnviado   bool          `gorm:"default:false" json:"email_enviado"`
	CreatedAt      time.Time     `json:"created_at"`
}

func (Factura) TableName() string { return "facturas" }
