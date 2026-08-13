package models

import (
	"time"

	"github.com/google/uuid"
)

// Rotulo es una etiqueta adhesiva guardada (nombre de plato + precio) para
// reimprimirla sin volver a tipearla. Es una lista aparte de Producto: los
// platos que se rotulan en la vitrina no son los mismos que se cobran por
// caja, y acá el precio nunca es nulo — un rótulo sin precio no existe.
//
// El índice único (empresa_id, nombre) es lo que hace que "Guardar" pise el
// precio del rótulo que ya existe en vez de acumular duplicados.
type Rotulo struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	EmpresaID uuid.UUID `gorm:"type:uuid;uniqueIndex:idx_rotulos_empresa_nombre" json:"empresa_id"`
	Nombre    string    `gorm:"not null;uniqueIndex:idx_rotulos_empresa_nombre" json:"nombre"`
	Precio    float64   `gorm:"not null" json:"precio"`
	CreatedAt time.Time `json:"created_at"`
}

func (Rotulo) TableName() string { return "rotulos" }
