import { useEffect, useState } from 'react'
import { pendientesCAEApi, type VentaPendienteCAE } from '../../../lib/api'
import { formatPrecio, validarCUIT, formatCUIT } from '../../../lib/utils'
import { Button } from '../../ui/Button'

// Ventas/facturas que todavía no consiguieron CAE: esperando a ARCA, esperando
// su turno (se autorizan en el mismo orden en que se vendieron), o trabadas de
// verdad (CUIT inválido) y necesitando que alguien las corrija o anule.
export function PendientesCAE() {
  const [items, setItems]       = useState<VentaPendienteCAE[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState('')

  const cargar = async () => {
    setCargando(true)
    setError('')
    try {
      const { data } = await pendientesCAEApi.listar()
      if (data.success && data.data) setItems(data.data)
    } catch {
      setError('No se pudo cargar la lista de pendientes')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  if (cargando) return <div className="text-center text-gray-400 py-16">Cargando...</div>

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-xl text-sm px-4 py-3" style={{ background: '#FEF2F2', color: '#DC2626' }}>
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-gray-300 gap-2 py-16">
          <p className="font-semibold text-gray-400">Nada pendiente</p>
          <p className="text-sm text-gray-300">Todas las ventas tienen CAE.</p>
        </div>
      ) : (
        items.map(item => (
          <PendienteCard key={item.venta_id} item={item} onCambio={cargar} />
        ))
      )}
    </div>
  )
}

function PendienteCard({ item, onCambio }: { item: VentaPendienteCAE; onCambio: () => void }) {
  const [editando, setEditando] = useState(false)
  const [razonSocial, setRazonSocial] = useState(item.razon_social ?? '')
  const [cuit, setCuit]               = useState(item.cuit_cliente ?? '')
  const [email, setEmail]             = useState(item.email_cliente ?? '')
  const [cargando, setCargando]       = useState(false)
  const [error, setError]             = useState('')

  const esFactura = item.tipo === 'FACTURA'
  const fecha = new Date(item.created_at).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const motivoEspera = item.estado === 'PENDIENTE' && item.intentos === 0
    ? 'Esperando su turno o a ARCA'
    : `${item.intentos} intento${item.intentos === 1 ? '' : 's'} fallido${item.intentos === 1 ? '' : 's'}`

  const anular = async () => {
    const confirmar = esFactura
      ? `¿Anular esta factura de ${item.razon_social}? El cliente ya cobrado no va a recibir comprobante fiscal.`
      : '¿Anular este ticket? No debería hacer falta salvo que ARCA lleve mucho tiempo caído — un ticket no puede ser rechazado por datos, así que en general conviene esperar.'
    if (!window.confirm(confirmar)) return

    setCargando(true)
    setError('')
    try {
      const { data } = await pendientesCAEApi.anular(item.venta_id)
      if (!data.success) throw new Error(data.error || 'Error al anular')
      onCambio()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al anular')
      setCargando(false)
    }
  }

  const corregirYReintentar = async () => {
    if (!razonSocial.trim())    { setError('Ingresá la razón social'); return }
    if (!validarCUIT(cuit))     { setError('CUIT inválido'); return }
    if (!email.includes('@'))  { setError('Email inválido'); return }

    setCargando(true)
    setError('')
    try {
      const { data } = await pendientesCAEApi.corregir(item.venta_id, {
        razon_social: razonSocial.trim(),
        cuit_cliente: cuit,
        email_cliente: email,
      })
      if (!data.success) throw new Error(data.error || 'Error al corregir')
      onCambio()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al corregir')
      setCargando(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">{esFactura ? 'Factura' : 'Ticket'}</span>
            <span className="font-mono text-gray-400 text-sm">{item.numero}</span>
          </div>
          <p className="text-gray-400 text-xs" style={{ marginTop: 2 }}>{fecha}</p>
        </div>
        <span className="font-mono font-bold text-gray-900">{formatPrecio(item.total)}</span>
      </div>

      <div className="rounded-xl text-xs px-3 py-2 mt-3" style={{ background: '#FFFBEB', color: '#B45309' }}>
        {motivoEspera}
        {item.ultimo_error && <div className="mt-1 text-gray-500">{item.ultimo_error}</div>}
      </div>

      {esFactura && !editando && (
        <div className="text-sm text-gray-600 mt-3">
          <p><span className="text-gray-400">Cliente:</span> {item.razon_social}</p>
          <p><span className="text-gray-400">CUIT:</span> {item.cuit_cliente}</p>
          <p><span className="text-gray-400">Email:</span> {item.email_cliente}</p>
        </div>
      )}

      {esFactura && editando && (
        <div className="flex flex-col gap-2 mt-3">
          <input
            type="text" value={razonSocial} onChange={e => setRazonSocial(e.target.value)}
            placeholder="Razón social"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <input
            type="tel" inputMode="numeric" value={cuit} maxLength={13}
            onChange={e => setCuit(formatCUIT(e.target.value.replace(/\D/g, '')))}
            placeholder="CUIT del cliente"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-blue-500"
          />
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email del cliente"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>
      )}

      {error && <p className="text-red-600 text-xs mt-2">{error}</p>}

      <div className="flex gap-2 mt-3">
        {esFactura && (
          editando ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => { setEditando(false); setError('') }} disabled={cargando}>
                Cancelar
              </Button>
              <Button variant="success" size="sm" onClick={corregirYReintentar} disabled={cargando}>
                {cargando ? 'Reintentando...' : 'Corregir y reintentar'}
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setEditando(true)} disabled={cargando}>
              Corregir datos
            </Button>
          )
        )}
        {!editando && (
          <Button variant="danger" size="sm" onClick={anular} disabled={cargando}>
            {cargando ? 'Anulando...' : 'Anular'}
          </Button>
        )}
      </div>
    </div>
  )
}
