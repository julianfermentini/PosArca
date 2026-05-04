import { useState } from 'react'
import { z } from 'zod'
import { Button } from '../../ui/Button'
import { validarCUIT, formatCUIT } from '../../../lib/utils'
import type { MetodoPago } from '../../../types'

interface FacturaModalProps {
  onClose: () => void
  onSubmit: (datos: DatosFactura) => Promise<void>
  metodoPago: MetodoPago | null
}

export interface DatosFactura {
  razon_social: string
  cuit_cliente: string
  email_cliente: string
}

const schema = z.object({
  razon_social: z.string().min(3, 'Requerido'),
  cuit_cliente: z.string().refine(validarCUIT, 'CUIT inválido'),
  email_cliente: z.string().email('Email inválido'),
})

export function FacturaModal({ onClose, onSubmit, metodoPago }: FacturaModalProps) {
  const [form, setForm] = useState<DatosFactura>({
    razon_social: '',
    cuit_cliente: '',
    email_cliente: '',
  })
  const [errores, setErrores] = useState<Partial<DatosFactura>>({})
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const set = (campo: keyof DatosFactura) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let valor = e.target.value
    if (campo === 'cuit_cliente') valor = formatCUIT(valor.replace(/\D/g, ''))
    setForm((f) => ({ ...f, [campo]: valor }))
    if (errores[campo]) setErrores((err) => ({ ...err, [campo]: undefined }))
  }

  const handleSubmit = async () => {
    const result = schema.safeParse(form)
    if (!result.success) {
      const errs: Partial<DatosFactura> = {}
      result.error.issues.forEach((issue) => {
        const campo = issue.path[0] as keyof DatosFactura
        errs[campo] = issue.message
      })
      setErrores(errs)
      return
    }

    if (!metodoPago) {
      setError('Seleccione un método de pago')
      return
    }

    setCargando(true)
    setError('')
    try {
      await onSubmit(form)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al emitir factura')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Datos de Factura</h2>
          <button
            onPointerDown={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 text-gray-500 text-xl font-bold flex items-center justify-center active:bg-gray-200"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Razón Social" error={errores.razon_social}>
            <input
              type="text"
              value={form.razon_social}
              onChange={set('razon_social')}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg focus:border-blue-500 focus:outline-none"
              placeholder="Empresa S.A."
            />
          </Field>

          <Field label="CUIT" error={errores.cuit_cliente}>
            <input
              type="tel"
              inputMode="numeric"
              value={form.cuit_cliente}
              onChange={set('cuit_cliente')}
              maxLength={13}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg focus:border-blue-500 focus:outline-none"
              placeholder="20-12345678-9"
            />
          </Field>

          <Field label="Email" error={errores.email_cliente}>
            <input
              type="email"
              inputMode="email"
              value={form.email_cliente}
              onChange={set('email_cliente')}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg focus:border-blue-500 focus:outline-none"
              placeholder="cliente@empresa.com"
            />
          </Field>
        </div>

        {error && (
          <p className="mt-4 text-red-600 bg-red-50 rounded-xl px-4 py-3 text-sm font-medium">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <Button variant="secondary" size="lg" fullWidth onClick={onClose} disabled={cargando}>
            Cancelar
          </Button>
          <Button variant="success" size="lg" fullWidth onClick={handleSubmit} disabled={cargando}>
            {cargando ? 'Emitiendo...' : 'Emitir y Enviar Email'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-red-500 text-sm">{error}</p>}
    </div>
  )
}
