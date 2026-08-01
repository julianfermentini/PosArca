package models

import "github.com/google/uuid"

type ConfigEmpresa struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CUIT              string    `gorm:"column:cuit" json:"cuit"`
	RazonSocial       string    `gorm:"not null" json:"razon_social"`
	Titular           string    `gorm:"default:''" json:"titular"`
	PuntoVenta        int       `gorm:"default:1" json:"punto_venta"`
	CertPEM           string    `gorm:"column:cert_pem;default:''" json:"-"`
	KeyPEM            string    `gorm:"column:key_pem;default:''" json:"-"`
	ArcaEnv           string    `gorm:"default:'testing'" json:"arca_env"`
	Direccion         string    `gorm:"default:''" json:"direccion"`
	Telefono          string    `gorm:"default:''" json:"telefono"`
	CondicionIVA      string    `gorm:"default:'Responsable Inscripto'" json:"condicion_iva"`
	IngBrutos         string    `gorm:"default:''" json:"ing_brutos"`
	InicioActividades string    `gorm:"default:''" json:"inicio_actividades"`
	DefensaConsumidor string    `gorm:"default:''" json:"defensa_consumidor"`
}

func (ConfigEmpresa) TableName() string { return "config_empresa" }
