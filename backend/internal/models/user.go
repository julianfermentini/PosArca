package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	EmpresaID     uuid.UUID `gorm:"type:uuid;index" json:"empresa_id"`
	Email         string    `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash  string    `gorm:"not null" json:"-"`
	NegocioNombre string    `gorm:"not null" json:"negocio_nombre"`
	CreatedAt     time.Time `json:"created_at"`
}

func (User) TableName() string { return "users" }
