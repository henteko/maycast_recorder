/**
 * ResumeUploadManager
 * バックグラウンド再送信機能を管理
 */

import { RecordingEntity } from '@maycast/common-types';
import type { IChunkRepository } from '../../domain/repositories/IChunkRepository';
import type { IRecordingRepository } from '../../domain/repositories/IRecordingRepository';
import { RecordingAPIClient } from '../../infrastructure/api/recording-api';
import { ChunkUploader } from './ChunkUploader';
import type { UnfinishedRecording } from './resume-upload';
import type { UploadProgress } from './types';
import { deleteUploadStates } from '../storage/upload-state-storage';
import { deleteRemoteMapping, updateInitSegmentUploaded } from '../recording/remote-recording-mapping';

/**
 * 再送信結果
 */
export interface ResumeResult {
  success: boolean;
  uploadedChunks: number;
  failedChunks: number;
  error?: string;
}

/**
 * ResumeUploadManager
 * 未完了Recordingの再アップロードを管理
 */
export class ResumeUploadManager {
  private uploaders: Map<string, ChunkUploader> = new Map();
  private progress: Map<string, UploadProgress> = new Map();
  private isResuming: Map<string, boolean> = new Map();
  private chunkRepository: IChunkRepository;
  private apiClient: RecordingAPIClient;
  private recordingRepository: IRecordingRepository;

  constructor(
    chunkRepository: IChunkRepository,
    apiClient: RecordingAPIClient,
    recordingRepository: IRecordingRepository
  ) {
    this.chunkRepository = chunkRepository;
    this.apiClient = apiClient;
    this.recordingRepository = recordingRepository;
  }

