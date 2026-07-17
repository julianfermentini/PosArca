package handlers

import (
	"gorm.io/gorm"

	"pos-fiscal/config"
	"pos-fiscal/internal/models"
)

// getEmpresaConf obtiene la configuración del negocio desde la BD.
// Si la BD no tiene datos todavía, usa los valores del .env como fallback.
func getEmpresaConf(db *gorm.DB, cfg *config.Config) models.ConfigEmpresa {
	var emp models.ConfigEmpresa
	db.First(&emp)
	if emp.RazonSocial == "" {
		emp.RazonSocial = cfg.NegocioNombre
		emp.Direccion = cfg.NegocioDirec
		emp.Telefono = cfg.NegocioTel
		emp.CondicionIVA = cfg.NegocioIVACond
		emp.PuntoVenta = cfg.ArcaPuntoVenta
		emp.ArcaEnv = cfg.ArcaEnv
	}
	// CUIT siempre desde env var — es un dato fiscal que debe coincidir con el certificado ARCA
	if cfg.ArcaCUIT != "" {
		emp.CUIT = cfg.ArcaCUIT
	}
	return emp
}
