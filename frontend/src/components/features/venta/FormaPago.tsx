import { formatPrecio } from '../../../lib/utils'

export interface FormaPagoProps {
  total: number
  sumaPagos: number
  montoEfectivo: number
  montoTarjeta: number
  montoBilletera: number
  dividirPago: boolean
  onSetEfectivo: (monto: number) => void
  onSetTarjeta: (monto: number) => void
  onSetBilletera: (monto: number) => void
  onToggleDividir: (dividir: boolean) => void
}

export function FormaPago({
  total, sumaPagos, montoEfectivo, montoTarjeta, montoBilletera, dividirPago,
  onSetEfectivo, onSetTarjeta, onSetBilletera, onToggleDividir,
}: FormaPagoProps) {
  if (!dividirPago) {
    return (
      <>
        <div className="flex rounded-xl p-1" style={{ background: '#F3F4F6', gap: 4 }}>
          {([
            { label: 'Efectivo',  ef: total, tar: 0,     bil: 0     },
            { label: 'Tarjeta',   ef: 0,     tar: total, bil: 0     },
            { label: 'Billetera', ef: 0,     tar: 0,     bil: total },
          ] as const).map(m => {
            const activo = Math.abs(montoEfectivo  - m.ef)  < 0.01 &&
                           Math.abs(montoTarjeta   - m.tar) < 0.01 &&
                           Math.abs(montoBilletera - m.bil) < 0.01 &&
                           sumaPagos > 0
            return (
              <button
                key={m.label}
                onPointerDown={e => {
                  e.preventDefault()
                  onSetEfectivo(m.ef)
                  onSetTarjeta(m.tar)
                  onSetBilletera(m.bil)
                }}
                className="flex-1 rounded-lg text-sm font-semibold transition-all touch-manipulation active:scale-95"
                style={{
                  height: 46, border: 'none', cursor: 'pointer',
                  background: activo ? '#3B72E0' : 'transparent',
                  color: activo ? '#fff' : '#6B7280',
                  boxShadow: activo ? '0 1px 3px rgba(59,114,224,0.3)' : 'none',
                }}
              >
                {m.label}
              </button>
            )
          })}
        </div>
        <button
          onPointerDown={e => {
            e.preventDefault()
            onSetEfectivo(0)
            onSetTarjeta(0)
            onSetBilletera(0)
            onToggleDividir(true)
          }}
          className="w-full rounded-xl font-semibold text-sm transition-all touch-manipulation active:scale-95"
          style={{ height: 46, border: '1.5px solid #3B72E0', background: '#fff', color: '#3B72E0', cursor: 'pointer' }}
        >
          Dividir pago
        </button>
      </>
    )
  }

  const balanceado = Math.abs(sumaPagos - total) < 0.005
  const sobra = sumaPagos - total >= 0.005

  return (
    <div className="rounded-xl border border-gray-100 flex flex-col" style={{ background: '#F9FAFB', padding: '14px', gap: 10 }}>
      {([
        { label: 'Efectivo',          value: montoEfectivo,  set: onSetEfectivo },
        { label: 'Tarjeta',           value: montoTarjeta,   set: onSetTarjeta },
        { label: 'Billetera digital', value: montoBilletera, set: onSetBilletera },
      ] as const).map(({ label, value, set }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-gray-600 text-sm flex-shrink-0" style={{ minWidth: 112 }}>{label}</span>
          <div className="flex items-center gap-1 flex-1">
            <span className="text-gray-400 text-sm">$</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={value === 0 ? '' : value}
              onChange={e => set(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="no-spin w-full border border-gray-200 rounded-lg outline-none font-mono text-right transition-all"
              style={{ padding: '9px 10px', fontSize: 14 }}
              onFocus={e => (e.target.style.borderColor = '#3B72E0')}
              onBlur={e => (e.target.style.borderColor = '')}
            />
          </div>
        </div>
      ))}
      <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '2px 0' }} />
      {/* Restante — rojo si falta, verde cuando está pago */}
      <div className="flex items-center justify-between rounded-lg px-3 py-2"
        style={{ background: balanceado ? '#F0FDF4' : '#FEF2F2' }}>
        <span className="text-sm font-semibold" style={{ color: balanceado ? '#16A34A' : '#DC2626' }}>
          {balanceado ? 'Pago completo' : sobra ? 'Sobra' : 'Restante'}
        </span>
        <span className="font-mono font-black" style={{ fontSize: 16, color: balanceado ? '#16A34A' : '#DC2626' }}>
          {balanceado ? '✓' : formatPrecio(Math.abs(total - sumaPagos))}
        </span>
      </div>
      <button
        onPointerDown={e => {
          e.preventDefault()
          onSetEfectivo(0)
          onSetTarjeta(0)
          onSetBilletera(0)
          onToggleDividir(false)
        }}
        className="w-full rounded-xl font-semibold text-sm transition-all touch-manipulation active:scale-95"
        style={{ height: 44, border: '1.5px solid #D1D5DB', background: '#fff', color: '#374151', cursor: 'pointer' }}
      >
        Volver a pago único
      </button>
    </div>
  )
}
