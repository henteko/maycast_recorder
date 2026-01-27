/**
 * GuestStorageStrategy - Guest Mode用のストレージ戦略
 *
 * RemoteStorageStrategyをベースに、roomIdを自動的に付与する
 * OPFS + サーバーへの並行アップロード（Room内Recording）
 */

import { ChunkStorage } from '../../infrastructure/storage/chunk-storage';
import type { IStorageStrategy } from '../../storage-strategies/IStorageStrategy';
import type { RecordingId, RoomId } from '@maycast/common-types';
import { RecordingManager } from '../remote/RecordingManager';
import { ChunkUploader } from '../remote/ChunkUploader';
import { getServerUrl } from '../remote/serverConfig';
import type { LocalRecordingId, RemoteRecordingId } from '../../types/recording-id';
import { asLocalRecordingId, asRemoteRecordingId } from '../../types/recording-id';
import {
  saveRemoteMapping,
  updateInitSegmentUploaded,
  deleteRemoteMapping,
} from '../remote/remote-recording-mapping';

export class GuestStorageStrategy implements IStorageStrategy {
  private roomId: RoomId;
  private storageMap: Map<LocalRecordingId, ChunkStorage> = new Map();
  private recordingManagerMap: Map<LocalRecordingId, RecordingManager> = new Map();
  private chunkUploaderMap: Map<LocalRecordingId, ChunkUploader> = new Map();
  private serverRecordingIdMap: Map<LocalRecordingId, RemoteRecordingId> = new Map();
  private completedRecordingsMap: Map<LocalRecordingId, RemoteRecordingId> = new Map();
  private lastCompletedLocalRecordingId: LocalRecordingId | null = null;

  constructor(roomId: RoomId) {
    this.roomId = roomId;
    console.log(`🏠 [GuestStorageStrategy] Initialized for room: ${roomId}`);
  }

  async initSession(recordingId: RecordingId): Promise<void> {
    const localRecordingId = asLocalRecordingId(recordingId);
    console.log('🚀 [GuestStorageStrategy] Initializing session (local):', localRecordingId);
    console.log('🏠 [GuestStorageStrategy] Room ID:', this.roomId);

    // OPFS初期化（ローカルIDを使用）
    const storage = new ChunkStorage(recordingId);
    await storage.initSession();
    this.storageMap.set(localRecordingId, storage);

    // サーバー接続
    const serverUrl = getServerUrl();
    console.log('🌐 [GuestStorageStrategy] Server URL:', serverUrl);

    const recordingManager = new RecordingManager(serverUrl);
    this.recordingManagerMap.set(localRecordingId, recordingManager);

    try {
      // サーバーにRecording作成（roomIdを指定）
      console.log(`📡 [GuestStorageStrategy] Creating recording on server (roomId: ${this.roomId})...`);
      const serverRecordingIdString = await recordingManager.createRecording(this.roomId);
      const remoteRecordingId = asRemoteRecordingId(serverRecordingIdString);
      console.log(`✅ Recording created on server (remote): ${remoteRecordingId}`);

      // ローカルIDとリモートIDのマッピングを保存（メモリ）
      this.serverRecordingIdMap.set(localRecordingId, remoteRecordingId);
      console.log(`🔗 [GuestStorageStrategy] Mapping: local=${localRecordingId} -> remote=${remoteRecordingId}`);

      // IndexedDBにマッピングを永続化（非ブロッキング）
      saveRemoteMapping({
        localRecordingId: localRecordingId as RecordingId,
        remoteRecordingId,
        initSegmentUploaded: false,
        createdAt: Date.now(),
      }).catch(err => {
        console.warn('⚠️ [GuestStorageStrategy] Failed to persist remote mapping:', err);
      });

      // Recording状態を'recording'に更新
      console.log('📡 [GuestStorageStrategy] Updating recording state to "recording"...');
      await recordingManager.updateState('recording');

      // ChunkUploader初期化（リモートIDを使用）
      const apiClient = recordingManager.getAPIClient();
      const chunkUploader = new ChunkUploader(remoteRecordingId, apiClient);
      this.chunkUploaderMap.set(localRecordingId, chunkUploader);

      console.log(`✅ Guest recording session initialized: local=${localRecordingId}, remote=${remoteRecordingId}, room=${this.roomId}`);
    } catch (err) {
      console.error('❌ Failed to create recording on server:', err);
      // サーバーエラーでも録画は継続（OPFS保存のみ）
      console.warn('⚠️ Recording will continue with local storage only');
    }
  }

