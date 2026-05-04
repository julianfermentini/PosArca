export type TipoComprobante = 'TICKET' | 'FACTURA'
export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'BILLETERA'
export type EstadoFactura = 'PENDIENTE' | 'AUTORIZADO' | 'ERROR'
export type EstadoSync = 'PENDIENTE' | 'PROCESANDO' | 'SINCRONIZADO' | 'ERROR'

export interface ItemVenta {
  descripcion: string
  precio_neto: number
  iva: number
  total: number
}

export interface Venta {
  id: string
  tipo: TipoComprobante
  numero: string
  items: ItemVenta[]
  subtotal: number
  iva: number
  total: number
  metodo_pago: MetodoPago
  impreso: boolean
  sincronizado: boolean
  created_at: string
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
}

export interface VentaOffline extends Omit<Venta, 'numero' | 'impreso' | 'sincronizado'> {
  estado_sync: EstadoSync
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
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// Para el carrito de la pantalla de venta (antes de guardar)
export interface ItemCarrito {
  id: string // UUID local temporal
  descripcion: string
  precio_neto: number
}
