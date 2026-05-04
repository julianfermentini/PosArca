import axios from 'axios'
import type { ApiResponse, Venta, Factura, ResumenCierre, VentaOffline } from '../types'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

export interface CrearVentaPayload {
  tipo: 'TICKET'
  items: { descripcion: string; precio_neto: number; iva: number; total: number }[]
  metodo_pago: 'EFECTIVO' | 'TARJETA' | 'BILLETERA'
}

export interface CrearFacturaPayload {
  items: { descripcion: string; precio_neto: number; iva: number; total: number }[]
  metodo_pago: 'EFECTIVO' | 'TARJETA' | 'BILLETERA'
  razon_social: string
  cuit_cliente: string
  email_cliente: string
}

export const ventasApi = {
  crear: (payload: CrearVentaPayload) =>
    api.post<ApiResponse<{ id: string; numero: string; cae: string; total: number }>>('/ventas', payload),

  listar: (fecha?: string) =>
    api.get<ApiResponse<Venta[]>>('/ventas', { params: fecha ? { fecha } : {} }),
}

export const facturasApi = {
  crear: (payload: CrearFacturaPayload) =>
    api.post<ApiResponse<{ id: string; numero: string; cae: string; email_enviado: boolean }>>('/facturas', payload),

  listar: () =>
    api.get<ApiResponse<Factura[]>>('/facturas'),
}

export const reportesApi = {
  cierre: (fecha?: string) =>
    api.get<ApiResponse<ResumenCierre>>('/reportes/cierre', { params: fecha ? { fecha } : {} }),
}

export const syncApi = {
  sincronizar: (ventas: VentaOffline[]) =>
    api.post<ApiResponse<{ total: number; exitosos: number }>>('/sync/ventas', { ventas }),
}

export default api
