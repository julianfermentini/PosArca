import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { productosApi } from '../lib/api'

export interface Producto {
  id: string
  nombre: string
  precio: number | null
}

interface ProductosState {
  productos: Producto[]
  cargar: () => Promise<void>
  agregar: (nombre: string, precio: number | null) => Promise<void>
  editar: (id: string, nombre: string, precio: number | null) => Promise<void>
  eliminar: (id: string) => Promise<void>
}

export const useProductosStore = create<ProductosState>()(
  persist(
    (set, get) => ({
      productos: [],

      cargar: async () => {
        try {
          const r = await productosApi.listar()
          if (!r.data.success || !r.data.data) return

          if (r.data.data.length === 0 && get().productos.length > 0) {
            // Migrar productos de localStorage a la BD (una sola vez)
            const locales = get().productos
            await Promise.all(locales.map(p => productosApi.crear(p.nombre, p.precio).catch(() => null)))
            const r2 = await productosApi.listar()
            if (r2.data.success && r2.data.data) set({ productos: r2.data.data })
          } else {
            set({ productos: r.data.data })
          }
        } catch {}
      },

      agregar: async (nombre, precio) => {
        const tempId = crypto.randomUUID()
        // Optimistic: mostrar de inmediato
        set(s => ({ productos: [...s.productos, { id: tempId, nombre, precio }] }))
        try {
          const r = await productosApi.crear(nombre, precio)
          if (r.data.success && r.data.data) {
            const real = r.data.data
            set(s => ({
              productos: s.productos.map(p => p.id === tempId
                ? { id: real.id, nombre: real.nombre, precio: real.precio }
                : p
              ),
            }))
          }
        } catch {
          set(s => ({ productos: s.productos.filter(p => p.id !== tempId) }))
        }
      },

      editar: async (id, nombre, precio) => {
        const prev = get().productos
        set(s => ({ productos: s.productos.map(p => p.id === id ? { ...p, nombre, precio } : p) }))
        try {
          await productosApi.actualizar(id, nombre, precio)
        } catch {
          set({ productos: prev })
        }
      },

      eliminar: async (id) => {
        const prev = get().productos
        set(s => ({ productos: s.productos.filter(p => p.id !== id) }))
        try {
          await productosApi.eliminar(id)
        } catch {
          set({ productos: prev })
        }
      },
    }),
    { name: 'pos-productos' }
  )
)
