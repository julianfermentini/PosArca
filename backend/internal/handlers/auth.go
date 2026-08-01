package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"pos-fiscal/internal/models"
)

type AuthHandler struct {
	db         *gorm.DB
	jwtSecret  string
	inviteCode string // vacío = modo legacy (solo primer usuario)
}

func NuevoAuthHandler(db *gorm.DB, jwtSecret, inviteCode string) *AuthHandler {
	return &AuthHandler{db: db, jwtSecret: jwtSecret, inviteCode: inviteCode}
}

type RegisterRequest struct {
	Email         string `json:"email" binding:"required,email"`
	Password      string `json:"password" binding:"required,min=6"`
	NegocioNombre string `json:"negocio_nombre" binding:"required"`
	InviteCode    string `json:"invite_code"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Register crea una nueva empresa+usuario. Con INVITE_CODE configurado, acepta
// múltiples registros (multitenant SaaS). Sin él, solo permite el primero.
func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	if h.inviteCode != "" {
		if req.InviteCode != h.inviteCode {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "Código de invitación inválido"})
			return
		}
	} else {
		// Modo legacy: solo el primer usuario puede registrarse
		var count int64
		h.db.Model(&models.User{}).Count(&count)
		if count > 0 {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "Ya existe una cuenta registrada"})
			return
		}
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

	token, err := generarToken(user, h.jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error generando token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data": gin.H{
			"token":          token,
			"email":          user.Email,
			"negocio_nombre": user.NegocioNombre,
		},
	})
}

// Login valida credenciales y devuelve JWT.
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	var user models.User
	if err := h.db.Where("email = ?", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Email o contraseña incorrectos"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Email o contraseña incorrectos"})
		return
	}

	token, err := generarToken(user, h.jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error generando token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"token":          token,
			"email":          user.Email,
			"negocio_nombre": user.NegocioNombre,
		},
	})
}

// HasUsers indica si hay usuarios y si el registro por invitación está habilitado.
func (h *AuthHandler) HasUsers(c *gin.Context) {
	var count int64
	h.db.Model(&models.User{}).Count(&count)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"has_users":      count > 0,
			"invite_enabled": h.inviteCode != "",
		},
	})
}

// crearEmpresaConUsuario crea una ConfigEmpresa y su User asociado en una
// transacción atómica. Es la única fuente de verdad para crear cuentas nuevas.
func crearEmpresaConUsuario(db *gorm.DB, email, passwordHash, negocioNombre string) (models.User, error) {
	var user models.User
	err := db.Transaction(func(tx *gorm.DB) error {
		empresa := models.ConfigEmpresa{
			ID:           uuid.New(),
			RazonSocial:  negocioNombre,
			PuntoVenta:   1,
			ArcaEnv:      "testing",
			CondicionIVA: "Responsable Inscripto",
		}
		if err := tx.Create(&empresa).Error; err != nil {
			return err
		}
		user = models.User{
			EmpresaID:     empresa.ID,
			Email:         email,
			PasswordHash:  passwordHash,
			NegocioNombre: negocioNombre,
		}
		return tx.Create(&user).Error
	})
	return user, err
}

func generarToken(user models.User, secret string) (string, error) {
	claims := jwt.MapClaims{
		"sub":            user.ID.String(),
		"empresa_id":     user.EmpresaID.String(),
		"email":          user.Email,
		"negocio_nombre": user.NegocioNombre,
		"exp":            time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}
