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

// La ÚNICA aritmética de plata del carrito: los montos de una línea, derivados
// igual que models.NuevoVentaItem en el backend. El precio final por unidad es
// la fuente de verdad; el descuento se aplica sobre él (que es lo que significa
// un descuento para el cliente), el neto sale de dividir y el IVA por RESTA
// (final − neto), así neto + IVA vuelve a dar exacto el precio tipeado aunque
// la división no sea redonda. Todo lo demás en este store es sumar esto.
function montosLinea(item: ItemCarrito, pct: number) {
  const final = redondear(item.precio_final * (1 - pct / 100))
  const neto = calcularNeto(final)
  return {
    finalUnit: final,
    netoUnit:  neto,
    neto:      neto * item.cantidad,
    iva:       (final - neto) * item.cantidad,
    total:     final * item.cantidad,
  }
}

type MontoLinea = 'neto' | 'iva' | 'total'
const sumar = (carrito: ItemCarrito[], pct: number, campo: MontoLinea) =>
  redondear(carrito.reduce((acc, item) => acc + montosLinea(item, pct)[campo], 0))

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

  // Neto bruto — el "Subtotal neto" de pantalla es el mismo cálculo con
  // descuento 0, no una fórmula aparte.
  getSubtotal: () => sumar(get().carrito, 0, 'neto'),

  // Neto ya descontado — la base imponible que se factura.
  getNetoConDescuento: () => sumar(get().carrito, get().descuentoPct, 'neto'),

  getDescuentoNeto: () => redondear(get().getSubtotal() - get().getNetoConDescuento()),

  // Descuento en pesos con IVA incluido — para la línea del ticket. Es la
  // diferencia entre los dos totales, así no puede desalinearse del TOTAL.
  getDescuentoTotal: () =>
    redondear(sumar(get().carrito, 0, 'total') - get().getTotal()),

  getIVA: () => sumar(get().carrito, get().descuentoPct, 'iva'),

  // Suma de precios finales, sin una sola división: no puede discrepar del
  // total que calcula el backend ni del que autoriza ARCA.
  getTotal: () => sumar(get().carrito, get().descuentoPct, 'total'),

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
      const m = montosLinea(item, pct)
      return {
        descripcion: item.descripcion,
        precio_final: m.finalUnit,
        precio_neto: m.netoUnit,
        cantidad: item.cantidad,
      }
    })
  },
}))
