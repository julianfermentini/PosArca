import { useState, useEffect, useCallback } from 'react'
import { useVentaStore } from '../stores/ventaStore'
import { useSyncStore } from '../stores/syncStore'
import { NumericKeypad } from '../components/features/venta/NumericKeypad'
import { ItemList } from '../components/features/venta/ItemList'
import { FacturaModal, type DatosFactura } from '../components/features/factura/FacturaModal'
import { Button } from '../components/ui/Button'
import { ventasApi, facturasApi } from '../lib/api'
import { formatPrecio, generarUUID } from '../lib/utils'
import type { MetodoPago, VentaOffline } from '../types'

type Paso = 'descripcion' | 'precio'

type ConfirmState =
  | { tipo: 'ticket'; numero: string; total: number }
  | { tipo: 'factura'; numero: string; total: number; email: string }
  | null

export default function VentaPage() {
  const store = useVentaStore()
  const sync = useSyncStore()

  const [paso, setPaso] = useState<Paso>('descripcion')
  const [mostrarFacturaModal, setMostrarFacturaModal] = useState(false)
  const [confirmacion, setConfirmacion] = useState<ConfirmState>(null)
  const [cargando, setCargando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Detectar online/offline
  useEffect(() => {
    const handleOnline  = () => sync.setOnline(true)
    const handleOffline = () => sync.setOnline(false)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    sync.actualizarConteo()
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const puedeAgregar = store.descripcionActual.trim() && parseFloat(store.precioActual) > 0
  const puedeEmitir  = store.carrito.length > 0 && store.metodoPago

  const handleAgregarItem = useCallback(() => {
    if (!puedeAgregar) return
    if (paso === 'descripcion') {
      setPaso('precio')
      return
    }
    store.agregarItem()
    setPaso('descripcion')
  }, [paso, puedeAgregar, store])

  const emitirTicket = async () => {
    if (!puedeEmitir || cargando) return
    setCargando(true)
    setErrorMsg('')

    const payload = {
      tipo: 'TICKET' as const,
      items: store.getItemsParaAPI(),
      metodo_pago: store.metodoPago!,
    }

    if (!sync.online) {
      // Guardar offline
      const venta: VentaOffline = {
        id: generarUUID(),
        tipo: 'TICKET',
        items: payload.items,
        subtotal: store.getSubtotal(),
        iva: store.getIVA(),
        total: store.getTotal(),
        metodo_pago: store.metodoPago!,
        created_at: new Date().toISOString(),
        estado_sync: 'PENDIENTE',
      }
      await sync.guardarOffline(venta)
      setConfirmacion({ tipo: 'ticket', numero: 'OFFLINE', total: store.getTotal() })
      store.limpiarCarrito()
      setCargando(false)
      return
    }

    try {
      const { data } = await ventasApi.crear(payload)
      if (data.success && data.data) {
        setConfirmacion({ tipo: 'ticket', numero: data.data.numero, total: data.data.total })
        store.limpiarCarrito()
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al emitir ticket'
      setErrorMsg(msg)
    } finally {
      setCargando(false)
    }
  }

  const emitirFactura = async (datos: DatosFactura) => {
    if (!puedeEmitir) throw new Error('Complete el carrito y el método de pago')

    const { data } = await facturasApi.crear({
      items: store.getItemsParaAPI(),
      metodo_pago: store.metodoPago!,
      ...datos,
    })

    if (!data.success) throw new Error(data.error || 'Error al emitir factura')

    setMostrarFacturaModal(false)
    setConfirmacion({
      tipo: 'factura',
      numero: data.data!.numero,
      total: store.getTotal(),
      email: datos.email_cliente,
    })
    store.limpiarCarrito()
  }

  // Pantalla de confirmación post-venta
  if (confirmacion) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-green-50 p-8 gap-6">
        <div className="text-8xl">✓</div>
        <h1 className="text-4xl font-bold text-green-700">
          {confirmacion.tipo === 'ticket' ? 'Ticket Emitido' : 'Factura Emitida'}
        </h1>
        {confirmacion.numero !== 'OFFLINE' && (
          <p className="text-2xl text-gray-700">Nro: <strong>{confirmacion.numero}</strong></p>
        )}
        {confirmacion.numero === 'OFFLINE' && (
          <p className="text-xl text-amber-600 bg-amber-50 px-6 py-3 rounded-xl">
            Guardado offline — se sincronizará con conexión
          </p>
        )}
        <p className="text-3xl font-bold text-gray-900">{formatPrecio(confirmacion.total)}</p>
        {confirmacion.tipo === 'factura' && (
          <p className="text-lg text-gray-600">Email enviado a: {confirmacion.email}</p>
        )}
        <Button size="xl" onClick={() => setConfirmacion(null)} className="mt-4">
          Nueva Venta
        </Button>
      </div>
    )
  }

  return (
    <div className="h-full flex bg-gray-50 overflow-hidden">
      {/* Panel izquierdo: entrada de items */}
      <div className="flex flex-col w-[340px] bg-white border-r border-gray-200 p-4 gap-4 flex-shrink-0">
        {/* Badge offline */}
        {(!sync.online || sync.pendientes > 0) && (
          <div className={`rounded-xl px-3 py-2 text-sm font-semibold flex items-center gap-2
            ${sync.online ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
            <span>{sync.online ? '📶' : '📵'}</span>
            {sync.online
              ? `${sync.pendientes} venta${sync.pendientes !== 1 ? 's' : ''} pendiente${sync.pendientes !== 1 ? 's' : ''}`
              : 'Sin conexión'}
          </div>
        )}

        {/* Descripción */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            {paso === 'descripcion' ? '1. Descripción' : '2. Precio (neto sin IVA)'}
          </label>
          <div className="border-2 border-gray-200 rounded-xl bg-gray-50 px-4 py-3 min-h-[56px] flex items-center">
            {paso === 'descripcion' ? (
              <input
                type="text"
                value={store.descripcionActual}
                onChange={(e) => store.setDescripcion(e.target.value)}
                placeholder="Descripción del producto..."
                className="w-full bg-transparent text-lg outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && store.descripcionActual.trim()) setPaso('precio')
                }}
                autoFocus
              />
            ) : (
              <div className="w-full">
                <p className="text-sm text-gray-500 truncate">{store.descripcionActual}</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${store.precioActual || '0'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Teclado numérico */}
        {paso === 'precio' ? (
          <NumericKeypad
            value={store.precioActual}
            onChange={store.setPrecio}
            onConfirm={() => {
              store.agregarItem()
              setPaso('descripcion')
            }}
          />
        ) : (
          <Button
            size="lg"
            fullWidth
            disabled={!store.descripcionActual.trim()}
            onClick={() => store.descripcionActual.trim() && setPaso('precio')}
          >
            Siguiente → Precio
          </Button>
        )}

        {paso === 'precio' && (
          <button
            onClick={() => { setPaso('descripcion'); store.setPrecio('') }}
            className="text-sm text-gray-500 hover:text-gray-700 text-center py-1"
          >
            ← Volver a descripción
          </button>
        )}
      </div>

      {/* Panel central: lista de items */}
      <div className="flex-1 flex flex-col p-4 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-gray-900">
            Items ({store.carrito.length})
          </h2>
          {store.carrito.length > 0 && (
            <button
              onClick={store.limpiarCarrito}
              className="text-sm text-red-500 hover:text-red-700 font-medium"
            >
              Vaciar todo
            </button>
          )}
        </div>

        <div className="flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col">
          <ItemList items={store.carrito} onEliminar={store.eliminarItem} />
        </div>

        {errorMsg && (
          <p className="mt-3 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-medium">
            {errorMsg}
          </p>
        )}
      </div>

      {/* Panel derecho: totales y acciones */}
      <div className="flex flex-col w-[280px] bg-white border-l border-gray-200 p-4 gap-4 flex-shrink-0">
        {/* Totales */}
        <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal neto</span>
            <span>{formatPrecio(store.getSubtotal())}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>IVA 21%</span>
            <span>{formatPrecio(store.getIVA())}</span>
          </div>
          <div className="flex justify-between text-2xl font-bold text-gray-900 pt-2 border-t border-gray-200">
            <span>TOTAL</span>
            <span>{formatPrecio(store.getTotal())}</span>
          </div>
        </div>

        {/* Método de pago */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            Método de Pago
          </p>
          <div className="grid grid-cols-1 gap-2">
            {(['EFECTIVO', 'TARJETA', 'BILLETERA'] as MetodoPago[]).map((m) => (
              <button
                key={m}
                onPointerDown={(e) => { e.preventDefault(); store.setMetodoPago(m) }}
                className={[
                  'min-h-[52px] rounded-xl font-semibold text-base transition-all',
                  'border-2 touch-manipulation active:scale-95',
                  store.metodoPago === m
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300',
                ].join(' ')}
              >
                {m === 'EFECTIVO' ? '💵 Efectivo'
                  : m === 'TARJETA' ? '💳 Tarjeta'
                  : '📱 Billetera'}
              </button>
            ))}
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-col gap-3 mt-auto">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!puedeEmitir || cargando}
            onClick={emitirTicket}
          >
            {cargando ? 'Emitiendo...' : '🧾 Emitir Ticket'}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            disabled={!puedeEmitir || cargando}
            onClick={() => setMostrarFacturaModal(true)}
          >
            📄 Necesita Factura
          </Button>
        </div>
      </div>

      {mostrarFacturaModal && (
        <FacturaModal
          onClose={() => setMostrarFacturaModal(false)}
          onSubmit={emitirFactura}
          metodoPago={store.metodoPago}
        />
      )}
    </div>
  )
}
