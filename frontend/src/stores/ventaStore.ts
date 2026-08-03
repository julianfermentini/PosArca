import { create } from 'zustand'
import type { ItemCarrito, ItemRequest } from '../types'
import { calcularIVA, calcularTotal, calcularNeto, redondear } from '../lib/utils'

const newId = () => crypto.randomUUID()

// Descuentos disponibles en el combo (0 = sin descuento).
export const DESCUENTOS = [0, 5, 10, 15, 20] as const

interface VentaState {
  carrito: ItemCarrito[]
  montoEfectivo: number
  montoTarjeta: number
  montoBilletera: number
  descripcionActual: string
  precioActual: string
  descuentoPct: number

  setDescripcion: (desc: string) => void
  setPrecio: (precio: string) => void
  agregarItem: () => void
  agregarItemDirecto: (descripcion: string, precioFinal: number) => void
  eliminarItem: (id: string) => void
  incrementarItem: (id: string) => void
  decrementarItem: (id: string) => void
  limpiarCarrito: () => void
  setMontoEfectivo: (monto: number) => void
  setMontoTarjeta: (monto: number) => void
  setMontoBilletera: (monto: number) => void
  setDescuento: (pct: number) => void

  getSubtotal: () => number
  getNetoConDescuento: () => number
  getDescuentoNeto: () => number
  getDescuentoTotal: () => number
  getIVA: () => number
  getTotal: () => number
  getSumaPagos: () => number
  getItemsParaAPI: () => ItemRequest[]
}

// Neto unitario con el descuento aplicado, redondeado por unidad igual que el
// backend. Es la fuente de verdad: los items se mandan con este neto, así ARCA,
// el total y el ticket ven todos la misma base imponible reducida.
const netoUnitConDesc = (neto: number, pct: number) => redondear(neto * (1 - pct / 100))

export const useVentaStore = create<VentaState>((set, get) => ({
  carrito: [],
  montoEfectivo: 0,
  montoTarjeta: 0,
  montoBilletera: 0,
  descripcionActual: '',
  precioActual: '',
  descuentoPct: 0,

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
    set({ carrito: [], montoEfectivo: 0, montoTarjeta: 0, montoBilletera: 0, descripcionActual: '', precioActual: '', descuentoPct: 0 }),

  setMontoEfectivo:  (monto) => set({ montoEfectivo: monto }),
  setMontoTarjeta:   (monto) => set({ montoTarjeta: monto }),
  setMontoBilletera: (monto) => set({ montoBilletera: monto }),

  // Cambiar el descuento resetea los pagos: el total cambia y montos ya cargados
  // quedarían desalineados.
  setDescuento: (pct) => set({ descuentoPct: pct, montoEfectivo: 0, montoTarjeta: 0, montoBilletera: 0 }),

  // Neto bruto, sin descuento — base del descuento y del "Subtotal neto".
  getSubtotal: () =>
    get().carrito.reduce((acc, item) => acc + item.precio_neto * item.cantidad, 0),

  // Neto ya descontado — lo que realmente se factura.
  getNetoConDescuento: () => {
    const pct = get().descuentoPct
    return get().carrito.reduce((acc, item) => acc + netoUnitConDesc(item.precio_neto, pct) * item.cantidad, 0)
  },

  getDescuentoNeto: () => redondear(get().getSubtotal() - get().getNetoConDescuento()),

  // Descuento en pesos con IVA incluido — para la línea del ticket.
  getDescuentoTotal: () => redondear(calcularTotal(get().getSubtotal()) - get().getTotal()),

  getIVA: () => calcularIVA(get().getNetoConDescuento()),

  getTotal: () => {
    const neto = get().getNetoConDescuento()
    return redondear(neto + calcularIVA(neto))
  },

  getSumaPagos: () => {
    const { montoEfectivo, montoTarjeta, montoBilletera } = get()
    return montoEfectivo + montoTarjeta + montoBilletera
  },

  // Una línea por producto, con cantidad — el backend guarda una fila por línea.
  // El neto ya lleva el descuento aplicado, así ARCA factura la base reducida.
  getItemsParaAPI: () => {
    const pct = get().descuentoPct
    return get().carrito.map(item => ({
      descripcion: item.descripcion,
      precio_neto: netoUnitConDesc(item.precio_neto, pct),
      cantidad: item.cantidad,
    }))
  },
}))
