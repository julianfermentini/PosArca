package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"pos-fiscal/internal/models"
)

type RotuloHandler struct {
	db *gorm.DB
}

func NuevoRotuloHandler(db *gorm.DB) *RotuloHandler {
	return &RotuloHandler{db: db}
}

func (h *RotuloHandler) List(c *gin.Context) {
	empresaID := getEmpresaID(c)

	var rotulos []models.Rotulo
	h.db.Where("empresa_id = ?", empresaID).Order("nombre asc").Find(&rotulos)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": rotulos})
}

type rotuloReq struct {
	Nombre string  `json:"nombre" binding:"required"`
	Precio float64 `json:"precio" binding:"required,gt=0"`
}

// Guardar da de alta el rótulo, o le pisa el precio al que ya exista con ese
// nombre. Es un upsert y no un create porque "Guardar" es la única forma de
// crearlos desde la pantalla: sin esto, cada cambio de precio dejaría un
// "Milanesa" nuevo al lado del viejo. El ON CONFLICT lo resuelve en una sola
// query contra el índice único, sin el race de un read-then-write.
func (h *RotuloHandler) Guardar(c *gin.Context) {
	var req rotuloReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	empresaID := getEmpresaID(c)
	r := models.Rotulo{ID: uuid.New(), EmpresaID: empresaID, Nombre: req.Nombre, Precio: req.Precio}
	if err := h.db.Clauses(
		clause.OnConflict{
			Columns:   []clause.Column{{Name: "empresa_id"}, {Name: "nombre"}},
			DoUpdates: clause.AssignmentColumns([]string{"precio"}),
		},
		// Sin esto, al pisar un rótulo existente devolveríamos el uuid nuevo que
		// nunca se insertó, y el frontend guardaría una fila fantasma.
		clause.Returning{},
	).Create(&r).Error; err != nil {
		internalError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": r})
}

func (h *RotuloHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id inválido"})
		return
	}
	empresaID := getEmpresaID(c)
	h.db.Delete(&models.Rotulo{}, "id = ? AND empresa_id = ?", id, empresaID)
	c.JSON(http.StatusOK, gin.H{"success": true})
}
