import { useState, useEffect } from 'react'
import { authApi } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

export default function LoginPage() {
  const { setAuth } = useAuthStore()
  const [modo, setModo] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [negocio, setNegocio] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    authApi.status().then(({ data }) => {
      if (!data.data?.has_users) setModo('register')
    }).catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cargando) return
    setCargando(true)
    setError('')
    try {
      const fn = modo === 'login'
        ? authApi.login(email, password)
        : authApi.register(email, password, negocio)
      const { data } = await fn
      if (data.success && data.data) {
        setAuth(data.data.token, data.data.email, data.data.negocio_nombre)
      } else {
        setError(data.error || 'Error desconocido')
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Error de conexión')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
      <div
        className="w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex"
        style={{ maxWidth: 900, minHeight: 520 }}
      >
        {/* Left: brand panel */}
        <div className="bg-gray-900 p-12 flex flex-col justify-between flex-shrink-0" style={{ width: '42%' }}>
          <div>
            <div className="flex items-center gap-2.5 mb-7">
              <span
                className="flex items-center justify-center font-black text-sm text-white"
                style={{ width: 34, height: 34, borderRadius: 10, background: '#3B72E0', fontSize: 14 }}
              >
                PA
              </span>
              <span className="font-black text-white tracking-tight" style={{ fontSize: 22 }}>PosArca</span>
            </div>
            <p className="text-gray-300 leading-relaxed" style={{ fontSize: 15, maxWidth: 280, lineHeight: '1.65' }}>
              Punto de venta fiscal con facturación electrónica AFIP/ARCA, pensado para el mostrador.
            </p>
          </div>
          <div className="text-gray-400 text-xs uppercase tracking-wider" style={{ lineHeight: '1.9' }}>
            CAE oficial · Tickets y facturas<br />
            Reportes de caja en tiempo real
          </div>
        </div>

        {/* Right: form panel */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 flex flex-col justify-center"
          style={{ padding: '52px 44px', gap: 18 }}
        >
          <div>
            <h1 className="font-bold text-gray-900 mb-1.5" style={{ fontSize: 24 }}>
              {modo === 'register' ? 'Creá tu cuenta' : 'Bienvenido de nuevo'}
            </h1>
            <p className="text-gray-500 text-sm">
              {modo === 'register' ? 'Configurá tu negocio en PosArca' : 'Ingresá con tu email y contraseña'}
            </p>
          </div>

          {modo === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Nombre del negocio
              </label>
              <input
                type="text"
                value={negocio}
                onChange={e => setNegocio(e.target.value)}
                placeholder="Ej: Bar El Rincón"
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none transition-all"
                style={{ fontSize: 14 }}
                onFocus={e => (e.target.style.borderColor = '#3B72E0')}
                onBlur={e => (e.target.style.borderColor = '')}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="vos@negocio.com"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none transition-all"
              onFocus={e => (e.target.style.borderColor = '#3B72E0')}
              onBlur={e => (e.target.style.borderColor = '')}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none transition-all"
              onFocus={e => (e.target.style.borderColor = '#3B72E0')}
              onBlur={e => (e.target.style.borderColor = '')}
            />
          </div>

          {error && (
            <p className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full font-bold text-white text-base rounded-xl transition-colors disabled:opacity-50"
            style={{ height: 54, background: '#3B72E0' }}
            onMouseOver={e => { if (!cargando) (e.target as HTMLElement).style.background = '#2F5CC0' }}
            onMouseOut={e => (e.target as HTMLElement).style.background = '#3B72E0'}
          >
            {cargando ? 'Cargando...' : modo === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>

          <button
            type="button"
            onClick={() => { setModo(m => m === 'register' ? 'login' : 'register'); setError('') }}
            className="text-gray-500 hover:text-gray-700 text-sm text-center transition-colors"
          >
            {modo === 'login' ? '¿Primera vez? Crear una cuenta' : '¿Ya tenés cuenta? Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}