  /**
   * 特定のRecordingの再送信を実行
   */
  async resumeRecording(unfinished: UnfinishedRecording): Promise<ResumeResult> {
    const { recording, remoteRecordingId, pendingChunks, missingChunkIds, initSegmentUploaded } = unfinished;
    const localRecordingId = recording.id;

    // 全ての未アップロードチャンク（pendingChunks + missingChunkIds）
    const allPendingChunkIds = [
      ...pendingChunks.map(c => c.chunkId),
      ...missingChunkIds,
    ];

    console.log(`🔄 [ResumeUploadManager] Starting resume for ${localRecordingId}`);
    console.log(`   Remote ID: ${remoteRecordingId}`);
    console.log(`   Init segment uploaded: ${initSegmentUploaded}`);
    console.log(`   Pending chunks (from upload_states): ${pendingChunks.length}`);
    console.log(`   Missing chunks (no upload_state): ${missingChunkIds.length}`);
    console.log(`   Total chunks to upload: ${allPendingChunkIds.length}`);

    this.isResuming.set(localRecordingId, true);

    // 進捗を初期化
    const totalChunks = allPendingChunkIds.length + (initSegmentUploaded ? 0 : 1);
    this.progress.set(localRecordingId, {
      uploaded: 0,
      total: totalChunks,
      pending: allPendingChunkIds.length,
      uploading: 0,
      failed: 0,
    });

    try {
      // 1. remoteRecordingId の存在確認
      if (!remoteRecordingId) {
        const errorMsg = 'リモート Recording ID が見つかりません。録画データのマッピングが破損している可能性があります。';
        console.error(`❌ [ResumeUploadManager] ${errorMsg}`);
        return {
          success: false,
          uploadedChunks: 0,
          failedChunks: allPendingChunkIds.length,
          error: errorMsg,
        };
      }

      // 2. サーバー側に Recording が存在するか確認
      try {
        await this.apiClient.getRecording(remoteRecordingId);
        console.log(`✅ [ResumeUploadManager] Server recording exists: ${remoteRecordingId}`);
      } catch (_error) {
        // Recording が見つからない場合はエラーを返す
        const errorMsg = `サーバー側に Recording が存在しません (ID: ${remoteRecordingId})。サーバーが再起動された可能性があります。この録画データは手動で削除してください。`;
        console.error(`❌ [ResumeUploadManager] ${errorMsg}`);
        return {
          success: false,
          uploadedChunks: 0,
          failedChunks: allPendingChunkIds.length,
          error: errorMsg,
        };
      }

      const serverRecordingId = remoteRecordingId;

      // 3. init segment が未送信なら OPFS から読み込みアップロード
      if (!initSegmentUploaded) {
        console.log('📤 [ResumeUploadManager] Uploading init segment...');
        const initSegment = await this.chunkRepository.getInitSegment(localRecordingId);

        if (initSegment) {
          await this.apiClient.uploadInitSegment(serverRecordingId, new Uint8Array(initSegment));
          await updateInitSegmentUploaded(localRecordingId, true);
          console.log('✅ [ResumeUploadManager] Init segment uploaded');

          // 進捗更新
          const currentProgress = this.progress.get(localRecordingId)!;
          currentProgress.uploaded += 1;
          this.progress.set(localRecordingId, { ...currentProgress });
        } else {
          console.warn('⚠️ [ResumeUploadManager] Init segment not found in OPFS');
        }
      }

      // 4. 未送信チャンクをアップロード
      if (allPendingChunkIds.length > 0) {
        const chunkUploader = new ChunkUploader(serverRecordingId, this.apiClient);
        this.uploaders.set(localRecordingId, chunkUploader);

        // OPFS からチャンクデータを読み込んでキューに追加
        // pendingChunks と missingChunkIds の両方を処理
        for (const chunkId of allPendingChunkIds) {
          const chunkData = await this.chunkRepository.findById(localRecordingId, chunkId);

          if (chunkData) {
            await chunkUploader.addChunk(chunkId.toString(), new Uint8Array(chunkData));
            console.log(`📤 [ResumeUploadManager] Chunk #${chunkId} queued`);
          } else {
            console.warn(`⚠️ [ResumeUploadManager] Chunk #${chunkId} not found in OPFS`);
          }
        }

        // 完了待機
        console.log('⏳ [ResumeUploadManager] Waiting for chunks to upload...');
        await chunkUploader.waitForCompletion();

        const stats = chunkUploader.getStats();
        console.log(`📊 [ResumeUploadManager] Upload stats: ${JSON.stringify(stats)}`);

        // 進捗最終更新
        const currentProgress = this.progress.get(localRecordingId)!;
        currentProgress.uploaded = (initSegmentUploaded ? 0 : 1) + stats.uploadedChunks;
        currentProgress.pending = 0;
        currentProgress.uploading = 0;
        currentProgress.failed = stats.failedChunks;
        this.progress.set(localRecordingId, { ...currentProgress });

        if (stats.failedChunks > 0) {
          console.warn(`⚠️ [ResumeUploadManager] ${stats.failedChunks} chunks failed`);
          return {
            success: false,
            uploadedChunks: stats.uploadedChunks,
            failedChunks: stats.failedChunks,
            error: `${stats.failedChunks} chunks failed to upload`,
          };
        }
      }

      // 5. 全成功時: Recording 状態を finalizing → synced に更新
      console.log('🔄 [ResumeUploadManager] Updating recording state to finalizing...');
      await this.apiClient.updateRecordingState(serverRecordingId, 'finalizing');
      console.log('🔄 [ResumeUploadManager] Updating recording state to synced...');
      await this.apiClient.updateRecordingState(serverRecordingId, 'synced');

      // 6. ローカルの Recording も synced に更新
      console.log(`🔄 [ResumeUploadManager] Updating local recording state: ${recording.state} → synced`);
      const recordingEntity = RecordingEntity.reconstitute(recording);

      // 状態遷移: standby → recording → finalizing → synced
      // 現在の状態から synced まで順番に遷移
      if (recordingEntity.getState() === 'standby') {
        recordingEntity.startRecording();
      }
      if (recordingEntity.getState() === 'recording') {
        recordingEntity.finalize();
      }
      if (recordingEntity.getState() === 'finalizing') {
        recordingEntity.markAsSynced();
      }

      await this.recordingRepository.save(recordingEntity);
      console.log(`✅ [ResumeUploadManager] Local recording state updated to: ${recordingEntity.getState()}`);

      // マッピングと状態を削除
      await deleteRemoteMapping(localRecordingId);
      await deleteUploadStates(localRecordingId);

      console.log(`✅ [ResumeUploadManager] Resume completed for ${localRecordingId}`);

      return {
        success: true,
        uploadedChunks: allPendingChunkIds.length,
        failedChunks: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ [ResumeUploadManager] Resume failed for ${localRecordingId}:`, error);

      // 進捗更新
      const currentProgress = this.progress.get(localRecordingId);
      if (currentProgress) {
        currentProgress.failed = currentProgress.pending;
        currentProgress.pending = 0;
        this.progress.set(localRecordingId, { ...currentProgress });
      }

      return {
        success: false,
        uploadedChunks: 0,
        failedChunks: allPendingChunkIds.length,
        error: errorMessage,
      };
    } finally {
      this.isResuming.set(localRecordingId, false);
      this.uploaders.delete(localRecordingId);
    }
  }

  /**
   * 複数のRecordingを順次再送信
   */
  async resumeAllRecordings(unfinishedList: UnfinishedRecording[]): Promise<ResumeResult[]> {
    const results: ResumeResult[] = [];

    for (const unfinished of unfinishedList) {
      const result = await this.resumeRecording(unfinished);
      results.push(result);
    }

    return results;
  }

  /**
   * 特定のRecordingの進捗を取得
   * ChunkUploaderが存在する場合はリアルタイムの進捗を返す
   */
  getProgress(recordingId: string): UploadProgress | null {
    const baseProgress = this.progress.get(recordingId);
    if (!baseProgress) {
      return null;
    }

    // ChunkUploaderが存在する場合はリアルタイムの進捗を取得
    const uploader = this.uploaders.get(recordingId);
    if (uploader) {
      const stats = uploader.getStats();
      return {
        ...baseProgress,
        uploaded: baseProgress.uploaded + stats.uploadedChunks - (baseProgress.total - baseProgress.pending),
        pending: stats.pendingChunks,
        uploading: stats.totalChunks - stats.uploadedChunks - stats.failedChunks - stats.pendingChunks,
        failed: stats.failedChunks,
      };
    }

    return baseProgress;
  }

  /**
   * 全Recordingの進捗を取得
   * ChunkUploaderが存在する場合はリアルタイムの進捗を返す
   */
  getAllProgress(): Map<string, UploadProgress> {
    const result = new Map<string, UploadProgress>();

    for (const [recordingId, baseProgress] of this.progress) {
      const uploader = this.uploaders.get(recordingId);
      if (uploader) {
        const stats = uploader.getStats();
        // init segment が含まれている場合を考慮
        const initSegmentCount = baseProgress.total > stats.totalChunks ? 1 : 0;
        const uploadedWithInit = initSegmentCount + stats.uploadedChunks;

        result.set(recordingId, {
          uploaded: uploadedWithInit,
          total: baseProgress.total,
          pending: stats.pendingChunks,
          uploading: stats.totalChunks - stats.uploadedChunks - stats.failedChunks - stats.pendingChunks,
          failed: stats.failedChunks,
        });
      } else {
        result.set(recordingId, baseProgress);
      }
    }

    return result;
  }

  /**
   * 特定のRecordingが再送信中かどうか
   */
  isRecordingResuming(recordingId: string): boolean {
    return this.isResuming.get(recordingId) || false;
  }

  /**
   * いずれかのRecordingが再送信中かどうか
   */
  isAnyResuming(): boolean {
    return Array.from(this.isResuming.values()).some(v => v);
  }
}
