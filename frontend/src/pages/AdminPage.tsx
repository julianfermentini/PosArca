import { useState, useCallback } from 'react'
import { adminApi, type CuentaAdmin, type ActualizarCuentaPayload } from '../lib/api'

// ─── utilidades ──────────────────────────────────────────────────────────────

function extractError(e: unknown): string {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error desconocido'
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const inputCls =
  'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-colors'

function TextField({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} className={inputCls} />
    </div>
  )
}

// ─── componentes de UI ───────────────────────────────────────────────────────

function Badge({ env }: { env: string }) {
  const prod = env === 'produccion'
  return (
    <span
      className="inline-block text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ background: prod ? '#DCFCE7' : '#FEF3C7', color: prod ? '#15803D' : '#92400E' }}
    >
      {prod ? 'Producción' : 'Testing'}
    </span>
  )
}

function EstadoBadge({ activo }: { activo: boolean }) {
  return (
    <span
      className="inline-block text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ background: activo ? '#DCFCE7' : '#F3F4F6', color: activo ? '#15803D' : '#6B7280' }}
    >
      {activo ? 'Activa' : 'Pausada'}
    </span>
  )
}

// ─── Modal genérico ───────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 flex items-start justify-center z-50 p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.5)', paddingTop: 40, paddingBottom: 40 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-base">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ─── Modal resetear contraseña ────────────────────────────────────────────────

function ResetModal({ cuenta, secret, onClose }: { cuenta: CuentaAdmin; secret: string; onClose: () => void }) {
  const [pass, setPass] = useState('')
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState('')
  const [cargando, setCargando] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    setErr('')
    try {
      await adminApi.resetPassword(secret, cuenta.email, pass)
      setOk(true)
      setPass('')
    } catch (ex) {
      setErr(extractError(ex))
    } finally {
      setCargando(false)
    }
  }

  return (
    <Modal title="Resetear contraseña" onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">{cuenta.email}</p>
      {ok ? (
        <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl mb-3">
          Contraseña actualizada correctamente.
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password" value={pass} onChange={e => setPass(e.target.value)}
            placeholder="Nueva contraseña (mínimo 6 caracteres)" required minLength={6}
            className={inputCls} style={{ fontFamily: 'monospace' }}
          />
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button type="submit" disabled={cargando}
            className="w-full font-bold text-white rounded-xl py-3 text-sm disabled:opacity-50"
            style={{ background: '#3B72E0' }}
          >
            {cargando ? 'Guardando...' : 'Guardar contraseña'}
          </button>
        </form>
      )}
    </Modal>
  )
}

// ─── Modal editar cuenta ──────────────────────────────────────────────────────

