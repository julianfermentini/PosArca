package models

import "github.com/google/uuid"

type ConfigEmpresa struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CUIT         string    `gorm:"column:cuit;not null" json:"cuit"`
	RazonSocial  string    `gorm:"not null" json:"razon_social"`
	PuntoVenta   int       `gorm:"default:1" json:"punto_venta"`
	CertPath     string    `json:"cert_path,omitempty"`
	KeyPath      string    `json:"key_path,omitempty"`
	ArcaEnv      string    `gorm:"default:'testing'" json:"arca_env"`
	Direccion    string    `gorm:"default:''" json:"direccion"`
	Telefono     string    `gorm:"default:''" json:"telefono"`
	CondicionIVA string    `gorm:"default:'Responsable Inscripto'" json:"condicion_iva"`
}

func (ConfigEmpresa) TableName() string { return "config_empresa" }
