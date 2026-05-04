import type { ItemCarrito } from '../../../types'
import { formatPrecio, calcularTotal } from '../../../lib/utils'

interface ItemListProps {
  items: ItemCarrito[]
  onEliminar: (id: string) => void
}

export function ItemList({ items, onEliminar }: ItemListProps) {
  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-lg">
        Sin items — agregue productos
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
      {items.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-3 py-3 px-1">
          <span className="text-gray-400 text-sm w-6 text-right flex-shrink-0">
            {idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{item.descripcion}</p>
            <p className="text-sm text-gray-500">Neto: {formatPrecio(item.precio_neto)}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-gray-900">{formatPrecio(calcularTotal(item.precio_neto))}</p>
            <p className="text-xs text-gray-400">c/IVA</p>
          </div>
          <button
            onPointerDown={(e) => { e.preventDefault(); onEliminar(item.id) }}
            className="
              w-10 h-10 rounded-lg bg-red-50 text-red-500 font-bold text-lg
              flex items-center justify-center flex-shrink-0
              active:bg-red-100 active:scale-95 transition-all touch-manipulation
            "
            aria-label="Eliminar item"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
