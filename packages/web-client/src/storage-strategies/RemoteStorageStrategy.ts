/**
 * RemoteStorageStrategy - Remote Mode用のストレージ戦略
 *
 * OPFS + サーバーへの並行アップロード
 */

import { ChunkStorage } from '../infrastructure/storage/chunk-storage';
import type { IStorageStrategy } from './IStorageStrategy';
import type { RecordingId } from '@maycast/common-types';
import { RecordingManager } from '../infrastructure/recording/RecordingManager';
import { ChunkUploader } from '../infrastructure/upload/ChunkUploader';
import { getServerUrl } from '../infrastructure/config/serverConfig';
import type { LocalRecordingId, RemoteRecordingId } from '../types/recording-id';
import { asLocalRecordingId, asRemoteRecordingId } from '../types/recording-id';
import {
  saveRemoteMapping,
  updateInitSegmentUploaded,
  deleteRemoteMapping,
} from '../infrastructure/recording/remote-recording-mapping';

export class RemoteStorageStrategy implements IStorageStrategy {
  private storageMap: Map<LocalRecordingId, ChunkStorage> = new Map();
  private recordingManagerMap: Map<LocalRecordingId, RecordingManager> = new Map();
  private chunkUploaderMap: Map<LocalRecordingId, ChunkUploader> = new Map();
  // ローカルRecording IDとリモートRecording IDのマッピング
  private serverRecordingIdMap: Map<LocalRecordingId, RemoteRecordingId> = new Map();
  // 完了したRecordingのマッピング（ダウンロード用）
  private completedRecordingsMap: Map<LocalRecordingId, RemoteRecordingId> = new Map();
  // 最後に完了したローカルRecording ID
  private lastCompletedLocalRecordingId: LocalRecordingId | null = null;

