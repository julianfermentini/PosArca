import type { Producto } from '../../../stores/productosStore'
import { NumericKeypad } from './NumericKeypad'
import { formatPrecio } from '../../../lib/utils'

type Paso = 'descripcion' | 'precio'

const FREE_COLORS = ['#3B72E0', '#0EA57A', '#8B5CF6', '#F97316', '#EC4899', '#0EA5E9']

interface ProductoPanelProps {
  productos: Producto[]
  paso: Paso
  descripcionActual: string
  precioActual: string
  onSelectProducto: (producto: Producto) => void
  onChangePrecio: (value: string) => void
  onConfirmarPrecio: () => void
  onCancelar: () => void
}

export function ProductoPanel({
  productos, paso, descripcionActual, precioActual,
  onSelectProducto, onChangePrecio, onConfirmarPrecio, onCancelar,
}: ProductoPanelProps) {
  const sinPrecio = productos.filter(p => p.precio === null)
  const conPrecio = productos.filter(p => p.precio !== null)
  const freeColorMap: Record<string, string> = {}
  sinPrecio.forEach((p, i) => { freeColorMap[p.id] = FREE_COLORS[i % FREE_COLORS.length] })

  if (paso === 'precio') {
    return (
      <>
        <div>
          <p className="text-gray-400 font-bold uppercase tracking-widest mb-2" style={{ fontSize: 10 }}>
            Precio final (IVA incluido)
          </p>
          <div className="border border-gray-200 rounded-xl" style={{ background: '#F9FAFB', padding: '16px 18px' }}>
            <p className="font-semibold mb-1" style={{ fontSize: 12, color: '#F59E0B' }}>{descripcionActual}</p>
            <p className="font-mono font-black text-gray-900" style={{ fontSize: 32 }}>
              ${precioActual || '0'}
            </p>
          </div>
        </div>

        <NumericKeypad
          value={precioActual}
          onChange={onChangePrecio}
          onConfirm={onConfirmarPrecio}
        />

        <button
          onClick={onCancelar}
          className="text-gray-400 hover:text-gray-600 text-sm text-left transition-colors"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
        >
          ← Cancelar
        </button>
      </>
    )
  }

  if (productos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-300 gap-2" style={{ minHeight: 200 }}>
        <p className="font-semibold" style={{ fontSize: 15 }}>Sin productos</p>
        <p className="text-sm">Andá a Configuración para agregar.</p>
      </div>
    )
  }

  return (
    <>
      {sinPrecio.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="text-gray-400 font-bold uppercase tracking-widest" style={{ fontSize: 10 }}>Precio libre</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {sinPrecio.map(p => (
              <button
                key={p.id}
                onPointerDown={e => { e.preventDefault(); onSelectProducto(p) }}
                className="flex flex-col items-start text-white text-left active:scale-95 transition-all touch-manipulation"
                style={{ background: freeColorMap[p.id], borderRadius: 14, padding: '18px 16px', minHeight: 90, border: 'none', cursor: 'pointer', gap: 6 }}
              >
                <span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>{p.nombre}</span>
                <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.85 }}>Ingresar precio</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {conPrecio.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sinPrecio.length > 0 && (
            <p className="text-gray-400 font-bold uppercase tracking-widest" style={{ fontSize: 10 }}>Precio fijo</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {conPrecio.map(p => (
              <button
                key={p.id}
                onPointerDown={e => { e.preventDefault(); onSelectProducto(p) }}
                className="flex flex-col items-start text-white text-left active:scale-95 transition-all touch-manipulation"
                style={{ background: '#64748B', borderRadius: 14, padding: '18px 16px', minHeight: 90, border: 'none', cursor: 'pointer', gap: 6 }}
              >
                <span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>{p.nombre}</span>
                <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.85 }}>{formatPrecio(p.precio!)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
