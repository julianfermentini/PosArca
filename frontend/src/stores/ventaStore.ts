import { create } from 'zustand'
import type { ItemCarrito, MetodoPago, ItemRequest } from '../types'
import { calcularIVA, calcularTotal, calcularNeto } from '../lib/utils'

const newId = () => crypto.randomUUID()

interface VentaState {
  carrito: ItemCarrito[]
  metodoPago: MetodoPago | null
  descripcionActual: string
  precioActual: string

  setDescripcion: (desc: string) => void
  setPrecio: (precio: string) => void
  agregarItem: () => void
  agregarItemDirecto: (descripcion: string, precioFinal: number) => void
  eliminarItem: (id: string) => void
  incrementarItem: (id: string) => void
  decrementarItem: (id: string) => void
  limpiarCarrito: () => void
  setMetodoPago: (metodo: MetodoPago) => void

  getSubtotal: () => number
  getIVA: () => number
  getTotal: () => number
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
    const { descripcionActual, precioActual, carrito } = get()
    const precioFinal = parseFloat(precioActual)
    if (!descripcionActual.trim() || isNaN(precioFinal) || precioFinal <= 0) return
    const precioNeto = calcularNeto(precioFinal)
    const desc = descripcionActual.trim()

    // Si ya existe el mismo producto con el mismo precio, incrementar cantidad
    const existente = carrito.find(i => i.descripcion === desc && i.precio_neto === precioNeto)
    if (existente) {
      set((s) => ({
        carrito: s.carrito.map(i => i.id === existente.id ? { ...i, cantidad: i.cantidad + 1 } : i),
        descripcionActual: '',
        precioActual: '',
      }))
    } else {
      set((s) => ({
        carrito: [...s.carrito, { id: newId(), descripcion: desc, precio_neto: precioNeto, cantidad: 1 }],
        descripcionActual: '',
        precioActual: '',
      }))
    }
  },

  agregarItemDirecto: (descripcion, precioFinal) => {
    const precioNeto = calcularNeto(precioFinal)
    if (!descripcion.trim() || precioNeto <= 0) return
    const desc = descripcion.trim()
    const existente = get().carrito.find(i => i.descripcion === desc && i.precio_neto === precioNeto)
    if (existente) {
      set((s) => ({
        carrito: s.carrito.map(i => i.id === existente.id ? { ...i, cantidad: i.cantidad + 1 } : i),
      }))
    } else {
      set((s) => ({
        carrito: [...s.carrito, { id: newId(), descripcion: desc, precio_neto: precioNeto, cantidad: 1 }],
      }))
    }
  },

  eliminarItem: (id) =>
    set((s) => ({ carrito: s.carrito.filter((i) => i.id !== id) })),

  incrementarItem: (id) =>
    set((s) => ({
      carrito: s.carrito.map(i => i.id === id ? { ...i, cantidad: i.cantidad + 1 } : i),
    })),

  decrementarItem: (id) =>
    set((s) => ({
      carrito: s.carrito
        .map(i => i.id === id ? { ...i, cantidad: i.cantidad - 1 } : i)
        .filter(i => i.cantidad > 0),
    })),

  limpiarCarrito: () =>
    set({ carrito: [], metodoPago: null, descripcionActual: '', precioActual: '' }),

  setMetodoPago: (metodo) => set({ metodoPago: metodo }),

  getSubtotal: () =>
    get().carrito.reduce((acc, item) => acc + item.precio_neto * item.cantidad, 0),

  getIVA: () => calcularIVA(get().getSubtotal()),

  getTotal: () => calcularTotal(get().getSubtotal()),

  // Una línea por producto, con cantidad — el backend guarda una fila por línea
  getItemsParaAPI: () =>
    get().carrito.map(item => ({
      descripcion: item.descripcion,
      precio_neto: item.precio_neto,
      cantidad: item.cantidad,
    })),
}))