  async initSession(recordingId: RecordingId): Promise<void> {
    const localRecordingId = asLocalRecordingId(recordingId);
    console.log('🚀 [RemoteStorageStrategy] Initializing session (local):', localRecordingId);

    // OPFS初期化（ローカルIDを使用）
    const storage = new ChunkStorage(recordingId);
    await storage.initSession();
    this.storageMap.set(localRecordingId, storage);

    // サーバー接続
    const serverUrl = getServerUrl();
    console.log('🌐 [RemoteStorageStrategy] Server URL:', serverUrl);

    const recordingManager = new RecordingManager(serverUrl);
    this.recordingManagerMap.set(localRecordingId, recordingManager);

    try {
      // サーバーにRecording作成
      console.log('📡 [RemoteStorageStrategy] Creating recording on server...');
      const serverRecordingIdString = await recordingManager.createRecording();
      const remoteRecordingId = asRemoteRecordingId(serverRecordingIdString);
      console.log(`✅ Recording created on server (remote): ${remoteRecordingId}`);

      // ローカルIDとリモートIDのマッピングを保存（メモリ）
      this.serverRecordingIdMap.set(localRecordingId, remoteRecordingId);
      console.log(`🔗 [RemoteStorageStrategy] Mapping: local=${localRecordingId} -> remote=${remoteRecordingId}`);

      // IndexedDBにマッピングを永続化（非ブロッキング）
      saveRemoteMapping({
        localRecordingId: localRecordingId as RecordingId,
        remoteRecordingId,
        initSegmentUploaded: false,
        createdAt: Date.now(),
      }).catch(err => {
        console.warn('⚠️ [RemoteStorageStrategy] Failed to persist remote mapping:', err);
      });

      // Recording状態を'recording'に更新
      console.log('📡 [RemoteStorageStrategy] Updating recording state to "recording"...');
      await recordingManager.updateState('recording');

      // ChunkUploader初期化（リモートIDを使用）
      const apiClient = recordingManager.getAPIClient();
      const chunkUploader = new ChunkUploader(remoteRecordingId, apiClient);
      this.chunkUploaderMap.set(localRecordingId, chunkUploader);

      console.log(`✅ Remote recording session initialized: local=${localRecordingId}, remote=${remoteRecordingId}`);
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
        // 録画開始 → recording状態に遷移
        console.log(`🔄 [RemoteStorageStrategy] Marking as recording (remote=${remoteRecordingId})`);
        await recordingManager.updateState('recording');

        const apiClient = recordingManager.getAPIClient();

        // Presigned URLによる直接アップロードを試行
        try {
          const uploadUrlResponse = await apiClient.getInitSegmentUploadUrl(remoteRecordingId);
          if (uploadUrlResponse.directUpload) {
            console.log(`📡 [RemoteStorageStrategy] Uploading init segment directly to S3... (remote=${remoteRecordingId})`);
            await apiClient.uploadToPresignedUrl(uploadUrlResponse.url, data);
            await apiClient.confirmInitSegmentUpload(remoteRecordingId);
            console.log(`✅ [RemoteStorageStrategy] Init segment uploaded directly to S3 (${data.length} bytes)`);
          } else {
            console.log(`📡 [RemoteStorageStrategy] Uploading init segment via proxy... (remote=${remoteRecordingId})`);
            await apiClient.uploadInitSegment(remoteRecordingId, data);
            console.log(`✅ [RemoteStorageStrategy] Init segment uploaded via proxy (${data.length} bytes)`);
          }
        } catch (urlErr) {
          // Presigned URL取得に失敗した場合、プロキシ方式にフォールバック
          console.warn('⚠️ [RemoteStorageStrategy] Presigned URL failed, falling back to proxy:', urlErr);
          await apiClient.uploadInitSegment(remoteRecordingId, data);
          console.log(`✅ [RemoteStorageStrategy] Init segment uploaded via proxy fallback (${data.length} bytes)`);
        }

        // IndexedDBのinitSegmentUploadedフラグを更新（非ブロッキング）
        updateInitSegmentUploaded(recordingId, true).catch(err => {
          console.warn('⚠️ [RemoteStorageStrategy] Failed to update initSegmentUploaded flag:', err);
        });
      } catch (err) {
        console.error('❌ Failed to upload init segment to server:', err);
        // サーバーエラーでもローカルには保存済み
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
        console.log(`📤 [RemoteStorageStrategy] Chunk #${chunkId} queued for upload (local=${localRecordingId}, remote=${remoteRecordingId})`);
      } catch (err) {
        console.error(`❌ Failed to queue chunk #${chunkId} for upload:`, err);
        // アップロード失敗してもOPFSには保存されているので録画継続
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
        // まずfinalizing状態に遷移（録画停止時）
        console.log(`🔄 [RemoteStorageStrategy] Marking as finalizing (remote=${remoteRecordingId})`);
        await recordingManager.updateState('finalizing');

        console.log(`⏳ [RemoteStorageStrategy] Waiting for all chunks to upload... (remote=${remoteRecordingId})`);
        await chunkUploader.waitForCompletion();

        const stats = chunkUploader.getStats();
        console.log(`✅ Upload completed: ${stats.uploadedChunks}/${stats.totalChunks} chunks (remote=${remoteRecordingId})`);

        if (stats.failedChunks > 0) {
          console.warn(`⚠️ ${stats.failedChunks} chunks failed to upload, staying in 'finalizing' state`);
          // finalizing状態のまま（既に設定済み）、マッピングも保持
        } else {
          // 全チャンク成功 → synced状態に遷移
          await recordingManager.updateState('synced');
          console.log(`✅ Recording synced to server (local=${localRecordingId}, remote=${remoteRecordingId})`);

          // IndexedDBからマッピングを削除（完全同期済み）
          deleteRemoteMapping(recordingId).catch(err => {
            console.warn('⚠️ [RemoteStorageStrategy] Failed to delete remote mapping:', err);
          });
        }
      } catch (err) {
        console.error('❌ Failed to complete server sync:', err);
        // サーバーエラーでもローカルには保存済み
      }
    } else {
      console.warn(`⚠️ Server upload not available, recording saved locally only (local=${localRecordingId})`);
    }

    // 完了したRecordingのマッピングを保存（ダウンロード用）
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
    // 最新のRecordingのアップロード進捗を返す（ローカルIDキーで検索）
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

    // まずcompletedRecordingsMapから検索、なければserverRecordingIdMapから検索
    let remoteRecordingId = this.completedRecordingsMap.get(localId);
    if (!remoteRecordingId) {
      remoteRecordingId = this.serverRecordingIdMap.get(localId);
    }

    if (!remoteRecordingId) {
      throw new Error(`No server recording found for local recording: ${localId}`);
    }

    console.log(`📥 [RemoteStorageStrategy] Downloading from server: local=${localId}, remote=${remoteRecordingId}`);

    // サーバーからダウンロード
    const serverUrl = getServerUrl();
    const response = await fetch(`${serverUrl}/api/recordings/${remoteRecordingId}/download`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to download from server: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const blob = await response.blob();
    console.log(`✅ [RemoteStorageStrategy] Download completed: ${blob.size} bytes`);
    return blob;
  }

  /**
   * 最後に完了したRecordingのローカルIDを取得
   */
  getLastCompletedRecordingId(): LocalRecordingId | null {
    return this.lastCompletedLocalRecordingId;
  }
}
