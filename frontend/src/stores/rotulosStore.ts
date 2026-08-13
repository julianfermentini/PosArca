import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { rotulosApi } from '../lib/api'

export interface Rotulo {
  id: string
  nombre: string
  precio: number
}

interface RotulosState {
  rotulos: Rotulo[]
  cargar: () => Promise<void>
  guardar: (nombre: string, precio: number) => Promise<boolean>
  eliminar: (id: string) => Promise<void>
  reset: () => void
}

// El orden lo decide siempre el cliente: el ORDER BY del server usa la
// collation de Postgres, que con acentos y Ñ no ordena igual que el español.
// Si cada camino usara su criterio, un rótulo saltaría de lugar al recargar.
const porNombre = (rs: Rotulo[]) => [...rs].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

export const useRotulosStore = create<RotulosState>()(
  persist(
    (set, get) => ({
      rotulos: [],

      cargar: async () => {
        try {
          const r = await rotulosApi.listar()
          if (r.data.success && r.data.data) set({ rotulos: porNombre(r.data.data) })
        } catch {}
      },

      // A diferencia de productosStore, acá no hay update optimista: guardar es
      // un upsert, así que hasta que responde el server no sabemos si el rótulo
      // es nuevo o si le pisamos el precio a uno que ya estaba. Se aplica la
      // fila que devuelve el server, que es siempre la real.
      guardar: async (nombre, precio) => {
        try {
          const r = await rotulosApi.guardar(nombre, precio)
          if (!r.data.success || !r.data.data) return false
          const guardado = r.data.data
          set(s => ({ rotulos: porNombre([...s.rotulos.filter(x => x.id !== guardado.id), guardado]) }))
          return true
        } catch {
          return false
        }
      },

      eliminar: async (id) => {
        const prev = get().rotulos
        set(s => ({ rotulos: s.rotulos.filter(r => r.id !== id) }))
        try {
          await rotulosApi.eliminar(id)
        } catch {
          set({ rotulos: prev })
        }
      },

      reset: () => set({ rotulos: [] }),
    }),
    { name: 'pos-rotulos' }
  )
)
