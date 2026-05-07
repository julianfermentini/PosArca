import { useState } from 'react'
import { useProductosStore } from '../stores/productosStore'
import { formatPrecio } from '../lib/utils'

export default function ConfigPage() {
  const { productos, agregar, editar, eliminar } = useProductosStore()

  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editPrecio, setEditPrecio] = useState('')

  const handleAgregar = () => {
    const n = nombre.trim()
    if (!n) return
    const p = precio.trim() ? parseFloat(precio) : null
    if (p !== null && (isNaN(p) || p <= 0)) return
    agregar(n, p)
    setNombre('')
    setPrecio('')
  }

  const iniciarEdicion = (id: string, n: string, p: number | null) => {
    setEditandoId(id)
    setEditNombre(n)
    setEditPrecio(p !== null ? String(p) : '')
  }

  const confirmarEdicion = () => {
    if (!editandoId || !editNombre.trim()) return
    const p = editPrecio.trim() ? parseFloat(editPrecio) : null
    if (p !== null && (isNaN(p) || p <= 0)) return
    editar(editandoId, editNombre.trim(), p)
    setEditandoId(null)
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Productos rápidos */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Productos de acceso rápido</h2>
          <p className="text-sm text-gray-500 mb-5">
            Aparecen como botones en la pantalla de caja. El precio es el valor final con IVA incluido.
            Si lo dejás vacío, se pedirá el precio al momento de la venta.
          </p>

          {/* Formulario agregar */}
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del producto"
              className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400"
              onKeyDown={(e) => e.key === 'Enter' && handleAgregar()}
            />
            <input
              type="number"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="Precio (opcional)"
              className="w-36 border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400"
              onKeyDown={(e) => e.key === 'Enter' && handleAgregar()}
            />
            <button
              onClick={handleAgregar}
              disabled={!nombre.trim()}
              className="
                px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm
                disabled:opacity-40 hover:bg-blue-700 active:scale-95 transition-all
              "
            >
              + Agregar
            </button>
          </div>

          {/* Lista de productos */}
          {productos.length === 0 ? (
            <p className="text-center text-gray-400 py-8">
              No hay productos configurados todavía.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {productos.map((p) => (
                <div key={p.id} className="py-3">
                  {editandoId === p.id ? (
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={editNombre}
                        onChange={(e) => setEditNombre(e.target.value)}
                        className="flex-1 border-2 border-blue-300 rounded-xl px-3 py-2 text-sm outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && confirmarEdicion()}
                        autoFocus
                      />
                      <input
                        type="number"
                        value={editPrecio}
                        onChange={(e) => setEditPrecio(e.target.value)}
                        placeholder="Precio (opcional)"
                        className="w-36 border-2 border-blue-300 rounded-xl px-3 py-2 text-sm outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && confirmarEdicion()}
                      />
                      <button
                        onClick={confirmarEdicion}
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditandoId(null)}
                        className="px-4 py-2 rounded-xl border-2 border-gray-200 text-gray-600 text-sm hover:border-gray-400 transition-all"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{p.nombre}</p>
                        <p className="text-sm text-gray-500">
                          {p.precio !== null ? formatPrecio(p.precio) : 'Precio libre'}
                        </p>
                      </div>
                      <button
                        onClick={() => iniciarEdicion(p.id, p.nombre, p.precio)}
                        className="px-3 py-1.5 rounded-lg border-2 border-gray-200 text-gray-600 text-sm hover:border-blue-300 hover:text-blue-600 transition-all"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => eliminar(p.id)}
                        className="px-3 py-1.5 rounded-lg border-2 border-red-100 text-red-500 text-sm hover:bg-red-50 transition-all"
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info sistema */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Configuración del sistema</h2>
          <p className="text-gray-500 text-sm">
            Los parámetros fiscales (CUIT, punto de venta, certificados ARCA/AFIP) se configuran
            mediante variables de entorno en el servidor.
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Ver <code className="bg-gray-100 px-2 py-1 rounded">.env.example</code> para referencia.
          </p>
        </div>

      </div>
    </div>
  )
}
