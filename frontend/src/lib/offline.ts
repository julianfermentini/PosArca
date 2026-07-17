import type { VentaOffline, EstadoSync } from '../types'

const DB_NAME = 'pos-fiscal'
const DB_VERSION = 1
const STORE_VENTAS = 'ventas_offline'

let _db: IDBDatabase | null = null

function abrirDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_VENTAS)) {
        const store = db.createObjectStore(STORE_VENTAS, { keyPath: 'id' })
        store.createIndex('estado_sync', 'estado_sync', { unique: false })
      }
    }

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result
      resolve(_db)
    }

    req.onerror = () => reject(req.error)
  })
}

export async function guardarVentaOffline(venta: VentaOffline): Promise<void> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VENTAS, 'readwrite')
    const store = tx.objectStore(STORE_VENTAS)
    const req = store.put({ ...venta, estado_sync: 'PENDIENTE' satisfies EstadoSync })
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function obtenerVentasPendientes(): Promise<VentaOffline[]> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VENTAS, 'readonly')
    const store = tx.objectStore(STORE_VENTAS)
    const idx = store.index('estado_sync')
    const req = idx.getAll('PENDIENTE' satisfies EstadoSync)
    req.onsuccess = () => {
      // IndexedDB no garantiza orden cronológico acá — lo forzamos por created_at
      // para que el backend les asigne el CAE en el mismo orden en que se vendieron.
      const ventas = (req.result as VentaOffline[]).sort((a, b) => a.created_at.localeCompare(b.created_at))
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

export async function contarPendientes(): Promise<number> {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VENTAS, 'readonly')
    const store = tx.objectStore(STORE_VENTAS)
    const idx = store.index('estado_sync')
    const req = idx.count('PENDIENTE' satisfies EstadoSync)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
