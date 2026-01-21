/**
 * IndexedDB メタデータ管理
 *
 * チャンクのメタデータ（timestamp, size, hash等）と録画情報を管理
 */

import type { ChunkMetadata, RecordingId, Recording, RecordingState } from '@maycast/common-types';

const DB_NAME = 'maycast-recorder';
const DB_VERSION = 2; // Version 2: sessionId → id (RecordingId) migration
const CHUNK_STORE = 'chunks';
const RECORDING_STORE = 'recordings'; // Renamed from 'sessions'
const LEGACY_SESSION_STORE = 'sessions'; // For migration

/**
 * IndexedDBを開く
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;
      const transaction = (event.target as IDBOpenDBRequest).transaction!;

      // Version 1 → Version 2: sessionId → id (RecordingId) migration
      if (oldVersion < 1) {
        // 初回作成時（Version 0 → 1）
        const chunkStore = db.createObjectStore(CHUNK_STORE, {
          keyPath: ['recordingId', 'chunkId'],
        });
        chunkStore.createIndex('recordingId', 'recordingId', { unique: false });
        chunkStore.createIndex('timestamp', 'timestamp', { unique: false });

        db.createObjectStore(RECORDING_STORE, { keyPath: 'id' });
      }

      if (oldVersion === 1) {
        // Version 1からのマイグレーション

        // 古いチャンクストアのデータを取得
        const oldChunkStore = transaction.objectStore(CHUNK_STORE);
        const chunks: ChunkMetadata[] = [];

        const chunkCursorRequest = oldChunkStore.openCursor();
        chunkCursorRequest.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const oldData = cursor.value;
            // sessionId → recordingId に変換
            const migratedChunk = {
              ...oldData,
              recordingId: oldData.sessionId,
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (migratedChunk as any).sessionId;
            chunks.push(migratedChunk);
            cursor.continue();
          } else {
            // 全データ取得完了後、ストアを再作成
            db.deleteObjectStore(CHUNK_STORE);
            const newChunkStore = db.createObjectStore(CHUNK_STORE, {
              keyPath: ['recordingId', 'chunkId'],
            });
            newChunkStore.createIndex('recordingId', 'recordingId', { unique: false });
            newChunkStore.createIndex('timestamp', 'timestamp', { unique: false });

            // データを新しいストアに移行
            chunks.forEach(chunk => {
              newChunkStore.put(chunk);
            });
          }
        };

        // 古いセッションストアのデータを取得
        if (db.objectStoreNames.contains(LEGACY_SESSION_STORE)) {
          const oldSessionStore = transaction.objectStore(LEGACY_SESSION_STORE);
          const recordings: Recording[] = [];

          const sessionCursorRequest = oldSessionStore.openCursor();
          sessionCursorRequest.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              const oldData = cursor.value;
              // SessionMetadata → Recording に変換
              recordings.push({
                id: oldData.sessionId,
                state: (oldData.isCompleted ? 'synced' : 'finalizing') as RecordingState,
                chunkCount: oldData.totalChunks,
                totalSize: oldData.totalSize,
                startTime: oldData.startTime,
                endTime: oldData.endTime,
                createdAt: new Date(oldData.startTime).toISOString(),
                updatedAt: oldData.endTime ? new Date(oldData.endTime).toISOString() : new Date().toISOString(),
              });
              cursor.continue();
            } else {
              // 全データ取得完了後、新しいストアを作成
              db.deleteObjectStore(LEGACY_SESSION_STORE);
              const newRecordingStore = db.createObjectStore(RECORDING_STORE, { keyPath: 'id' });

              // データを新しいストアに移行
              recordings.forEach(recording => {
                newRecordingStore.put(recording);
              });
            }
          };
        } else {
          // sessions ストアが存在しない場合は新規作成
          db.createObjectStore(RECORDING_STORE, { keyPath: 'id' });
        }
      }
    };
  });
}

/**
 * チャンクメタデータを保存
 */
export async function saveChunkMetadata(metadata: ChunkMetadata): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHUNK_STORE], 'readwrite');
    const store = transaction.objectStore(CHUNK_STORE);
    const request = store.put(metadata);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * チャンクメタデータを取得
 */
export async function getChunkMetadata(
  recordingId: RecordingId,
  chunkId: number
): Promise<ChunkMetadata | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHUNK_STORE], 'readonly');
    const store = transaction.objectStore(CHUNK_STORE);
    const request = store.get([recordingId, chunkId]);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

/**
 * 録画の全チャンクメタデータを取得
 */
export async function listChunkMetadata(recordingId: RecordingId): Promise<ChunkMetadata[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHUNK_STORE], 'readonly');
    const store = transaction.objectStore(CHUNK_STORE);
    const index = store.index('recordingId');
    const request = index.getAll(recordingId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const chunks = request.result as ChunkMetadata[];
      // chunkId順にソート
      chunks.sort((a, b) => a.chunkId - b.chunkId);
      resolve(chunks);
    };
  });
}

/**
 * 録画メタデータを保存
 */
export async function saveRecording(recording: Recording): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([RECORDING_STORE], 'readwrite');
    const store = transaction.objectStore(RECORDING_STORE);
    const request = store.put(recording);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * 録画メタデータを取得
 */
export async function getRecording(
  recordingId: RecordingId
): Promise<Recording | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([RECORDING_STORE], 'readonly');
    const store = transaction.objectStore(RECORDING_STORE);
    const request = store.get(recordingId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

/**
 * 全録画メタデータを取得
 */
export async function listRecordings(): Promise<Recording[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([RECORDING_STORE], 'readonly');
    const store = transaction.objectStore(RECORDING_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * 録画のメタデータを削除
 */
export async function deleteRecording(recordingId: RecordingId): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHUNK_STORE, RECORDING_STORE], 'readwrite');

    // チャンクメタデータを削除
    const chunkStore = transaction.objectStore(CHUNK_STORE);
    const chunkIndex = chunkStore.index('recordingId');
    const chunkRequest = chunkIndex.openCursor(IDBKeyRange.only(recordingId));

    chunkRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    chunkRequest.onerror = () => {
      console.warn('⚠️ Failed to delete chunk metadata for recording:', recordingId, chunkRequest.error);
    };

    // 録画メタデータを削除
    const recordingStore = transaction.objectStore(RECORDING_STORE);
    recordingStore.delete(recordingId);

    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}
