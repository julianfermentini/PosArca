import { DESCUENTOS } from '../../../stores/ventaStore'
import { formatPrecio } from '../../../lib/utils'
import { FormaPago, type FormaPagoProps } from './FormaPago'
import { FacturaFields, type FacturaFieldsProps } from './FacturaFields'

interface CobroPanelProps {
  total: number
  neto: number
  iva: number
  descPct: number
  descNeto: number
  onChangeDescuento: (pct: number) => void

  pago: FormaPagoProps

  needsFactura: boolean
  onToggleFactura: (needs: boolean) => void
  factura: FacturaFieldsProps

  puedeEmitir: boolean
  cargando: boolean
  errorMsg: string
  emitido: { tipo: string; numero: string } | null
  onEmitir: () => void

  printerConectado: boolean
  onImprimirNoFiscal: () => void
}

export function CobroPanel({
  total, neto, iva, descPct, descNeto, onChangeDescuento,
  pago,
  needsFactura, onToggleFactura, factura,
  puedeEmitir, cargando, errorMsg, emitido, onEmitir,
  printerConectado, onImprimirNoFiscal,
}: CobroPanelProps) {
  return (
    <>
      {/* Scrollable content area */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h2 className="font-bold text-gray-900" style={{ fontSize: 20, margin: 0 }}>Totales</h2>

        {/* Amounts */}
        <div className="rounded-xl border border-gray-100 flex flex-col" style={{ background: '#F9FAFB', padding: 18, gap: 10 }}>
          <div className="flex justify-between text-gray-500 text-sm">
            <span>Subtotal neto</span>
            <span className="font-mono font-semibold text-gray-700">{formatPrecio(neto)}</span>
          </div>
          {descPct > 0 && (
            <div className="flex justify-between text-sm font-medium" style={{ color: '#0EA57A' }}>
              <span>Descuento {descPct}%</span>
              <span className="font-mono font-semibold">−{formatPrecio(descNeto)}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-500 text-sm">
            <span>IVA 21%</span>
            <span className="font-mono font-semibold text-gray-700">{formatPrecio(iva)}</span>
          </div>
          <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '2px 0' }} />
          <div className="flex justify-between items-baseline">
            <span className="font-bold text-gray-900">Total</span>
            <span className="font-mono font-black" style={{ fontSize: 24, color: '#3B72E0' }}>{formatPrecio(total)}</span>
          </div>
        </div>

        {/* Descuento */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="text-gray-400 font-bold uppercase tracking-widest" style={{ fontSize: 10 }}>Descuento</p>
          <select
            value={descPct}
            onChange={e => onChangeDescuento(Number(e.target.value))}
            className="w-full rounded-xl outline-none font-semibold text-sm transition-all touch-manipulation"
            style={{
              padding: '12px', cursor: 'pointer',
              border: `1.5px solid ${descPct > 0 ? '#0EA57A' : '#E5E7EB'}`,
              background: descPct > 0 ? '#ECFDF5' : '#fff',
              color: descPct > 0 ? '#047857' : '#374151',
            }}
          >
            {DESCUENTOS.map(d => (
              <option key={d} value={d}>{d === 0 ? 'Sin descuento' : `${d}% de descuento`}</option>
            ))}
          </select>
        </div>

        {/* Payment method */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="text-gray-400 font-bold uppercase tracking-widest" style={{ fontSize: 10 }}>Forma de pago</p>
          <FormaPago {...pago} />
        </div>

        {/* Factura toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none" style={{ userSelect: 'none' }}>
          <div
            onPointerDown={e => { e.preventDefault(); onToggleFactura(!needsFactura) }}
            className="relative transition-colors touch-manipulation"
            style={{
              width: 40, height: 24, borderRadius: 12,
              background: needsFactura ? '#3B72E0' : '#D1D5DB',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <span
              className="absolute bg-white rounded-full transition-transform"
              style={{
                top: 4, width: 16, height: 16,
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                transform: needsFactura ? 'translateX(20px)' : 'translateX(4px)',
              }}
            />
          </div>
          <span className="text-sm font-medium text-gray-700">Necesita factura</span>
        </label>

        {/* Inline factura fields */}
        {needsFactura && <FacturaFields {...factura} />}
      </div>

      {/* ── Bottom: always visible ── */}
      <div style={{ flexShrink: 0, padding: '0 24px max(32px, env(safe-area-inset-bottom, 32px))', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Success toast */}
        {emitido && (
          <div className="rounded-xl border flex flex-col" style={{
            background: '#F0FDF4', borderColor: '#86EFAC', padding: '14px 16px', gap: 4,
            animation: 'fadeSlideIn 0.25s ease',
          }}>
            <span className="font-bold" style={{ color: '#16A34A' }}>{emitido.tipo} emitido</span>
            {emitido.numero === 'OFFLINE' ? (
              <span style={{ fontSize: 12, color: '#D97706' }}>Guardado offline — se sincronizará</span>
            ) : emitido.numero === 'PENDIENTE' ? (
              <span style={{ fontSize: 12, color: '#D97706' }}>Cobrado — pendiente de CAE, se autoriza solo</span>
            ) : (
              <span className="font-mono text-gray-400" style={{ fontSize: 11 }}>
                N° {emitido.numero} · CAE aprobado
              </span>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="rounded-xl border text-sm font-medium" style={{
            background: '#FEF2F2', borderColor: '#FECACA', color: '#DC2626', padding: '12px 16px',
          }}>
            {errorMsg}
          </div>
        )}

        {/* Emit button */}
        <button
          onPointerDown={e => { e.preventDefault(); onEmitir() }}
          disabled={!puedeEmitir || cargando}
          className="w-full font-bold text-white text-base transition-all active:scale-95 touch-manipulation"
          style={{
            height: 54,
            borderRadius: 12,
            border: 'none',
            cursor: puedeEmitir && !cargando ? 'pointer' : 'not-allowed',
            background: puedeEmitir && !cargando ? '#3B72E0' : '#93AEDE',
          }}
        >
          {cargando ? 'Emitiendo...' : needsFactura ? 'Emitir Factura' : 'Emitir Ticket'}
        </button>

        {/* Ticket no fiscal / prueba — solo visible con impresora conectada */}
        {printerConectado && !needsFactura && (
          <button
            onPointerDown={e => { e.preventDefault(); if (puedeEmitir) onImprimirNoFiscal() }}
            disabled={!puedeEmitir}
            className="w-full font-semibold text-sm transition-all active:scale-95 touch-manipulation"
            style={{
              height: 42,
              borderRadius: 12,
              border: '1.5px solid #D1D5DB',
              cursor: puedeEmitir ? 'pointer' : 'not-allowed',
              background: puedeEmitir ? '#F9FAFB' : '#F3F4F6',
              color: puedeEmitir ? '#374151' : '#9CA3AF',
            }}
          >
            Ticket no fiscal / Prueba
          </button>
        )}
      </div>
    </>
  )
}
