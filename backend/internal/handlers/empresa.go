package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"pos-fiscal/internal/models"
)

type EmpresaHandler struct {
	db *gorm.DB
}

func NuevoEmpresaHandler(db *gorm.DB) *EmpresaHandler {
	return &EmpresaHandler{db: db}
}

// Get devuelve la configuración de la empresa del usuario autenticado.
func (h *EmpresaHandler) Get(c *gin.Context) {
	empresaID := getEmpresaID(c)
	emp, err := loadEmpresa(h.db, empresaID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "empresa no encontrada"})
		return
	}
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

// Update guarda los datos del negocio de la empresa del usuario autenticado.
func (h *EmpresaHandler) Update(c *gin.Context) {
	var req UpdateEmpresaReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	empresaID := getEmpresaID(c)
	var emp models.ConfigEmpresa
	if err := h.db.First(&emp, "id = ?", empresaID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "empresa no encontrada"})
		return
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
