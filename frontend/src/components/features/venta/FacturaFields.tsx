import { formatCUIT } from '../../../lib/utils'

export interface FacturaFieldsProps {
  razonSocial: string
  cuit: string
  emailCliente: string
  onChangeRazonSocial: (value: string) => void
  onChangeCuit: (value: string) => void
  onChangeEmailCliente: (value: string) => void
}

export function FacturaFields({
  razonSocial, cuit, emailCliente,
  onChangeRazonSocial, onChangeCuit, onChangeEmailCliente,
}: FacturaFieldsProps) {
  return (
    <div className="flex flex-col rounded-xl border border-gray-200" style={{ background: '#F9FAFB', padding: 14, gap: 10 }}>
      <div>
        <label className="block font-semibold text-gray-500 mb-1" style={{ fontSize: 11 }}>Razón social</label>
        <input
          type="text"
          value={razonSocial}
          onChange={e => onChangeRazonSocial(e.target.value)}
          placeholder="Empresa S.A."
          className="w-full border border-gray-200 rounded-lg outline-none transition-all"
          style={{ padding: '9px 12px', fontSize: 13 }}
          onFocus={e => (e.target.style.borderColor = '#3B72E0')}
          onBlur={e => (e.target.style.borderColor = '')}
        />
      </div>
      <div>
        <label className="block font-semibold text-gray-500 mb-1" style={{ fontSize: 11 }}>CUIT del cliente</label>
        <input
          type="tel"
          inputMode="numeric"
          value={cuit}
          onChange={e => onChangeCuit(formatCUIT(e.target.value.replace(/\D/g, '')))}
          maxLength={13}
          placeholder="20-12345678-9"
          className="w-full border border-gray-200 rounded-lg outline-none font-mono transition-all"
          style={{ padding: '9px 12px', fontSize: 13 }}
          onFocus={e => (e.target.style.borderColor = '#3B72E0')}
          onBlur={e => (e.target.style.borderColor = '')}
        />
      </div>
      <div>
        <label className="block font-semibold text-gray-500 mb-1" style={{ fontSize: 11 }}>Email del cliente</label>
        <input
          type="email"
          value={emailCliente}
          onChange={e => onChangeEmailCliente(e.target.value)}
          placeholder="cliente@empresa.com"
          className="w-full border border-gray-200 rounded-lg outline-none transition-all"
          style={{ padding: '9px 12px', fontSize: 13 }}
          onFocus={e => (e.target.style.borderColor = '#3B72E0')}
          onBlur={e => (e.target.style.borderColor = '')}
        />
      </div>
    </div>
  )
}
