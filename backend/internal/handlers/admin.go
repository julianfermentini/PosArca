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
	db          *gorm.DB
	adminSecret string
}

func NuevoAdminHandler(db *gorm.DB, adminSecret string) *AdminHandler {
	return &AdminHandler{db: db, adminSecret: adminSecret}
}

func (h *AdminHandler) autenticar(c *gin.Context) bool {
	if h.adminSecret == "" || c.GetHeader("X-Admin-Secret") != h.adminSecret {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "No autorizado"})
		return false
	}
	return true
}

type crearCuentaAdminRequest struct {
	Email         string `json:"email" binding:"required,email"`
	Password      string `json:"password" binding:"required,min=6"`
	NegocioNombre string `json:"negocio_nombre" binding:"required"`
}

// CrearCuenta maneja POST /api/admin/crear-cuenta.
func (h *AdminHandler) CrearCuenta(c *gin.Context) {
	if !h.autenticar(c) {
		return
	}

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
	ID          uuid.UUID `json:"id"`
	RazonSocial string    `json:"razon_social"`
	CUIT        string    `json:"cuit"`
	Email       string    `json:"email"`
	PuntoVenta  int       `json:"punto_venta"`
	ArcaEnv     string    `json:"arca_env"`
	CreatedAt   time.Time `json:"created_at"`
}

// ListarCuentas maneja GET /api/admin/cuentas.
func (h *AdminHandler) ListarCuentas(c *gin.Context) {
	if !h.autenticar(c) {
		return
	}

	var cuentas []cuentaAdmin
	h.db.Raw(`
		SELECT e.id, e.razon_social, e.cuit, e.punto_venta, e.arca_env, e.created_at, u.email
		FROM config_empresa e
		LEFT JOIN users u ON u.empresa_id = e.id
		ORDER BY e.created_at DESC
	`).Scan(&cuentas)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": cuentas})
}

type resetPasswordRequest struct {
	Email       string `json:"email" binding:"required,email"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// ResetPassword maneja POST /api/admin/reset-password.
func (h *AdminHandler) ResetPassword(c *gin.Context) {
	if !h.autenticar(c) {
		return
	}

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
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": result.Error.Error()})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "usuario no encontrado"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
