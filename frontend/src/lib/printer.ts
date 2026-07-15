// ─── ESC/POS encoder mínimo para impresoras térmicas ──────────────────────────

const CP1252: Record<string, number> = {
  á: 0xe1, é: 0xe9, í: 0xed, ó: 0xf3, ú: 0xfa,
  Á: 0xc1, É: 0xc9, Í: 0xcd, Ó: 0xd3, Ú: 0xda,
  ñ: 0xf1, Ñ: 0xd1, ü: 0xfc, Ü: 0xdc,
  '°': 0xb0, '¡': 0xa1, '¿': 0xbf,
}

class EscPos {
  private buf: number[] = []

  private push(...b: number[]) { this.buf.push(...b); return this }

  init()               { return this.push(0x1b, 0x40) }
  center()             { return this.push(0x1b, 0x61, 0x01) }
  left()               { return this.push(0x1b, 0x61, 0x00) }
  right()              { return this.push(0x1b, 0x61, 0x02) }
  bold(on: boolean)    { return this.push(0x1b, 0x45, on ? 1 : 0) }
  doubleH(on: boolean) { return this.push(0x1d, 0x21, on ? 0x01 : 0x00) }
  lf(n = 1)            { for (let i = 0; i < n; i++) this.buf.push(0x0a); return this }
  cut()                { return this.push(0x1d, 0x56, 0x01) }

  text(s: string) {
    for (const ch of s) {
      const code = ch.codePointAt(0) ?? 63
      this.buf.push(code < 128 ? code : (CP1252[ch] ?? 63))
    }
    return this
  }

  line(s: string) { return this.text(s).lf() }
  sep(w = 32)     { return this.text('-'.repeat(w)).lf() }

  // Dos columnas en W chars: izquierda y derecha
  twoCol(left: string, right: string, w = 32) {
    const spaces = Math.max(1, w - left.length - right.length)
    return this.text(left + ' '.repeat(spaces) + right).lf()
  }

  // Línea de item: descripción izquierda, "(IVA)  precio" derecha
  itemLine(desc: string, ivaLabel: string, price: string, w = 32) {
    const right = ivaLabel + price
    const maxDesc = Math.max(1, w - right.length - 1)
    const d = desc.slice(0, maxDesc).toUpperCase()
    const spaces = Math.max(1, w - d.length - right.length)
    return this.text(d + ' '.repeat(spaces) + right).lf()
  }

  // QR code via GS ( k (ESC/POS estándar)
  qrCode(data: string, size = 5) {
    const bytes = Array.from(data).map(c => c.charCodeAt(0))
    const len = bytes.length + 3
    const pL = len & 0xff
    const pH = (len >> 8) & 0xff
    // Model 2
    this.push(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00)
    // Module size
    this.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size)
    // Error correction level M
    this.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x32)
    // Store data
    this.push(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...bytes)
    // Print
    this.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30)
    return this
  }

  bytes() { return new Uint8Array(this.buf) }
}

// ─── Datos que necesita el ticket ─────────────────────────────────────────────

export interface DatosTicketFront {
  negocioNombre:      string
  titular?:           string
  cuit:               string
  ingBrutos?:         string
  direccion?:         string
  inicioActividades?: string
  defensaConsumidor?: string
  condicionIVA?:      string
  puntoVenta:         number
  tipoCmp:            string
  numero:             string
  items:              Array<{ descripcion: string; precioNeto: number; total: number }>
  subtotal:           number
  iva:                number
  total:              number
  metodoPago:         string
  cae:                string
  caeVto:             string
  // Overrides para reimpresión (muestra fecha/hora original)
  fechaHora?: string   // ej. "14/07/2026  14:18:54"
  fechaISO?:  string   // ej. "2026-07-14" — para el QR ARCA
}

