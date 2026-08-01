import { useState, useEffect, useCallback } from 'react'
import { adminApi, type CuentaAdmin } from '../lib/api'

const STORAGE_KEY = 'pos-admin-secret'

function Badge({ env }: { env: string }) {
  const prod = env === 'produccion'
  return (
    <span
      className="inline-block text-xs font-bold px-2 py-0.5 rounded-full"
      style={{
        background: prod ? '#DCFCE7' : '#FEF3C7',
        color: prod ? '#15803D' : '#92400E',
      }}
    >
      {prod ? 'Producción' : 'Testing'}
    </span>
  )
}

function ResetModal({ email, secret, onClose }: { email: string; secret: string; onClose: () => void }) {
  const [pass, setPass] = useState('')
  const [estado, setEstado] = useState<'idle' | 'ok' | 'err'>('idle')
  const [err, setErr] = useState('')
  const [cargando, setCargando] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    setEstado('idle')
    try {
      await adminApi.resetPassword(secret, email, pass)
      setEstado('ok')
      setPass('')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setErr(msg || 'Error')
      setEstado('err')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-bold text-gray-900 mb-1" style={{ fontSize: 17 }}>Resetear contraseña</h3>
        <p className="text-sm text-gray-500 mb-4">{email}</p>
        {estado === 'ok' ? (
          <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl mb-4">
            Contraseña actualizada correctamente.
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="Nueva contraseña (mínimo 6 caracteres)"
              required
              minLength={6}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none"
              style={{ fontFamily: 'monospace' }}
              onFocus={e => (e.target.style.borderColor = '#3B72E0')}
              onBlur={e => (e.target.style.borderColor = '')}
            />
            {estado === 'err' && (
              <p className="text-red-600 text-sm">{err}</p>
            )}
            <button
              type="submit"
              disabled={cargando}
              className="w-full font-bold text-white rounded-xl py-3 text-sm disabled:opacity-50"
              style={{ background: '#3B72E0' }}
            >
              {cargando ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
        )}
        <button
          onClick={onClose}
          className="mt-3 w-full text-sm text-gray-500 hover:text-gray-700 py-1"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

function NuevaCuentaForm({ secret, onCreada }: { secret: string; onCreada: () => void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [nombre, setNombre] = useState('')
  const [estado, setEstado] = useState<'idle' | 'ok' | 'err'>('idle')
  const [err, setErr] = useState('')
  const [cargando, setCargando] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    setEstado('idle')
    try {
      await adminApi.crearCuenta(secret, email, pass, nombre)
      setEstado('ok')
      setEmail(''); setPass(''); setNombre('')
      onCreada()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setErr(msg || 'Error creando cuenta')
      setEstado('err')
    } finally {
      setCargando(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none transition-all'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => { setOpen(o => !o); setEstado('idle') }}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-semibold text-gray-900 text-sm">Nueva cuenta</span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>

      {open && (
        <form onSubmit={submit} className="px-5 pb-5 flex flex-col gap-3 border-t border-gray-100 pt-4">
          {estado === 'ok' && (
            <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl">
              Cuenta creada correctamente.
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Nombre del negocio
            </label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Bar El Rincón" required className={inputCls}
              onFocus={e => (e.target.style.borderColor = '#3B72E0')}
              onBlur={e => (e.target.style.borderColor = '')}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="cliente@negocio.com" required className={inputCls}
              onFocus={e => (e.target.style.borderColor = '#3B72E0')}
              onBlur={e => (e.target.style.borderColor = '')}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Contraseña inicial
            </label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)}
              placeholder="Mínimo 6 caracteres" required minLength={6} className={inputCls}
              style={{ fontFamily: 'monospace' }}
              onFocus={e => (e.target.style.borderColor = '#3B72E0')}
              onBlur={e => (e.target.style.borderColor = '')}
            />
          </div>
          {estado === 'err' && <p className="text-red-600 text-sm">{err}</p>}
          <button
            type="submit" disabled={cargando}
            className="font-bold text-white rounded-xl py-3 text-sm disabled:opacity-50 mt-1"
            style={{ background: '#3B72E0' }}
          >
            {cargando ? 'Creando...' : 'Crear cuenta'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function AdminPage() {
  const [secret, setSecret] = useState(() => sessionStorage.getItem(STORAGE_KEY) ?? '')
  const [secretInput, setSecretInput] = useState('')
  const [autenticado, setAutenticado] = useState(false)
  const [authErr, setAuthErr] = useState('')
  const [cuentas, setCuentas] = useState<CuentaAdmin[]>([])
  const [cargando, setCargando] = useState(false)
  const [resetEmail, setResetEmail] = useState<string | null>(null)

  const cargar = useCallback(async (s: string) => {
    setCargando(true)
    try {
      const { data } = await adminApi.listarCuentas(s)
      setCuentas(data.data ?? [])
      setAutenticado(true)
      sessionStorage.setItem(STORAGE_KEY, s)
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      if (status === 401) setAuthErr('Secret incorrecto')
      else setAuthErr('Error de conexión')
      setAutenticado(false)
    } finally {
      setCargando(false)
    }
  }, [])

  // Intentar con el secret guardado en sessión al cargar
  useEffect(() => {
    if (secret) cargar(secret)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault()
    setAuthErr('')
    setSecret(secretInput)
    cargar(secretInput)
  }

  const formatFecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  if (!autenticado) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm p-8">
          <div className="flex items-center gap-2 mb-6">
            <span
              className="flex items-center justify-center font-black text-white text-xs"
              style={{ width: 30, height: 30, borderRadius: 8, background: '#3B72E0' }}
            >PA</span>
            <span className="font-black text-gray-900 tracking-tight" style={{ fontSize: 18 }}>
              PosArca <span className="text-gray-400 font-normal">Admin</span>
            </span>
          </div>
          <form onSubmit={handleAuth} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Admin Secret
              </label>
              <input
                type="password"
                value={secretInput}
                onChange={e => setSecretInput(e.target.value)}
                placeholder="••••••••••••"
                required
                autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none"
                style={{ fontFamily: 'monospace' }}
                onFocus={e => (e.target.style.borderColor = '#3B72E0')}
                onBlur={e => (e.target.style.borderColor = '')}
              />
            </div>
            {authErr && <p className="text-red-600 text-sm">{authErr}</p>}
            <button
              type="submit"
              disabled={cargando}
              className="w-full font-bold text-white rounded-xl py-3 text-sm disabled:opacity-50"
              style={{ background: '#3B72E0' }}
            >
              {cargando ? 'Verificando...' : 'Acceder'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navbar */}
      <nav
        className="flex items-center justify-between px-6 flex-shrink-0"
        style={{ background: '#111827', height: 56 }}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center font-black text-white text-xs"
            style={{ width: 28, height: 28, borderRadius: 8, background: '#3B72E0' }}
          >PA</span>
          <span className="font-black text-white tracking-tight" style={{ fontSize: 16 }}>
            PosArca <span className="text-gray-400 font-normal">Admin</span>
          </span>
        </div>
        <button
          onClick={() => { sessionStorage.removeItem(STORAGE_KEY); setAutenticado(false); setSecret('') }}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Salir
        </button>
      </nav>

      <div className="max-w-3xl mx-auto p-6 flex flex-col gap-6">

        {/* Cuentas */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">
              Cuentas registradas
              <span className="ml-2 text-gray-400 font-normal">({cuentas.length})</span>
            </h2>
            <button
              onClick={() => cargar(secret)}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Actualizar
            </button>
          </div>

          {cuentas.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-10">Sin cuentas registradas</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: '#F9FAFB' }}>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Negocio</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Env</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Alta</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cuentas.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">{c.razon_social}</td>
                      <td className="px-5 py-3 text-gray-600" style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.email}</td>
                      <td className="px-5 py-3 hidden sm:table-cell"><Badge env={c.arca_env} /></td>
                      <td className="px-5 py-3 text-gray-400 hidden sm:table-cell text-xs">{formatFecha(c.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => setResetEmail(c.email)}
                          className="text-xs font-semibold transition-colors"
                          style={{ color: '#3B72E0' }}
                          onMouseOver={e => (e.currentTarget.style.color = '#2F5CC0')}
                          onMouseOut={e => (e.currentTarget.style.color = '#3B72E0')}
                        >
                          Reset contraseña
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <NuevaCuentaForm secret={secret} onCreada={() => cargar(secret)} />
      </div>

      {resetEmail && (
        <ResetModal
          email={resetEmail}
          secret={secret}
          onClose={() => setResetEmail(null)}
        />
      )}
    </div>
  )
}