  async saveInitSegment(recordingId: RecordingId, data: Uint8Array): Promise<void> {
    const localRecordingId = asLocalRecordingId(recordingId);
    const storage = this.storageMap.get(localRecordingId);
    if (!storage) {
      throw new Error(`ChunkStorage not initialized for local recording: ${localRecordingId}`);
    }

    // OPFS保存（ローカルIDを使用）
    await storage.saveInitSegment(data);

    // サーバーアップロード
    const recordingManager = this.recordingManagerMap.get(localRecordingId);
    const remoteRecordingId = this.serverRecordingIdMap.get(localRecordingId);

    if (recordingManager && remoteRecordingId) {
      try {
        console.log(`🔄 [GuestStorageStrategy] Marking as recording (remote=${remoteRecordingId})`);
        await recordingManager.updateState('recording');

        console.log(`📡 [GuestStorageStrategy] Uploading init segment to server... (remote=${remoteRecordingId})`);
        const apiClient = recordingManager.getAPIClient();
        await apiClient.uploadInitSegment(remoteRecordingId, data);
        console.log(`✅ [GuestStorageStrategy] Init segment uploaded to server (${data.length} bytes)`);

        // IndexedDBのinitSegmentUploadedフラグを更新（非ブロッキング）
        updateInitSegmentUploaded(recordingId, true).catch(err => {
          console.warn('⚠️ [GuestStorageStrategy] Failed to update initSegmentUploaded flag:', err);
        });
      } catch (err) {
        console.error('❌ Failed to upload init segment to server:', err);
      }
    } else {
      console.warn(`⚠️ Server upload not available, init segment saved locally only (local=${localRecordingId})`);
    }
  }

  async saveChunk(
    recordingId: RecordingId,
    data: Uint8Array,
    timestamp: number
  ): Promise<number> {
    const localRecordingId = asLocalRecordingId(recordingId);
    const storage = this.storageMap.get(localRecordingId);
    if (!storage) {
      throw new Error(`ChunkStorage not initialized for local recording: ${localRecordingId}`);
    }

    // OPFS保存（バックアップとして、ローカルIDを使用）
    const chunkId = await storage.saveChunk(data, timestamp);

    // サーバーアップロード（非同期、録画をブロックしない）
    const chunkUploader = this.chunkUploaderMap.get(localRecordingId);
    const remoteRecordingId = this.serverRecordingIdMap.get(localRecordingId);

    if (chunkUploader && remoteRecordingId) {
      try {
        await chunkUploader.addChunk(chunkId.toString(), data);
        console.log(`📤 [GuestStorageStrategy] Chunk #${chunkId} queued for upload (local=${localRecordingId}, remote=${remoteRecordingId})`);
      } catch (err) {
        console.error(`❌ Failed to queue chunk #${chunkId} for upload:`, err);
      }
    } else {
      console.warn(`⚠️ ChunkUploader not available, chunk #${chunkId} saved to OPFS only (local=${localRecordingId})`);
    }

    return chunkId;
  }