// ─── Construye la URL del QR ARCA según RG 5616/2024 ──────────────────────────
function buildArcaQR(d: DatosTicketFront): string {
  const cuitNum = parseInt(d.cuit.replace(/\D/g, ''), 10) || 0
  const parts   = d.numero.split('-')
  const ptoVta  = parseInt(parts[0] ?? '1', 10) || d.puntoVenta
  const nroCmp  = parseInt(parts[1] ?? '0', 10) || 0
  const fecha   = d.fechaISO ?? new Date().toISOString().slice(0, 10)
  const payload = {
    ver: 1, fecha, cuit: cuitNum, ptoVta,
    tipoCmp: 83, nroCmp,
    importe: d.total, moneda: 'PES', ctz: 1,
    tipoDocRec: 99, nroDocRec: 0,
    tipoCodAut: 'E',
    codAut: parseInt(d.cae, 10) || 0,
  }
  return `https://www.afip.gov.ar/fe/qr/?p=${btoa(JSON.stringify(payload))}`
}

function fmtCuit(cuit: string): string {
  const c = cuit.replace(/\D/g, '')
  return c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : cuit
}

// ─── Genera los bytes ESC/POS del ticket fiscal (formato ARCA / RG 5614/2024) ─
export function buildTicketBytes(d: DatosTicketFront): Uint8Array {
  const enc = new EscPos()
  const W   = 42   // 80mm paper — ~42 chars en fuente normal

  // Formato argentino: punto de miles, coma decimal
  const $ = (n: number) => n.toFixed(2).replace('.', ',')

  let fechaHoraStr: string
  if (d.fechaHora) {
    fechaHoraStr = d.fechaHora
  } else {
    const now = new Date()
    const fec = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const hor = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    fechaHoraStr = `${fec} ${hor}`
  }

  const parts = d.numero.split('-')
  const pvStr = (parts[0] ?? '').padStart(5, '0')
  const nStr  = (parts[1] ?? '').padStart(8, '0')

  // Agrupar items idénticos para mostrar cantidad en el ticket
  type Grupo = { descripcion: string; totalUnit: number; qty: number; totalLinea: number }
  const grupos: Grupo[] = []
  for (const it of d.items) {
    const g = grupos.find(x => x.descripcion === it.descripcion && Math.abs(x.totalUnit - it.total) < 0.01)
    if (g) { g.qty++; g.totalLinea += it.total }
    else grupos.push({ descripcion: it.descripcion, totalUnit: it.total, qty: 1, totalLinea: it.total })
  }

  enc.init()

  // ── Encabezado del negocio ────────────────────────────────────────────────────
  enc.center()
    .bold(true).doubleH(true).line(d.negocioNombre.toUpperCase()).doubleH(false).bold(false)

  if (d.titular && d.titular.toUpperCase() !== d.negocioNombre.toUpperCase()) {
    enc.line(d.titular.toUpperCase())
  }
  // CUIT e IVA en la misma línea
  if (d.condicionIVA) enc.twoCol(`CUIT ${fmtCuit(d.cuit)}`, `IVA ${d.condicionIVA.toUpperCase()}`, W)
  else                enc.line(`CUIT ${fmtCuit(d.cuit)}`)
  // IIBB e Inicio de Actividades en la misma línea
  if (d.ingBrutos && d.inicioActividades)
    enc.twoCol(`IIBB: ${d.ingBrutos}`, `INICIO: ${d.inicioActividades}`, W)
  else if (d.ingBrutos)         enc.line(`IIBB: ${d.ingBrutos}`)
  else if (d.inicioActividades) enc.line(`INICIO ACTIVIDADES: ${d.inicioActividades}`)
  if (d.direccion) enc.line(d.direccion.toUpperCase())

  // ── Tipo y número de comprobante ──────────────────────────────────────────────
  enc.left()
  enc.bold(true).twoCol('TIQUE (CODIGO 083)', `NUMERO ${pvStr}-${nStr}`, W).bold(false)
  enc.line(`FECHA: ${fechaHoraStr}  ** ORIG **`)
  enc.line('CLIENTE/DOM: CONSUMIDOR FINAL')
  enc.bold(true).line('A CONSUMIDOR FINAL ****').bold(false)
  enc.sep(W)

  // ── Items (dos líneas por producto: cantidad×precio(21) / descripción+total) ───
  for (const g of grupos) {
    enc.line(`${g.qty} x  ${$(g.totalUnit)}  (21)`)
    enc.twoCol(g.descripcion.slice(0, W - 9), $(g.totalLinea), W)
  }
  enc.sep(W)

  // ── TOTAL + Pago ──────────────────────────────────────────────────────────────
  enc.bold(true).twoCol('TOTAL', `$ ${$(d.total)}`, W).bold(false)
  const pagoLabel: Record<string, string> = {
    EFECTIVO: 'EFECTIVO', TARJETA: 'TARJETA', BILLETERA: 'BILLETERA DIGITAL',
  }
  enc.line(`FORMA DE PAGO: ${pagoLabel[d.metodoPago] ?? d.metodoPago}`)
  if (d.defensaConsumidor) enc.line(`ORIENTACION AL CONSUMIDOR ${d.defensaConsumidor}`)

  // ── Autorización ARCA + QR ────────────────────────────────────────────────────
  if (d.cae) {
    const vtoStr = d.caeVto ? d.caeVto.slice(0, 10).split('-').reverse().join('/') : ''
    enc.center()
    enc.bold(true).line('* COMP.ELECT. AUTORIZADO POR ARCA *').bold(false)
    // CAE y vencimiento en una sola línea (39 chars — cabe en 42)
    enc.line(`C.A.E.: ${d.cae}  VTO: ${vtoStr}`)
    enc.line('CODIGO QR ARCA  R.G. 4892/2020')
    enc.qrCode(buildArcaQR(d), 5)
    enc.lf(1).left()
    // Transparencia Fiscal al Consumidor — Ley 27.743 / RG ARCA 5614/2024
    enc.line('REGIMEN TRANSP.FISCAL AL CONS. LEY 27.743')
    enc.line('RG.ARCA 5614/24')
    enc.twoCol('IVA CONTENIDO', `$ ${$(d.iva)}`, W)
    enc.line('SOLO SON INFORMADOS IMPUESTOS NACIONALES')
  }

  enc.lf(4).cut()
  return enc.bytes()
}

