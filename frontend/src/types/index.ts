export type TipoComprobante = 'TICKET' | 'FACTURA'
export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'BILLETERA'
export type EstadoFactura = 'PENDIENTE' | 'AUTORIZADO' | 'ERROR'
export type EstadoSync = 'PENDIENTE' | 'PROCESANDO' | 'SINCRONIZADO' | 'ERROR'

// Ítem normalizado — una fila en venta_items.
// precio_neto es POR UNIDAD; iva y total son de la LÍNEA (unidad × cantidad).
export interface VentaItem {
  id: string
  venta_id: string
  descripcion: string
  // Opcional porque las filas guardadas antes de esta columna no la traen (vale 1)
  cantidad?: number
  precio_neto: number
  iva: number
  total: number
  orden: number
}

export interface Venta {
  id: string
  tipo: TipoComprobante
  numero: string
  // Número real que autorizó ARCA — distinto de numero (contador local/provisorio).
  // Es el que hay que imprimir/mostrar/poner en el QR una vez que hay CAE.
  numero_fiscal?: string
  monto_efectivo: number
  monto_tarjeta: number
  monto_billetera: number
  impreso: boolean
  sincronizado: boolean
  cae?: string
  cae_vto?: string
  qr_data?: string
  created_at: string
  items: VentaItem[]
}

export interface Factura {
  id: string
  venta_id: string
  razon_social: string
  cuit_cliente: string
  email_cliente: string
  cae: string
  cae_vto: string
  estado: EstadoFactura
  email_enviado: boolean
  created_at: string
  venta?: Venta
}

// Lo que el frontend envía al backend. El backend calcula neto, IVA y total a
// partir del precio final — es la fuente de verdad de los montos.
export interface ItemRequest {
  descripcion: string
  // Precio final por unidad, IVA incluido: lo que se tipeó en la caja.
  precio_final: number
  // Transitorio: se sigue mandando para que el deploy del frontend y el del
  // backend puedan salir en cualquier orden (un backend viejo sólo entiende
  // este campo). Se saca en una release posterior.
  precio_neto: number
  cantidad: number
}

export interface VentaOffline {
  id: string
  tipo: TipoComprobante
  items: ItemRequest[]
  monto_efectivo: number
  monto_tarjeta: number
  monto_billetera: number
  created_at: string
  estado_sync: EstadoSync
  // Email de la cuenta que cargó la venta — evita sincronizar con el JWT de
  // otra cuenta si alguien más inició sesión en el mismo dispositivo antes
  // de que esta venta terminara de sincronizar.
  cuenta_email?: string
}

export interface RangoComprobante {
  tipo: TipoComprobante
  primero: string
  ultimo: string
}

export interface ResumenCierre {
  total_ventas: number
  total_tickets: number
  total_facturas: number
  por_metodo_pago: {
    efectivo: number
    tarjeta: number
    billetera: number
  }
  monto_total: number
  monto_iva: number
  rango_comprobantes: RangoComprobante[]
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// Ítem en el carrito local (antes de guardar). Guarda el precio final por
// unidad tal cual se tipeó — el neto y el IVA se derivan de ahí, nunca al
// revés: dividir por 1,21 pierde información y no se puede volver.
export interface ItemCarrito {
  id: string
  descripcion: string
  precio_final: number
  cantidad: number
}
