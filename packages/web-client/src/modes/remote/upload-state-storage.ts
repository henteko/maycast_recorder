/**
 * upload-state-storage - チャンクアップロード状態をIndexedDBで管理
 */

import type { RecordingId } from '@maycast/common-types';
import type { ChunkUploadStatus } from './types';

const DB_NAME = 'maycast_upload_states';
const DB_VERSION = 1;
const STORE_NAME = 'upload_states';

/**
 * IndexedDBを初期化
 */
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // upload_statesストアを作成
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: ['recordingId', 'chunkId'],
        });
        // recordingIdでインデックスを作成（録画ごとの状態取得用）
        store.createIndex('by_recording', 'recordingId', { unique: false });
      }
    };
  });
}

/**
 * チャンクアップロード状態を保存
 */
export async function saveUploadState(status: ChunkUploadStatus): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(status);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * チャンクアップロード状態を取得
 */
export async function getUploadState(
  recordingId: RecordingId,
  chunkId: number
): Promise<ChunkUploadStatus | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get([recordingId, chunkId]);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

/**
 * 特定の録画の全チャンクアップロード状態を取得
 */
export async function listUploadStates(
  recordingId: RecordingId
): Promise<ChunkUploadStatus[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('by_recording');
    const request = index.getAll(recordingId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

/**
 * 特定の録画の全アップロード状態を削除
 */
export async function deleteUploadStates(recordingId: RecordingId): Promise<void> {
  const db = await openDB();
  const states = await listUploadStates(recordingId);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    for (const state of states) {
      store.delete([state.recordingId, state.chunkId]);
    }

    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}

/**
 * アップロード状態を更新
 */
export async function updateUploadState(
  recordingId: RecordingId,
  chunkId: number,
  updates: Partial<Pick<ChunkUploadStatus, 'state' | 'retryCount' | 'error'>>
): Promise<void> {
  const existing = await getUploadState(recordingId, chunkId);
  if (!existing) {
    throw new Error(`Upload state not found: ${recordingId}/${chunkId}`);
  }

  const updated: ChunkUploadStatus = {
    ...existing,
    ...updates,
    lastAttempt: Date.now(),
  };

  await saveUploadState(updated);
}
