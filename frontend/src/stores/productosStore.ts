import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Producto {
  id: string
  nombre: string
  precio: number | null
}

interface ProductosState {
  productos: Producto[]
  agregar: (nombre: string, precio: number | null) => void
  editar: (id: string, nombre: string, precio: number | null) => void
  eliminar: (id: string) => void
}

export const useProductosStore = create<ProductosState>()(
  persist(
    (set) => ({
      productos: [],
      agregar: (nombre, precio) =>
        set((s) => ({
          productos: [...s.productos, { id: crypto.randomUUID(), nombre: nombre.trim(), precio }],
        })),
      editar: (id, nombre, precio) =>
        set((s) => ({
          productos: s.productos.map((p) => (p.id === id ? { ...p, nombre: nombre.trim(), precio } : p)),
        })),
      eliminar: (id) =>
        set((s) => ({ productos: s.productos.filter((p) => p.id !== id) })),
    }),
    { name: 'pos-productos' }
  )
)
