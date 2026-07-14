import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { empresaApi, type Empresa } from '../lib/api'

interface EmpresaStore {
  empresa: Empresa | null
  configurada: boolean
  hydrated: boolean
  cargar: () => Promise<void>
  guardar: (datos: Omit<Empresa, 'id' | 'cuit' | 'punto_venta'>) => Promise<void>
}

export const useEmpresaStore = create<EmpresaStore>()(
  persist(
    (set, get) => ({
      empresa: null,
      configurada: false,
      hydrated: false,

      cargar: async () => {
        try {
          const r = await empresaApi.get()
          if (r.data.success) {
            const emp = r.data.data
            if (!emp) return
            const configurada = get().configurada || !!emp.razon_social
            set({ empresa: emp, configurada })
          }
        } catch {}
      },

      guardar: async (datos) => {
        // Guardar localmente de inmediato para no depender del backend
        set({
          empresa: {
            razon_social:       datos.razon_social,
            titular:            datos.titular,
            cuit:               get().empresa?.cuit ?? '',
            punto_venta:        get().empresa?.punto_venta ?? 1,
            direccion:          datos.direccion,
            telefono:           datos.telefono,
            condicion_iva:      datos.condicion_iva,
            ing_brutos:         datos.ing_brutos,
            inicio_actividades: datos.inicio_actividades,
            defensa_consumidor: datos.defensa_consumidor,
          },
          configurada: true,
        })
        // Sincronizar con el backend (best-effort)
        try {
          const r = await empresaApi.update({
            razon_social:       datos.razon_social,
            titular:            datos.titular,
            direccion:          datos.direccion,
            telefono:           datos.telefono,
            condicion_iva:      datos.condicion_iva,
            ing_brutos:         datos.ing_brutos,
            inicio_actividades: datos.inicio_actividades,
            defensa_consumidor: datos.defensa_consumidor,
          })
          if (r.data.success && r.data.data) {
            set({ empresa: r.data.data })
          }
        } catch {}
      },
    }),
    {
      name: 'pos-empresa',
      partialize: (state) => ({ empresa: state.empresa, configurada: state.configurada }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true
      },
    }
  )
)
