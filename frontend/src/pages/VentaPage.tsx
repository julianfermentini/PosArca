import { useState, useEffect, useCallback } from 'react'
import { useVentaStore } from '../stores/ventaStore'
import { useSyncStore } from '../stores/syncStore'
import { useProductosStore, type Producto } from '../stores/productosStore'
import { useEmpresaStore } from '../stores/empresaStore'
import { usePrinterStore } from '../stores/printerStore'
import { NumericKeypad } from '../components/features/venta/NumericKeypad'
import { ventasApi, facturasApi } from '../lib/api'
import { formatPrecio, generarUUID, validarCUIT, formatCUIT, calcularTotal } from '../lib/utils'
import type { MetodoPago, VentaOffline } from '../types'

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

  useEffect(() => {
    const up   = () => sync.setOnline(true)
    const down = () => sync.setOnline(false)
    window.addEventListener('online',  up)
    window.addEventListener('offline', down)
    sync.actualizarConteo()
    return () => {
      window.removeEventListener('online',  up)
      window.removeEventListener('offline', down)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const puedeEmitir = store.carrito.length > 0 && !!store.metodoPago

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
      if (needsFactura) {
        if (!razonSocial.trim())    { setErrorMsg('Ingresá la razón social'); return }
        if (!validarCUIT(cuit))     { setErrorMsg('CUIT inválido'); return }
        if (!emailCliente.includes('@')) { setErrorMsg('Email inválido'); return }

        const { data } = await facturasApi.crear({
          items: store.getItemsParaAPI(),
          metodo_pago: store.metodoPago!,
          razon_social: razonSocial.trim(),
          cuit_cliente: cuit,
          email_cliente: emailCliente,
        })
        if (!data.success) throw new Error(data.error || 'Error al emitir factura')
        mostrarExito('Factura', data.data!.numero)
      } else {
        if (!sync.online) {
          const venta: VentaOffline = {
            id: generarUUID(),
            tipo: 'TICKET',
            items: store.getItemsParaAPI(),
            metodo_pago: store.metodoPago!,
            created_at: new Date().toISOString(),
            estado_sync: 'PENDIENTE',
          }
          await sync.guardarOffline(venta)
          mostrarExito('Ticket', 'OFFLINE')
          return
        }

        // Capturar datos del carrito antes de limpiar para el ticket
        const itemsSnap    = store.getItemsParaAPI()
        const subtotalSnap = store.getSubtotal()
        const ivaSnap      = store.getIVA()
        const totalSnap    = store.getTotal()
        const metodoPago   = store.metodoPago!

        const { data } = await ventasApi.crear({
          tipo: 'TICKET',
          items: itemsSnap,
          metodo_pago: metodoPago,
        })
        if (data.success && data.data) {
          mostrarExito('Ticket', data.data.numero)

          // Imprimir desde el tablet si hay impresora conectada
          if (printer.conectado) {
            printer.imprimir({
              negocioNombre: empresa?.razon_social ?? '',
              cuit:          empresa?.cuit ?? '',
              puntoVenta:    empresa?.punto_venta ?? 1,
              tipoCmp:       'TICKET',
              numero:        data.data.numero,
              items:         itemsSnap.map(it => ({
                descripcion: it.descripcion,
                precioNeto:  it.precio_neto,
                total:       calcularTotal(it.precio_neto),
              })),
              subtotal:   subtotalSnap,
              iva:        ivaSnap,
              total:      totalSnap,
              metodoPago: metodoPago,
              cae:        data.data.cae,
              caeVto:     data.data.cae_vto ?? '',
            })
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

  const total = store.getTotal()
  const neto  = store.getSubtotal()
  const iva   = store.getIVA()

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
            <div>
              <p className="text-gray-400 font-bold uppercase tracking-widest mb-2" style={{ fontSize: 10 }}>
                1. Descripción
              </p>
              <input
                type="text"
                value={store.descripcionActual}
                onChange={e => store.setDescripcion(e.target.value)}
                placeholder="Descripción del producto..."
                className="w-full border border-gray-200 rounded-xl outline-none transition-all"
                style={{ padding: '13px 16px', fontSize: 14 }}
                onFocus={e => (e.target.style.borderColor = '#3B72E0')}
                onBlur={e => (e.target.style.borderColor = '')}
                onKeyDown={e => { if (e.key === 'Enter' && store.descripcionActual.trim()) setPaso('precio') }}
                autoFocus
              />
            </div>

            {sinPrecio.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="text-gray-400 font-bold uppercase tracking-widest" style={{ fontSize: 10 }}>Precio libre</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {sinPrecio.map(p => (
                    <button
                      key={p.id}
                      onPointerDown={e => { e.preventDefault(); handleProductoClick(p) }}
                      className="flex flex-col items-start text-white text-left active:scale-95 transition-all touch-manipulation"
                      style={{
                        background: freeColorMap[p.id],
                        borderRadius: 12,
                        padding: '12px 14px',
                        minHeight: 64,
                        border: 'none',
                        cursor: 'pointer',
                        gap: 3,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 800, lineHeight: '1.2' }}>{p.nombre}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.85 }}>Ingresar precio</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {conPrecio.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="text-gray-400 font-bold uppercase tracking-widest" style={{ fontSize: 10 }}>Precio fijo</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {conPrecio.map(p => (
                    <button
                      key={p.id}
                      onPointerDown={e => { e.preventDefault(); handleProductoClick(p) }}
                      className="flex flex-col items-start text-white text-left active:scale-95 transition-all touch-manipulation"
                      style={{
                        background: '#64748B',
                        borderRadius: 12,
                        padding: '12px 14px',
                        minHeight: 64,
                        border: 'none',
                        cursor: 'pointer',
                        gap: 3,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 800, lineHeight: '1.2' }}>{p.nombre}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.85 }}>{formatPrecio(p.precio!)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onPointerDown={e => { e.preventDefault(); if (store.descripcionActual.trim()) setPaso('precio') }}
              disabled={!store.descripcionActual.trim()}
              className="w-full font-bold text-white transition-all active:scale-95 touch-manipulation"
              style={{
                height: 52,
                borderRadius: 12,
                border: 'none',
                fontSize: 15,
                cursor: store.descripcionActual.trim() ? 'pointer' : 'not-allowed',
                background: store.descripcionActual.trim() ? '#3B72E0' : '#93AEDE',
              }}
            >
              Ingresar precio →
            </button>
          </>
        ) : (
          <>
            <div>
              <p className="text-gray-400 font-bold uppercase tracking-widest mb-2" style={{ fontSize: 10 }}>
                2. Precio final (IVA incluido)
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
              onClick={() => { setPaso('descripcion'); store.setPrecio('') }}
              className="text-gray-400 hover:text-gray-600 text-sm text-left transition-colors"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
            >
              ← Volver a descripción
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
                style={{ padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate" style={{ fontSize: 14, marginBottom: 2 }}>
                    {item.descripcion}
                  </p>
                  <p className="font-mono text-gray-400" style={{ fontSize: 11 }}>
                    {formatPrecio(item.precio_neto)} neto
                  </p>
                </div>
                <p className="font-mono font-bold text-gray-900 flex-shrink-0" style={{ fontSize: 15 }}>
                  {formatPrecio(calcularTotal(item.precio_neto))}
                </p>
                <button
                  onPointerDown={e => { e.preventDefault(); store.eliminarItem(item.id) }}
                  className="flex items-center justify-center text-red-400 hover:bg-red-50 active:scale-95 transition-all touch-manipulation flex-shrink-0"
                  style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT: Totals ── */}
      <div className={`${mobileTab === 'cobrar' ? 'flex' : 'hidden'} lg:flex flex-col bg-white border-l overflow-y-auto flex-shrink-0 w-full lg:w-auto`}
        style={{ borderColor: 'rgba(0,0,0,0.06)', padding: 24, gap: 18, ...(window.innerWidth >= 1024 ? { width: 360 } : {}) }}>

        <h2 className="font-bold text-gray-900" style={{ fontSize: 20, margin: 0 }}>Totales</h2>

        {/* Amounts */}
        <div className="rounded-xl border border-gray-100 flex flex-col" style={{ background: '#F9FAFB', padding: 18, gap: 10 }}>
          <div className="flex justify-between text-gray-500 text-sm">
            <span>Subtotal neto</span>
            <span className="font-mono font-semibold text-gray-700">{formatPrecio(neto)}</span>
          </div>
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

        {/* Payment method */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="text-gray-400 font-bold uppercase tracking-widest" style={{ fontSize: 10 }}>Método de pago</p>
          <div className="flex rounded-xl p-1" style={{ background: '#F3F4F6', gap: 4 }}>
            {(['EFECTIVO', 'TARJETA', 'BILLETERA'] as MetodoPago[]).map(m => (
              <button
                key={m}
                onPointerDown={e => { e.preventDefault(); store.setMetodoPago(m) }}
                className="flex-1 rounded-lg text-sm font-semibold transition-all touch-manipulation active:scale-95"
                style={{
                  height: 42,
                  border: 'none',
                  cursor: 'pointer',
                  background: store.metodoPago === m ? '#3B72E0' : 'transparent',
                  color: store.metodoPago === m ? '#fff' : '#6B7280',
                  boxShadow: store.metodoPago === m ? '0 1px 3px rgba(59,114,224,0.3)' : 'none',
                }}
              >
                {m === 'EFECTIVO' ? 'Efectivo' : m === 'TARJETA' ? 'Tarjeta' : 'Billetera'}
              </button>
            ))}
          </div>
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

        <div style={{ flex: 1 }} />

        {/* Success toast */}
        {emitido && (
          <div className="rounded-xl border flex flex-col" style={{
            background: '#F0FDF4', borderColor: '#86EFAC', padding: '14px 16px', gap: 4,
            animation: 'fadeSlideIn 0.25s ease',
          }}>
            <span className="font-bold" style={{ color: '#16A34A' }}>{emitido.tipo} emitido</span>
            {emitido.numero !== 'OFFLINE' ? (
              <span className="font-mono text-gray-400" style={{ fontSize: 11 }}>
                N° {emitido.numero} · CAE aprobado
              </span>
            ) : (
              <span style={{ fontSize: 12, color: '#D97706' }}>Guardado offline — se sincronizará</span>
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
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      </div>{/* end inner flex */}
    </div>
  )
}
