import { useState } from 'react'
import { useEmpresaStore } from '../stores/empresaStore'

interface Props {
  onComplete: () => void
}

export default function SetupPage({ onComplete }: Props) {
  const { guardar } = useEmpresaStore()

  const [nombre, setNombre]     = useState('')
  const [direccion, setDir]     = useState('')
  const [telefono, setTel]      = useState('')
  const [condIVA, setCondIVA]   = useState('Responsable Inscripto')
  const [guardando, setGuardando] = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setGuardando(true)
    setError('')
    try {
      await guardar({
        razon_social:  nombre.trim(),
        direccion:     direccion.trim(),
        telefono:      telefono.trim(),
        condicion_iva: condIVA,
      })
      onComplete()
    } catch {
      setError('No se pudo guardar. Revisá la conexión con el servidor.')
      setGuardando(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-xl outline-none text-sm transition-all'
  const inputStyle = { padding: '11px 14px' }
  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
    (e.target.style.borderColor = '#3B72E0')
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
    (e.target.style.borderColor = '')

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#F3F4F6', padding: '32px 16px' }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full" style={{ maxWidth: 480, padding: '40px 36px' }}>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <span
            className="flex items-center justify-center font-black text-white flex-shrink-0"
            style={{ width: 36, height: 36, borderRadius: 10, background: '#3B72E0', fontSize: 14 }}
          >
            PA
          </span>
          <div>
            <h1 className="font-bold text-gray-900" style={{ fontSize: 18, margin: 0 }}>
              Configurá tu negocio
            </h1>
            <p className="text-gray-500 text-sm" style={{ margin: 0 }}>
              Estos datos aparecerán en tickets y facturas.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div>
            <label className="block font-semibold text-gray-500 mb-1.5"
              style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Nombre del negocio *
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Mi Bar & Restó"
              className={inputCls}
              style={inputStyle}
              onFocus={onFocus}
              onBlur={onBlur}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-500 mb-1.5"
              style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Dirección
            </label>
            <input
              type="text"
              value={direccion}
              onChange={e => setDir(e.target.value)}
              placeholder="Av. San Martín 1234, Mendoza"
              className={inputCls}
              style={inputStyle}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-500 mb-1.5"
              style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Teléfono
            </label>
            <input
              type="tel"
              value={telefono}
              onChange={e => setTel(e.target.value)}
              placeholder="+54 261 000-0000"
              className={inputCls}
              style={inputStyle}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-500 mb-1.5"
              style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Condición IVA
            </label>
            <select
              value={condIVA}
              onChange={e => setCondIVA(e.target.value)}
              className={inputCls}
              style={{ ...inputStyle, appearance: 'none', background: 'white' }}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <option>Responsable Inscripto</option>
              <option>Monotributista</option>
              <option>Exento</option>
            </select>
          </div>

          {error && (
            <p className="text-sm rounded-xl text-red-700" style={{ background: '#FEF2F2', padding: '10px 14px' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!nombre.trim() || guardando}
            className="font-semibold text-white rounded-xl transition-colors disabled:opacity-40"
            style={{ padding: '13px', background: '#3B72E0', border: 'none', cursor: nombre.trim() ? 'pointer' : 'not-allowed', fontSize: 15, marginTop: 4 }}
            onMouseOver={e => { if (!guardando) (e.currentTarget.style.background = '#2F5CC0') }}
            onMouseOut={e => (e.currentTarget.style.background = '#3B72E0')}
          >
            {guardando ? 'Guardando...' : 'Comenzar a usar PosArca →'}
          </button>
        </form>

        <p className="text-center text-gray-400 text-xs" style={{ marginTop: 20 }}>
          Podés cambiar estos datos en cualquier momento desde Configuración.
        </p>
      </div>
    </div>
  )
}
