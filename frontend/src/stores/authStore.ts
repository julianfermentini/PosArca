import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useEmpresaStore } from './empresaStore'
import { useVentaStore } from './ventaStore'
import { useProductosStore } from './productosStore'
import { useRotulosStore } from './rotulosStore'

interface AuthState {
  token: string | null
  email: string | null
  negocioNombre: string | null
  setAuth: (token: string, email: string, negocioNombre: string) => void
  logout: () => void
  isAuthenticated: () => boolean
}

// Limpia todo estado de la cuenta anterior. Tiene que ser en memoria y no un
// removeItem de localStorage: los stores ya hidratados se siguen mostrando con
// los datos viejos hasta que responde el cargar() del login siguiente, y en
// una app multi-empresa eso es mostrarle a una cuenta los datos de otra.
// Reseteando el store alcanza — zustand/persist reescribe lo persistido solo.
function resetSesion() {
  useEmpresaStore.getState().reset()
  useVentaStore.getState().limpiarCarrito()
  useProductosStore.getState().reset()
  useRotulosStore.getState().reset()
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
