// ─── ESC/POS encoder mínimo para impresoras térmicas 58mm ─────────────────────
// Sin dependencias externas. Codifica texto en cp1252 para soportar caracteres
// españoles que la mayoría de las impresoras térmicas baratas requieren.

const CP1252: Record<string, number> = {
  á: 0xe1, é: 0xe9, í: 0xed, ó: 0xf3, ú: 0xfa,
  Á: 0xc1, É: 0xc9, Í: 0xcd, Ó: 0xd3, Ú: 0xda,
  ñ: 0xf1, Ñ: 0xd1, ü: 0xfc, Ü: 0xdc,
  '°': 0xb0, '¡': 0xa1, '¿': 0xbf,
}

class EscPos {
  private buf: number[] = []

  private push(...b: number[]) { this.buf.push(...b); return this }

  init()                { return this.push(0x1b, 0x40) }
  center()              { return this.push(0x1b, 0x61, 0x01) }
  left()                { return this.push(0x1b, 0x61, 0x00) }
  right()               { return this.push(0x1b, 0x61, 0x02) }
  bold(on: boolean)     { return this.push(0x1b, 0x45, on ? 1 : 0) }
  doubleH(on: boolean)  { return this.push(0x1d, 0x21, on ? 0x01 : 0x00) }
  lf(n = 1)             { for (let i = 0; i < n; i++) this.buf.push(0x0a); return this }
  cut()                 { return this.push(0x1d, 0x56, 0x01) }

  text(s: string) {
    for (const ch of s) {
      const code = ch.codePointAt(0) ?? 63
      this.buf.push(code < 128 ? code : (CP1252[ch] ?? 63))
    }
    return this
  }

  line(s: string) { return this.text(s).lf() }

  sep(w = 32) { return this.text('-'.repeat(w)).lf() }

  // Descripción alineada a la izquierda, precio a la derecha, en W chars total
  itemLine(desc: string, price: string, w = 32) {
    const maxDesc = w - price.length - 1
    const d = desc.slice(0, maxDesc)
    const spaces = w - d.length - price.length
    return this.text(d + ' '.repeat(Math.max(1, spaces)) + price).lf()
  }

  bytes() { return new Uint8Array(this.buf) }
}

// ─── Datos que necesita el ticket ─────────────────────────────────────────────

export interface DatosTicketFront {
  negocioNombre: string
  cuit:          string
  puntoVenta:    number
  tipoCmp:       string        // 'TICKET' | 'FACTURA'
  numero:        string
  items:         Array<{ descripcion: string; precioNeto: number; total: number }>
  subtotal:      number
  iva:           number
  total:         number
  metodoPago:    string
  cae:           string
  caeVto:        string        // 'YYYY-MM-DD'
}

export function buildTicketBytes(d: DatosTicketFront): Uint8Array {
  const enc = new EscPos()
  const $ = (n: number) => `$${n.toFixed(2)}`
  const fmtDate = (iso: string) => {
    const [y, m, dd] = iso.split('-')
    return `${dd}/${m}/${y}`
  }
  const now = new Date()
  const hora = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const fecha = fmtDate(now.toISOString().slice(0, 10))

  enc.init()
  enc.center().doubleH(true).bold(true).line(d.negocioNombre)
  enc.doubleH(false).bold(false)
  enc.line(`CUIT: ${d.cuit}`)
  enc.line(`${d.tipoCmp === 'TICKET' ? 'Ticket' : 'Factura'} N°: ${d.numero}`)
  enc.line(`${fecha} ${hora}`)

  enc.left().sep()

  for (const it of d.items) {
    enc.itemLine(it.descripcion, $(it.total))
  }

  enc.sep()
  enc.right()
  enc.line(`Subtotal neto:   ${$(d.subtotal)}`)
  enc.line(`IVA 21%:         ${$(d.iva)}`)
  enc.bold(true).line(`TOTAL:           ${$(d.total)}`).bold(false)
  enc.line(`Pago: ${d.metodoPago}`)

  enc.left().sep()
  enc.line(`CAE: ${d.cae}`)
  enc.line(`Vto: ${fmtDate(d.caeVto)}`)
  enc.sep()

  enc.center().lf()
  enc.line('Gracias por su compra!')
  enc.lf(4)
  enc.cut()

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
