import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import VentaPage   from './pages/VentaPage'
import ReportePage from './pages/ReportePage'
import ConfigPage  from './pages/ConfigPage'
import LoginPage   from './pages/LoginPage'
import SetupPage   from './pages/SetupPage'
import { useSyncStore }     from './stores/syncStore'
import { useAuthStore }     from './stores/authStore'
import { useEmpresaStore }  from './stores/empresaStore'
import { useProductosStore } from './stores/productosStore'

export default function App() {
  const { online, pendientes, sincronizar, actualizarConteo } = useSyncStore()
  const { token, isAuthenticated, negocioNombre, logout } = useAuthStore()
  const { empresa, configurada, hydrated, cargar } = useEmpresaStore()
  const { cargar: cargarProductos } = useProductosStore()

  useEffect(() => {
    if (token) {
      cargar()
      cargarProductos()
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sincronizar al cargar si ya hay internet y hay ventas pendientes
  useEffect(() => {
    actualizarConteo().then(() => {
      if (navigator.onLine) sincronizar()
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated()) return <LoginPage />
  if (!hydrated) return null
  if (!configurada) return <SetupPage onComplete={cargar} />

  const displayName = empresa?.razon_social || negocioNombre

  const tabCls = (isActive: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
      isActive ? 'text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
    }`

  const bottomTabCls = (isActive: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-xs font-semibold transition-colors ${
      isActive ? 'text-blue-500' : 'text-gray-400'
    }`

  return (
    <BrowserRouter>
      <div className="h-screen flex flex-col">

        {/* ── Top nav ── */}
        <nav
          className="flex items-center justify-between flex-shrink-0 px-3 md:px-6"
          style={{ background: '#111827', height: 56 }}
        >
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span
              className="flex items-center justify-center font-black text-white flex-shrink-0"
              style={{ width: 28, height: 28, borderRadius: 8, background: '#3B72E0', fontSize: 11 }}
            >
              PA
            </span>
            <span className="font-black text-white tracking-tight hidden sm:block" style={{ fontSize: 16 }}>PosArca</span>
          </div>

          {/* Desktop tabs */}
          <div
            className="hidden md:flex items-center gap-0.5 p-1 rounded-xl"
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

          {/* Right: status + name + logout */}
          <div className="flex items-center gap-2 md:gap-4">
            {!online && (
              <span className="text-white text-xs px-2 py-1 rounded-full font-semibold animate-pulse"
                style={{ background: '#EF4444' }}>
                Offline
              </span>
            )}
            {online && pendientes > 0 && (
              <button
                onClick={sincronizar}
                className="text-white text-xs px-2 py-1 rounded-full font-semibold transition-opacity hover:opacity-80 active:opacity-60"
                style={{ background: '#F59E0B', border: 'none', cursor: 'pointer' }}
                title={`${pendientes} venta${pendientes > 1 ? 's' : ''} offline pendiente${pendientes > 1 ? 's' : ''} — tap para sincronizar`}
              >
                {pendientes}
              </button>
            )}
            {online && pendientes === 0 && (
              <span className="text-xs font-medium" style={{ color: '#4ADE80' }}>● Online</span>
            )}
            <span className="text-xs md:text-sm font-medium truncate max-w-[100px] md:max-w-none" style={{ color: '#D1D5DB' }}>
              {displayName}
            </span>
            <button
              onClick={logout}
              className="text-xs md:text-sm transition-colors rounded-lg px-2 md:px-3 py-1.5 flex-shrink-0"
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

        {/* ── Main content ── */}
        <main className="flex-1 overflow-hidden bg-gray-50 pb-14 md:pb-0">
          <Routes>
            <Route path="/"        element={<VentaPage />} />
            <Route path="/reporte" element={<ReportePage />} />
            <Route path="/config"  element={<ConfigPage />} />
          </Routes>
        </main>

        {/* ── Mobile bottom nav ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 flex border-t bg-white z-50"
          style={{ borderColor: '#E5E7EB', height: 56 }}>
          <NavLink to="/" end className={({ isActive }) => bottomTabCls(isActive)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
            Caja
          </NavLink>
          <NavLink to="/reporte" className={({ isActive }) => bottomTabCls(isActive)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
            </svg>
            Reportes
          </NavLink>
          <NavLink to="/config" className={({ isActive }) => bottomTabCls(isActive)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Config
          </NavLink>
        </nav>

      </div>
    </BrowserRouter>
  )
}
