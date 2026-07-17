package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"pos-fiscal/internal/models"
)

type AuthHandler struct {
	db        *gorm.DB
	jwtSecret string
}

func NuevoAuthHandler(db *gorm.DB, jwtSecret string) *AuthHandler {
	return &AuthHandler{db: db, jwtSecret: jwtSecret}
}

type RegisterRequest struct {
	Email         string `json:"email" binding:"required,email"`
	Password      string `json:"password" binding:"required,min=6"`
	NegocioNombre string `json:"negocio_nombre" binding:"required"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Register crea el primer usuario. Solo funciona si no existe ninguno.
func (h *AuthHandler) Register(c *gin.Context) {
	var count int64
	h.db.Model(&models.User{}).Count(&count)
	if count > 0 {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "Ya existe una cuenta registrada"})
		return
	}

	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error interno"})
		return
	}

	user := models.User{
		Email:         req.Email,
		PasswordHash:  string(hash),
		NegocioNombre: req.NegocioNombre,
	}
	if err := h.db.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error creando usuario"})
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

// HasUsers indica si ya existe al menos un usuario registrado.
func (h *AuthHandler) HasUsers(c *gin.Context) {
	var count int64
	h.db.Model(&models.User{}).Count(&count)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"has_users": count > 0}})
}

func generarToken(user models.User, secret string) (string, error) {
	claims := jwt.MapClaims{
		"sub":            user.ID.String(),
		"email":          user.Email,
		"negocio_nombre": user.NegocioNombre,
		"exp":            time.Now().Add(30 * 24 * time.Hour).Unix(), // 30 días
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}
