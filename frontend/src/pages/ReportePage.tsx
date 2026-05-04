import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { reportesApi } from '../lib/api'
import { formatPrecio } from '../lib/utils'
import type { ResumenCierre } from '../types'
import { Button } from '../components/ui/Button'

export default function ReportePage() {
  const hoy = format(new Date(), 'yyyy-MM-dd')
  const [fecha, setFecha] = useState(hoy)
  const [resumen, setResumen] = useState<ResumenCierre | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const cargar = async () => {
    setCargando(true)
    setError('')
    try {
      const { data } = await reportesApi.cierre(fecha)
      if (data.success && data.data) setResumen(data.data)
    } catch {
      setError('Error al cargar el reporte')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [fecha]) // eslint-disable-line react-hooks/exhaustive-deps

  const fechaLabel = format(new Date(fecha + 'T12:00:00'), "EEEE d 'de' MMMM yyyy", { locale: es })

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Cierre de Caja</h1>
          <input
            type="date"
            value={fecha}
            max={hoy}
            onChange={(e) => setFecha(e.target.value)}
            className="border-2 border-gray-200 rounded-xl px-4 py-3 text-lg focus:border-blue-500 focus:outline-none"
          />
        </div>

        <p className="text-gray-500 capitalize">{fechaLabel}</p>

        {error && (
          <div className="bg-red-50 text-red-600 rounded-xl px-4 py-3">{error}</div>
        )}

        {cargando && (
          <div className="text-center text-gray-500 py-12 text-xl">Cargando...</div>
        )}

        {resumen && !cargando && (
          <>
            {/* Resumen general */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Total ventas" valor={resumen.total_ventas} tipo="numero" />
              <StatCard label="Tickets"       valor={resumen.total_tickets} tipo="numero" />
              <StatCard label="Facturas"      valor={resumen.total_facturas} tipo="numero" />
            </div>

            {/* Montos */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Totales</h2>
              <Row label="Subtotal neto" valor={resumen.monto_total - resumen.monto_iva} />
              <Row label="IVA 21%"       valor={resumen.monto_iva} />
              <div className="pt-3 border-t border-gray-200">
                <Row label="TOTAL" valor={resumen.monto_total} grande />
              </div>
            </div>

            {/* Por método de pago */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Por Método de Pago</h2>
              <Row label="💵 Efectivo"    valor={resumen.por_metodo_pago.efectivo} />
              <Row label="💳 Tarjeta"     valor={resumen.por_metodo_pago.tarjeta} />
              <Row label="📱 Billetera"   valor={resumen.por_metodo_pago.billetera} />
            </div>

            <Button
              size="lg"
              fullWidth
              variant="secondary"
              onClick={() => window.print()}
            >
              🖨️ Imprimir Resumen
            </Button>
          </>
        )}

        {resumen?.total_ventas === 0 && !cargando && (
          <div className="text-center text-gray-400 py-12 text-xl">
            Sin ventas para esta fecha
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, valor, tipo }: { label: string; valor: number; tipo: 'numero' | 'dinero' }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center">
      <p className="text-3xl font-bold text-gray-900">
        {tipo === 'dinero' ? formatPrecio(valor) : valor}
      </p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  )
}

function Row({ label, valor, grande }: { label: string; valor: number; grande?: boolean }) {
  return (
    <div className={`flex justify-between ${grande ? 'text-2xl font-bold' : 'text-gray-700'}`}>
      <span>{label}</span>
      <span>{formatPrecio(valor)}</span>
    </div>
  )
}
