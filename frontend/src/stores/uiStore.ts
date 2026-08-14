import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Escalas de la pantalla de Caja. Se usa parada frente al mostrador y de reojo,
// así que hace falta poder agrandarla; el resto de las pantallas se usan
// sentado y de cerca y conviene que sigan entrando enteras.
//
// OJO al agregar una escala más grande: los anchos mínimos de las tres
// columnas de Caja (VentaPage) tienen que seguir entrando en la pantalla más
// angosta que usa ese layout. Hoy son 240 + 280 + 260 = 780, y en 1024px al
// 1.3 quedan 1024/1.3 = 787 disponibles. Con una escala mayor no entran y el
// botón Emitir se recorta sin aviso.
export const ESCALAS_CAJA = [
  { id: 'normal',     label: 'Normal',     valor: 1    },
  { id: 'grande',     label: 'Grande',     valor: 1.15 },
  { id: 'mas-grande', label: 'Más grande', valor: 1.3  },
] as const

export type EscalaCajaID = typeof ESCALAS_CAJA[number]['id']

// Se persiste el ID, no el multiplicador: si algún día se ajusta cuánto
// agranda "Grande", las tablets que lo tenían elegido siguen en "Grande" en
// vez de quedar con un número huérfano.
//
// Recibe string y no EscalaCajaID porque lo persistido no está validado: si el
// localStorage quedó con un ID que ya no existe, cae a Normal. Tienen que
// pasar por acá TANTO el zoom como el selector, o el zoom caería a Normal
// mientras el selector muestra las tres opciones apagadas.
export function escalaActiva(id: string) {
  return ESCALAS_CAJA.find(e => e.id === id) ?? ESCALAS_CAJA[0]
}

interface UIState {
  escalaCaja: EscalaCajaID
  setEscalaCaja: (id: EscalaCajaID) => void
}

// Preferencias del dispositivo, no de la cuenta: a propósito NO se limpian en
// resetSesion() del authStore. Cerrar sesión no tiene por qué achicarle la
// letra al que usa esta tablet. Mismo criterio que printerStore.
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      escalaCaja: 'normal',
      setEscalaCaja: (id) => set({ escalaCaja: id }),
    }),
    { name: 'pos-ui' }
  )
)
