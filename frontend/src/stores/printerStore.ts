import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  conectarUSB, imprimirUSB, desconectarUSB,
  conectarBluetooth, imprimirBluetooth, desconectarBluetooth,
  buildTicketBytes, buildTicketNoFiscalBytes,
  type DatosTicketFront, type DatosTicketNoFiscal,
} from '../lib/printer'

type TipoConexion = 'usb' | 'bluetooth' | null

interface PrinterStore {
  tipo:      TipoConexion
  nombre:    string | null
  conectado: boolean
  error:     string | null

  conectarUSB:       () => Promise<void>
  conectarBluetooth: () => Promise<void>
  desconectar:       () => void
  imprimir:          (datos: DatosTicketFront) => Promise<void>
  imprimirNoFiscal:  (datos: DatosTicketNoFiscal) => Promise<void>
  clearError:        () => void
}

export const usePrinterStore = create<PrinterStore>()(
  persist(
    (set, get) => ({
      tipo:      null,
      nombre:    null,
      conectado: false,
      error:     null,

      conectarUSB: async () => {
        try {
          const info = await conectarUSB()
          set({ tipo: 'usb', nombre: info.nombre, conectado: true, error: null })
        } catch (e: any) {
          set({ error: e.message ?? 'Error conectando impresora USB' })
        }
      },

      conectarBluetooth: async () => {
        try {
          const info = await conectarBluetooth()
          set({ tipo: 'bluetooth', nombre: info.nombre, conectado: true, error: null })
        } catch (e: any) {
          set({ error: e.message ?? 'Error conectando impresora Bluetooth' })
        }
      },

      desconectar: () => {
        const { tipo } = get()
        if (tipo === 'usb')       desconectarUSB()
        if (tipo === 'bluetooth') desconectarBluetooth()
        set({ tipo: null, nombre: null, conectado: false, error: null })
      },

      imprimir: async (datos) => {
        const { tipo, conectado } = get()
        if (!conectado || !tipo) return
        try {
          const bytes = buildTicketBytes(datos)
          if (tipo === 'usb')       await imprimirUSB(bytes)
          if (tipo === 'bluetooth') await imprimirBluetooth(bytes)
        } catch (e: any) {
          set({ conectado: false, error: e.message ?? 'Error al imprimir' })
        }
      },

      imprimirNoFiscal: async (datos) => {
        const { tipo, conectado } = get()
        if (!conectado || !tipo) return
        try {
          const bytes = buildTicketNoFiscalBytes(datos)
          if (tipo === 'usb')       await imprimirUSB(bytes)
          if (tipo === 'bluetooth') await imprimirBluetooth(bytes)
        } catch (e: any) {
          set({ conectado: false, error: e.message ?? 'Error al imprimir' })
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'pos-printer',
      // Solo persistir el tipo y nombre para mostrar el estado entre recargas.
      // El objeto del dispositivo vive en la memoria del módulo printer.ts y se pierde al recargar.
      partialize: (s) => ({ tipo: s.tipo, nombre: s.nombre }),
    }
  )
)
