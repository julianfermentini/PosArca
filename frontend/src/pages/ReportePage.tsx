import { useState, useEffect, type ReactNode } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { reportesApi, ventasApi } from '../lib/api'
import { formatPrecio } from '../lib/utils'
import { useEmpresaStore } from '../stores/empresaStore'
import { usePrinterStore } from '../stores/printerStore'
import type { ResumenCierre, Venta } from '../types'

type Tab = 'historial' | 'cierre'

// ─── Helpers de calendario ────────────────────────────────────────────────────

function mesLabel(year: number, month: number): string {
  const d = new Date(year, month, 1)
  return format(d, "MMMM yyyy", { locale: es })
    .replace(/^\w/, c => c.toUpperCase())
}

function diasEnMes(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function primerDiaSemana(year: number, month: number): number {
  // 0=Dom → convertir a lunes=0
  const d = new Date(year, month, 1).getDay()
  return (d + 6) % 7
}

function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ─── Componente calendario ────────────────────────────────────────────────────

function Calendario({
  year, month, diasConVentas, seleccionado, hoyISO,
  onSelect, onPrev, onNext,
}: {
  year: number; month: number
  diasConVentas: Set<string>; seleccionado: string | null; hoyISO: string
  onSelect: (fecha: string) => void; onPrev: () => void; onNext: () => void
}) {
  const dias    = diasEnMes(year, month)
  const offset  = primerDiaSemana(year, month)
  const celdas  = offset + dias
  const filas   = Math.ceil(celdas / 7)
  const dias_s  = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  return (
    <div className="bg-white rounded-2xl border border-gray-100"
      style={{ padding: 20, userSelect: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>

      {/* Cabecera mes */}
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <button
          onClick={onPrev}
          className="flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          style={{ width: 32, height: 32, border: 'none', cursor: 'pointer', background: 'transparent' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="font-bold text-gray-900" style={{ fontSize: 15 }}>{mesLabel(year, month)}</span>
        <button
          onClick={onNext}
          disabled={toISO(year, month + 1, 1) > hoyISO.slice(0, 8) + '01'}
          className="flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-30"
          style={{ width: 32, height: 32, border: 'none', cursor: 'pointer', background: 'transparent' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* Encabezados días */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
        {dias_s.map(d => (
          <div key={d} className="text-center font-bold text-gray-400"
            style={{ fontSize: 11, padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Celdas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {Array.from({ length: filas * 7 }).map((_, i) => {
          const dia = i - offset + 1
          if (dia < 1 || dia > dias) return <div key={i} />

          const iso     = toISO(year, month, dia)
          const futuro  = iso > hoyISO
          const tieneV  = diasConVentas.has(iso)
          const sel     = iso === seleccionado
          const hoy     = iso === hoyISO

          return (
            <button
              key={i}
              disabled={futuro}
              onClick={() => onSelect(iso)}
              className="flex items-center justify-center rounded-lg font-semibold transition-all active:scale-90"
              style={{
                height: 36, border: 'none', cursor: futuro ? 'default' : 'pointer', fontSize: 13,
                background: sel
                  ? '#3B72E0'
                  : tieneV
                  ? '#DCFCE7'
                  : 'transparent',
                color: sel
                  ? '#fff'
                  : futuro
                  ? '#D1D5DB'
                  : tieneV
                  ? '#15803D'
                  : hoy
                  ? '#3B72E0'
                  : '#374151',
                fontWeight: hoy || tieneV ? 700 : 500,
                outline: hoy && !sel ? '2px solid #93C5FD' : 'none',
                outlineOffset: -2,
              }}
            >
              {dia}
            </button>
          )
        })}
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4" style={{ marginTop: 14 }}>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 12, height: 12, borderRadius: 4, background: '#DCFCE7', border: '1.5px solid #86EFAC' }} />
          <span className="text-gray-400" style={{ fontSize: 11 }}>Con ventas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 12, height: 12, borderRadius: 4, background: '#3B72E0' }} />
          <span className="text-gray-400" style={{ fontSize: 11 }}>Seleccionado</span>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ReportePage() {
  const hoy      = new Date()
  const hoyISO   = format(hoy, 'yyyy-MM-dd')
  const [year,  setYear]  = useState(hoy.getFullYear())
  const [month, setMonth] = useState(hoy.getMonth())
  const [fechaSel, setFechaSel] = useState<string>(hoyISO)

  const [tab,     setTab]     = useState<Tab>('historial')
  const [resumen, setResumen] = useState<ResumenCierre | null>(null)
  const [ventas,  setVentas]  = useState<Venta[]>([])
  const [diasCV,  setDiasCV]  = useState<Set<string>>(new Set())
  const [expandida,        setExpandida]        = useState<string | null>(null)
  const [cargando,         setCargando]         = useState(false)
  const [cargandoCal,      setCargandoCal]      = useState(false)
  const [error,            setError]            = useState('')
  const [reimprimiendoId,  setReimprimiendoId]  = useState<string | null>(null)
  const [cierreOk,         setCierreOk]         = useState(false)

  const { empresa } = useEmpresaStore()
  const printer     = usePrinterStore()

  // Cargar días con ventas cuando cambia el mes
  useEffect(() => {
    const mes = `${year}-${String(month + 1).padStart(2, '0')}`
    setCargandoCal(true)
    ventasApi.diasConVentas(mes)
      .then(r => {
        if (r.data.success && r.data.data) setDiasCV(new Set(r.data.data))
        else setDiasCV(new Set())
      })
      .catch(() => setDiasCV(new Set()))
      .finally(() => setCargandoCal(false))
  }, [year, month])

  // Cargar datos del día seleccionado
  useEffect(() => {
    if (!fechaSel) return
    setCargando(true)
    setError('')
    setExpandida(null)
    Promise.all([
      reportesApi.cierre(fechaSel),
      ventasApi.listar(fechaSel),
    ]).then(([r, v]) => {
      setResumen(r.data.success && r.data.data ? r.data.data : null)
      setVentas(v.data.success && v.data.data ? v.data.data : [])
    }).catch(() => setError('Error al cargar datos'))
      .finally(() => setCargando(false))
  }, [fechaSel])

  const prevMes = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  const nextMes = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const fechaLabel = fechaSel
    ? format(new Date(fechaSel + 'T00:00:00'), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
        .replace(/^\w/, c => c.toUpperCase())
    : ''

  const reimprimir = async (v: Venta) => {
    setReimprimiendoId(v.id)
    const dt      = new Date(v.created_at)
    const fecha   = dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const hora    = dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    const fechaISO = v.created_at.slice(0, 10)
    const total   = v.items.reduce((s, i) => s + i.total, 0)
    const iva     = v.items.reduce((s, i) => s + i.iva, 0)

    const empresaBase = {
      negocioNombre:     empresa?.razon_social ?? '',
      titular:           empresa?.titular ?? '',
      cuit:              empresa?.cuit ?? '',
      ingBrutos:         empresa?.ing_brutos ?? '',
      direccion:         empresa?.direccion ?? '',
      inicioActividades: empresa?.inicio_actividades ?? '',
      defensaConsumidor: empresa?.defensa_consumidor ?? '',
      condicionIVA:      empresa?.condicion_iva ?? '',
    }
    const itemsData = v.items.map(it => ({
      descripcion: it.descripcion, precioNeto: it.precio_neto, total: it.total,
    }))

    if (v.cae) {
      await printer.imprimir({
        ...empresaBase,
        puntoVenta: empresa?.punto_venta ?? 1,
        tipoCmp:    v.tipo,
        numero:     v.numero_fiscal || v.numero,
        items:      itemsData,
        subtotal:   total - iva,
        iva, total,
        metodoPago: v.metodo_pago,
        cae:        v.cae,
        caeVto:     v.cae_vto ?? '',
        qrData:     v.qr_data ?? '',
        fechaHora:  `${fecha}  ${hora}`,
        fechaISO,
      })
    } else {
      await printer.imprimirNoFiscal({
        ...empresaBase,
        items:      itemsData,
        subtotal:   total - iva,
        iva, total,
        metodoPago: v.metodo_pago,
        titulo:    '*** COPIA DE TICKET ***',
        subtitulo: v.numero ? `No T. ${v.numero}` : '',
        fechaHora: `${fecha}  ${hora}`,
      })
    }
    setTimeout(() => setReimprimiendoId(null), 2000)
  }

  const handleImprimirCierre = async () => {
    if (!resumen || !printer.conectado) return
    const fechaFmt = fechaSel
      ? format(new Date(fechaSel + 'T00:00:00'), 'dd/MM/yyyy')
      : format(hoy, 'dd/MM/yyyy')
    await printer.imprimirCierre({
      negocioNombre: empresa?.razon_social ?? '',
      cuit:          empresa?.cuit ?? '',
      fecha:         fechaFmt,
      totalVentas:   resumen.total_ventas,
      totalTickets:  resumen.total_tickets,
      totalFacturas: resumen.total_facturas,
      montoTotal:    resumen.monto_total,
      montoNeto:     resumen.monto_total - resumen.monto_iva,
      montoIVA:      resumen.monto_iva,
      efectivo:      resumen.por_metodo_pago.efectivo,
      tarjeta:       resumen.por_metodo_pago.tarjeta,
      billetera:     resumen.por_metodo_pago.billetera,
    })
    setCierreOk(true)
    setTimeout(() => setCierreOk(false), 2500)
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#F3F4F6' }}>
      <div style={{ padding: '24px 28px', maxWidth: 1100 }}>

        {/* Layout: calendario izquierda, contenido derecha */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'start' }}>

          {/* ── Columna izquierda: calendario ── */}
          <div style={{ width: 300, flexShrink: 0 }}>
            <Calendario
              year={year} month={month}
              diasConVentas={diasCV}
              seleccionado={fechaSel}
              hoyISO={hoyISO}
              onSelect={iso => setFechaSel(iso)}
              onPrev={prevMes}
              onNext={nextMes}
            />
            {cargandoCal && (
              <p className="text-center text-gray-400 text-xs" style={{ marginTop: 8 }}>Cargando...</p>
            )}
          </div>

          {/* ── Columna derecha: datos del día ── */}
          <div>
            {/* Header del día + tabs */}
            <div style={{ marginBottom: 20 }}>
              <h2 className="font-bold text-gray-900" style={{ fontSize: 18, margin: '0 0 4px' }}>
                {fechaLabel}
              </h2>
              <div className="flex rounded-xl p-1" style={{ background: '#E5E7EB', gap: 4 }}>
                {(['historial', 'cierre'] as Tab[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className="rounded-lg text-sm font-semibold transition-all"
                    style={{
                      padding: '7px 18px', border: 'none', cursor: 'pointer',
                      background: tab === t ? '#fff' : 'transparent',
                      color: tab === t ? '#111827' : '#6B7280',
                      boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {t === 'historial' ? 'Historial' : 'Cierre de Caja'}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-xl text-sm px-4 py-3 mb-4" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                {error}
              </div>
            )}
            {cargando && (
              <div className="text-center text-gray-400 py-16">Cargando...</div>
            )}

            {/* HISTORIAL TAB */}
            {!cargando && tab === 'historial' && (
              ventas.length === 0
                ? <div className="text-center text-gray-400 py-16">Sin ventas para esta fecha</div>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {ventas.map(v => {
                      const total  = v.items.reduce((s, i) => s + i.total, 0)
                      const abierta = expandida === v.id
                      const hora   = format(new Date(v.created_at), 'HH:mm')

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
                            <span className="font-bold flex-shrink-0 rounded-md text-xs"
                              style={{ padding: '3px 8px', background: v.tipo === 'FACTURA' ? '#3B72E0' : '#E5E7EB', color: v.tipo === 'FACTURA' ? '#fff' : '#374151' }}>
                              {v.tipo}
                            </span>
                            <span className="font-mono font-bold text-gray-900 flex-shrink-0" style={{ fontSize: 14, width: 90 }}>
                              {v.numero || '—'}
                            </span>
                            <span className="text-gray-400 text-sm flex-shrink-0" style={{ width: 90 }}>
                              {v.metodo_pago === 'EFECTIVO' ? 'Efectivo' : v.metodo_pago === 'TARJETA' ? 'Tarjeta' : 'Billetera'}
                            </span>
                            <span className="font-mono text-gray-400 flex-shrink-0" style={{ fontSize: 13, width: 60 }}>{hora}</span>
                            <span style={{ flex: 1 }} />
                            <span className="font-mono font-bold text-gray-900 flex-shrink-0" style={{ fontSize: 15 }}>
                              {formatPrecio(total)}
                            </span>
                            <span className="text-gray-400 flex-shrink-0 transition-transform"
                              style={{ transform: abierta ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-flex' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </span>
                          </button>

                          {abierta && (
                            <div className="border-t border-gray-50 flex flex-col" style={{ padding: '12px 18px 16px', gap: 6 }}>
                              {v.items.map(item => (
                                <div key={item.id} className="flex justify-between text-sm text-gray-500" style={{ paddingLeft: 98 }}>
                                  <span>{item.descripcion}</span>
                                  <span className="font-mono font-semibold text-gray-700">{formatPrecio(item.total)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between text-sm text-gray-400 border-t border-gray-100"
                                style={{ paddingLeft: 98, paddingTop: 8, marginTop: 4 }}>
                                <span>IVA 21%</span>
                                <span className="font-mono">{formatPrecio(v.items.reduce((s, i) => s + i.iva, 0))}</span>
                              </div>
                              <div className="flex justify-between font-bold text-gray-900 text-sm" style={{ paddingLeft: 98 }}>
                                <span>Total</span>
                                <span className="font-mono">{formatPrecio(total)}</span>
                              </div>

                              {printer.conectado && (
                                <div style={{ paddingLeft: 98, paddingTop: 8, marginTop: 4, borderTop: '1px solid #F3F4F6' }}>
                                  <button
                                    onClick={() => reimprimir(v)}
                                    disabled={reimprimiendoId === v.id}
                                    className="flex items-center gap-2 font-semibold text-sm rounded-lg transition-colors disabled:opacity-50"
                                    style={{ padding: '7px 14px', border: '1.5px solid #D1D5DB', background: '#F9FAFB', color: '#374151', cursor: 'pointer' }}
                                    onMouseOver={e => (e.currentTarget.style.borderColor = '#3B72E0')}
                                    onMouseOut={e => (e.currentTarget.style.borderColor = '#D1D5DB')}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                                    </svg>
                                    {reimprimiendoId === v.id ? 'Imprimiendo...' : v.cae ? 'Reimprimir ticket fiscal' : 'Reimprimir copia'}
                                  </button>
                                  {v.cae && (
                                    <p className="text-xs text-gray-400" style={{ marginTop: 4 }}>CAE: {v.cae}</p>
                                  )}
                                </div>
                              )}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Stat cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                    <StatCard eyebrow="Comprobantes">
                      <p className="font-black text-gray-900" style={{ fontSize: 32, margin: 0 }}>{resumen.total_ventas}</p>
                      <p className="text-gray-400 text-sm" style={{ margin: '2px 0 0' }}>
                        {resumen.total_tickets} tickets · {resumen.total_facturas} facturas
                      </p>
                    </StatCard>
                    <StatCard eyebrow="Total vendido">
                      <p className="font-black" style={{ fontSize: 28, margin: 0, color: '#3B72E0' }}>{formatPrecio(resumen.monto_total)}</p>
                      <p className="text-gray-400 text-sm" style={{ margin: '2px 0 0' }}>IVA incluido</p>
                    </StatCard>
                    <StatCard eyebrow="Imprimir cierre">
                      <button
                        onClick={handleImprimirCierre}
                        disabled={!printer.conectado}
                        className="w-full flex items-center justify-center gap-2 font-bold text-white rounded-xl transition-colors disabled:opacity-40"
                        style={{ height: 42, background: '#3B72E0', border: 'none', cursor: printer.conectado ? 'pointer' : 'not-allowed', fontSize: 14 }}
                        onMouseOver={e => printer.conectado && ((e.currentTarget as HTMLElement).style.background = '#2F5CC0')}
                        onMouseOut={e => ((e.currentTarget as HTMLElement).style.background = '#3B72E0')}
                        title={printer.conectado ? 'Imprimir cierre en térmica' : 'Conectá la impresora primero'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                        </svg>
                        Imprimir cierre
                      </button>
                      {!printer.conectado && (
                        <p className="text-gray-400 text-xs text-center" style={{ marginTop: 6 }}>Sin impresora conectada</p>
                      )}
                    </StatCard>
                  </div>

                  {/* Desglose */}
                  <div className="bg-white rounded-xl border border-gray-100" style={{ padding: 20 }}>
                    <p className="text-gray-400 font-bold uppercase tracking-widest mb-3" style={{ fontSize: 10 }}>Desglose</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Subtotal neto</span>
                        <span className="font-mono font-semibold text-gray-700">{formatPrecio(resumen.monto_total - resumen.monto_iva)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>IVA 21%</span>
                        <span className="font-mono font-semibold text-gray-700">{formatPrecio(resumen.monto_iva)}</span>
                      </div>
                      <div style={{ height: 1, background: '#E5E7EB', margin: '2px 0' }} />
                      <div className="flex justify-between font-bold text-gray-900">
                        <span>TOTAL</span>
                        <span className="font-mono" style={{ fontSize: 20 }}>{formatPrecio(resumen.monto_total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Por método de pago */}
                  <div className="bg-white rounded-xl border border-gray-100" style={{ padding: 20 }}>
                    <p className="text-gray-400 font-bold uppercase tracking-widest mb-4" style={{ fontSize: 10 }}>Por método de pago</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {[
                        { label: 'Efectivo',  amount: resumen.por_metodo_pago.efectivo  },
                        { label: 'Tarjeta',   amount: resumen.por_metodo_pago.tarjeta   },
                        { label: 'Billetera', amount: resumen.por_metodo_pago.billetera },
                      ].map(({ label, amount }) => {
                        const max = Math.max(1, resumen.por_metodo_pago.efectivo, resumen.por_metodo_pago.tarjeta, resumen.por_metodo_pago.billetera)
                        const pct = Math.round((amount / max) * 100)
                        return (
                          <div key={label}>
                            <div className="flex justify-between text-sm" style={{ marginBottom: 5 }}>
                              <span className="font-semibold text-gray-900">{label}</span>
                              <span className="font-mono font-bold text-gray-900">{formatPrecio(amount)}</span>
                            </div>
                            <div style={{ height: 7, background: '#E5E7EB', borderRadius: 6, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: '#3B72E0', borderRadius: 6, transition: 'width 0.5s ease' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {cierreOk && (
                    <div className="rounded-xl border font-bold" style={{
                      background: '#F0FDF4', borderColor: '#86EFAC', color: '#16A34A',
                      padding: '14px 16px', animation: 'fadeSlideIn 0.25s ease',
                    }}>
                      Cierre enviado a la impresora
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-16">Sin ventas para esta fecha</div>
              )
            )}
          </div>
        </div>
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
    <div className="bg-white rounded-xl border border-gray-100" style={{ padding: '18px 20px' }}>
      <p className="text-gray-400 font-bold uppercase tracking-widest mb-3" style={{ fontSize: 10 }}>{eyebrow}</p>
      {children}
    </div>
  )
}
