package handlers

import (
	"net/http"
	"strings"

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

// bindRotulo parsea el body y normaliza el nombre. El trim va acá y no en el
// cliente porque la unicidad de (empresa_id, nombre) es sobre el string exacto:
// sin esto, " Milanesa" y "Milanesa" entrarían como dos rótulos distintos.
func bindRotulo(c *gin.Context) (rotuloReq, bool) {
	var req rotuloReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return req, false
	}
	req.Nombre = strings.TrimSpace(req.Nombre)
	if req.Nombre == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "el nombre no puede estar vacío"})
		return req, false
	}
	return req, true
}

// Guardar da de alta el rótulo, o le pisa el precio al que ya exista con ese
// nombre. Es un upsert y no un create porque "Guardar" es la única forma de
// crearlos desde la pantalla: sin esto, cada cambio de precio dejaría un
// "Milanesa" nuevo al lado del viejo. El ON CONFLICT lo resuelve en una sola
// query contra el índice único, sin el race de un read-then-write.
func (h *RotuloHandler) Guardar(c *gin.Context) {
	req, ok := bindRotulo(c)
	if !ok {
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

// Actualizar cambia nombre y precio de un rótulo puntual. Es lo que hace el
// botón de editar de la lista, y a diferencia de Guardar identifica la fila
// por id — es la única forma de renombrar uno sin que quede el viejo al lado.
func (h *RotuloHandler) Actualizar(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id inválido"})
		return
	}
	req, ok := bindRotulo(c)
	if !ok {
		return
	}
	empresaID := getEmpresaID(c)

	var r models.Rotulo
	if err := h.db.First(&r, "id = ? AND empresa_id = ?", id, empresaID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "rótulo no encontrado"})
		return
	}

	// Renombrarlo al nombre de otro rótulo choca con el índice único
	// (empresa_id, nombre). Se chequea antes para poder devolver un mensaje
	// que sirva en vez de un 500; el índice sigue siendo la garantía real si
	// dos pedidos simultáneos pasaran este chequeo a la vez.
	var enUso int64
	h.db.Model(&models.Rotulo{}).
		Where("empresa_id = ? AND nombre = ? AND id <> ?", empresaID, req.Nombre, id).
		Count(&enUso)
	if enUso > 0 {
		c.JSON(http.StatusConflict, gin.H{"success": false, "error": "ya tenés un rótulo con ese nombre"})
		return
	}

	r.Nombre = req.Nombre
	r.Precio = req.Precio
	if err := h.db.Save(&r).Error; err != nil {
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
