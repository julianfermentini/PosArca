import { useState } from 'react'
import { useRotulosStore, type Rotulo } from '../../../stores/rotulosStore'
import { formatPrecio } from '../../../lib/utils'

interface Props {
  // Tocar un rótulo lo carga en el formulario de impresión de la página.
  onCargar: (r: Rotulo) => void
}

export function RotulosGuardados({ onCargar }: Props) {
  const { rotulos, editar, eliminar } = useRotulosStore()

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombre, setNombre]         = useState('')
  const [precio, setPrecio]         = useState('')
  const [error, setError]           = useState('')

  const precioNum   = parseFloat(precio) || 0
  const puedeGuardar = nombre.trim() !== '' && precioNum > 0

  const abrirEdicion = (r: Rotulo) => {
    setEditandoId(r.id)
    setNombre(r.nombre)
    setPrecio(String(r.precio))
    setError('')
  }

  const cancelar = () => { setEditandoId(null); setError('') }

  const guardarEdicion = async () => {
    if (!editandoId || !puedeGuardar) return
    const err = await editar(editandoId, nombre.trim(), precioNum)
    if (err) { setError(err); return }
    cancelar()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100" style={{ padding: 20 }}>
      <p className="text-gray-400 font-bold uppercase tracking-widest" style={{ fontSize: 10, margin: '0 0 8px' }}>
        Rótulos guardados
      </p>

      {rotulos.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center text-gray-300 gap-2" style={{ minHeight: 110 }}>
          <p className="font-semibold" style={{ fontSize: 15, margin: 0 }}>Todavía no guardaste ninguno</p>
          <p className="text-sm" style={{ margin: 0 }}>Cargá un nombre y un precio, y tocá "Guardar rótulo".</p>
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 8 }}>
          {rotulos.map(r => editandoId === r.id ? (
            <div key={r.id} className="rounded-xl border flex flex-col"
              style={{ borderColor: '#3B72E0', padding: 14, gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 10 }}>
                <input
                  value={nombre}
                  onChange={e => { setNombre(e.target.value); setError('') }}
                  onKeyDown={e => { if (e.key === 'Enter' && puedeGuardar) guardarEdicion() }}
                  maxLength={42}
                  autoFocus
                  placeholder="Nombre del plato"
                  className="w-full border border-gray-200 rounded-lg outline-none text-sm transition-all"
                  style={{ padding: '10px 12px' }}
                  onFocus={e => (e.target.style.borderColor = '#3B72E0')}
                  onBlur={e => (e.target.style.borderColor = '')}
                />
                <input
                  type="number"
                  value={precio}
                  onChange={e => { setPrecio(e.target.value); setError('') }}
                  onKeyDown={e => { if (e.key === 'Enter' && puedeGuardar) guardarEdicion() }}
                  placeholder="Precio"
                  className="w-full border border-gray-200 rounded-lg outline-none text-sm transition-all"
                  style={{ padding: '10px 12px' }}
                  onFocus={e => (e.target.style.borderColor = '#3B72E0')}
                  onBlur={e => (e.target.style.borderColor = '')}
                />
              </div>

              {error && (
                <p className="text-xs text-red-700 rounded-lg" style={{ background: '#FEF2F2', padding: '8px 12px', margin: 0 }}>
                  {error}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={guardarEdicion}
                  disabled={!puedeGuardar}
                  className="font-semibold text-white rounded-lg transition-colors disabled:opacity-40"
                  style={{ padding: '9px 18px', background: '#3B72E0', border: 'none', cursor: puedeGuardar ? 'pointer' : 'not-allowed', fontSize: 13 }}
                >
                  Guardar
                </button>
                <button
                  onClick={cancelar}
                  className="font-semibold text-gray-600 rounded-lg border border-gray-200 hover:border-gray-400"
                  style={{ padding: '9px 18px', background: '#fff', cursor: 'pointer', fontSize: 13 }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div key={r.id} className="flex items-center rounded-xl border border-gray-100" style={{ gap: 4 }}>
              <button
                onPointerDown={e => { e.preventDefault(); onCargar(r) }}
                title="Usar este rótulo"
                className="flex-1 flex items-center justify-between min-w-0 text-left active:scale-[0.99] transition-transform touch-manipulation"
                style={{ padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', gap: 12 }}
              >
                <span className="font-semibold text-gray-900 min-w-0 truncate" style={{ fontSize: 15 }}>{r.nombre}</span>
                <span className="font-mono font-bold text-gray-700 flex-shrink-0" style={{ fontSize: 14 }}>{formatPrecio(r.precio)}</span>
              </button>
              <button
                onClick={() => abrirEdicion(r)}
                title="Editar nombre y precio"
                className="flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-lg flex-shrink-0"
                style={{ width: 34, height: 34, border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
              <button
                onClick={() => eliminar(r.id)}
                title="Borrar rótulo"
                className="flex items-center justify-center text-red-400 hover:bg-red-50 rounded-lg flex-shrink-0"
                style={{ width: 34, height: 34, marginRight: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
