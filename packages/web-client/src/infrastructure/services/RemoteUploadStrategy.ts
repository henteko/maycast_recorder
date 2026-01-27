import type {
  IUploadStrategy,
  UploadParams,
  UploadProgress,
} from '../../domain/services/IUploadStrategy';
import { ChunkUploader } from '../upload/ChunkUploader';
import { RecordingAPIClient } from '../api/recording-api';

/**
 * サーバーへアップロードを行う Upload Strategy の実装
 *
 * Remote モードで使用
 * ChunkUploader を使用して並行アップロードとリトライを実現
 */
export class RemoteUploadStrategy implements IUploadStrategy {
  private uploaders: Map<string, ChunkUploader> = new Map();
  private apiClient: RecordingAPIClient;

  constructor(apiClient: RecordingAPIClient) {
    this.apiClient = apiClient;
  }

  async upload(params: UploadParams): Promise<void> {
    const { recordingId, chunkId, data, isInitSegment } = params;

    // Init Segment の場合
    if (isInitSegment) {
      try {
        await this.apiClient.uploadInitSegment(recordingId, new Uint8Array(data));
        console.log(`✅ [RemoteUploadStrategy] Init segment uploaded for recording ${recordingId}`);
      } catch (error) {
        console.error('❌ Failed to upload init segment:', error);
        throw error;
      }
      return;
    }

    // 通常のチャンクの場合
    // ChunkUploader を取得または作成
    let uploader = this.uploaders.get(recordingId);
    if (!uploader) {
      uploader = new ChunkUploader(recordingId, this.apiClient, {
        maxConcurrentUploads: 10,
        maxRetries: 3,
      });
      this.uploaders.set(recordingId, uploader);
    }

    // チャンクをキューに追加（非同期でアップロード開始）
    await uploader.addChunk(String(chunkId), new Uint8Array(data));
  }

  getProgress(): UploadProgress {
    let totalUploaded = 0;
    let totalChunks = 0;

    for (const uploader of this.uploaders.values()) {
      const stats = uploader.getStats();
      totalUploaded += stats.uploadedChunks;
      totalChunks += stats.totalChunks;
    }

    const percentage = totalChunks === 0 ? 100 : (totalUploaded / totalChunks) * 100;

    return {
      uploaded: totalUploaded,
      total: totalChunks,
      percentage,
    };
  }

  async waitForCompletion(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const uploader of this.uploaders.values()) {
      promises.push(uploader.waitForCompletion());
    }

    await Promise.all(promises);
  }

  clear(): void {
    this.uploaders.clear();
  }
}
