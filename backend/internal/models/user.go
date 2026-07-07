package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Email        string    `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"not null" json:"-"`
	NegocioNombre string   `gorm:"not null" json:"negocio_nombre"`
	CreatedAt    time.Time `json:"created_at"`
}

func (User) TableName() string { return "users" }
