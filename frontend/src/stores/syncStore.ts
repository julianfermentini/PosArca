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
        // En una implementación completa, marcar individualmente según resultados
        for (const venta of pendientes) {
          await marcarSincronizada(venta.id)
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
