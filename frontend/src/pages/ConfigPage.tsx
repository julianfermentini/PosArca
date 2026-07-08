import { useState, useEffect } from 'react'
import { useProductosStore } from '../stores/productosStore'
import { useEmpresaStore } from '../stores/empresaStore'
import { usePrinterStore } from '../stores/printerStore'
import { formatPrecio } from '../lib/utils'

const FREE_COLORS = ['#3B72E0', '#0EA57A', '#8B5CF6', '#F97316', '#EC4899', '#0EA5E9']

// ─── Shared field styles ──────────────────────────────────────────────────────
const labelCls = 'block font-semibold text-gray-500 mb-1'
const labelStyle = { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }
const inputCls  = 'w-full border border-gray-200 rounded-xl outline-none text-sm transition-all'
const inputSty  = { padding: '10px 14px' }
const onFocusBlue = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
  (e.target.style.borderColor = '#3B72E0')
const onBlurReset = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
  (e.target.style.borderColor = '')

// ─── Section card ─────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100" style={{ padding: 24, ...style }}>
      {children}
    </div>
  )
}

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 className="font-bold text-gray-900" style={{ fontSize: 15, margin: 0 }}>{children}</h3>
      {sub && <p className="text-gray-500 text-sm" style={{ margin: '3px 0 0' }}>{sub}</p>}
    </div>
  )
}