  async completeSession(recordingId: RecordingId): Promise<void> {
    const localRecordingId = asLocalRecordingId(recordingId);
    const storage = this.storageMap.get(localRecordingId);
    if (!storage) {
      throw new Error(`ChunkStorage not initialized for local recording: ${localRecordingId}`);
    }

    // OPFS完了（ローカルIDを使用）
    await storage.completeSession();

    // 全チャンクのアップロード完了を待機
    const chunkUploader = this.chunkUploaderMap.get(localRecordingId);
    const recordingManager = this.recordingManagerMap.get(localRecordingId);
    const remoteRecordingId = this.serverRecordingIdMap.get(localRecordingId);

    if (chunkUploader && recordingManager && remoteRecordingId) {
      try {
        // まずfinalizing状態に遷移
        console.log(`🔄 [GuestStorageStrategy] Marking as finalizing (remote=${remoteRecordingId})`);
        await recordingManager.updateState('finalizing');

        console.log(`⏳ [GuestStorageStrategy] Waiting for all chunks to upload... (remote=${remoteRecordingId})`);
        await chunkUploader.waitForCompletion();

        const stats = chunkUploader.getStats();
        console.log(`✅ Upload completed: ${stats.uploadedChunks}/${stats.totalChunks} chunks (remote=${remoteRecordingId})`);

        if (stats.failedChunks > 0) {
          console.warn(`⚠️ ${stats.failedChunks} chunks failed to upload, staying in 'finalizing' state`);
        } else {
          // 全チャンク成功 → synced状態に遷移
          await recordingManager.updateState('synced');
          console.log(`✅ Recording synced to server (local=${localRecordingId}, remote=${remoteRecordingId})`);

          // IndexedDBからマッピングを削除（完全同期済み）
          deleteRemoteMapping(recordingId).catch(err => {
            console.warn('⚠️ [GuestStorageStrategy] Failed to delete remote mapping:', err);
          });
        }
      } catch (err) {
        console.error('❌ Failed to complete server sync:', err);
      }
    } else {
      console.warn(`⚠️ Server upload not available, recording saved locally only (local=${localRecordingId})`);
    }

    // 完了したRecordingのマッピングを保存
    if (remoteRecordingId) {
      this.completedRecordingsMap.set(localRecordingId, remoteRecordingId);
      this.lastCompletedLocalRecordingId = localRecordingId;
    }

    // クリーンアップ
    this.storageMap.delete(localRecordingId);
    this.recordingManagerMap.delete(localRecordingId);
    this.chunkUploaderMap.delete(localRecordingId);
    this.serverRecordingIdMap.delete(localRecordingId);
  }

  getUploadProgress(): { uploaded: number; total: number } {
    for (const chunkUploader of this.chunkUploaderMap.values()) {
      const stats = chunkUploader.getStats();
      return {
        uploaded: stats.uploadedChunks,
        total: stats.totalChunks,
      };
    }
    return { uploaded: 0, total: 0 };
  }

  /**
   * サーバーからRecordingをダウンロード
   */
  async downloadFromServer(localRecordingId: RecordingId): Promise<Blob> {
    const localId = asLocalRecordingId(localRecordingId);

    let remoteRecordingId = this.completedRecordingsMap.get(localId);
    if (!remoteRecordingId) {
      remoteRecordingId = this.serverRecordingIdMap.get(localId);
    }

    if (!remoteRecordingId) {
      throw new Error(`No server recording found for local recording: ${localId}`);
    }

    console.log(`📥 [GuestStorageStrategy] Downloading from server: local=${localId}, remote=${remoteRecordingId}`);

    const serverUrl = getServerUrl();
    const response = await fetch(`${serverUrl}/api/recordings/${remoteRecordingId}/download`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to download from server: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const blob = await response.blob();
    console.log(`✅ [GuestStorageStrategy] Download completed: ${blob.size} bytes`);
    return blob;
  }

  /**
   * Room IDを取得
   */
  getRoomId(): RoomId {
    return this.roomId;
  }

  /**
   * 最後に完了したRecordingのローカルIDを取得
   */
  getLastCompletedRecordingId(): LocalRecordingId | null {
    return this.lastCompletedLocalRecordingId;
  }
}
