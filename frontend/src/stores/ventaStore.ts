import { create } from 'zustand'
import type { ItemCarrito, MetodoPago, ItemRequest } from '../types'
import { calcularIVA, calcularTotal } from '../lib/utils'

const newId = () => crypto.randomUUID()

interface VentaState {
  carrito: ItemCarrito[]
  metodoPago: MetodoPago | null
  descripcionActual: string
  precioActual: string

  setDescripcion: (desc: string) => void
  setPrecio: (precio: string) => void
  agregarItem: () => void
  eliminarItem: (id: string) => void
  limpiarCarrito: () => void
  setMetodoPago: (metodo: MetodoPago) => void

  // Totales calculados localmente para mostrar en pantalla
  getSubtotal: () => number
  getIVA: () => number
  getTotal: () => number

  // Solo descripcion + precio_neto — el backend calcula IVA y total
  getItemsParaAPI: () => ItemRequest[]
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

    set((s) => ({
      carrito: [...s.carrito, { id: newId(), descripcion: descripcionActual.trim(), precio_neto: precioNeto }],
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

  getIVA: () => calcularIVA(get().getSubtotal()),

  getTotal: () => calcularTotal(get().getSubtotal()),

  // El backend recalcula — solo enviamos lo mínimo
  getItemsParaAPI: () =>
    get().carrito.map((item) => ({
      descripcion: item.descripcion,
      precio_neto: item.precio_neto,
    })),
}))
