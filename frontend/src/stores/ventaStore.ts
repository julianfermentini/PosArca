import { create } from 'zustand'
import type { ItemCarrito, ItemRequest } from '../types'
import { calcularNeto, redondear } from '../lib/utils'

const newId = () => crypto.randomUUID()

// Descuentos disponibles en el combo (0 = sin descuento).
export const DESCUENTOS = [0, 5, 10, 15, 20] as const

export interface VentaState {
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

// El precio final por unidad es la fuente de verdad. El descuento se aplica
// sobre él (que es lo que significa un descuento para el cliente) y el neto se
// deriva dividiendo, igual que en models.NuevoVentaItem del backend. El IVA
// sale siempre por RESTA (final − neto), así neto + IVA vuelve a dar exacto el
// precio tipeado aunque la división no sea redonda.
const finalUnitConDesc = (final: number, pct: number) => redondear(final * (1 - pct / 100))

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
    const precioFinal = redondear(parseFloat(precioActual))
    if (!descripcionActual.trim() || isNaN(precioFinal) || precioFinal <= 0) return
    const desc = descripcionActual.trim()

    // Si ya existe el mismo producto con el mismo precio, incrementar cantidad
    const existente = carrito.find(i => i.descripcion === desc && i.precio_final === precioFinal)
    if (existente) {
      set((s) => ({
        carrito: s.carrito.map(i => i.id === existente.id ? { ...i, cantidad: i.cantidad + 1 } : i),
        descripcionActual: '',
        precioActual: '',
      }))
    } else {
      set((s) => ({
        carrito: [...s.carrito, { id: newId(), descripcion: desc, precio_final: precioFinal, cantidad: 1 }],
        descripcionActual: '',
        precioActual: '',
      }))
    }
  },

  agregarItemDirecto: (descripcion, precioFinalRaw) => {
    const precioFinal = redondear(precioFinalRaw)
    if (!descripcion.trim() || precioFinal <= 0) return
    const desc = descripcion.trim()
    const existente = get().carrito.find(i => i.descripcion === desc && i.precio_final === precioFinal)
    if (existente) {
      set((s) => ({
        carrito: s.carrito.map(i => i.id === existente.id ? { ...i, cantidad: i.cantidad + 1 } : i),
      }))
    } else {
      set((s) => ({
        carrito: [...s.carrito, { id: newId(), descripcion: desc, precio_final: precioFinal, cantidad: 1 }],
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

  // Neto bruto, sin descuento — base del "Subtotal neto" en pantalla.
  getSubtotal: () =>
    get().carrito.reduce((acc, item) => acc + calcularNeto(item.precio_final) * item.cantidad, 0),

  // Neto ya descontado — la base imponible que se factura.
  getNetoConDescuento: () => {
    const pct = get().descuentoPct
    return get().carrito.reduce(
      (acc, item) => acc + calcularNeto(finalUnitConDesc(item.precio_final, pct)) * item.cantidad, 0)
  },

  getDescuentoNeto: () => redondear(get().getSubtotal() - get().getNetoConDescuento()),

  // Descuento en pesos con IVA incluido — para la línea del ticket.
  getDescuentoTotal: () => {
    const pct = get().descuentoPct
    return redondear(get().carrito.reduce(
      (acc, item) => acc + (item.precio_final - finalUnitConDesc(item.precio_final, pct)) * item.cantidad, 0))
  },

  // IVA por resta, igual que el backend: nunca como 21% del neto redondeado.
  getIVA: () => {
    const pct = get().descuentoPct
    return redondear(get().carrito.reduce((acc, item) => {
      const final = finalUnitConDesc(item.precio_final, pct)
      return acc + (final - calcularNeto(final)) * item.cantidad
    }, 0))
  },

  // Suma de los precios finales: sin una sola división, así no puede
  // discrepar del total que calcula el backend ni del que autoriza ARCA.
  getTotal: () => {
    const pct = get().descuentoPct
    return redondear(get().carrito.reduce(
      (acc, item) => acc + finalUnitConDesc(item.precio_final, pct) * item.cantidad, 0))
  },

  getSumaPagos: () => {
    const { montoEfectivo, montoTarjeta, montoBilletera } = get()
    return montoEfectivo + montoTarjeta + montoBilletera
  },

  // Una línea por producto, con cantidad — el backend guarda una fila por línea.
  // El precio ya lleva el descuento aplicado, así ARCA factura el monto reducido.
  //
  // Se mandan los dos precios a propósito: el backend nuevo usa precio_final y
  // uno viejo sólo entiende precio_neto, así el deploy del frontend y el del
  // backend pueden salir en cualquier orden sin cortar la caja.
  getItemsParaAPI: () => {
    const pct = get().descuentoPct
    return get().carrito.map(item => {
      const final = finalUnitConDesc(item.precio_final, pct)
      return {
        descripcion: item.descripcion,
        precio_final: final,
        precio_neto: calcularNeto(final),
        cantidad: item.cantidad,
      }
    })
  },
}))
