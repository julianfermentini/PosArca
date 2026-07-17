package models

// ComprobanteContador guarda el último número asignado por (tipo, punto de venta).
// siguienteNumero lo actualiza bajo un lock de fila (SELECT ... FOR UPDATE) para que
// asignar el siguiente número sea atómico incluso con transacciones concurrentes.
type ComprobanteContador struct {
	Tipo       TipoComprobante `gorm:"primaryKey"`
	PuntoVenta int             `gorm:"primaryKey"`
	Ultimo     int64           `gorm:"not null;default:0"`
}

func (ComprobanteContador) TableName() string { return "comprobante_contadores" }
