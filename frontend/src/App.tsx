import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import VentaPage    from './pages/VentaPage'
import ReportePage  from './pages/ReportePage'
import ConfigPage   from './pages/ConfigPage'
import { useSyncStore } from './stores/syncStore'

export default function App() {
  const { online, pendientes } = useSyncStore()

  return (
    <BrowserRouter>
      <div className="h-screen flex flex-col bg-gray-100">
        {/* Barra de navegación superior */}
        <nav className="bg-blue-700 text-white flex items-center px-4 gap-4 h-14 flex-shrink-0 shadow-md">
          <span className="font-bold text-lg tracking-tight mr-2">POS Fiscal</span>

          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${isActive ? 'bg-blue-900' : 'hover:bg-blue-600'}`
            }
          >
            🧾 Caja
          </NavLink>

          <NavLink
            to="/reporte"
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${isActive ? 'bg-blue-900' : 'hover:bg-blue-600'}`
            }
          >
            📊 Cierre de Caja
          </NavLink>

          <NavLink
            to="/config"
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${isActive ? 'bg-blue-900' : 'hover:bg-blue-600'}`
            }
          >
            ⚙️ Config
          </NavLink>

          {/* Indicador de estado online/pendientes */}
          <div className="ml-auto flex items-center gap-2 text-sm">
            {!online && (
              <span className="bg-red-500 px-3 py-1 rounded-full font-semibold animate-pulse">
                📵 Sin conexión
              </span>
            )}
            {online && pendientes > 0 && (
              <span className="bg-amber-500 px-3 py-1 rounded-full font-semibold">
                ⏳ {pendientes} pendiente{pendientes !== 1 ? 's' : ''}
              </span>
            )}
            {online && pendientes === 0 && (
              <span className="text-blue-200 text-xs">● Online</span>
            )}
          </div>
        </nav>

        {/* Contenido principal */}
        <main className="flex-1 overflow-hidden">
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
