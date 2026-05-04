export default function ConfigPage() {
  return (
    <div className="h-full flex items-center justify-center bg-gray-50 p-8">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-lg w-full text-center space-y-4">
        <div className="text-6xl">⚙️</div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500">
          La configuración del sistema (CUIT, punto de venta, certificados AFIP)
          se gestiona mediante variables de entorno en el servidor.
        </p>
        <p className="text-sm text-gray-400">
          Ver <code className="bg-gray-100 px-2 py-1 rounded">.env.example</code> para referencia.
        </p>
      </div>
    </div>
  )
}
