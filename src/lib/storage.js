// Tiny IndexedDB wrapper. One database, a few object stores, promise based.
const DB_NAME = 'lumina-workspace'
const DB_VERSION = 2
const STORES = ['files', 'conversations', 'graphs', 'activity', 'kv', 'notes']

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function tx(store, mode, fn) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const request = fn(transaction.objectStore(store))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export const db = {
  get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
  getAll: (store) => tx(store, 'readonly', (s) => s.getAll()),
  set: (store, value) => tx(store, 'readwrite', (s) => s.put(value)),
  del: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
