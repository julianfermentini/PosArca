import { useState, useEffect, useCallback } from 'react'
import { useVentaStore } from '../stores/ventaStore'
import { useSyncStore } from '../stores/syncStore'
import { useProductosStore, type Producto } from '../stores/productosStore'
import { useEmpresaStore } from '../stores/empresaStore'
import { usePrinterStore } from '../stores/printerStore'
import { ProductoPanel } from '../components/features/venta/ProductoPanel'
import { CarritoPanel } from '../components/features/venta/CarritoPanel'
import { CobroPanel } from '../components/features/venta/CobroPanel'
import { emitirVenta } from '../lib/emitirVenta'
import { buildEmpresaBase, itemsParaTicket } from '../lib/printer'

type Paso = 'descripcion' | 'precio'

export default function VentaPage() {
  const store   = useVentaStore()
  const sync    = useSyncStore()
  const printer = usePrinterStore()
  const { empresa } = useEmpresaStore()
  const { productos } = useProductosStore()

  const [paso, setPaso] = useState<Paso>('descripcion')
  const [mobileTab, setMobileTab] = useState<'agregar' | 'carrito' | 'cobrar'>('agregar')
  const [cargando, setCargando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [emitido, setEmitido] = useState<{ tipo: string; numero: string } | null>(null)

  // Datos factura inline
  const [needsFactura, setNeedsFactura]     = useState(false)
  const [razonSocial, setRazonSocial]       = useState('')
  const [cuit, setCuit]                     = useState('')
  const [emailCliente, setEmailCliente]     = useState('')
  const [dividirPago, setDividirPago]       = useState(false)

  useEffect(() => {
    sync.actualizarConteo()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sumaPagos   = store.getSumaPagos()
  // Tolerancia solo para el error de punto flotante (los montos van redondeados
  // a centavos) — no debe ser lo bastante grande como para dar por cobrada una
  // venta con un faltante real de centavos.
  const puedeEmitir = store.carrito.length > 0 && Math.abs(sumaPagos - store.getTotal()) < 0.005

  const handleProductoClick = useCallback((producto: Producto) => {
    if (producto.precio !== null) {
      store.agregarItemDirecto(producto.nombre, producto.precio)
    } else {
      store.setDescripcion(producto.nombre)
      setPaso('precio')
    }
  }, [store])

  const mostrarExito = (tipo: string, numero: string) => {
    setPaso('descripcion')
    setNeedsFactura(false)
    setDividirPago(false)
    setRazonSocial('')
    setCuit('')
    setEmailCliente('')
    setErrorMsg('')
    setEmitido({ tipo, numero })
    setTimeout(() => setEmitido(null), 3500)
  }

  const handleEmitir = async () => {
    if (!puedeEmitir || cargando) return
    setCargando(true)
    setErrorMsg('')
    try {
      const resultado = await emitirVenta({ store, sync, printer, empresa, needsFactura, razonSocial, cuit, emailCliente })
      if (resultado) mostrarExito(resultado.tipo, resultado.numero)
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Error al emitir')
    } finally {
      setCargando(false)
    }
  }

  const total   = store.getTotal()
  const neto    = store.getSubtotal()
  const iva     = store.getIVA()
  const descPct   = store.descuentoPct
  const descNeto  = store.getDescuentoNeto()
  const descMonto = store.getDescuentoTotal()   // descuento IVA incluido

  const empresaBase = buildEmpresaBase(empresa)

  const handleImprimirNoFiscal = () => {
    printer.imprimirNoFiscal({
      ...empresaBase,
      items: itemsParaTicket(store.carrito),
      subtotal:       neto,
      iva,
      total,
      descuentoPct:   descPct,
      descuentoMonto: descMonto,
      montoEfectivo:  store.montoEfectivo,
      montoTarjeta:   store.montoTarjeta,
      montoBilletera: store.montoBilletera,
    })
  }

  const mtab = (t: typeof mobileTab) =>
    `flex-1 py-2 text-xs font-bold transition-colors rounded-lg ${mobileTab === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#F3F4F6' }}>

      {/* ── Mobile tab selector ── */}
      <div className="lg:hidden flex p-2 gap-1 bg-white border-b flex-shrink-0" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
        <button className={mtab('agregar')} onClick={() => setMobileTab('agregar')}>Agregar</button>
        <button className={mtab('carrito')} onClick={() => setMobileTab('carrito')}>
          Carrito {store.carrito.length > 0 && <span className="ml-1 text-blue-500">({store.carrito.length})</span>}
        </button>
        <button className={mtab('cobrar')} onClick={() => setMobileTab('cobrar')}>Cobrar</button>
      </div>

      <div className="flex flex-1 overflow-hidden">

      {/* ── LEFT: Product entry ── */}
      <div className={`${mobileTab === 'agregar' ? 'flex' : 'hidden'} lg:flex flex-col bg-white border-r overflow-y-auto flex-shrink-0 w-full lg:w-auto`}
        style={{ borderColor: 'rgba(0,0,0,0.06)', padding: 24, gap: 18, ...(window.innerWidth >= 1024 ? { width: 380 } : {}) }}>
        <ProductoPanel
          productos={productos}
          paso={paso}
          descripcionActual={store.descripcionActual}
          precioActual={store.precioActual}
          onSelectProducto={handleProductoClick}
          onChangePrecio={store.setPrecio}
          onConfirmarPrecio={() => { store.agregarItem(); setPaso('descripcion'); setMobileTab('carrito') }}
          onCancelar={() => { setPaso('descripcion'); store.setPrecio(''); store.setDescripcion('') }}
        />
      </div>

      {/* ── CENTER: Cart ── */}
      <div className={`${mobileTab === 'carrito' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col min-w-0 w-full`} style={{ background: '#F3F4F6' }}>
        <CarritoPanel
          items={store.carrito}
          onIncrementar={store.incrementarItem}
          onDecrementar={store.decrementarItem}
        />
      </div>

      {/* ── RIGHT: Totals ── */}
      <div className={`${mobileTab === 'cobrar' ? 'flex' : 'hidden'} lg:flex flex-col bg-white border-l flex-shrink-0 w-full lg:w-auto`}
        style={{ borderColor: 'rgba(0,0,0,0.06)', ...(window.innerWidth >= 1024 ? { width: 360 } : {}), overflow: 'hidden' }}>
        <CobroPanel
          total={total} neto={neto} iva={iva} descPct={descPct} descNeto={descNeto}
          onChangeDescuento={store.setDescuento}
          pago={{
            total, sumaPagos,
            montoEfectivo: store.montoEfectivo, montoTarjeta: store.montoTarjeta, montoBilletera: store.montoBilletera,
            onSetEfectivo: store.setMontoEfectivo, onSetTarjeta: store.setMontoTarjeta, onSetBilletera: store.setMontoBilletera,
            dividirPago, onToggleDividir: setDividirPago,
          }}
          needsFactura={needsFactura} onToggleFactura={setNeedsFactura}
          factura={{
            razonSocial, cuit, emailCliente,
            onChangeRazonSocial: setRazonSocial, onChangeCuit: setCuit, onChangeEmailCliente: setEmailCliente,
          }}
          puedeEmitir={puedeEmitir} cargando={cargando} errorMsg={errorMsg} emitido={emitido} onEmitir={handleEmitir}
          printerConectado={printer.conectado} onImprimirNoFiscal={handleImprimirNoFiscal}
        />
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        /* Sin flechas de spinner: el monto se ingresa solo por teclado */
        .no-spin::-webkit-outer-spin-button,
        .no-spin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input.no-spin[type=number] { -moz-appearance: textfield; appearance: textfield; }
      `}</style>
      </div>{/* end inner flex */}
    </div>
  )
}
