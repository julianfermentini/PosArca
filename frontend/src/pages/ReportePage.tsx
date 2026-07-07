import { useState, useEffect, type ReactNode } from 'react'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { reportesApi, ventasApi } from '../lib/api'
import { formatPrecio } from '../lib/utils'
import type { ResumenCierre, Venta } from '../types'

type Tab = 'historial' | 'cierre'

export default function ReportePage() {
  const [dateOffset, setDateOffset] = useState(0)
  const [tab, setTab] = useState<Tab>('historial')
  const [resumen, setResumen] = useState<ResumenCierre | null>(null)
  const [ventas, setVentas] = useState<Venta[]>([])
  const [expandida, setExpandida] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [printFlash, setPrintFlash] = useState(false)

  const fecha = format(addDays(new Date(), dateOffset), 'yyyy-MM-dd')
  const dateLabel = dateOffset === 0
    ? 'Hoy'
    : dateOffset === -1
    ? 'Ayer'
    : `${Math.abs(dateOffset)} días atrás`

  const fullDateLabel = format(addDays(new Date(), dateOffset), "EEEE d 'de' MMMM", { locale: es })

  useEffect(() => {
    setCargando(true)
    setError('')
    setExpandida(null)
    Promise.all([
      reportesApi.cierre(fecha),
      ventasApi.listar(fecha),
    ]).then(([r, v]) => {
      if (r.data.success && r.data.data) setResumen(r.data.data)
      if (v.data.success && v.data.data) setVentas(v.data.data)
    }).catch(() => setError('Error al cargar datos'))
      .finally(() => setCargando(false))
  }, [fecha])

  const handlePrint = () => {
    setPrintFlash(true)
    setTimeout(() => setPrintFlash(false), 2600)
    window.print()
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#F3F4F6' }}>
      <div style={{ padding: '28px 36px' }}>

        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap" style={{ marginBottom: 24, gap: 14 }}>
          {/* Tab control */}
          <div className="flex rounded-xl p-1" style={{ background: '#E5E7EB', gap: 4 }}>
            {(['historial', 'cierre'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="rounded-lg text-sm font-semibold transition-all"
                style={{
                  padding: '8px 20px',
                  border: 'none',
                  cursor: 'pointer',
                  background: tab === t ? '#fff' : 'transparent',
                  color: tab === t ? '#111827' : '#6B7280',
                  boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {t === 'historial' ? 'Historial' : 'Cierre de Caja'}
              </button>
            ))}
          </div>

          {/* Date nav */}
          <div className="flex items-center rounded-full border border-gray-200 bg-white"
            style={{ padding: '6px 10px', gap: 4 }}>
            <button
              onClick={() => setDateOffset(o => o - 1)}
              className="flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              style={{ width: 30, height: 30, border: 'none', cursor: 'pointer', background: 'transparent' }}
              title="Día anterior"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span className="font-bold text-gray-900 text-sm text-center" style={{ minWidth: 130 }}>
              {dateLabel} — <span className="text-gray-400 font-normal capitalize">{fullDateLabel}</span>
            </span>
            <button
              onClick={() => setDateOffset(o => Math.min(0, o + 1))}
              disabled={dateOffset >= 0}
              className="flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-30"
              style={{ width: 30, height: 30, border: 'none', cursor: dateOffset >= 0 ? 'not-allowed' : 'pointer', background: 'transparent' }}
              title="Día siguiente"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl text-sm px-4 py-3 mb-4" style={{ background: '#FEF2F2', color: '#DC2626' }}>
            {error}
          </div>
        )}
        {cargando && (
          <div className="text-center text-gray-400 py-16 text-lg">Cargando...</div>
        )}

        {/* HISTORIAL TAB */}
        {!cargando && tab === 'historial' && (
          ventas.length === 0
            ? <div className="text-center text-gray-400 py-16 text-lg">Sin ventas para esta fecha</div>
            : (
              <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ventas.map(v => {
                  const total = v.items.reduce((s, i) => s + i.total, 0)
                  const abierta = expandida === v.id
                  const hora = format(new Date(v.created_at), 'HH:mm')

                  return (
                    <div key={v.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden"
                      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                      <button
                        className="w-full flex items-center bg-transparent text-left"
                        style={{ gap: 16, padding: '16px 18px', border: 'none', cursor: 'pointer' }}
                        onClick={() => setExpandida(abierta ? null : v.id)}
                        onMouseOver={e => (e.currentTarget.style.background = '#F9FAFB')}
                        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {/* Badge */}
                        <span
                          className="font-bold flex-shrink-0 rounded-md text-xs"
                          style={{
                            padding: '3px 8px',
                            background: v.tipo === 'FACTURA' ? '#3B72E0' : '#E5E7EB',
                            color: v.tipo === 'FACTURA' ? '#fff' : '#374151',
                          }}
                        >
                          {v.tipo}
                        </span>
                        <span className="font-mono font-bold text-gray-900 flex-shrink-0"
                          style={{ fontSize: 14, width: 90 }}>
                          {v.numero || '—'}
                        </span>
                        <span className="text-gray-400 text-sm flex-shrink-0" style={{ width: 110 }}>
                          {v.metodo_pago === 'EFECTIVO' ? 'Efectivo'
                            : v.metodo_pago === 'TARJETA' ? 'Tarjeta'
                            : 'Billetera'}
                        </span>
                        <span className="font-mono text-gray-400 flex-shrink-0" style={{ fontSize: 13, width: 70 }}>
                          {hora}
                        </span>
                        <span style={{ flex: 1 }} />
                        <span className="font-mono font-bold text-gray-900 flex-shrink-0" style={{ fontSize: 15 }}>
                          {formatPrecio(total)}
                        </span>
                        <span
                          className="text-gray-400 flex-shrink-0 transition-transform"
                          style={{ transform: abierta ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-flex' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </span>
                      </button>

                      {abierta && (
                        <div className="border-t border-gray-50 flex flex-col" style={{ padding: '12px 18px 16px', gap: 6 }}>
                          {v.items.map(item => (
                            <div key={item.id} className="flex justify-between text-sm text-gray-500"
                              style={{ paddingLeft: 98 }}>
                              <span>{item.descripcion}</span>
                              <span className="font-mono font-semibold text-gray-700">{formatPrecio(item.total)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm text-gray-400 border-t border-gray-100"
                            style={{ paddingLeft: 98, paddingTop: 8, marginTop: 4 }}>
                            <span>IVA 21%</span>
                            <span className="font-mono">{formatPrecio(v.items.reduce((s, i) => s + i.iva, 0))}</span>
                          </div>
                          <div className="flex justify-between font-bold text-gray-900 text-sm"
                            style={{ paddingLeft: 98 }}>
                            <span>Total</span>
                            <span className="font-mono">{formatPrecio(total)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
        )}

        {/* CIERRE TAB */}
        {!cargando && tab === 'cierre' && (
          resumen && resumen.total_ventas > 0 ? (
            <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Stat cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                <StatCard eyebrow="Comprobantes">
                  <p className="font-black text-gray-900" style={{ fontSize: 36, margin: 0 }}>
                    {resumen.total_ventas}
                  </p>
                  <p className="text-gray-400 text-sm" style={{ margin: '2px 0 0' }}>
                    {resumen.total_tickets} tickets · {resumen.total_facturas} facturas
                  </p>
                </StatCard>

                <StatCard eyebrow="Total vendido">
                  <p className="font-black" style={{ fontSize: 36, margin: 0, color: '#3B72E0' }}>
                    {formatPrecio(resumen.monto_total)}
                  </p>
                  <p className="text-gray-400 text-sm" style={{ margin: '2px 0 0' }}>IVA incluido</p>
                </StatCard>

                <StatCard eyebrow="Cierre">
                  <button
                    onClick={handlePrint}
                    className="w-full flex items-center justify-center gap-2 font-bold text-white rounded-xl transition-colors"
                    style={{ height: 42, background: '#3B72E0', border: 'none', cursor: 'pointer', fontSize: 14 }}
                    onMouseOver={e => (e.currentTarget.style.background = '#2F5CC0')}
                    onMouseOut={e => (e.currentTarget.style.background = '#3B72E0')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    Imprimir cierre
                  </button>
                </StatCard>
              </div>

              {/* Totals */}
              <div className="bg-white rounded-xl border border-gray-100" style={{ padding: 24 }}>
                <p className="text-gray-400 font-bold uppercase tracking-widest mb-4" style={{ fontSize: 10 }}>Desglose</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Subtotal neto</span>
                    <span className="font-mono font-semibold text-gray-700">
                      {formatPrecio(resumen.monto_total - resumen.monto_iva)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>IVA 21%</span>
                    <span className="font-mono font-semibold text-gray-700">{formatPrecio(resumen.monto_iva)}</span>
                  </div>
                  <div style={{ height: 1, background: '#E5E7EB', margin: '4px 0' }} />
                  <div className="flex justify-between font-bold text-gray-900">
                    <span>TOTAL</span>
                    <span className="font-mono" style={{ fontSize: 20 }}>{formatPrecio(resumen.monto_total)}</span>
                  </div>
                </div>
              </div>

              {/* Payment breakdown */}
              <div className="bg-white rounded-xl border border-gray-100" style={{ padding: 24 }}>
                <p className="text-gray-400 font-bold uppercase tracking-widest mb-5" style={{ fontSize: 10 }}>
                  Por método de pago
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[
                    { key: 'efectivo', label: 'Efectivo', amount: resumen.por_metodo_pago.efectivo },
                    { key: 'tarjeta',  label: 'Tarjeta',  amount: resumen.por_metodo_pago.tarjeta  },
                    { key: 'billetera',label: 'Billetera', amount: resumen.por_metodo_pago.billetera },
                  ].map(({ key, label, amount }) => {
                    const maxAmt = Math.max(1,
                      resumen.por_metodo_pago.efectivo,
                      resumen.por_metodo_pago.tarjeta,
                      resumen.por_metodo_pago.billetera,
                    )
                    const pct = Math.round((amount / maxAmt) * 100)
                    return (
                      <div key={key}>
                        <div className="flex justify-between text-sm" style={{ marginBottom: 6 }}>
                          <span className="font-semibold text-gray-900">{label}</span>
                          <span className="font-mono font-bold text-gray-900">{formatPrecio(amount)}</span>
                        </div>
                        <div style={{ height: 8, background: '#E5E7EB', borderRadius: 6, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', width: `${pct}%`,
                            background: '#3B72E0', borderRadius: 6,
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {printFlash && (
                <div className="rounded-xl border font-bold" style={{
                  background: '#F0FDF4', borderColor: '#86EFAC', color: '#16A34A',
                  padding: '14px 16px', animation: 'fadeSlideIn 0.25s ease',
                }}>
                  Cierre enviado a la impresora
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-16 text-lg">Sin ventas para esta fecha</div>
          )
        )}
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}

function StatCard({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100" style={{ padding: '20px 24px' }}>
      <p className="text-gray-400 font-bold uppercase tracking-widest mb-3" style={{ fontSize: 10 }}>{eyebrow}</p>
      {children}
    </div>
  )
}
