import { create } from 'zustand'
import type { ItemCarrito, MetodoPago } from '../types'
import { calcularIVA, calcularTotal } from '../lib/utils'

const newId = () => crypto.randomUUID()

interface VentaState {
  carrito: ItemCarrito[]
  metodoPago: MetodoPago | null
  descripcionActual: string
  precioActual: string

  // Acciones de carrito
  setDescripcion: (desc: string) => void
  setPrecio: (precio: string) => void
  agregarItem: () => void
  eliminarItem: (id: string) => void
  limpiarCarrito: () => void
  setMetodoPago: (metodo: MetodoPago) => void

  // Computed (calculados a partir del carrito)
  getSubtotal: () => number
  getIVA: () => number
  getTotal: () => number
  getItemsParaAPI: () => { descripcion: string; precio_neto: number; iva: number; total: number }[]
}

export const useVentaStore = create<VentaState>((set, get) => ({
  carrito: [],
  metodoPago: null,
  descripcionActual: '',
  precioActual: '',

  setDescripcion: (desc) => set({ descripcionActual: desc }),
  setPrecio: (precio) => set({ precioActual: precio }),

  agregarItem: () => {
    const { descripcionActual, precioActual } = get()
    const precioNeto = parseFloat(precioActual)
    if (!descripcionActual.trim() || isNaN(precioNeto) || precioNeto <= 0) return

    const item: ItemCarrito = {
      id: newId(),
      descripcion: descripcionActual.trim(),
      precio_neto: precioNeto,
    }

    set((s) => ({
      carrito: [...s.carrito, item],
      descripcionActual: '',
      precioActual: '',
    }))
  },

  eliminarItem: (id) =>
    set((s) => ({ carrito: s.carrito.filter((i) => i.id !== id) })),

  limpiarCarrito: () =>
    set({ carrito: [], metodoPago: null, descripcionActual: '', precioActual: '' }),

  setMetodoPago: (metodo) => set({ metodoPago: metodo }),

  getSubtotal: () =>
    get().carrito.reduce((acc, item) => acc + item.precio_neto, 0),

  getIVA: () => {
    const subtotal = get().getSubtotal()
    return calcularIVA(subtotal)
  },

  getTotal: () => {
    const subtotal = get().getSubtotal()
    return calcularTotal(subtotal)
  },

  getItemsParaAPI: () =>
    get().carrito.map((item) => ({
      descripcion: item.descripcion,
      precio_neto: item.precio_neto,
      iva: calcularIVA(item.precio_neto),
      total: calcularTotal(item.precio_neto),
    })),
}))
