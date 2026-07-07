import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import VentaPage   from './pages/VentaPage'
import ReportePage from './pages/ReportePage'
import ConfigPage  from './pages/ConfigPage'
import LoginPage   from './pages/LoginPage'
import SetupPage   from './pages/SetupPage'
import { useSyncStore }   from './stores/syncStore'
import { useAuthStore }   from './stores/authStore'
import { useEmpresaStore } from './stores/empresaStore'

export default function App() {
  const { online, pendientes } = useSyncStore()
  const { isAuthenticated, negocioNombre, logout } = useAuthStore()
  const { empresa, configurada, cargar } = useEmpresaStore()

  // Cargar datos del negocio cuando el usuario está autenticado.
  // isAuthenticated() lee del store y no cambia de referencia — eslint-disable es intencional.
  useEffect(() => {
    if (isAuthenticated()) cargar()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated()) return <LoginPage />

  // Primera vez: pedir que configure el negocio antes de operar
  if (!configurada) return <SetupPage onComplete={cargar} />

  const displayName = empresa?.razon_social || negocioNombre

  const tabCls = (isActive: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
      isActive ? 'text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
    }`

  return (
    <BrowserRouter>
      <div className="h-screen flex flex-col">
        <nav
          className="flex items-center justify-between flex-shrink-0 px-6"
          style={{ background: '#111827', height: 64 }}
        >
          {/* Left: logo + tabs */}
          <div className="flex items-center gap-7">
            <div className="flex items-center gap-2.5">
              <span
                className="flex items-center justify-center font-black text-white"
                style={{ width: 30, height: 30, borderRadius: 9, background: '#3B72E0', fontSize: 12 }}
              >
                PA
              </span>
              <span className="font-black text-white tracking-tight" style={{ fontSize: 17 }}>PosArca</span>
            </div>

            <div
              className="flex items-center gap-0.5 p-1 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.07)' }}
            >
              <NavLink to="/" end className={({ isActive }) => tabCls(isActive)}
                style={({ isActive }) => isActive ? { background: '#3B72E0' } : {}}>
                Caja
              </NavLink>
              <NavLink to="/reporte" className={({ isActive }) => tabCls(isActive)}
                style={({ isActive }) => isActive ? { background: '#3B72E0' } : {}}>
                Reportes
              </NavLink>
              <NavLink to="/config" className={({ isActive }) => tabCls(isActive)}
                style={({ isActive }) => isActive ? { background: '#3B72E0' } : {}}>
                Configuración
              </NavLink>
            </div>
          </div>

          {/* Right: status + business name + logout */}
          <div className="flex items-center gap-4">
            {!online && (
              <span className="text-white text-xs px-3 py-1.5 rounded-full font-semibold animate-pulse"
                style={{ background: '#EF4444' }}>
                Sin conexión
              </span>
            )}
            {online && pendientes > 0 && (
              <span className="text-white text-xs px-3 py-1.5 rounded-full font-semibold"
                style={{ background: '#F59E0B' }}>
                {pendientes} pendiente{pendientes !== 1 ? 's' : ''}
              </span>
            )}
            {online && pendientes === 0 && (
              <span className="text-xs" style={{ color: '#4B5563' }}>● Online</span>
            )}
            <span className="text-sm font-medium" style={{ color: '#D1D5DB' }}>{displayName}</span>
            <button
              onClick={logout}
              className="text-sm transition-colors rounded-lg px-3 py-1.5"
              style={{ color: '#D1D5DB' }}
              onMouseOver={e => {
                ;(e.currentTarget as HTMLElement).style.color = '#fff'
                ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'
              }}
              onMouseOut={e => {
                ;(e.currentTarget as HTMLElement).style.color = '#D1D5DB'
                ;(e.currentTarget as HTMLElement).style.background = ''
              }}
            >
              Salir
            </button>
          </div>
        </nav>

        <main className="flex-1 overflow-hidden bg-gray-50">
          <Routes>
            <Route path="/"        element={<VentaPage />} />
            <Route path="/reporte" element={<ReportePage />} />
            <Route path="/config"  element={<ConfigPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
