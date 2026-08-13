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
  register: (email: string, password: string, negocio_nombre: string, invite_code: string) =>
    api.post<ApiResponse<{ token: string; email: string; negocio_nombre: string }>>('/auth/register', { email, password, negocio_nombre, invite_code }),
  status: () =>
    api.get<ApiResponse<{ has_users: boolean; invite_enabled: boolean }>>('/auth/status'),
  cambiarPassword: (passwordActual: string, passwordNueva: string) =>
    api.put<ApiResponse<object>>('/auth/password', { password_actual: passwordActual, password_nueva: passwordNueva }),
}

export interface CrearVentaPayload {
  tipo: 'TICKET'
  items: ItemRequest[]
  monto_efectivo:  number
  monto_tarjeta:   number
  monto_billetera: number
}

export interface CrearFacturaPayload {
  items: ItemRequest[]
  monto_efectivo:  number
  monto_tarjeta:   number
  monto_billetera: number
  razon_social: string
  cuit_cliente: string
  email_cliente: string
}

export const ventasApi = {
  // pendiente_cae = true cuando ARCA no estaba disponible: la venta quedó registrada
  // y el CAE se conseguirá en segundo plano; cae/cae_vto/qr_data vienen vacíos en
  // ese caso. Cuando hay CAE, numero pasa a ser el número real que autorizó ARCA
  // (no el contador local) — es el que hay que imprimir/mostrar.
  crear: (payload: CrearVentaPayload) =>
    api.post<ApiResponse<{ id: string; numero: string; cae?: string; cae_vto?: string; qr_data?: string; total: number; pendiente_cae: boolean }>>('/ventas', payload),

  listar: (fecha?: string) =>
    api.get<ApiResponse<Venta[]>>('/ventas', { params: fecha ? { fecha } : {} }),

  diasConVentas: (mes: string) =>
    api.get<ApiResponse<string[]>>('/ventas/dias', { params: { mes } }),
}

export const facturasApi = {
  crear: (payload: CrearFacturaPayload) =>
    api.post<ApiResponse<{ id: string; numero: string; cae?: string; cae_vto?: string; qr_data?: string; email_enviado: boolean; pendiente_cae: boolean }>>('/facturas', payload),

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

export interface VentaPendienteCAE {
  venta_id: string
  tipo: 'TICKET' | 'FACTURA'
  numero: string
  created_at: string
  total: number
  intentos: number
  estado: 'PENDIENTE' | 'ERROR'
  ultimo_error?: string
  razon_social?: string
  cuit_cliente?: string
  email_cliente?: string
}

export const pendientesCAEApi = {
  listar: () =>
    api.get<ApiResponse<VentaPendienteCAE[]>>('/pendientes-cae'),
  anular: (ventaId: string, motivo?: string) =>
    api.post<ApiResponse<null>>(`/pendientes-cae/${ventaId}/anular`, { motivo }),
  corregir: (ventaId: string, payload: { razon_social: string; cuit_cliente: string; email_cliente: string }) =>
    api.put<ApiResponse<null>>(`/pendientes-cae/${ventaId}/corregir`, payload),
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

export interface RotuloAPI {
  id: string
  nombre: string
  precio: number
}

export const rotulosApi = {
  listar: () =>
    api.get<ApiResponse<RotuloAPI[]>>('/rotulos'),
  // Upsert: si ya hay un rótulo con ese nombre, le pisa el precio.
  guardar: (nombre: string, precio: number) =>
    api.post<ApiResponse<RotuloAPI>>('/rotulos', { nombre, precio }),
  eliminar: (id: string) =>
    api.delete<ApiResponse<null>>(`/rotulos/${id}`),
}

export interface CuentaAdmin {
  id: string
  razon_social: string
  titular: string
  cuit: string
  email: string
  punto_venta: number
  arca_env: string
  activo: boolean
  direccion: string
  telefono: string
  condicion_iva: string
  ing_brutos: string
  inicio_actividades: string
  defensa_consumidor: string
  created_at: string
}

export interface ActualizarCuentaPayload {
  razon_social: string
  titular: string
  cuit: string
  email: string
  punto_venta: number
  arca_env: string
  direccion: string
  telefono: string
  condicion_iva: string
  ing_brutos: string
  inicio_actividades: string
  defensa_consumidor: string
}

const adminHeaders = (secret: string) => ({ headers: { 'X-Admin-Secret': secret } })

export const adminApi = {
  listarCuentas: (secret: string) =>
    api.get<ApiResponse<CuentaAdmin[]>>('/admin/cuentas', adminHeaders(secret)),
  crearCuenta: (secret: string, email: string, password: string, negocio_nombre: string) =>
    api.post<ApiResponse<{ email: string; negocio_nombre: string }>>('/admin/crear-cuenta', { email, password, negocio_nombre }, adminHeaders(secret)),
  resetPassword: (secret: string, email: string, new_password: string) =>
    api.post<ApiResponse<null>>('/admin/reset-password', { email, new_password }, adminHeaders(secret)),
  actualizarCuenta: (secret: string, id: string, payload: ActualizarCuentaPayload) =>
    api.put<ApiResponse<null>>(`/admin/cuentas/${id}`, payload, adminHeaders(secret)),
  cambiarEstado: (secret: string, id: string, activo: boolean) =>
    api.patch<ApiResponse<null>>(`/admin/cuentas/${id}/estado`, { activo }, adminHeaders(secret)),
  eliminarCuenta: (secret: string, id: string) =>
    api.delete<ApiResponse<null>>(`/admin/cuentas/${id}`, adminHeaders(secret)),
}

export default api
