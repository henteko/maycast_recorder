/**
 * IndexedDB メタデータ管理
 *
 * チャンクのメタデータ（timestamp, size, hash等）を管理
 */

import type { ChunkMetadata, SessionMetadata } from './types'

const DB_NAME = 'maycast-recorder'
const DB_VERSION = 1
const CHUNK_STORE = 'chunks'
const SESSION_STORE = 'sessions'

/**
 * IndexedDBを開く
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // チャンクストア
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        const chunkStore = db.createObjectStore(CHUNK_STORE, {
          keyPath: ['sessionId', 'chunkId'],
        })
        chunkStore.createIndex('sessionId', 'sessionId', { unique: false })
        chunkStore.createIndex('timestamp', 'timestamp', { unique: false })
      }

      // セッションストア
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: 'sessionId' })
      }
    }
  })
}

/**
 * チャンクメタデータを保存
 */
export async function saveChunkMetadata(metadata: ChunkMetadata): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHUNK_STORE], 'readwrite')
    const store = transaction.objectStore(CHUNK_STORE)
    const request = store.put(metadata)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

/**
 * チャンクメタデータを取得
 */
export async function getChunkMetadata(
  sessionId: string,
  chunkId: number
): Promise<ChunkMetadata | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHUNK_STORE], 'readonly')
    const store = transaction.objectStore(CHUNK_STORE)
    const request = store.get([sessionId, chunkId])

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result || null)
  })
}

/**
 * セッションの全チャンクメタデータを取得
 */
export async function listChunkMetadata(sessionId: string): Promise<ChunkMetadata[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHUNK_STORE], 'readonly')
    const store = transaction.objectStore(CHUNK_STORE)
    const index = store.index('sessionId')
    const request = index.getAll(sessionId)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const chunks = request.result as ChunkMetadata[]
      // chunkId順にソート
      chunks.sort((a, b) => a.chunkId - b.chunkId)
      resolve(chunks)
    }
  })
}

/**
 * セッションメタデータを保存
 */
export async function saveSessionMetadata(metadata: SessionMetadata): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE], 'readwrite')
    const store = transaction.objectStore(SESSION_STORE)
    const request = store.put(metadata)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

/**
 * セッションメタデータを取得
 */
export async function getSessionMetadata(
  sessionId: string
): Promise<SessionMetadata | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE], 'readonly')
    const store = transaction.objectStore(SESSION_STORE)
    const request = store.get(sessionId)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result || null)
  })
}

/**
 * 全セッションメタデータを取得
 */
export async function listSessionMetadata(): Promise<SessionMetadata[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE], 'readonly')
    const store = transaction.objectStore(SESSION_STORE)
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

/**
 * セッションのメタデータを削除
 */
export async function deleteSessionMetadata(sessionId: string): Promise<void> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHUNK_STORE, SESSION_STORE], 'readwrite')

    // チャンクメタデータを削除
    const chunkStore = transaction.objectStore(CHUNK_STORE)
    const chunkIndex = chunkStore.index('sessionId')
    const chunkRequest = chunkIndex.openCursor(IDBKeyRange.only(sessionId))

    chunkRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }

    chunkRequest.onerror = () => {
      console.warn('⚠️ Failed to delete chunk metadata for session:', sessionId, chunkRequest.error)
    }

    // セッションメタデータを削除
    const sessionStore = transaction.objectStore(SESSION_STORE)
    sessionStore.delete(sessionId)

    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = () => resolve()
  })
}
