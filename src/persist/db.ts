/**
 * Minimal IndexedDB wrapper — one object store, no dependencies.
 * Any failure (private mode, quota, no IDB) degrades to "no persistence".
 */

const DB_NAME = 'photo-editor'
const DB_VERSION = 1
const STORE = 'session'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
    req.onblocked = () => reject(new Error('indexedDB blocked'))
  })
}

let cached: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!cached) {
    cached = openDb().catch((err) => {
      cached = null
      throw err
    })
  }
  return cached
}

export async function idbPut(key: string, value: unknown): Promise<void> {
  const d = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('write failed'))
    tx.onabort = () => reject(tx.error ?? new Error('write aborted'))
  })
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const d = await db()
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error ?? new Error('read failed'))
  })
}

export async function idbDelete(key: string): Promise<void> {
  const d = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('delete failed'))
  })
}