function EditModal({ cuenta, secret, onClose, onGuardado }: {
  cuenta: CuentaAdmin; secret: string; onClose: () => void; onGuardado: () => void
}) {
  const [form, setForm] = useState<ActualizarCuentaPayload>({
    razon_social: cuenta.razon_social,
    titular: cuenta.titular,
    cuit: cuenta.cuit,
    email: cuenta.email,
    punto_venta: cuenta.punto_venta,
    arca_env: cuenta.arca_env,
    direccion: cuenta.direccion,
    telefono: cuenta.telefono,
    condicion_iva: cuenta.condicion_iva,
    ing_brutos: cuenta.ing_brutos,
    inicio_actividades: cuenta.inicio_actividades,
    defensa_consumidor: cuenta.defensa_consumidor,
  })
  const [err, setErr] = useState('')
  const [cargando, setCargando] = useState(false)

  const set = (k: keyof ActualizarCuentaPayload) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: k === 'punto_venta' ? Number(e.target.value) : e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    setErr('')
    try {
      await adminApi.actualizarCuenta(secret, cuenta.id, form)
      onGuardado()
      onClose()
    } catch (ex) {
      setErr(extractError(ex))
    } finally {
      setCargando(false)
    }
  }

  return (
    <Modal title="Editar cuenta" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <TextField label="Razón Social" value={form.razon_social} onChange={set('razon_social')} placeholder="Bar El Rincón" />
          </div>
          <TextField label="Titular" value={form.titular} onChange={set('titular')} placeholder="Juan Pérez" />
          <TextField label="CUIT" value={form.cuit} onChange={set('cuit')} placeholder="20-12345678-9" />
          <div className="col-span-2">
            <TextField label="Email del usuario" value={form.email} onChange={set('email')} type="email" placeholder="cliente@negocio.com" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Punto de Venta</label>
            <input type="number" min={1} value={form.punto_venta} onChange={set('punto_venta')} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ambiente ARCA</label>
            <select value={form.arca_env} onChange={set('arca_env')} className={inputCls}>
              <option value="testing">Testing</option>
              <option value="produccion">Producción</option>
            </select>
          </div>
          <TextField label="Dirección" value={form.direccion} onChange={set('direccion')} placeholder="Av. San Martín 123" />
          <TextField label="Teléfono" value={form.telefono} onChange={set('telefono')} placeholder="261-4000000" />
          <div className="col-span-2">
            <TextField label="Condición IVA" value={form.condicion_iva} onChange={set('condicion_iva')} placeholder="Responsable Inscripto" />
          </div>
          <TextField label="Ing. Brutos" value={form.ing_brutos} onChange={set('ing_brutos')} placeholder="123456789" />
          <TextField label="Inicio Actividades" value={form.inicio_actividades} onChange={set('inicio_actividades')} placeholder="01/01/2020" />
          <div className="col-span-2">
            <TextField label="Defensa Consumidor" value={form.defensa_consumidor} onChange={set('defensa_consumidor')} placeholder="0800-123-4567" />
          </div>
        </div>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button type="submit" disabled={cargando}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: '#3B72E0' }}
          >
            {cargando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Modal eliminar con confirmación ─────────────────────────────────────────

function EliminarModal({ cuenta, secret, onClose, onEliminado }: {
  cuenta: CuentaAdmin; secret: string; onClose: () => void; onEliminado: () => void
}) {
  const [confirmacion, setConfirmacion] = useState('')
  const [err, setErr] = useState('')
  const [cargando, setCargando] = useState(false)
  const coincide = confirmacion === cuenta.razon_social

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!coincide) return
    setCargando(true)
    setErr('')
    try {
      await adminApi.eliminarCuenta(secret, cuenta.id)
      onEliminado()
      onClose()
    } catch (ex) {
      setErr(extractError(ex))
    } finally {
      setCargando(false)
    }
  }

  return (
    <Modal title="Eliminar cuenta" onClose={onClose}>
      <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
        <p className="text-sm text-red-700 font-semibold">Esta acción es permanente e irreversible.</p>
        <p className="text-sm text-red-600 mt-1">
          Se borrarán todos los datos de <strong>{cuenta.razon_social}</strong>: ventas, facturas, productos y el usuario.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Escribí el nombre del negocio para confirmar
          </label>
          <input
            type="text" value={confirmacion} onChange={e => setConfirmacion(e.target.value)}
            placeholder={cuenta.razon_social} className={inputCls}
          />
          <p className="text-xs text-gray-400 mt-1">Debe coincidir exactamente: <em>{cuenta.razon_social}</em></p>
        </div>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button type="submit" disabled={!coincide || cargando}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: '#DC2626' }}
          >
            {cargando ? 'Eliminando...' : 'Eliminar cuenta'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Formulario nueva cuenta ──────────────────────────────────────────────────

function NuevaCuentaForm({ secret, onCreada }: { secret: string; onCreada: () => void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [nombre, setNombre] = useState('')
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState('')
  const [cargando, setCargando] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    setErr('')
    try {
      await adminApi.crearCuenta(secret, email, pass, nombre)
      setOk(true)
      setEmail(''); setPass(''); setNombre('')
      onCreada()
    } catch (ex) {
      setErr(extractError(ex))
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => { setOpen(o => !o); setOk(false); setErr('') }}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-semibold text-gray-900 text-sm">+ Nueva cuenta</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {open && (
        <form onSubmit={submit} className="px-5 pb-5 flex flex-col gap-3 border-t border-gray-100 pt-4">
          {ok && (
            <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl">
              Cuenta creada correctamente.
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nombre del negocio</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Bar El Rincón" required className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="cliente@negocio.com" required className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Contraseña inicial</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)}
              placeholder="Mínimo 6 caracteres" required minLength={6}
              className={inputCls} style={{ fontFamily: 'monospace' }} />
          </div>
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button type="submit" disabled={cargando}
            className="font-bold text-white rounded-xl py-3 text-sm disabled:opacity-50 mt-1"
            style={{ background: '#3B72E0' }}
          >
            {cargando ? 'Creando...' : 'Crear cuenta'}
          </button>
        </form>
      )}
    </div>
  )
}

// ─── Fila de cuenta con acciones ──────────────────────────────────────────────

type ModalActivo = { tipo: 'editar' | 'reset' | 'eliminar'; cuenta: CuentaAdmin } | null

function FilaCuenta({ cuenta, secret, onRecargar, onModal }: {
  cuenta: CuentaAdmin
  secret: string
  onRecargar: () => void
  onModal: (m: ModalActivo) => void
}) {
  const [toggling, setToggling] = useState(false)

  const toggleEstado = async () => {
    setToggling(true)
    try {
      await adminApi.cambiarEstado(secret, cuenta.id, !cuenta.activo)
      onRecargar()
    } finally {
      setToggling(false)
    }
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900 text-sm">{cuenta.razon_social}</div>
        <div className="text-xs text-gray-400 mt-0.5" style={{ fontFamily: 'monospace' }}>{cuenta.email}</div>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">
        {cuenta.cuit || <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <div className="flex flex-col gap-1">
          <Badge env={cuenta.arca_env} />
          <EstadoBadge activo={cuenta.activo} />
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-gray-400 hidden lg:table-cell">{formatFecha(cuenta.created_at)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => onModal({ tipo: 'editar', cuenta })}
            className="text-xs font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100"
            title="Editar"
          >
            Editar
          </button>
          <button
            onClick={() => onModal({ tipo: 'reset', cuenta })}
            className="text-xs font-medium px-2 py-1 rounded-lg hover:bg-blue-50"
            style={{ color: '#3B72E0' }}
            title="Resetear contraseña"
          >
            Contraseña
          </button>
          <button
            onClick={toggleEstado}
            disabled={toggling}
            className="text-xs font-medium px-2 py-1 rounded-lg disabled:opacity-40"
            style={{ color: cuenta.activo ? '#92400E' : '#15803D',
              background: cuenta.activo ? '#FEF3C7' : '#DCFCE7' }}
            title={cuenta.activo ? 'Pausar cuenta' : 'Reactivar cuenta'}
          >
            {toggling ? '...' : cuenta.activo ? 'Pausar' : 'Reactivar'}
          </button>
          <button
            onClick={() => onModal({ tipo: 'eliminar', cuenta })}
            className="text-xs font-medium text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50"
            title="Eliminar cuenta"
          >
            Eliminar
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AdminPage() {
  const [secret, setSecret] = useState('')
  const [secretInput, setSecretInput] = useState('')
  const [autenticado, setAutenticado] = useState(false)
  const [authErr, setAuthErr] = useState('')
  const [cuentas, setCuentas] = useState<CuentaAdmin[]>([])
  const [cargando, setCargando] = useState(false)
  const [modal, setModal] = useState<ModalActivo>(null)

  const cargar = useCallback(async (s: string) => {
    setCargando(true)
    try {
      const { data } = await adminApi.listarCuentas(s)
      setCuentas(data.data ?? [])
      setAutenticado(true)
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setAuthErr(status === 401 ? 'Secret incorrecto' : 'Error de conexión')
      setAutenticado(false)
    } finally {
      setCargando(false)
    }
  }, [])

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault()
    setAuthErr('')
    setSecret(secretInput)
    cargar(secretInput)
  }

  if (!autenticado) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm p-8">
          <div className="flex items-center gap-2 mb-6">
            <span className="flex items-center justify-center font-black text-white text-xs"
              style={{ width: 30, height: 30, borderRadius: 8, background: '#3B72E0' }}>PA</span>
            <span className="font-black text-gray-900 tracking-tight" style={{ fontSize: 18 }}>
              posArg <span className="text-gray-400 font-normal">Admin</span>
            </span>
          </div>
          <form onSubmit={handleAuth} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Admin Secret
              </label>
              <input
                type="password" value={secretInput} onChange={e => setSecretInput(e.target.value)}
                placeholder="••••••••••••" required autoFocus
                className={inputCls} style={{ fontFamily: 'monospace' }}
              />
            </div>
            {authErr && <p className="text-red-600 text-sm">{authErr}</p>}
            <button type="submit" disabled={cargando}
              className="w-full font-bold text-white rounded-xl py-3 text-sm disabled:opacity-50"
              style={{ background: '#3B72E0' }}
            >
              {cargando ? 'Verificando...' : 'Acceder'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const recargar = () => cargar(secret)

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="flex items-center justify-between px-6 flex-shrink-0" style={{ background: '#111827', height: 56 }}>
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center font-black text-white text-xs"
            style={{ width: 28, height: 28, borderRadius: 8, background: '#3B72E0' }}>PA</span>
          <span className="font-black text-white tracking-tight" style={{ fontSize: 16 }}>
            posArg <span className="text-gray-400 font-normal">Admin</span>
          </span>
        </div>
        <button onClick={() => { setAutenticado(false); setSecret('') }}
          className="text-sm text-gray-400 hover:text-white transition-colors">
          Salir
        </button>
      </nav>

      <div className="max-w-5xl mx-auto p-6 flex flex-col gap-6">

        {/* Tabla de cuentas */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">
              Cuentas registradas
              <span className="ml-2 text-gray-400 font-normal">({cuentas.length})</span>
            </h2>
            <button onClick={recargar} disabled={cargando}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40">
              {cargando ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>

          {cuentas.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-10">Sin cuentas registradas</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: '#F9FAFB' }}>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Negocio / Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">CUIT</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Estado</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Alta</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cuentas.map(c => (
                    <FilaCuenta key={c.id} cuenta={c} secret={secret} onRecargar={recargar} onModal={setModal} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <NuevaCuentaForm secret={secret} onCreada={recargar} />
      </div>

      {/* Modales */}
      {modal?.tipo === 'editar' && (
        <EditModal cuenta={modal.cuenta} secret={secret} onClose={() => setModal(null)} onGuardado={recargar} />
      )}
      {modal?.tipo === 'reset' && (
        <ResetModal cuenta={modal.cuenta} secret={secret} onClose={() => setModal(null)} />
      )}
      {modal?.tipo === 'eliminar' && (
        <EliminarModal cuenta={modal.cuenta} secret={secret} onClose={() => setModal(null)} onEliminado={recargar} />
      )}
    </div>
  )
}
