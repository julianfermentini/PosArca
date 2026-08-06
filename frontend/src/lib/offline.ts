import type { VentaOffline, EstadoSync } from '../types'

const DB_NAME = 'pos-fiscal'
const DB_VERSION = 2
const STORE_VENTAS = 'ventas_offline'

let _db: IDBDatabase | null = null

function abrirDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      const tx = (e.target as IDBOpenDBRequest).transaction!
      const store = db.objectStoreNames.contains(STORE_VENTAS)
        ? tx.objectStore(STORE_VENTAS)
        : db.createObjectStore(STORE_VENTAS, { keyPath: 'id' })
      if (!store.indexNames.contains('estado_sync')) {
        store.createIndex('estado_sync', 'estado_sync', { unique: false })
      }
      // v2: taguea cada venta con la cuenta que la cargó, para no sincronizarla
      // con el JWT de otra cuenta si alguien más inició sesión en el mismo
      // dispositivo antes de que terminara de sincronizar.
      if (!store.indexNames.contains('cuenta_email')) {
        store.createIndex('cuenta_email', 'cuenta_email', { unique: false })
      }
    }

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result
      resolve(_db)
    }

    req.onerror = () => reject(req.error)
  })
}

export async function guardarVentaOffline(venta: VentaOffline, cuentaEmail: string | null): Promise<void> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VENTAS, 'readwrite')
    const store = tx.objectStore(STORE_VENTAS)
    const req = store.put({ ...venta, cuenta_email: cuentaEmail ?? undefined, estado_sync: 'PENDIENTE' satisfies EstadoSync })
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// Filtra por la cuenta logueada. Las ventas guardadas antes de esta versión
// (sin cuenta_email) se incluyen igual para no perderlas — son casos legacy,
// no un cruce entre cuentas nuevo.
function esDeLaCuenta(v: VentaOffline, cuentaEmail: string | null): boolean {
  return !v.cuenta_email || v.cuenta_email === cuentaEmail
}

export async function obtenerVentasPendientes(cuentaEmail: string | null): Promise<VentaOffline[]> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VENTAS, 'readonly')
    const store = tx.objectStore(STORE_VENTAS)
    const idx = store.index('estado_sync')
    const req = idx.getAll('PENDIENTE' satisfies EstadoSync)
    req.onsuccess = () => {
      // IndexedDB no garantiza orden cronológico acá — lo forzamos por created_at
      // para que el backend les asigne el CAE en el mismo orden en que se vendieron.
      const ventas = (req.result as VentaOffline[])
        .filter((v) => esDeLaCuenta(v, cuentaEmail))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
      resolve(ventas)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function marcarSincronizada(id: string): Promise<void> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VENTAS, 'readwrite')
    const store = tx.objectStore(STORE_VENTAS)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const venta = getReq.result
      if (venta) {
        venta.estado_sync = 'SINCRONIZADO' satisfies EstadoSync
        store.put(venta)
      }
      resolve()
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

export async function contarPendientes(cuentaEmail: string | null): Promise<number> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VENTAS, 'readonly')
    const store = tx.objectStore(STORE_VENTAS)
    const idx = store.index('estado_sync')
    const req = idx.getAll('PENDIENTE' satisfies EstadoSync)
    req.onsuccess = () => {
      const ventas = (req.result as VentaOffline[]).filter((v) => esDeLaCuenta(v, cuentaEmail))
      resolve(ventas.length)
    }
    req.onerror = () => reject(req.error)
  })
}