// ─── Ticket NO FISCAL (offline / prueba) ─────────────────────────────────────

export interface DatosTicketNoFiscal {
  negocioNombre:      string
  titular?:           string
  cuit:               string
  ingBrutos?:         string
  direccion?:         string
  defensaConsumidor?: string
  condicionIVA?:      string
  items:              Array<{ descripcion: string; precioNeto: number; total: number }>
  subtotal:           number
  iva:                number
  total:              number
  metodoPago:         string
  // Overrides para copia / reimpresión
  titulo?:     string   // reemplaza "** TICKET NO FISCAL **"
  subtitulo?:  string   // ej. "Nº T. 0001-00000042"
  fechaHora?:  string   // ej. "14/07/2026  14:18:54" — si no se pasa usa now()
}

export function buildTicketNoFiscalBytes(d: DatosTicketNoFiscal): Uint8Array {
  const enc = new EscPos()
  const W   = 42
  const $   = (n: number) => n.toFixed(2).replace('.', ',')

  let fechaHoraStr: string
  if (d.fechaHora) {
    fechaHoraStr = d.fechaHora
  } else {
    const now  = new Date()
    const fec  = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const hor  = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    fechaHoraStr = `${fec}  ${hor}`
  }

  enc.init()

  // Encabezado idéntico al ticket fiscal
  enc.center()
    .bold(true).doubleH(true).line(d.negocioNombre.toUpperCase()).doubleH(false).bold(false)

  if (d.titular && d.titular.toUpperCase() !== d.negocioNombre.toUpperCase()) {
    enc.line(d.titular.toUpperCase())
  }

  enc.line(`C.U.I.T. Nro.: ${fmtCuit(d.cuit)}`)
  if (d.ingBrutos)         enc.line(`Ing. Brutos: ${d.ingBrutos}`)
  if (d.direccion)         enc.line(d.direccion.toUpperCase())
  if (d.defensaConsumidor) enc.line(`DEFENSA DEL CONSUMIDOR ${d.defensaConsumidor}`)
  if (d.condicionIVA)      enc.line(`IVA ${d.condicionIVA.toUpperCase()}`)

  // Título (NO FISCAL u otro como COPIA)
  enc.lf(1).sep(W)
  enc.bold(true).line(d.titulo ?? '** TICKET NO FISCAL **').bold(false)
  if (d.subtitulo) enc.line(d.subtitulo)
  else             enc.line('Sin CAE - Pendiente ARCA')
  enc.sep(W)

  enc.left().line(`Fecha: ${fechaHoraStr}`)
  enc.sep(W)

  // Items
  for (const it of d.items) {
    enc.itemLine(it.descripcion, '  (21)  ', $(it.total), W)
  }

  enc.sep(W)

  // TOTAL
  enc.bold(true).twoCol('TOTAL', $(d.total), W).bold(false)

  // Pago
  const pagoLabel: Record<string, string> = {
    EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', BILLETERA: 'Billetera Digital',
  }
  enc.lf(1).twoCol(pagoLabel[d.metodoPago] ?? d.metodoPago, $(d.total), W)

  enc.lf(1).sep(W)
  enc.center()
  enc.bold(true).line('NO VALIDO COMO').bold(false)
  enc.bold(true).line('COMPROBANTE FISCAL ARCA').bold(false)

  enc.lf(4).cut()
  return enc.bytes()
}

