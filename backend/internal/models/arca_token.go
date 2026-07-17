package models

import "time"

// ArcaTokenCache guarda el último token/sign obtenidos de AFIP/ARCA (WSAA).
// Vivir en la base, en vez de en un archivo del contenedor, permite compartir el
// token entre instancias del backend y sobrevivir a un redeploy.
type ArcaTokenCache struct {
	CUIT       int64     `gorm:"primaryKey;column:cuit"`
	Token      string    `gorm:"not null"`
	Sign       string    `gorm:"not null"`
	Expiration time.Time `gorm:"not null"`
}

func (ArcaTokenCache) TableName() string { return "arca_token_cache" }
