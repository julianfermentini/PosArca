export type TipoComprobante = 'TICKET' | 'FACTURA'
export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'BILLETERA'
export type EstadoFactura = 'PENDIENTE' | 'AUTORIZADO' | 'ERROR'
export type EstadoSync = 'PENDIENTE' | 'PROCESANDO' | 'SINCRONIZADO' | 'ERROR'

// Ítem normalizado — una fila en venta_items
export interface VentaItem {
  id: string
  venta_id: string
  descripcion: string
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
  metodo_pago: MetodoPago
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

// Lo que el frontend envía al backend — solo descripción y precio neto
// El backend calcula IVA y total
export interface ItemRequest {
  descripcion: string
  precio_neto: number
}

export interface VentaOffline {
  id: string
  tipo: TipoComprobante
  items: ItemRequest[]
  metodo_pago: MetodoPago
  created_at: string
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

// Ítem en el carrito local (antes de guardar)
export interface ItemCarrito {
  id: string
  descripcion: string
  precio_neto: number
  cantidad: number
}