// ─── Cierre de Caja ──────────────────────────────────────────────────────────

export interface DatosCierre {
  negocioNombre: string
  cuit:          string
  fecha:         string   // "14/07/2026"
  totalVentas:   number
  totalTickets:  number
  totalFacturas: number
  montoTotal:    number
  montoNeto:     number
  montoIVA:      number
  efectivo:      number
  tarjeta:       number
  billetera:     number
}

export function buildCierreBytes(d: DatosCierre): Uint8Array {
  const enc = new EscPos()
  const W   = 42
  const $   = (n: number) => `$ ${n.toFixed(2).replace('.', ',')}`

  enc.init()
  enc.center()
    .bold(true).doubleH(true).line(d.negocioNombre.toUpperCase()).doubleH(false).bold(false)
  enc.line(`C.U.I.T. ${fmtCuit(d.cuit)}`)
  enc.lf(1)
  enc.bold(true).line('CIERRE DE CAJA').bold(false)
  enc.line(d.fecha)
  enc.sep(W)

  enc.left()
  enc.bold(true).line('COMPROBANTES').bold(false)
  enc.twoCol('Tickets:', String(d.totalTickets), W)
  enc.twoCol('Facturas:', String(d.totalFacturas), W)
  enc.twoCol('Total:', String(d.totalVentas), W)
  enc.sep(W)

  enc.bold(true).line('DESGLOSE').bold(false)
  enc.twoCol('Subtotal neto:', $(d.montoNeto), W)
  enc.twoCol('IVA 21%:', $(d.montoIVA), W)
  enc.sep(W)
  enc.bold(true).twoCol('TOTAL:', $(d.montoTotal), W).bold(false)
  enc.sep(W)

  enc.bold(true).line('POR METODO DE PAGO').bold(false)
  enc.twoCol('Efectivo:', $(d.efectivo), W)
  enc.twoCol('Tarjeta:', $(d.tarjeta), W)
  enc.twoCol('Billetera:', $(d.billetera), W)
  enc.sep(W)

  enc.lf(4).cut()
  return enc.bytes()
}

// ─── Conexión WebUSB ──────────────────────────────────────────────────────────

export interface PrinterInfo {
  tipo:   'usb' | 'bluetooth'
  nombre: string
}

let usbDevice: any = null
let usbEndpoint = 0

