package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"pos-fiscal/config"
	"pos-fiscal/internal/models"
)

type EmpresaHandler struct {
	db  *gorm.DB
	cfg *config.Config
}

func NuevoEmpresaHandler(db *gorm.DB, cfg *config.Config) *EmpresaHandler {
	return &EmpresaHandler{db: db, cfg: cfg}
}

// Get devuelve la configuración de la empresa.
// Si todavía no fue guardada en la BD, devuelve los valores del .env como defaults.
func (h *EmpresaHandler) Get(c *gin.Context) {
	emp := getEmpresaConf(h.db, h.cfg)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": emp})
}

type UpdateEmpresaReq struct {
	RazonSocial       string `json:"razon_social" binding:"required"`
	Titular           string `json:"titular"`
	Direccion         string `json:"direccion"`
	Telefono          string `json:"telefono"`
	CondicionIVA      string `json:"condicion_iva"`
	IngBrutos         string `json:"ing_brutos"`
	InicioActividades string `json:"inicio_actividades"`
	DefensaConsumidor string `json:"defensa_consumidor"`
}

// Update guarda (upsert) los datos del negocio.
func (h *EmpresaHandler) Update(c *gin.Context) {
	var req UpdateEmpresaReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	var emp models.ConfigEmpresa
	h.db.First(&emp)

	// Primer uso: crear nuevo registro con campos ARCA desde .env
	if emp.ID == uuid.Nil {
		emp.ID = uuid.New()
		emp.CUIT = h.cfg.ArcaCUIT
		emp.PuntoVenta = h.cfg.ArcaPuntoVenta
		emp.ArcaEnv = h.cfg.ArcaEnv
		emp.CertPath = h.cfg.ArcaCertPath
		emp.KeyPath = h.cfg.ArcaKeyPath
	}

	emp.RazonSocial = req.RazonSocial
	emp.Titular = req.Titular
	emp.Direccion = req.Direccion
	emp.Telefono = req.Telefono
	emp.CondicionIVA = req.CondicionIVA
	emp.IngBrutos = req.IngBrutos
	emp.InicioActividades = req.InicioActividades
	emp.DefensaConsumidor = req.DefensaConsumidor

	if err := h.db.Save(&emp).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": emp})
}
