import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useEmpresaStore } from './empresaStore'
import { useVentaStore } from './ventaStore'

interface AuthState {
  token: string | null
  email: string | null
  negocioNombre: string | null
  setAuth: (token: string, email: string, negocioNombre: string) => void
  logout: () => void
  isAuthenticated: () => boolean
}

// Limpia todo estado (en memoria y persistido) de la cuenta anterior. Borrar
// solo la clave de localStorage no alcanza para los stores ya hidratados —
// por eso empresaStore/ventaStore se resetean explícitamente en memoria, y
// no solo vía removeItem.
function resetSesion() {
  localStorage.removeItem('pos-productos')
  useEmpresaStore.getState().reset()
  useVentaStore.getState().limpiarCarrito()
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      email: null,
      negocioNombre: null,
      setAuth: (token, email, negocioNombre) => {
        resetSesion()
        set({ token, email, negocioNombre })
      },
      logout: () => {
        resetSesion()
        set({ token: null, email: null, negocioNombre: null })
      },
      isAuthenticated: () => !!get().token,
    }),
    { name: 'pos-auth' }
  )
)