export async function conectarUSB(): Promise<PrinterInfo> {
  if (!('usb' in navigator)) throw new Error('WebUSB no disponible en este navegador')

  // Clase 7 = USB Printer class (ESC/POS estándar)
  // Si tu impresora no aparece, puede ser clase 2 (CDC) — contactar soporte.
  const device = await (navigator as any).usb.requestDevice({
    filters: [{ classCode: 7 }, { classCode: 0 }],
  })

  await device.open()
  if (device.configuration === null) await device.selectConfiguration(1)

  // Buscar la primera interfaz con un endpoint OUT bulk
  let claimed = false
  for (const iface of device.configuration!.interfaces) {
    for (const alt of iface.alternates) {
      const ep = alt.endpoints.find((e: any) => e.direction === 'out' && e.type === 'bulk')
      if (ep) {
        await device.claimInterface(iface.interfaceNumber)
        usbEndpoint = ep.endpointNumber
        usbDevice = device
        claimed = true
        break
      }
    }
    if (claimed) break
  }

  if (!claimed) throw new Error('No se encontró endpoint de impresión en el dispositivo USB')

  return { tipo: 'usb', nombre: device.productName || 'Impresora USB' }
}

export async function imprimirUSB(bytes: Uint8Array): Promise<void> {
  if (!usbDevice) throw new Error('Impresora USB no conectada')
  // Enviar en bloques de 512 bytes (compatible con todos los chipsets USB)
  const CHUNK = 512
  for (let i = 0; i < bytes.length; i += CHUNK) {
    await usbDevice.transferOut(usbEndpoint, bytes.slice(i, i + CHUNK))
  }
}

export function desconectarUSB() {
  usbDevice?.close().catch(() => {})
  usbDevice = null
  usbEndpoint = 0
}

// ─── Conexión Web Bluetooth ───────────────────────────────────────────────────
// Soporta los servicios GATT más comunes en impresoras térmicas baratas.

const BT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Generic thermal (GoojPrt, Xprinter, etc.)
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service (NUS)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip RNBD / Issc
]
const BT_CHARS_WRITE = [
  '00002af1-0000-1000-8000-00805f9b34fb', // Generic thermal TX
  '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // NUS TX
  '49535343-1e4d-4bd9-ba61-23c647249616', // Microchip TX
]

let btChar: any = null
let btDevice: any = null

export async function conectarBluetooth(): Promise<PrinterInfo> {
  if (!('bluetooth' in navigator)) throw new Error('Web Bluetooth no disponible en este navegador')

  const device = await (navigator as any).bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: BT_SERVICES,
  })

  const server = await device.gatt!.connect()

  // Intentar cada servicio hasta encontrar una característica escribible
  for (const svcUUID of BT_SERVICES) {
    try {
      const svc = await server.getPrimaryService(svcUUID)
      for (const charUUID of BT_CHARS_WRITE) {
        try {
          const char = await svc.getCharacteristic(charUUID)
          if (char.properties.write || char.properties.writeWithoutResponse) {
            btChar = char
            btDevice = device
            return { tipo: 'bluetooth', nombre: device.name || 'Impresora BT' }
          }
        } catch {}
      }
    } catch {}
  }

  throw new Error(
    'No se encontró característica de escritura.\n' +
    'Asegurate de que la impresora esté en modo Bluetooth y sea compatible con ESC/POS.'
  )
}

export async function imprimirBluetooth(bytes: Uint8Array): Promise<void> {
  if (!btChar) throw new Error('Impresora Bluetooth no conectada')
  // BLE tiene MTU variable; 20 bytes es el mínimo garantizado
  const CHUNK = 20
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.slice(i, i + CHUNK)
    if (btChar.properties.writeWithoutResponse) {
      await btChar.writeValueWithoutResponse(chunk)
    } else {
      await btChar.writeValue(chunk)
    }
    // Pequeña pausa para no saturar el buffer BLE
    await new Promise(r => setTimeout(r, 12))
  }
}

export function desconectarBluetooth() {
  btDevice?.gatt?.disconnect()
  btDevice = null
  btChar = null
}
