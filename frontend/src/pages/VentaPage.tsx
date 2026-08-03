import { useState, useEffect, useCallback } from 'react'
import { useVentaStore, DESCUENTOS } from '../stores/ventaStore'
import { useSyncStore } from '../stores/syncStore'
import { useProductosStore, type Producto } from '../stores/productosStore'
import { useEmpresaStore } from '../stores/empresaStore'
import { usePrinterStore } from '../stores/printerStore'
import { NumericKeypad } from '../components/features/venta/NumericKeypad'
import { ventasApi, facturasApi } from '../lib/api'
import { formatPrecio, generarUUID, validarCUIT, formatCUIT, calcularTotal } from '../lib/utils'

type Paso = 'descripcion' | 'precio'

const FREE_COLORS = ['#3B72E0', '#0EA57A', '#8B5CF6', '#F97316', '#EC4899', '#0EA5E9']

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
  const puedeEmitir = store.carrito.length > 0 && Math.abs(sumaPagos - store.getTotal()) < 0.02

  const handleProductoClick = useCallback((producto: Producto) => {
    if (producto.precio !== null) {
      store.agregarItemDirecto(producto.nombre, producto.precio)
    } else {
      store.setDescripcion(producto.nombre)
      setPaso('precio')
    }
  }, [store])

  const mostrarExito = (tipo: string, numero: string) => {
    store.limpiarCarrito()
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

  const emitir = async () => {
    if (!puedeEmitir || cargando) return
    setCargando(true)
    setErrorMsg('')

    try {
      // Snapshot ÚNICO del carrito — capturado antes del primer await porque
      // mostrarExito() limpia el store. sincronizar() no toca el carrito.
      const snapItems    = store.getItemsParaAPI()   // netos ya con descuento → API/ARCA
      const snapCarrito  = store.carrito             // precios de lista → ticket
      const snapSubtotal = store.getSubtotal()
      const snapIva      = store.getIVA()
      const snapTotal    = store.getTotal()
      const snapEf       = store.montoEfectivo
      const snapTar      = store.montoTarjeta
      const snapBil      = store.montoBilletera
      const snapDescPct  = store.descuentoPct
      const snapDescMonto = store.getDescuentoTotal()

      // Helpers derivados del snapshot — no se recalculan por rama.
      // El ticket lista los ítems a precio de lista y muestra el descuento aparte,
      // así las líneas suman el SUBTOTAL y, restado el descuento, dan el TOTAL.
      const itemsPrinter   = snapCarrito.map(it => ({
        descripcion: it.descripcion,
        precioNeto:  it.precio_neto,
        total:       calcularTotal(it.precio_neto),
        cantidad:    it.cantidad,
      }))
      const totalesPrinter = {
        subtotal: snapSubtotal, iva: snapIva, total: snapTotal,
        descuentoPct: snapDescPct, descuentoMonto: snapDescMonto,
      }
      const pagosPrinter   = { montoEfectivo: snapEf, montoTarjeta: snapTar, montoBilletera: snapBil }

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
        if (!razonSocial.trim())         { setErrorMsg('Ingresá la razón social'); return }
        if (!validarCUIT(cuit))          { setErrorMsg('CUIT inválido'); return }
        if (!emailCliente.includes('@')) { setErrorMsg('Email inválido'); return }

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

        mostrarExito('Factura', data.data!.pendiente_cae ? 'PENDIENTE' : data.data!.numero)
        // ARCA caído: la factura se autoriza sola en segundo plano; mientras, no fiscal.
        if (data.data!.pendiente_cae) imprimirNoFiscalSnap()

      } else if (!sync.online) {
        await sync.guardarOffline({
          id: generarUUID(), tipo: 'TICKET',
          items:           snapItems,
          monto_efectivo:  snapEf,
          monto_tarjeta:   snapTar,
          monto_billetera: snapBil,
          created_at:      new Date().toISOString(),
          estado_sync:     'PENDIENTE',
        })
        mostrarExito('Ticket', 'OFFLINE')
        imprimirNoFiscalSnap()

      } else {
        const { data } = await ventasApi.crear({
          tipo:            'TICKET',
          items:           snapItems,
          monto_efectivo:  snapEf,
          monto_tarjeta:   snapTar,
          monto_billetera: snapBil,
        })
        if (data.success && data.data) {
          if (data.data.pendiente_cae) {
            mostrarExito('Ticket', 'PENDIENTE')
            imprimirNoFiscalSnap()
          } else {
            mostrarExito('Ticket', data.data.numero)
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
          }
        }
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Error al emitir')
    } finally {
      setCargando(false)
    }
  }

  // Color map for free-price products
  const sinPrecio = productos.filter(p => p.precio === null)
  const conPrecio = productos.filter(p => p.precio !== null)
  const freeColorMap: Record<string, string> = {}
  sinPrecio.forEach((p, i) => { freeColorMap[p.id] = FREE_COLORS[i % FREE_COLORS.length] })

  const total   = store.getTotal()
  const neto    = store.getSubtotal()
  const iva     = store.getIVA()
  const descPct   = store.descuentoPct
  const descNeto  = store.getDescuentoNeto()
  const descMonto = store.getDescuentoTotal()   // descuento IVA incluido

  const empresaBase = {
    negocioNombre:     empresa?.razon_social ?? '',
    titular:           empresa?.titular ?? '',
    cuit:              empresa?.cuit ?? '',
    ingBrutos:         empresa?.ing_brutos ?? '',
    direccion:         empresa?.direccion ?? '',
    defensaConsumidor: empresa?.defensa_consumidor ?? '',
    condicionIVA:      empresa?.condicion_iva ?? '',
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

        {paso === 'descripcion' ? (
          <>
            {productos.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-300 gap-2" style={{ minHeight: 200 }}>
                <p className="font-semibold" style={{ fontSize: 15 }}>Sin productos</p>
                <p className="text-sm">Andá a Configuración para agregar.</p>
              </div>
            ) : (
              <>
                {sinPrecio.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p className="text-gray-400 font-bold uppercase tracking-widest" style={{ fontSize: 10 }}>Precio libre</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {sinPrecio.map(p => (
                        <button
                          key={p.id}
                          onPointerDown={e => { e.preventDefault(); handleProductoClick(p) }}
                          className="flex flex-col items-start text-white text-left active:scale-95 transition-all touch-manipulation"
                          style={{ background: freeColorMap[p.id], borderRadius: 14, padding: '18px 16px', minHeight: 90, border: 'none', cursor: 'pointer', gap: 6 }}
                        >
                          <span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>{p.nombre}</span>
                          <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.85 }}>Ingresar precio</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {conPrecio.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sinPrecio.length > 0 && (
                      <p className="text-gray-400 font-bold uppercase tracking-widest" style={{ fontSize: 10 }}>Precio fijo</p>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {conPrecio.map(p => (
                        <button
                          key={p.id}
                          onPointerDown={e => { e.preventDefault(); handleProductoClick(p) }}
                          className="flex flex-col items-start text-white text-left active:scale-95 transition-all touch-manipulation"
                          style={{ background: '#64748B', borderRadius: 14, padding: '18px 16px', minHeight: 90, border: 'none', cursor: 'pointer', gap: 6 }}
                        >
                          <span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>{p.nombre}</span>
                          <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.85 }}>{formatPrecio(p.precio!)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div>
              <p className="text-gray-400 font-bold uppercase tracking-widest mb-2" style={{ fontSize: 10 }}>
                Precio final (IVA incluido)
              </p>
              <div className="border border-gray-200 rounded-xl" style={{ background: '#F9FAFB', padding: '16px 18px' }}>
                <p className="font-semibold mb-1" style={{ fontSize: 12, color: '#F59E0B' }}>{store.descripcionActual}</p>
                <p className="font-mono font-black text-gray-900" style={{ fontSize: 32 }}>
                  ${store.precioActual || '0'}
                </p>
              </div>
            </div>

            <NumericKeypad
              value={store.precioActual}
              onChange={store.setPrecio}
              onConfirm={() => { store.agregarItem(); setPaso('descripcion'); setMobileTab('carrito') }}
            />

            <button
              onClick={() => { setPaso('descripcion'); store.setPrecio(''); store.setDescripcion('') }}
              className="text-gray-400 hover:text-gray-600 text-sm text-left transition-colors"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
            >
              ← Cancelar
            </button>
          </>
        )}
      </div>

      {/* ── CENTER: Cart ── */}
      <div className={`${mobileTab === 'carrito' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col min-w-0 w-full`} style={{ background: '#F3F4F6' }}>
        <div style={{ padding: '24px 28px 12px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h2 className="font-bold text-gray-900" style={{ fontSize: 20, margin: 0 }}>Carrito</h2>
          <span className="text-gray-400 text-sm">
            {store.carrito.length > 0 ? `${store.carrito.length} ítem${store.carrito.length > 1 ? 's' : ''}` : ''}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: '0 28px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {store.carrito.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-3" style={{ minHeight: 300 }}>
              <div className="flex items-center justify-center" style={{
                width: 60, height: 60, borderRadius: 18, background: '#fff',
                border: '1.5px dashed #D1D5DB',
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
                  <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                </svg>
              </div>
              <p className="font-semibold text-gray-400" style={{ margin: 0 }}>El carrito está vacío</p>
              <p className="text-sm text-gray-300" style={{ margin: 0 }}>Agregá productos desde la izquierda</p>
            </div>
          ) : (
            store.carrito.map(item => (
              <div key={item.id} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100"
                style={{ padding: '12px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>

                {/* Nombre + precio unitario */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate" style={{ fontSize: 14, marginBottom: 2 }}>
                    {item.descripcion}
                  </p>
                  <p className="font-mono text-gray-400" style={{ fontSize: 11 }}>
                    {formatPrecio(calcularTotal(item.precio_neto))} c/u
                  </p>
                </div>

                {/* Controles cantidad */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onPointerDown={e => { e.preventDefault(); store.decrementarItem(item.id) }}
                    className="flex items-center justify-center font-bold active:scale-90 transition-all touch-manipulation"
                    style={{
                      width: 30, height: 30, borderRadius: 8, border: '1.5px solid #E5E7EB',
                      background: item.cantidad === 1 ? '#FEF2F2' : '#F9FAFB',
                      color: item.cantidad === 1 ? '#EF4444' : '#374151',
                      cursor: 'pointer', fontSize: 16,
                    }}
                  >
                    {item.cantidad === 1 ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      </svg>
                    ) : '−'}
                  </button>

                  <span className="font-mono font-bold text-gray-900 text-center"
                    style={{ minWidth: 28, fontSize: 15 }}>
                    {item.cantidad}
                  </span>

                  <button
                    onPointerDown={e => { e.preventDefault(); store.incrementarItem(item.id) }}
                    className="flex items-center justify-center font-bold active:scale-90 transition-all touch-manipulation"
                    style={{
                      width: 30, height: 30, borderRadius: 8, border: '1.5px solid #E5E7EB',
                      background: '#F9FAFB', color: '#3B72E0',
                      cursor: 'pointer', fontSize: 18,
                    }}
                  >
                    +
                  </button>
                </div>

                {/* Total del ítem */}
                <p className="font-mono font-bold text-gray-900 flex-shrink-0" style={{ fontSize: 15, minWidth: 72, textAlign: 'right' }}>
                  {formatPrecio(calcularTotal(item.precio_neto) * item.cantidad)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT: Totals ── */}
      <div className={`${mobileTab === 'cobrar' ? 'flex' : 'hidden'} lg:flex flex-col bg-white border-l flex-shrink-0 w-full lg:w-auto`}
        style={{ borderColor: 'rgba(0,0,0,0.06)', ...(window.innerWidth >= 1024 ? { width: 360 } : {}), overflow: 'hidden' }}>

        {/* Scrollable content area */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h2 className="font-bold text-gray-900" style={{ fontSize: 20, margin: 0 }}>Totales</h2>

          {/* Amounts */}
          <div className="rounded-xl border border-gray-100 flex flex-col" style={{ background: '#F9FAFB', padding: 18, gap: 10 }}>
            <div className="flex justify-between text-gray-500 text-sm">
              <span>Subtotal neto</span>
              <span className="font-mono font-semibold text-gray-700">{formatPrecio(neto)}</span>
            </div>
            {descPct > 0 && (
              <div className="flex justify-between text-sm font-medium" style={{ color: '#0EA57A' }}>
                <span>Descuento {descPct}%</span>
                <span className="font-mono font-semibold">−{formatPrecio(descNeto)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-500 text-sm">
              <span>IVA 21%</span>
              <span className="font-mono font-semibold text-gray-700">{formatPrecio(iva)}</span>
            </div>
            <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '2px 0' }} />
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-mono font-black" style={{ fontSize: 24, color: '#3B72E0' }}>{formatPrecio(total)}</span>
            </div>
          </div>

          {/* Descuento */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="text-gray-400 font-bold uppercase tracking-widest" style={{ fontSize: 10 }}>Descuento</p>
            <select
              value={descPct}
              onChange={e => store.setDescuento(Number(e.target.value))}
              className="w-full rounded-xl outline-none font-semibold text-sm transition-all touch-manipulation"
              style={{
                padding: '12px', cursor: 'pointer',
                border: `1.5px solid ${descPct > 0 ? '#0EA57A' : '#E5E7EB'}`,
                background: descPct > 0 ? '#ECFDF5' : '#fff',
                color: descPct > 0 ? '#047857' : '#374151',
              }}
            >
              {DESCUENTOS.map(d => (
                <option key={d} value={d}>{d === 0 ? 'Sin descuento' : `${d}% de descuento`}</option>
              ))}
            </select>
          </div>

          {/* Payment method */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="text-gray-400 font-bold uppercase tracking-widest" style={{ fontSize: 10 }}>Forma de pago</p>

            {!dividirPago ? (
              <>
                <div className="flex rounded-xl p-1" style={{ background: '#F3F4F6', gap: 4 }}>
                  {([
                    { label: 'Efectivo',  ef: total, tar: 0,     bil: 0     },
                    { label: 'Tarjeta',   ef: 0,     tar: total, bil: 0     },
                    { label: 'Billetera', ef: 0,     tar: 0,     bil: total },
                  ] as const).map(m => {
                    const activo = Math.abs(store.montoEfectivo  - m.ef)  < 0.01 &&
                                   Math.abs(store.montoTarjeta   - m.tar) < 0.01 &&
                                   Math.abs(store.montoBilletera - m.bil) < 0.01 &&
                                   sumaPagos > 0
                    return (
                      <button
                        key={m.label}
                        onPointerDown={e => {
                          e.preventDefault()
                          store.setMontoEfectivo(m.ef)
                          store.setMontoTarjeta(m.tar)
                          store.setMontoBilletera(m.bil)
                        }}
                        className="flex-1 rounded-lg text-sm font-semibold transition-all touch-manipulation active:scale-95"
                        style={{
                          height: 46, border: 'none', cursor: 'pointer',
                          background: activo ? '#3B72E0' : 'transparent',
                          color: activo ? '#fff' : '#6B7280',
                          boxShadow: activo ? '0 1px 3px rgba(59,114,224,0.3)' : 'none',
                        }}
                      >
                        {m.label}
                      </button>
                    )
                  })}
                </div>
                <button
                  onPointerDown={e => {
                    e.preventDefault()
                    store.setMontoEfectivo(0)
                    store.setMontoTarjeta(0)
                    store.setMontoBilletera(0)
                    setDividirPago(true)
                  }}
                  className="w-full rounded-xl font-semibold text-sm transition-all touch-manipulation active:scale-95"
                  style={{ height: 46, border: '1.5px solid #3B72E0', background: '#fff', color: '#3B72E0', cursor: 'pointer' }}
                >
                  Dividir pago
                </button>
              </>
            ) : (
              <div className="rounded-xl border border-gray-100 flex flex-col" style={{ background: '#F9FAFB', padding: '14px', gap: 10 }}>
                {([
                  { label: 'Efectivo',          value: store.montoEfectivo,  set: store.setMontoEfectivo },
                  { label: 'Tarjeta',           value: store.montoTarjeta,   set: store.setMontoTarjeta },
                  { label: 'Billetera digital', value: store.montoBilletera, set: store.setMontoBilletera },
                ] as const).map(({ label, value, set }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-gray-600 text-sm flex-shrink-0" style={{ minWidth: 112 }}>{label}</span>
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={value === 0 ? '' : value}
                        onChange={e => set(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="no-spin w-full border border-gray-200 rounded-lg outline-none font-mono text-right transition-all"
                        style={{ padding: '9px 10px', fontSize: 14 }}
                        onFocus={e => (e.target.style.borderColor = '#3B72E0')}
                        onBlur={e => (e.target.style.borderColor = '')}
                      />
                    </div>
                  </div>
                ))}
                <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '2px 0' }} />
                {/* Restante — rojo si falta, verde cuando está pago */}
                {(() => {
                  const balanceado = Math.abs(sumaPagos - total) < 0.02
                  const sobra = sumaPagos - total >= 0.02
                  return (
                    <div className="flex items-center justify-between rounded-lg px-3 py-2"
                      style={{ background: balanceado ? '#F0FDF4' : '#FEF2F2' }}>
                      <span className="text-sm font-semibold" style={{ color: balanceado ? '#16A34A' : '#DC2626' }}>
                        {balanceado ? 'Pago completo' : sobra ? 'Sobra' : 'Restante'}
                      </span>
                      <span className="font-mono font-black" style={{ fontSize: 16, color: balanceado ? '#16A34A' : '#DC2626' }}>
                        {balanceado ? '✓' : formatPrecio(Math.abs(total - sumaPagos))}
                      </span>
                    </div>
                  )
                })()}
                <button
                  onPointerDown={e => {
                    e.preventDefault()
                    store.setMontoEfectivo(0)
                    store.setMontoTarjeta(0)
                    store.setMontoBilletera(0)
                    setDividirPago(false)
                  }}
                  className="w-full rounded-xl font-semibold text-sm transition-all touch-manipulation active:scale-95"
                  style={{ height: 44, border: '1.5px solid #D1D5DB', background: '#fff', color: '#374151', cursor: 'pointer' }}
                >
                  Volver a pago único
                </button>
              </div>
            )}
          </div>

          {/* Factura toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none" style={{ userSelect: 'none' }}>
            <div
              onPointerDown={e => { e.preventDefault(); setNeedsFactura(v => !v) }}
              className="relative transition-colors touch-manipulation"
              style={{
                width: 40, height: 24, borderRadius: 12,
                background: needsFactura ? '#3B72E0' : '#D1D5DB',
                flexShrink: 0,
                cursor: 'pointer',
              }}
            >
              <span
                className="absolute bg-white rounded-full transition-transform"
                style={{
                  top: 4, width: 16, height: 16,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  transform: needsFactura ? 'translateX(20px)' : 'translateX(4px)',
                }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700">Necesita factura</span>
          </label>

          {/* Inline factura fields */}
          {needsFactura && (
            <div className="flex flex-col rounded-xl border border-gray-200" style={{ background: '#F9FAFB', padding: 14, gap: 10 }}>
              <div>
                <label className="block font-semibold text-gray-500 mb-1" style={{ fontSize: 11 }}>Razón social</label>
                <input
                  type="text"
                  value={razonSocial}
                  onChange={e => setRazonSocial(e.target.value)}
                  placeholder="Empresa S.A."
                  className="w-full border border-gray-200 rounded-lg outline-none transition-all"
                  style={{ padding: '9px 12px', fontSize: 13 }}
                  onFocus={e => (e.target.style.borderColor = '#3B72E0')}
                  onBlur={e => (e.target.style.borderColor = '')}
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-500 mb-1" style={{ fontSize: 11 }}>CUIT del cliente</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={cuit}
                  onChange={e => setCuit(formatCUIT(e.target.value.replace(/\D/g, '')))}
                  maxLength={13}
                  placeholder="20-12345678-9"
                  className="w-full border border-gray-200 rounded-lg outline-none font-mono transition-all"
                  style={{ padding: '9px 12px', fontSize: 13 }}
                  onFocus={e => (e.target.style.borderColor = '#3B72E0')}
                  onBlur={e => (e.target.style.borderColor = '')}
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-500 mb-1" style={{ fontSize: 11 }}>Email del cliente</label>
                <input
                  type="email"
                  value={emailCliente}
                  onChange={e => setEmailCliente(e.target.value)}
                  placeholder="cliente@empresa.com"
                  className="w-full border border-gray-200 rounded-lg outline-none transition-all"
                  style={{ padding: '9px 12px', fontSize: 13 }}
                  onFocus={e => (e.target.style.borderColor = '#3B72E0')}
                  onBlur={e => (e.target.style.borderColor = '')}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom: always visible ── */}
        <div style={{ flexShrink: 0, padding: '0 24px max(32px, env(safe-area-inset-bottom, 32px))', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Success toast */}
          {emitido && (
            <div className="rounded-xl border flex flex-col" style={{
              background: '#F0FDF4', borderColor: '#86EFAC', padding: '14px 16px', gap: 4,
              animation: 'fadeSlideIn 0.25s ease',
            }}>
              <span className="font-bold" style={{ color: '#16A34A' }}>{emitido.tipo} emitido</span>
              {emitido.numero === 'OFFLINE' ? (
                <span style={{ fontSize: 12, color: '#D97706' }}>Guardado offline — se sincronizará</span>
              ) : emitido.numero === 'PENDIENTE' ? (
                <span style={{ fontSize: 12, color: '#D97706' }}>Cobrado — pendiente de CAE, se autoriza solo</span>
              ) : (
                <span className="font-mono text-gray-400" style={{ fontSize: 11 }}>
                  N° {emitido.numero} · CAE aprobado
                </span>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl border text-sm font-medium" style={{
              background: '#FEF2F2', borderColor: '#FECACA', color: '#DC2626', padding: '12px 16px',
            }}>
              {errorMsg}
            </div>
          )}

          {/* Emit button */}
          <button
            onPointerDown={e => { e.preventDefault(); emitir() }}
            disabled={!puedeEmitir || cargando}
            className="w-full font-bold text-white text-base transition-all active:scale-95 touch-manipulation"
            style={{
              height: 54,
              borderRadius: 12,
              border: 'none',
              cursor: puedeEmitir && !cargando ? 'pointer' : 'not-allowed',
              background: puedeEmitir && !cargando ? '#3B72E0' : '#93AEDE',
            }}
          >
            {cargando ? 'Emitiendo...' : needsFactura ? 'Emitir Factura' : 'Emitir Ticket'}
          </button>

          {/* Ticket no fiscal / prueba — solo visible con impresora conectada */}
          {printer.conectado && !needsFactura && (
            <button
              onPointerDown={e => {
                e.preventDefault()
                if (!puedeEmitir) return
                printer.imprimirNoFiscal({
                  ...empresaBase,
                  items: store.carrito.map(it => ({
                    descripcion: it.descripcion,
                    precioNeto:  it.precio_neto,
                    total:       calcularTotal(it.precio_neto),
                    cantidad:    it.cantidad,
                  })),
                  subtotal:       neto,
                  iva,
                  total,
                  descuentoPct:   descPct,
                  descuentoMonto: descMonto,
                  montoEfectivo:  store.montoEfectivo,
                  montoTarjeta:   store.montoTarjeta,
                  montoBilletera: store.montoBilletera,
                })
              }}
              disabled={!puedeEmitir}
              className="w-full font-semibold text-sm transition-all active:scale-95 touch-manipulation"
              style={{
                height: 42,
                borderRadius: 12,
                border: '1.5px solid #D1D5DB',
                cursor: puedeEmitir ? 'pointer' : 'not-allowed',
                background: puedeEmitir ? '#F9FAFB' : '#F3F4F6',
                color: puedeEmitir ? '#374151' : '#9CA3AF',
              }}
            >
              Ticket no fiscal / Prueba
            </button>
          )}
        </div>
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
