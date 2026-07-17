import axios from 'axios'
import type { ApiResponse, Venta, Factura, ResumenCierre, VentaOffline, ItemRequest } from '../types'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL as string | undefined) ?? '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('pos-auth')
  if (stored) {
    try {
      const { state } = JSON.parse(stored)
      if (state?.token) config.headers.Authorization = `Bearer ${state.token}`
    } catch {}
  }
  return config
})

export const authApi = {
  login: (email: string, password: string) =>
    api.post<ApiResponse<{ token: string; email: string; negocio_nombre: string }>>('/auth/login', { email, password }),
  register: (email: string, password: string, negocio_nombre: string) =>
    api.post<ApiResponse<{ token: string; email: string; negocio_nombre: string }>>('/auth/register', { email, password, negocio_nombre }),
  status: () =>
    api.get<ApiResponse<{ has_users: boolean }>>('/auth/status'),
}

export interface CrearVentaPayload {
  tipo: 'TICKET'
  items: ItemRequest[]
  metodo_pago: 'EFECTIVO' | 'TARJETA' | 'BILLETERA'
}

export interface CrearFacturaPayload {
  items: ItemRequest[]
  metodo_pago: 'EFECTIVO' | 'TARJETA' | 'BILLETERA'
  razon_social: string
  cuit_cliente: string
  email_cliente: string
}

export const ventasApi = {
  crear: (payload: CrearVentaPayload) =>
    api.post<ApiResponse<{ id: string; numero: string; cae: string; cae_vto: string; total: number }>>('/ventas', payload),

  listar: (fecha?: string) =>
    api.get<ApiResponse<Venta[]>>('/ventas', { params: fecha ? { fecha } : {} }),

  diasConVentas: (mes: string) =>
    api.get<ApiResponse<string[]>>('/ventas/dias', { params: { mes } }),
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

export interface SyncResultadoItem {
  id: string
  numero?: string
  cae?: string
  error?: string
  success: boolean
}

export const syncApi = {
  // El backend procesa el lote secuencial (no en paralelo) para no perder el orden
  // correlativo de numeración ante ARCA, así que puede tardar más que el timeout
  // por defecto si hay muchas ventas pendientes.
  sincronizar: (ventas: VentaOffline[]) =>
    api.post<ApiResponse<{ total: number; exitosos: number; resultados: SyncResultadoItem[] }>>(
      '/sync/ventas', { ventas }, { timeout: 120000 },
    ),
}

export interface Empresa {
  id?: string
  razon_social:        string
  titular:             string
  cuit:                string
  punto_venta:         number
  direccion:           string
  telefono:            string
  condicion_iva:       string
  ing_brutos:          string
  inicio_actividades:  string
  defensa_consumidor:  string
}

export interface UpdateEmpresaPayload {
  razon_social:        string
  titular:             string
  direccion:           string
  telefono:            string
  condicion_iva:       string
  ing_brutos:          string
  inicio_actividades:  string
  defensa_consumidor:  string
}

export const empresaApi = {
  get: () =>
    api.get<ApiResponse<Empresa>>('/empresa'),
  update: (payload: UpdateEmpresaPayload) =>
    api.put<ApiResponse<Empresa>>('/empresa', payload),
}

export interface ProductoAPI {
  id: string
  nombre: string
  precio: number | null
}

export const productosApi = {
  listar: () =>
    api.get<ApiResponse<ProductoAPI[]>>('/productos'),
  crear: (nombre: string, precio: number | null) =>
    api.post<ApiResponse<ProductoAPI>>('/productos', { nombre, precio }),
  actualizar: (id: string, nombre: string, precio: number | null) =>
    api.put<ApiResponse<ProductoAPI>>(`/productos/${id}`, { nombre, precio }),
  eliminar: (id: string) =>
    api.delete<ApiResponse<null>>(`/productos/${id}`),
}

export default api
