package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"pos-fiscal/internal/models"
)

type AdminHandler struct {
	db *gorm.DB
}

func NuevoAdminHandler(db *gorm.DB) *AdminHandler {
	return &AdminHandler{db: db}
}

type crearCuentaAdminRequest struct {
	Email         string `json:"email" binding:"required,email"`
	Password      string `json:"password" binding:"required,min=6"`
	NegocioNombre string `json:"negocio_nombre" binding:"required"`
}

// CrearCuenta maneja POST /api/admin/crear-cuenta.
func (h *AdminHandler) CrearCuenta(c *gin.Context) {
	var req crearCuentaAdminRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error interno"})
		return
	}

	user, err := crearEmpresaConUsuario(h.db, req.Email, string(hash), req.NegocioNombre)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error creando cuenta"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data": gin.H{
			"email":          user.Email,
			"negocio_nombre": user.NegocioNombre,
		},
	})
}

type cuentaAdmin struct {
	ID                uuid.UUID `json:"id"`
	RazonSocial       string    `json:"razon_social"`
	Titular           string    `json:"titular"`
	// Tag de columna explícito: "CUIT" es un nombre 100% en mayúsculas, sin
	// minúsculas que marquen límite de palabra — GORM infería mal el nombre de
	// columna para el Scan de esta consulta Raw (el resto de los campos, con
	// mayúsculas mezcladas como ArcaEnv o CondicionIVA, sí mapeaban bien).
	CUIT              string    `gorm:"column:cuit" json:"cuit"`
	Email             string    `json:"email"`
	PuntoVenta        int       `json:"punto_venta"`
	ArcaEnv           string    `json:"arca_env"`
	Activo            bool      `json:"activo"`
	Direccion         string    `json:"direccion"`
	Telefono          string    `json:"telefono"`
	CondicionIVA      string    `json:"condicion_iva"`
	IngBrutos         string    `json:"ing_brutos"`
	InicioActividades string    `json:"inicio_actividades"`
	DefensaConsumidor string    `json:"defensa_consumidor"`
	CreatedAt         time.Time `json:"created_at"`
}

// ListarCuentas maneja GET /api/admin/cuentas.
func (h *AdminHandler) ListarCuentas(c *gin.Context) {
	var cuentas []cuentaAdmin
	if err := h.db.Raw(`
		SELECT e.id, e.razon_social, e.titular, e.cuit, e.punto_venta, e.arca_env,
		       e.activo, e.direccion, e.telefono, e.condicion_iva, e.ing_brutos,
		       e.inicio_actividades, e.defensa_consumidor,
		       COALESCE(e.created_at, u.created_at) AS created_at,
		       u.email
		FROM config_empresa e
		LEFT JOIN users u ON u.empresa_id = e.id
		ORDER BY COALESCE(e.created_at, u.created_at) DESC NULLS LAST
	`).Scan(&cuentas).Error; err != nil {
		internalError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": cuentas})
}

type actualizarCuentaRequest struct {
	RazonSocial       string `json:"razon_social" binding:"required"`
	Titular           string `json:"titular"`
	CUIT              string `json:"cuit"`
	Email             string `json:"email" binding:"required,email"`
	PuntoVenta        int    `json:"punto_venta"`
	ArcaEnv           string `json:"arca_env"`
	Direccion         string `json:"direccion"`
	Telefono          string `json:"telefono"`
	CondicionIVA      string `json:"condicion_iva"`
	IngBrutos         string `json:"ing_brutos"`
	InicioActividades string `json:"inicio_actividades"`
	DefensaConsumidor string `json:"defensa_consumidor"`
}

// ActualizarCuenta maneja PUT /api/admin/cuentas/:id.
func (h *AdminHandler) ActualizarCuenta(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id inválido"})
		return
	}

	var req actualizarCuentaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	err = h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.ConfigEmpresa{}).Where("id = ?", id).Updates(map[string]interface{}{
			"razon_social":       req.RazonSocial,
			"titular":            req.Titular,
			"cuit":               req.CUIT,
			"punto_venta":        req.PuntoVenta,
			"arca_env":           req.ArcaEnv,
			"direccion":          req.Direccion,
			"telefono":           req.Telefono,
			"condicion_iva":      req.CondicionIVA,
			"ing_brutos":         req.IngBrutos,
			"inicio_actividades": req.InicioActividades,
			"defensa_consumidor": req.DefensaConsumidor,
		}).Error; err != nil {
			return err
		}
		return tx.Model(&models.User{}).Where("empresa_id = ?", id).Update("email", req.Email).Error
	})
	if err != nil {
		internalError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

type cambiarEstadoRequest struct {
	Activo bool `json:"activo"`
}

// CambiarEstado maneja PATCH /api/admin/cuentas/:id/estado.
func (h *AdminHandler) CambiarEstado(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id inválido"})
		return
	}

	var req cambiarEstadoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	if err := h.db.Model(&models.ConfigEmpresa{}).Where("id = ?", id).
		Update("activo", req.Activo).Error; err != nil {
		internalError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// EliminarCuenta maneja DELETE /api/admin/cuentas/:id.
// Borra la empresa y todos sus datos en una transacción.
func (h *AdminHandler) EliminarCuenta(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id inválido"})
		return
	}

	err = h.db.Transaction(func(tx *gorm.DB) error {
		// Al borrar ventas, venta_items y tareas_pendientes se van en cascada (FK
		// ON DELETE CASCADE). Las demás tablas tienen empresa_id sin FK a
		// config_empresa, así que se borran explícitamente antes que la empresa.
		if err := tx.Exec("DELETE FROM comprobante_contadores WHERE empresa_id = ?", id).Error; err != nil {
			return err
		}
		if err := tx.Exec("DELETE FROM productos WHERE empresa_id = ?", id).Error; err != nil {
			return err
		}
		if err := tx.Exec("DELETE FROM facturas WHERE empresa_id = ?", id).Error; err != nil {
			return err
		}
		if err := tx.Exec("DELETE FROM ventas WHERE empresa_id = ?", id).Error; err != nil {
			return err
		}
		if err := tx.Exec("DELETE FROM users WHERE empresa_id = ?", id).Error; err != nil {
			return err
		}
		return tx.Exec("DELETE FROM config_empresa WHERE id = ?", id).Error
	})
	if err != nil {
		internalError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

type resetPasswordRequest struct {
	Email       string `json:"email" binding:"required,email"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// ResetPassword maneja POST /api/admin/reset-password.
func (h *AdminHandler) ResetPassword(c *gin.Context) {
	var req resetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error interno"})
		return
	}

	result := h.db.Model(&models.User{}).
		Where("email = ?", req.Email).
		Update("password_hash", string(hash))
	if result.Error != nil {
		internalError(c, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "usuario no encontrado"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
