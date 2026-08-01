package models

import (
	"time"

	"github.com/google/uuid"
)

type Producto struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	EmpresaID uuid.UUID `gorm:"type:uuid;index" json:"empresa_id"`
	Nombre    string    `gorm:"not null" json:"nombre"`
	Precio    *float64  `json:"precio"`
	CreatedAt time.Time `json:"created_at"`
}

func (Producto) TableName() string { return "productos" }
