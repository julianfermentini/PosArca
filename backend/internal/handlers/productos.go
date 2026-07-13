package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"pos-fiscal/internal/models"
)

type ProductoHandler struct {
	db *gorm.DB
}

func NuevoProductoHandler(db *gorm.DB) *ProductoHandler {
	return &ProductoHandler{db: db}
}

func (h *ProductoHandler) List(c *gin.Context) {
	var productos []models.Producto
	h.db.Order("created_at asc").Find(&productos)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": productos})
}

type productoReq struct {
	Nombre string   `json:"nombre" binding:"required"`
	Precio *float64 `json:"precio"`
}

func (h *ProductoHandler) Create(c *gin.Context) {
	var req productoReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	p := models.Producto{ID: uuid.New(), Nombre: req.Nombre, Precio: req.Precio}
	if err := h.db.Create(&p).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": p})
}

func (h *ProductoHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id inválido"})
		return
	}
	var req productoReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	var p models.Producto
	if err := h.db.First(&p, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "producto no encontrado"})
		return
	}
	p.Nombre = req.Nombre
	p.Precio = req.Precio
	h.db.Save(&p)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": p})
}

func (h *ProductoHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id inválido"})
		return
	}
	h.db.Delete(&models.Producto{}, "id = ?", id)
	c.JSON(http.StatusOK, gin.H{"success": true})
}
