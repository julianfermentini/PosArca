import { useState } from 'react'
import { useProductosStore, type Producto } from '../stores/productosStore'
import { usePrinterStore } from '../stores/printerStore'
import { NumericKeypad } from '../components/features/venta/NumericKeypad'
import { lineasRotulo, MAX_ROTULOS } from '../lib/printer'
import { formatPrecio } from '../lib/utils'

export default function RotuloPage() {
  const printer = usePrinterStore()
  const { productos } = useProductosStore()

  const [nombre, setNombre]     = useState('')
  const [precio, setPrecio]     = useState('')   // string: mismo contrato que NumericKeypad
  const [cantidad, setCantidad] = useState(1)
  const [ok, setOk]             = useState(false)

  const precioNum     = parseFloat(precio) || 0
  const puedeImprimir = printer.conectado && nombre.trim() !== '' && precioNum > 0
  // Literalmente lo que sale impreso: misma función que usa buildRotuloBytes.
  const preview       = lineasRotulo({ nombre, precio: precioNum })

  // Los productos no son un modo aparte: sólo prellenan los mismos dos campos.
  const seleccionar = (p: Producto) => {
    setNombre(p.nombre)
    setPrecio(p.precio !== null ? String(p.precio) : '')
  }

  const imprimir = async () => {
    if (!puedeImprimir) return
    printer.clearError()
    await printer.imprimirRotulo({ nombre: nombre.trim(), precio: precioNum, cantidad })
    // Las acciones del store se tragan el error en el estado en vez de
    // re-lanzarlo, así que hay que leerlo para no cantar un ✓ sobre un fallo.
    if (usePrinterStore.getState().error) return
    setOk(true)
    setTimeout(() => setOk(false), 2500)
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#F3F4F6' }}>
      <div style={{ padding: '24px 28px', maxWidth: 1000 }}>

        <div style={{ marginBottom: 20 }}>
          <h2 className="font-bold text-gray-900" style={{ fontSize: 18, margin: '0 0 4px' }}>Rótulos</h2>
          <p className="text-gray-500 text-sm" style={{ margin: 0 }}>
            Etiquetas adhesivas con el nombre del plato y el precio, en la misma impresora de tickets.
          </p>
        </div>

        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[380px_1fr] lg:gap-6 lg:items-start">

          {/* ── Datos del rótulo ── */}
          <div className="bg-white rounded-xl border border-gray-100 flex flex-col" style={{ padding: 24, gap: 18 }}>

            <div>
              <Eyebrow>Nombre del plato</Eyebrow>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                maxLength={42}
                autoCapitalize="words"
                autoComplete="off"
                spellCheck={false}
                placeholder="Milanesa napolitana"
                className="w-full border border-gray-200 rounded-xl outline-none transition-all"
                style={{ padding: '12px 14px', fontSize: 18, fontWeight: 600 }}
                onFocus={e => (e.target.style.borderColor = '#3B72E0')}
                onBlur={e => (e.target.style.borderColor = '')}
              />
            </div>

            <div>
              <Eyebrow>Precio final (IVA incluido)</Eyebrow>
              <div className="border border-gray-200 rounded-xl" style={{ background: '#F9FAFB', padding: '14px 18px', marginBottom: 12 }}>
                <p className="font-mono font-black text-gray-900" style={{ fontSize: 32, margin: 0 }}>
                  ${precio || '0'}
                </p>
              </div>
              <NumericKeypad value={precio} onChange={setPrecio} />
            </div>

            <div>
              <Eyebrow>Cantidad</Eyebrow>
              <div className="flex items-center" style={{ gap: 14 }}>
                <StepperBtn
                  onClick={() => setCantidad(c => Math.max(1, c - 1))}
                  disabled={cantidad <= 1}
                  label="−"
                />
                <span className="font-black text-gray-900 text-center" style={{ fontSize: 28, minWidth: 48 }}>
                  {cantidad}
                </span>
                <StepperBtn
                  onClick={() => setCantidad(c => Math.min(MAX_ROTULOS, c + 1))}
                  disabled={cantidad >= MAX_ROTULOS}
                  label="+"
                />
              </div>
            </div>

            <div>
              <button
                onClick={imprimir}
                disabled={!puedeImprimir}
                className="w-full flex items-center justify-center gap-2 font-bold text-white rounded-xl transition-colors disabled:opacity-40"
                style={{ height: 52, background: '#3B72E0', border: 'none', cursor: puedeImprimir ? 'pointer' : 'not-allowed', fontSize: 15 }}
                onMouseOver={e => puedeImprimir && ((e.currentTarget as HTMLElement).style.background = '#2F5CC0')}
                onMouseOut={e => ((e.currentTarget as HTMLElement).style.background = '#3B72E0')}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                </svg>
                Imprimir {cantidad} {cantidad === 1 ? 'rótulo' : 'rótulos'}
              </button>
              {!printer.conectado && (
                <p className="text-gray-400 text-xs text-center" style={{ marginTop: 6 }}>Sin impresora conectada</p>
              )}
              {printer.error && (
                <p className="text-xs text-red-700 rounded-lg" style={{ background: '#FEF2F2', padding: '8px 12px', marginTop: 8 }}>
                  {printer.error}
                </p>
              )}
              {ok && (
                <p className="text-sm font-semibold text-center" style={{ color: '#16A34A', marginTop: 8 }}>
                  ✓ Enviado a la impresora
                </p>
              )}
            </div>
          </div>

          {/* ── Vista previa + productos ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className="bg-white rounded-xl border border-gray-100" style={{ padding: 20 }}>
              <Eyebrow>Vista previa</Eyebrow>
              <div style={{
                border: '2px dashed #E5E7EB', borderRadius: 10, padding: '20px 12px', background: '#FCFCFD',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 4, minHeight: 130,
              }}>
                {preview.nombre.length === 0
                  ? <span className="text-gray-300 text-sm">Escribí un nombre o tocá un producto</span>
                  : preview.nombre.map((l, i) => (
                      <span key={i} className="font-mono font-black text-gray-900" style={{ fontSize: 20, lineHeight: 1.15 }}>{l}</span>
                    ))}
                {precioNum > 0 && (
                  <span className="font-mono font-black text-gray-900" style={{ fontSize: 30, marginTop: 6 }}>{preview.precio}</span>
                )}
              </div>
              {cantidad > 1 && (
                <p className="text-gray-400 text-xs text-center" style={{ marginTop: 8 }}>
                  Salen {cantidad} iguales, cortados uno por uno.
                </p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-100" style={{ padding: 20 }}>
              <Eyebrow>Productos</Eyebrow>
              {productos.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center text-gray-300 gap-2" style={{ minHeight: 120 }}>
                  <p className="font-semibold" style={{ fontSize: 15, margin: 0 }}>Sin productos</p>
                  <p className="text-sm" style={{ margin: 0 }}>Andá a Configuración para agregar.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3" style={{ gap: 12 }}>
                  {productos.map(p => (
                    <button
                      key={p.id}
                      onPointerDown={e => { e.preventDefault(); seleccionar(p) }}
                      className="flex flex-col items-start text-white text-left active:scale-95 transition-all touch-manipulation"
                      style={{ background: '#64748B', borderRadius: 14, padding: '16px 14px', minHeight: 78, border: 'none', cursor: 'pointer', gap: 5 }}
                    >
                      <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>{p.nombre}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.85 }}>
                        {p.precio !== null ? formatPrecio(p.precio) : 'Precio libre'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-gray-400 font-bold uppercase tracking-widest" style={{ fontSize: 10, margin: '0 0 8px' }}>
      {children}
    </p>
  )
}

function StepperBtn({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center border border-gray-200 rounded-xl font-black text-gray-700 active:scale-95 transition-all touch-manipulation disabled:opacity-30"
      style={{ width: 48, height: 48, background: '#fff', fontSize: 22, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {label}
    </button>
  )
}
