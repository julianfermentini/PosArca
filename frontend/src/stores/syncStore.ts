import { create } from 'zustand'
import { contarPendientes, guardarVentaOffline, obtenerVentasPendientes, marcarSincronizada } from '../lib/offline'
import { syncApi } from '../lib/api'
import type { VentaOffline } from '../types'

interface SyncState {
  online: boolean
  pendientes: number
  sincronizando: boolean

  setOnline: (online: boolean) => void
  actualizarConteo: () => Promise<void>
  guardarOffline: (venta: VentaOffline) => Promise<void>
  sincronizar: () => Promise<void>
}

export const useSyncStore = create<SyncState>((set, get) => ({
  online: navigator.onLine,
  pendientes: 0,
  sincronizando: false,

  setOnline: (online) => {
    set({ online })
    if (online) get().sincronizar()
  },

  actualizarConteo: async () => {
    const pendientes = await contarPendientes()
    set({ pendientes })
  },

  guardarOffline: async (venta) => {
    await guardarVentaOffline(venta)
    await get().actualizarConteo()
  },

  sincronizar: async () => {
    if (get().sincronizando) return
    set({ sincronizando: true })

    try {
      const pendientes = await obtenerVentasPendientes()
      if (pendientes.length === 0) return

      const { data } = await syncApi.sincronizar(pendientes)
      if (data.success && data.data) {
        const exitosas = data.data.resultados.filter((r) => r.success)
        await Promise.all(exitosas.map((r) => marcarSincronizada(r.id)))
        const fallidas = data.data.resultados.filter((r) => !r.success)
        if (fallidas.length > 0) {
          // Quedan en PENDIENTE a propósito — se reintentan en el próximo sync.
          console.error('Ventas no sincronizadas, se reintentarán:', fallidas)
        }
        await get().actualizarConteo()
      }
    } catch {
      // Silencioso — se reintentará cuando vuelva la conexión
    } finally {
      set({ sincronizando: false })
    }
  },
}))