// ─── Impresora section ────────────────────────────────────────────────────────
function SeccionImpresora() {
  const { nombre, conectado, error, conectarUSB, conectarBluetooth, desconectar, clearError } = usePrinterStore()

  const webUSBOk = 'usb' in navigator
  const webBTOk  = 'bluetooth' in navigator

  const statusColor = conectado ? '#22C55E' : '#9CA3AF'
  const statusLabel = conectado
    ? `Conectada — ${nombre}`
    : nombre
    ? `Desconectada (era: ${nombre})`
    : 'Sin impresora conectada'

  return (
    <Card>
      <SectionTitle sub="Se conecta directamente desde este dispositivo vía USB OTG o Bluetooth.">
        Impresora térmica
      </SectionTitle>

      {/* Status pill */}
      <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: statusColor, flexShrink: 0 }} />
        <span className="text-sm text-gray-600">{statusLabel}</span>
      </div>

      {/* Reconnect notice */}
      {nombre && !conectado && (
        <p className="text-xs text-amber-700 rounded-lg" style={{ background: '#FFFBEB', padding: '8px 12px', marginBottom: 12 }}>
          La conexión se pierde al recargar la página — reconectá antes de cobrar.
        </p>
      )}

      {error && (
        <p className="text-xs text-red-700 rounded-lg" style={{ background: '#FEF2F2', padding: '8px 12px', marginBottom: 12 }}>
          {error}{' '}
          <button onClick={clearError} style={{ textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>
            Cerrar
          </button>
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* USB */}
        <button
          onClick={conectarUSB}
          disabled={!webUSBOk}
          className="flex items-center gap-2 font-semibold rounded-xl border transition-colors disabled:opacity-40"
          style={{ padding: '9px 16px', fontSize: 13, cursor: webUSBOk ? 'pointer' : 'not-allowed', borderColor: '#D1D5DB', background: 'white', color: '#374151' }}
          onMouseOver={e => { if (webUSBOk) (e.currentTarget.style.borderColor = '#3B72E0') }}
          onMouseOut={e => (e.currentTarget.style.borderColor = '#D1D5DB')}
          title={!webUSBOk ? 'Requiere Chrome en Android con USB OTG' : ''}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v11m0 0-3-3m3 3 3-3M5 20h14a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2Z"/>
          </svg>
          Conectar por USB
        </button>

        {/* Bluetooth */}
        <button
          onClick={conectarBluetooth}
          disabled={!webBTOk}
          className="flex items-center gap-2 font-semibold rounded-xl border transition-colors disabled:opacity-40"
          style={{ padding: '9px 16px', fontSize: 13, cursor: webBTOk ? 'pointer' : 'not-allowed', borderColor: '#D1D5DB', background: 'white', color: '#374151' }}
          onMouseOver={e => { if (webBTOk) (e.currentTarget.style.borderColor = '#3B72E0') }}
          onMouseOut={e => (e.currentTarget.style.borderColor = '#D1D5DB')}
          title={!webBTOk ? 'Requiere Chrome con Web Bluetooth activado' : ''}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6.5 6.5 11 11L12 23V1l5.5 5.5-11 11"/>
          </svg>
          Conectar por Bluetooth
        </button>

        {/* Disconnect */}
        {(conectado || nombre) && (
          <button
            onClick={desconectar}
            className="font-semibold rounded-xl border transition-colors"
            style={{ padding: '9px 16px', fontSize: 13, cursor: 'pointer', borderColor: '#FCA5A5', background: '#FEF2F2', color: '#DC2626' }}
          >
            Desconectar
          </button>
        )}
      </div>

      {(!webUSBOk && !webBTOk) && (
        <p className="text-xs text-gray-400" style={{ marginTop: 12 }}>
          Abrí esta página desde <strong>Chrome en Android</strong> para habilitar la impresión directa.
        </p>
      )}
    </Card>
  )
}

// ─── Empresa section ──────────────────────────────────────────────────────────
function SeccionEmpresa() {
  const { empresa, guardar } = useEmpresaStore()

  const [nombre, setNombre]   = useState(empresa?.razon_social ?? '')
  const [dir,    setDir]      = useState(empresa?.direccion ?? '')
  const [tel,    setTel]      = useState(empresa?.telefono ?? '')
  const [iva,    setIva]      = useState(empresa?.condicion_iva ?? 'Responsable Inscripto')
  const [saving, setSaving]   = useState(false)
  const [ok,     setOk]       = useState(false)

  // Sincronizar si empresa carga después del montaje
  useEffect(() => {
    if (empresa) {
      setNombre(empresa.razon_social)
      setDir(empresa.direccion)
      setTel(empresa.telefono)
      setIva(empresa.condicion_iva)
    }
  }, [empresa?.razon_social])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    await guardar({ razon_social: nombre.trim(), direccion: dir.trim(), telefono: tel.trim(), condicion_iva: iva })
    setSaving(false)
    setOk(true)
    setTimeout(() => setOk(false), 2500)
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionTitle sub="Aparecen en el encabezado de tickets y facturas PDF.">
        Datos del negocio
      </SectionTitle>

      <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className={labelCls} style={labelStyle}>Nombre / Razón social *</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder="Mi Bar & Restó" required className={inputCls} style={inputSty}
            onFocus={onFocusBlue} onBlur={onBlurReset} />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label className={labelCls} style={labelStyle}>Dirección</label>
          <input type="text" value={dir} onChange={e => setDir(e.target.value)}
            placeholder="Av. San Martín 1234, Mendoza" className={inputCls} style={inputSty}
            onFocus={onFocusBlue} onBlur={onBlurReset} />
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>Teléfono</label>
          <input type="tel" value={tel} onChange={e => setTel(e.target.value)}
            placeholder="+54 261 000-0000" className={inputCls} style={inputSty}
            onFocus={onFocusBlue} onBlur={onBlurReset} />
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>Condición IVA</label>
          <select value={iva} onChange={e => setIva(e.target.value)}
            className={inputCls} style={{ ...inputSty, background: 'white' }}
            onFocus={onFocusBlue} onBlur={onBlurReset}>
            <option>Responsable Inscripto</option>
            <option>Monotributista</option>
            <option>Exento</option>
          </select>
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <button
            type="submit"
            disabled={!nombre.trim() || saving}
            className="font-semibold text-white rounded-xl transition-colors disabled:opacity-40"
            style={{ padding: '10px 20px', background: '#3B72E0', border: 'none', cursor: nombre.trim() ? 'pointer' : 'not-allowed', fontSize: 14 }}
            onMouseOver={e => { if (nombre.trim()) (e.currentTarget.style.background = '#2F5CC0') }}
            onMouseOut={e => (e.currentTarget.style.background = '#3B72E0')}
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {ok && <span className="text-sm font-semibold" style={{ color: '#16A34A' }}>✓ Guardado</span>}
        </div>
      </form>

      {empresa?.cuit && (
        <p className="text-xs text-gray-400" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #F3F4F6' }}>
          CUIT: <strong>{empresa.cuit}</strong> · Punto de venta: <strong>{String(empresa.punto_venta).padStart(4, '0')}</strong>
          {' '}— Parámetros fiscales configurados en el servidor (.env).
        </p>
      )}
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ConfigPage() {
  const { productos, agregar, editar, eliminar } = useProductosStore()

  const [mostrarForm, setMostrarForm] = useState(false)
  const [editandoId,  setEditandoId]  = useState<string | null>(null)
  const [draftName,   setDraftName]   = useState('')
  const [draftPrice,  setDraftPrice]  = useState('')
  const [sinPrecioFijo, setSinPrecioFijo] = useState(false)

  const freeIdx: Record<string, number> = {}
  let idx = 0
  productos.forEach(p => { if (p.precio === null) { freeIdx[p.id] = idx; idx++ } })

  const abrirNuevo = () => {
    setEditandoId(null); setDraftName(''); setDraftPrice(''); setSinPrecioFijo(false); setMostrarForm(true)
  }
  const abrirEdicion = (id: string, nombre: string, precio: number | null) => {
    setEditandoId(id); setDraftName(nombre); setDraftPrice(precio !== null ? String(precio) : '')
    setSinPrecioFijo(precio === null); setMostrarForm(true)
  }
  const cancelar = () => { setMostrarForm(false); setEditandoId(null) }
  const guardar = () => {
    if (!draftName.trim()) return
    const precio = sinPrecioFijo ? null : (parseFloat(draftPrice) || null)
    if (!sinPrecioFijo && (precio === null || precio <= 0)) return
    editandoId ? editar(editandoId, draftName.trim(), precio) : agregar(draftName.trim(), precio)
    cancelar()
  }
  const canSave = !!draftName.trim() && (sinPrecioFijo || parseFloat(draftPrice) > 0)
  const sorted = [...productos].sort((a, b) => {
    if (a.precio === null && b.precio !== null) return -1
    if (a.precio !== null && b.precio === null) return 1
    return 0
  })

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#F3F4F6' }}>
      <div style={{ padding: '28px 36px', maxWidth: 760 }}>

        {/* ── Datos del negocio ── */}
        <SeccionEmpresa />

        {/* ── Impresora ── */}
        <SeccionImpresora />

        {/* ── Productos ── */}
        <div style={{ marginTop: 8 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <div>
              <h2 className="font-bold text-gray-900" style={{ fontSize: 18, margin: 0 }}>
                Productos de acceso rápido
              </h2>
              <p className="text-gray-500 text-sm" style={{ margin: '3px 0 0' }}>
                Se muestran como botones en la pantalla de Caja.
              </p>
            </div>
            {!mostrarForm && (
              <button
                onClick={abrirNuevo}
                className="flex items-center gap-2 font-semibold text-white rounded-xl transition-colors"
                style={{ padding: '10px 18px', background: '#3B72E0', border: 'none', cursor: 'pointer', fontSize: 14 }}
                onMouseOver={e => (e.currentTarget.style.background = '#2F5CC0')}
                onMouseOut={e => (e.currentTarget.style.background = '#3B72E0')}
              >
                + Nuevo producto
              </button>
            )}
          </div>

          {/* New / edit form */}
          {mostrarForm && (
            <div className="bg-white rounded-xl border flex flex-col" style={{ borderColor: '#3B72E0', padding: 20, gap: 14, marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10 }}>
                <div>
                  <label className={labelCls} style={labelStyle}>Nombre</label>
                  <input type="text" value={draftName} onChange={e => setDraftName(e.target.value)}
                    placeholder="Nombre del producto" className={inputCls} style={inputSty}
                    onFocus={onFocusBlue} onBlur={onBlurReset} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter' && canSave) guardar() }} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Precio</label>
                  <input type="number" value={draftPrice} onChange={e => setDraftPrice(e.target.value)}
                    placeholder="Opcional" disabled={sinPrecioFijo}
                    className={`${inputCls} disabled:opacity-40`} style={inputSty}
                    onFocus={onFocusBlue} onBlur={onBlurReset}
                    onKeyDown={e => { if (e.key === 'Enter' && canSave) guardar() }} />
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div onClick={() => setSinPrecioFijo(v => !v)} style={{
                  width: 36, height: 20, borderRadius: 10,
                  background: sinPrecioFijo ? '#3B72E0' : '#D1D5DB',
                  cursor: 'pointer', flexShrink: 0, position: 'relative',
                }}>
                  <span className="absolute bg-white rounded-full" style={{
                    top: 3, width: 14, height: 14, boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    transform: sinPrecioFijo ? 'translateX(18px)' : 'translateX(3px)',
                    transition: 'transform 0.15s',
                  }} />
                </div>
                <span className="text-sm text-gray-600">Sin precio fijo (se ingresa en el momento)</span>
              </label>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={guardar} disabled={!canSave}
                  className="font-semibold text-white rounded-xl transition-colors disabled:opacity-40"
                  style={{ padding: '10px 20px', background: '#3B72E0', border: 'none', cursor: canSave ? 'pointer' : 'not-allowed', fontSize: 14 }}
                  onMouseOver={e => { if (canSave) (e.currentTarget.style.background = '#2F5CC0') }}
                  onMouseOut={e => (e.currentTarget.style.background = '#3B72E0')}>
                  Guardar
                </button>
                <button onClick={cancelar}
                  className="font-semibold text-gray-600 rounded-xl border border-gray-200 hover:border-gray-400"
                  style={{ padding: '10px 20px', background: '#fff', cursor: 'pointer', fontSize: 14 }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Product list */}
          {productos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 text-center text-gray-400 py-12 text-sm">
              No hay productos configurados todavía.
            </div>
          ) : (
            <div className="flex flex-col" style={{ gap: 8 }}>
              {sorted.map(p => {
                const colorSwatch = p.precio === null ? FREE_COLORS[(freeIdx[p.id] ?? 0) % FREE_COLORS.length] : null
                return (
                  <div key={p.id} className="bg-white rounded-xl border border-gray-100 flex items-center"
                    style={{ padding: '14px 16px', gap: 12 }}>
                    {colorSwatch && (
                      <span style={{ width: 12, height: 12, borderRadius: 4, background: colorSwatch, flexShrink: 0 }} />
                    )}
                    <span className="flex-1 font-semibold text-gray-900 min-w-0 truncate" style={{ fontSize: 14 }}>
                      {p.nombre}
                    </span>
                    <span className="font-mono font-bold text-gray-700 flex-shrink-0" style={{ fontSize: 13 }}>
                      {p.precio !== null ? formatPrecio(p.precio) : 'Sin precio fijo'}
                    </span>
                    <button onClick={() => abrirEdicion(p.id, p.nombre, p.precio)}
                      className="flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-lg"
                      style={{ width: 34, height: 34, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                    <button onClick={() => eliminar(p.id)}
                      className="flex items-center justify-center text-red-400 hover:bg-red-50 rounded-lg"
                      style={{ width: 34, height: 34, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
