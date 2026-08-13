import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { rotulosApi } from '../lib/api'
import { extractError } from '../lib/utils'

export interface Rotulo {
  id: string
  nombre: string
  precio: number
}

// guardar/editar devuelven null si salió bien, o el mensaje de error a mostrar
// (ej. "ya tenés un rótulo con ese nombre" cuando se renombra a uno repetido).
type Resultado = Promise<string | null>

interface RotulosState {
  rotulos: Rotulo[]
  cargar: () => Promise<void>
  guardar: (nombre: string, precio: number) => Resultado
  editar: (id: string, nombre: string, precio: number) => Resultado
  eliminar: (id: string) => Promise<void>
  reset: () => void
}

// El orden lo decide siempre el cliente: el ORDER BY del server usa la
// collation de Postgres, que con acentos y Ñ no ordena igual que el español.
// Si cada camino usara su criterio, un rótulo saltaría de lugar al recargar.
const porNombre = (rs: Rotulo[]) => [...rs].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

export const useRotulosStore = create<RotulosState>()(
  persist(
    (set, get) => {
      // Aplica la fila que devolvió el server, que es siempre la real: en un
      // alta trae el id nuevo, y en un upsert/edición el de la fila existente.
      const aplicar = (r: Rotulo) =>
        set(s => ({ rotulos: porNombre([...s.rotulos.filter(x => x.id !== r.id), r]) }))

      return {
        rotulos: [],

        cargar: async () => {
          try {
            const r = await rotulosApi.listar()
            if (r.data.success && r.data.data) set({ rotulos: porNombre(r.data.data) })
          } catch {}
        },

        // Sin update optimista, a diferencia de productosStore: guardar es un
        // upsert y editar puede rebotar por nombre repetido, así que hasta que
        // responde el server no sabemos con qué fila nos quedamos.
        guardar: async (nombre, precio) => {
          try {
            const r = await rotulosApi.guardar(nombre, precio)
            if (!r.data.success || !r.data.data) return 'No se pudo guardar'
            aplicar(r.data.data)
            return null
          } catch (e) {
            return extractError(e, 'No se pudo guardar')
          }
        },

        editar: async (id, nombre, precio) => {
          try {
            const r = await rotulosApi.actualizar(id, nombre, precio)
            if (!r.data.success || !r.data.data) return 'No se pudo guardar'
            aplicar(r.data.data)
            return null
          } catch (e) {
            return extractError(e, 'No se pudo guardar')
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
      }
    },
    { name: 'pos-rotulos' }
  )
)
