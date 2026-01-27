/**
 * remote-recording-mapping.ts
 * ローカルID ↔ サーバーIDのマッピングをIndexedDBで永続化
 */

import type { RecordingId } from '@maycast/common-types';

const DB_NAME = 'maycast_remote_mappings';
const DB_VERSION = 1;
const STORE_NAME = 'mappings';

/**
 * リモートRecordingマッピング情報
 */
export interface RemoteRecordingMapping {
  localRecordingId: RecordingId;
  remoteRecordingId: string;
  initSegmentUploaded: boolean;
  createdAt: number;
}

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

      // mappingsストアを作成
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: 'localRecordingId',
        });
      }
    };
  });
}

/**
 * マッピングを保存
 */
export async function saveRemoteMapping(mapping: RemoteRecordingMapping): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(mapping);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * マッピングを取得
 */
export async function getRemoteMapping(
  localRecordingId: RecordingId
): Promise<RemoteRecordingMapping | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(localRecordingId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

/**
 * マッピングを削除
 */
export async function deleteRemoteMapping(localRecordingId: RecordingId): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(localRecordingId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * 全マッピングを取得
 */
export async function listRemoteMappings(): Promise<RemoteRecordingMapping[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

/**
 * initSegmentUploadedフラグを更新
 */
export async function updateInitSegmentUploaded(
  localRecordingId: RecordingId,
  uploaded: boolean
): Promise<void> {
  const existing = await getRemoteMapping(localRecordingId);
  if (!existing) {
    throw new Error(`Remote mapping not found for: ${localRecordingId}`);
  }

  const updated: RemoteRecordingMapping = {
    ...existing,
    initSegmentUploaded: uploaded,
  };

  await saveRemoteMapping(updated);
}
