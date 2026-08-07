import type { VentaState } from '../stores/ventaStore'
import type { SyncState } from '../stores/syncStore'
import type { PrinterStore } from '../stores/printerStore'
import { ventasApi, facturasApi, type Empresa } from './api'
import { validarCUIT, generarUUID } from './utils'
import { buildEmpresaBase, itemsParaTicket } from './printer'

export interface EmitirVentaParams {
  store: VentaState
  sync: SyncState
  printer: PrinterStore
  empresa: Empresa | null
  needsFactura: boolean
  razonSocial: string
  cuit: string
  emailCliente: string
}

export interface EmitirVentaResult {
  tipo: string
  numero: string
}

// Emite la venta actual del carrito: sincroniza pendientes offline si hace
// falta, arma el comprobante (factura / ticket offline / ticket online),
// imprime y vacía el carrito. Devuelve null cuando el backend responde sin
// éxito para el ticket online — no hay nada que mostrar, el carrito queda
// intacto para reintentar (igual que el comportamiento previo a este refactor).
//
// Todo lo que necesita se captura en variables locales ANTES de tocar la red
// — limpiarCarrito() recién se llama al final de cada rama exitosa, así
// ningún snapshot puede terminar leyendo el carrito ya vacío.
export async function emitirVenta(params: EmitirVentaParams): Promise<EmitirVentaResult | null> {
  const { store, sync, printer, empresa, needsFactura, razonSocial, cuit, emailCliente } = params

  const snapItems     = store.getItemsParaAPI()
  const snapCarrito   = store.carrito
  const snapSubtotal  = store.getSubtotal()
  const snapIva       = store.getIVA()
  const snapTotal     = store.getTotal()
  const snapEf        = store.montoEfectivo
  const snapTar       = store.montoTarjeta
  const snapBil       = store.montoBilletera
  const snapDescPct   = store.descuentoPct
  const snapDescMonto = store.getDescuentoTotal()

  const empresaBase = buildEmpresaBase(empresa)
  const itemsPrinter = itemsParaTicket(snapCarrito)
  const totalesPrinter = {
    subtotal: snapSubtotal, iva: snapIva, total: snapTotal,
    descuentoPct: snapDescPct, descuentoMonto: snapDescMonto,
  }
  const pagosPrinter = { montoEfectivo: snapEf, montoTarjeta: snapTar, montoBilletera: snapBil }

  const imprimirNoFiscalSnap = () => {
    if (!printer.conectado) return
    printer.imprimirNoFiscal({ ...empresaBase, items: itemsPrinter, ...totalesPrinter, ...pagosPrinter })
  }

  // Sincronizar ventas offline pendientes antes de emitir — si no, esta venta
  // consigue número antes que una anterior, rompiendo el orden correlativo ARCA.
  if (sync.online && sync.pendientes > 0) {
    await sync.sincronizar()
  }

  if (needsFactura) {
    if (!razonSocial.trim())         throw new Error('Ingresá la razón social')
    if (!validarCUIT(cuit))          throw new Error('CUIT inválido')
    if (!emailCliente.includes('@')) throw new Error('Email inválido')

    const { data } = await facturasApi.crear({
      items:           snapItems,
      monto_efectivo:  snapEf,
      monto_tarjeta:   snapTar,
      monto_billetera: snapBil,
      razon_social:    razonSocial.trim(),
      cuit_cliente:    cuit,
      email_cliente:   emailCliente,
    })
    if (!data.success) throw new Error(data.error || 'Error al emitir factura')

    store.limpiarCarrito()
    // ARCA caído: la factura se autoriza sola en segundo plano; mientras, no fiscal.
    if (data.data!.pendiente_cae) imprimirNoFiscalSnap()
    return { tipo: 'Factura', numero: data.data!.pendiente_cae ? 'PENDIENTE' : data.data!.numero }
  }

  if (!sync.online) {
    await sync.guardarOffline({
      id: generarUUID(), tipo: 'TICKET',
      items:           snapItems,
      monto_efectivo:  snapEf,
      monto_tarjeta:   snapTar,
      monto_billetera: snapBil,
      created_at:      new Date().toISOString(),
      estado_sync:     'PENDIENTE',
    })
    store.limpiarCarrito()
    imprimirNoFiscalSnap()
    return { tipo: 'Ticket', numero: 'OFFLINE' }
  }

  const { data } = await ventasApi.crear({
    tipo:            'TICKET',
    items:           snapItems,
    monto_efectivo:  snapEf,
    monto_tarjeta:   snapTar,
    monto_billetera: snapBil,
  })
  if (!data.success || !data.data) return null

  store.limpiarCarrito()
  if (data.data.pendiente_cae) {
    imprimirNoFiscalSnap()
    return { tipo: 'Ticket', numero: 'PENDIENTE' }
  }

  if (printer.conectado) {
    printer.imprimir({
      ...empresaBase,
      inicioActividades: empresa?.inicio_actividades ?? '',
      puntoVenta:        empresa?.punto_venta ?? 1,
      tipoCmp:           'TICKET',
      numero:            data.data.numero,
      items:             itemsPrinter,
      ...totalesPrinter,
      ...pagosPrinter,
      cae:    data.data.cae ?? '',
      caeVto: data.data.cae_vto ?? '',
      qrData: data.data.qr_data ?? '',
    })
  }
  return { tipo: 'Ticket', numero: data.data.numero }
}
