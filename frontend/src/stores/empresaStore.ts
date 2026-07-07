import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { empresaApi, type Empresa } from '../lib/api'

interface EmpresaStore {
  empresa: Empresa | null
  configurada: boolean    // true si razon_social no está vacía
  cargar: () => Promise<void>
  guardar: (datos: Omit<Empresa, 'id' | 'cuit' | 'punto_venta'>) => Promise<void>
}

export const useEmpresaStore = create<EmpresaStore>()(
  persist(
    (set) => ({
      empresa: null,
      configurada: false,

      cargar: async () => {
        try {
          const r = await empresaApi.get()
          if (r.data.success) {
            const emp = r.data.data
            set({ empresa: emp, configurada: !!emp.razon_social })
          }
        } catch {}
      },

      guardar: async (datos) => {
        const r = await empresaApi.update({
          razon_social: datos.razon_social,
          direccion:    datos.direccion,
          telefono:     datos.telefono,
          condicion_iva: datos.condicion_iva,
        })
        if (r.data.success) {
          set({ empresa: r.data.data, configurada: !!r.data.data.razon_social })
        }
      },
    }),
    {
      name: 'pos-empresa',
      partialize: (state) => ({ empresa: state.empresa, configurada: state.configurada }),
    }
  )
)
