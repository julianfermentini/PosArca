package models

import (
	"time"

	"github.com/google/uuid"
)

type TipoTarea string
type EstadoTarea string

const (
	TareaObtenerCAE   TipoTarea = "OBTENER_CAE"
	TareaImprimir     TipoTarea = "IMPRIMIR"
	TareaEmailFactura TipoTarea = "EMAIL_FACTURA"

	TareaEstadoPendiente EstadoTarea = "PENDIENTE"
	TareaEstadoHecha     EstadoTarea = "HECHA"
	TareaEstadoError     EstadoTarea = "ERROR"
)

// TareaPendiente es un efecto secundario (imprimir ticket, mandar email) que debe
// sobrevivir a un reinicio del proceso a mitad de camino. Se crea en la misma
// transacción que la venta/factura, así nunca existe una sin su tarea asociada.
type TareaPendiente struct {
	ID          uuid.UUID   `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	VentaID     uuid.UUID   `gorm:"type:uuid;not null;index"`
	Tipo        TipoTarea   `gorm:"not null"`
	Estado      EstadoTarea `gorm:"not null;default:'PENDIENTE';index"`
	Intentos    int         `gorm:"not null;default:0"`
	UltimoError string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (TareaPendiente) TableName() string { return "tareas_pendientes" }
