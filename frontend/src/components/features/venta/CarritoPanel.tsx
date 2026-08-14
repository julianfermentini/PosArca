import type { ItemCarrito } from '../../../types'
import { formatPrecio } from '../../../lib/utils'

interface CarritoPanelProps {
  items: ItemCarrito[]
  onIncrementar: (id: string) => void
  onDecrementar: (id: string) => void
}

export function CarritoPanel({ items, onIncrementar, onDecrementar }: CarritoPanelProps) {
  return (
    <>
      <div style={{ padding: '24px 28px 12px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2 className="font-bold text-gray-900" style={{ fontSize: 20, margin: 0 }}>Carrito</h2>
        <span className="text-gray-400 text-sm">
          {items.length > 0 ? `${items.length} ítem${items.length > 1 ? 's' : ''}` : ''}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '0 28px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-3" style={{ minHeight: 300 }}>
            <div className="flex items-center justify-center" style={{
              width: 60, height: 60, borderRadius: 18, background: '#fff',
              border: '1.5px dashed #D1D5DB',
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
              </svg>
            </div>
            <p className="font-semibold text-gray-400" style={{ margin: 0 }}>El carrito está vacío</p>
            <p className="text-sm text-gray-300" style={{ margin: 0 }}>Agregá productos desde la izquierda</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100"
              style={{ padding: '12px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>

              {/* Nombre + precio unitario */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate" style={{ fontSize: 14, marginBottom: 2 }}>
                  {item.descripcion}
                </p>
                <p className="font-mono text-gray-400" style={{ fontSize: 11 }}>
                  {formatPrecio(item.precio_final)} c/u
                </p>
              </div>

              {/* Controles cantidad */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onPointerDown={e => { e.preventDefault(); onDecrementar(item.id) }}
                  className="flex items-center justify-center font-bold active:scale-90 transition-all touch-manipulation"
                  style={{
                    width: 30, height: 30, borderRadius: 8, border: '1.5px solid #E5E7EB',
                    background: item.cantidad === 1 ? '#FEF2F2' : '#F9FAFB',
                    color: item.cantidad === 1 ? '#EF4444' : '#374151',
                    cursor: 'pointer', fontSize: 16,
                  }}
                >
                  {item.cantidad === 1 ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    </svg>
                  ) : '−'}
                </button>

                <span className="font-mono font-bold text-gray-900 text-center"
                  style={{ minWidth: 28, fontSize: 15 }}>
                  {item.cantidad}
                </span>

                <button
                  onPointerDown={e => { e.preventDefault(); onIncrementar(item.id) }}
                  className="flex items-center justify-center font-bold active:scale-90 transition-all touch-manipulation"
                  style={{
                    width: 30, height: 30, borderRadius: 8, border: '1.5px solid #E5E7EB',
                    background: '#F9FAFB', color: '#3B72E0',
                    cursor: 'pointer', fontSize: 18,
                  }}
                >
                  +
                </button>
              </div>

              {/* Total del ítem */}
              <p className="font-mono font-bold text-gray-900 flex-shrink-0" style={{ fontSize: 15, minWidth: 72, textAlign: 'right' }}>
                {formatPrecio(item.precio_final * item.cantidad)}
              </p>
            </div>
          ))
        )}
      </div>
    </>
  )
}
