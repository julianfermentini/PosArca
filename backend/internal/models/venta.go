package models

import (
	"time"

	"github.com/google/uuid"
)

type TipoComprobante string
type MetodoPago string

const (
	TipoTicket  TipoComprobante = "TICKET"
	TipoFactura TipoComprobante = "FACTURA"

	PagoEfectivo  MetodoPago = "EFECTIVO"
	PagoTarjeta   MetodoPago = "TARJETA"
	PagoBilletera MetodoPago = "BILLETERA"
)

// Venta representa un comprobante (ticket o factura).
// Los ítems y montos viven en venta_items — esta tabla no almacena totales.
//
// Numero es un contador local propio, asignado al crear la venta — antes de
// pedirle nada a ARCA — para tener algo que mostrar mientras el CAE está
// pendiente. NumeroFiscal es el número real que asignó ARCA (CbteNro de
// FECAESolicitar), recién disponible cuando se autoriza el CAE. Son dos
// numeraciones independientes: el ticket/factura impreso y el QR (que ARCA
// valida contra sus propios registros) tienen que usar NumeroFiscal, no Numero.
type Venta struct {
	ID             uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	// La numeración (Numero) es un contador local POR EMPRESA — el índice único
	// tiene que incluir empresa_id, si no, dos empresas distintas que lleguen al
	// mismo correlativo (ej. las dos primeras "001-00000001" de su historia)
	// chocan entre sí aunque sean cuentas totalmente independientes.
	EmpresaID      uuid.UUID       `gorm:"type:uuid;index;uniqueIndex:idx_ventas_empresa_tipo_numero" json:"empresa_id"`
	Tipo           TipoComprobante `gorm:"not null;uniqueIndex:idx_ventas_empresa_tipo_numero" json:"tipo"`
	Numero         string          `gorm:"uniqueIndex:idx_ventas_empresa_tipo_numero" json:"numero,omitempty"`
	NumeroFiscal   string          `gorm:"column:numero_fiscal;default:''" json:"numero_fiscal,omitempty"`
	MetodoPago     MetodoPago      `gorm:"default:''" json:"metodo_pago,omitempty"`
	MontoEfectivo  float64         `gorm:"default:0" json:"monto_efectivo"`
	MontoTarjeta   float64         `gorm:"default:0" json:"monto_tarjeta"`
	MontoBilletera float64         `gorm:"default:0" json:"monto_billetera"`
	Impreso        bool            `gorm:"default:false" json:"impreso"`
	Sincronizado   bool            `gorm:"default:false" json:"sincronizado"`
	CAE            string          `gorm:"default:''" json:"cae,omitempty"`
	CAEVto         *time.Time      `json:"cae_vto,omitempty"`
	QRData         string          `gorm:"column:qr_data;default:''" json:"qr_data,omitempty"`
	CreatedAt      time.Time       `gorm:"index" json:"created_at"`
	Items          []VentaItem     `gorm:"foreignKey:VentaID;constraint:OnDelete:CASCADE" json:"items,omitempty"`
}

func (Venta) TableName() string { return "ventas" }

// VentaItem es una línea de la venta — una fila por producto, con cantidad.
// PrecioNeto es el neto POR UNIDAD; IVA y Total son los montos DE LA LÍNEA
// (unidad × cantidad). Las filas anteriores a la columna cantidad quedan con
// cantidad=1, donde línea y unidad coinciden.
type VentaItem struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	VentaID     uuid.UUID `gorm:"type:uuid;not null;index" json:"venta_id"`
	Descripcion string    `gorm:"not null" json:"descripcion"`
	Cantidad    int       `gorm:"not null;default:1" json:"cantidad"`
	PrecioNeto  float64   `gorm:"not null" json:"precio_neto"`
	IVA         float64   `gorm:"not null" json:"iva"`
	Total       float64   `gorm:"not null" json:"total"`
	Orden       int       `gorm:"not null;default:0" json:"orden"`
}

func (VentaItem) TableName() string { return "venta_items" }

// ItemRequest es lo que llega del frontend. El backend calcula neto, IVA y
// total. Cantidad ausente o 0 vale 1, para aceptar payloads viejos (ventas
// offline encoladas antes de ese campo) que mandaban una fila por unidad.
type ItemRequest struct {
	Descripcion string `json:"descripcion" binding:"required"`
	// Precio final por unidad, IVA incluido — lo que tipeó el cajero y lo que
	// paga el cliente. Es la fuente de verdad de los montos de la línea.
	PrecioFinal float64 `json:"precio_final" binding:"required_without=PrecioNeto,omitempty,gt=0"`
	// Legacy: las ventas encoladas offline por una versión anterior mandan el
	// neto. Se sigue aceptando mientras pueda quedar alguna sin sincronizar.
	PrecioNeto float64 `json:"precio_neto" binding:"omitempty,gt=0"`
	Cantidad   int     `json:"cantidad" binding:"omitempty,gte=1,lte=9999"`
}

// precioFinalUnit resuelve el precio final por unidad. Para las ventas viejas
// lo reconstruye con la fórmula anterior (neto + IVA redondeado por unidad),
// que reproduce exactamente los montos que esa versión ya imprimió en el
// ticket: una venta encolada no puede cambiar de importe al sincronizarse.
func (r ItemRequest) precioFinalUnit() float64 {
	if r.PrecioFinal > 0 {
		return redondear(r.PrecioFinal)
	}
	return redondear(r.PrecioNeto + redondear(r.PrecioNeto*0.21))
}

// NuevoVentaItem construye un VentaItem aplicando IVA 21%.
//
// El precio final es la fuente de verdad: el neto sale de dividir y el IVA por
// RESTA, no como 21% del neto redondeado. Así neto + IVA == precio final
// siempre y exacto, aunque la división no dé redonda — que era lo que hacía
// que un ítem de $100 terminara valiendo $99,99.
//
// Todo se redondea por unidad antes de multiplicar por cantidad, para que N
// unidades en una línea sumen exactamente lo mismo que N líneas de una unidad.
func NuevoVentaItem(ventaID uuid.UUID, req ItemRequest, orden int) VentaItem {
	cantidad := req.Cantidad
	if cantidad < 1 {
		cantidad = 1
	}
	final := req.precioFinalUnit()
	neto := redondear(final / 1.21)
	ivaUnit := redondear(final - neto)
	return VentaItem{
		ID:          uuid.New(),
		VentaID:     ventaID,
		Descripcion: req.Descripcion,
		Cantidad:    cantidad,
		PrecioNeto:  neto,
		IVA:         redondear(ivaUnit * float64(cantidad)),
		Total:       redondear(final * float64(cantidad)),
		Orden:       orden,
	}
}

// TotalesDeItems suma los montos de los ítems de una venta. IVA y Total ya son
// montos de línea; el neto se reconstruye de unidad × cantidad.
func TotalesDeItems(items []VentaItem) (subtotal, iva, total float64) {
	for _, it := range items {
		cantidad := it.Cantidad
		if cantidad < 1 {
			cantidad = 1
		}
		subtotal += it.PrecioNeto * float64(cantidad)
		iva += it.IVA
		total += it.Total
	}
	return
}

func redondear(v float64) float64 {
	return float64(int64(v*100+0.5)) / 100
}
