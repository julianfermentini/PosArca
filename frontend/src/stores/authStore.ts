import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  email: string | null
  negocioNombre: string | null
  setAuth: (token: string, email: string, negocioNombre: string) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      email: null,
      negocioNombre: null,
      setAuth: (token, email, negocioNombre) => set({ token, email, negocioNombre }),
      logout: () => set({ token: null, email: null, negocioNombre: null }),
      isAuthenticated: () => !!get().token,
    }),
    { name: 'pos-auth' }
  )
)
