import { RecordingAPIClient } from '../../api/recording-api';

export interface ChunkUploadTask {
  chunkId: string;
  data: Uint8Array;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  retryCount: number;
  error?: string;
}

export interface ChunkUploaderStats {
  totalChunks: number;
  uploadedChunks: number;
  failedChunks: number;
  pendingChunks: number;
}

/**
 * ChunkUploader
 * チャンクのアップロードキューを管理し、並行アップロードとリトライ機能を提供
 */
export class ChunkUploader {
  private queue: Map<string, ChunkUploadTask> = new Map();
  private maxConcurrentUploads: number;
  private maxRetries: number;
  private activeUploads = 0;
  private recordingId: string;
  private apiClient: RecordingAPIClient;
  private isProcessing = false;

  constructor(
    recordingId: string,
    apiClient: RecordingAPIClient,
    options: {
      maxConcurrentUploads?: number;
      maxRetries?: number;
    } = {}
  ) {
    this.recordingId = recordingId;
    this.apiClient = apiClient;
    this.maxConcurrentUploads = options.maxConcurrentUploads ?? 3;
    this.maxRetries = options.maxRetries ?? 3;
  }

  /**
   * チャンクをキューに追加
   */
  addChunk(chunkId: string, data: Uint8Array): void {
    this.queue.set(chunkId, {
      chunkId,
      data,
      status: 'pending',
      retryCount: 0,
    });

    // キュー処理を開始
    this.processQueue();
  }

  /**
   * キューを処理
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.hasPendingTasks() || this.activeUploads > 0) {
      // 並行アップロード数が制限に達していない場合、次のタスクを処理
      while (this.activeUploads < this.maxConcurrentUploads && this.hasPendingTasks()) {
        const task = this.getNextPendingTask();
        if (task) {
          this.uploadTask(task);
        }
      }

      // 少し待機してから次のチェック
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessing = false;
  }

  /**
   * ペンディング中のタスクがあるか
   */
  private hasPendingTasks(): boolean {
    return Array.from(this.queue.values()).some(
      task => task.status === 'pending'
    );
  }

  /**
   * 次のペンディングタスクを取得
   */
  private getNextPendingTask(): ChunkUploadTask | null {
    for (const task of this.queue.values()) {
      if (task.status === 'pending') {
        return task;
      }
    }
    return null;
  }

  /**
   * タスクをアップロード
   */
  private async uploadTask(task: ChunkUploadTask): Promise<void> {
    task.status = 'uploading';
    this.activeUploads++;

    try {
      await this.apiClient.uploadChunk(this.recordingId, task.chunkId, task.data);
      task.status = 'completed';
      console.log(`✅ Chunk uploaded: ${task.chunkId}`);
    } catch (error) {
      console.error(`❌ Failed to upload chunk ${task.chunkId}:`, error);

      // リトライ
      if (task.retryCount < this.maxRetries) {
        task.retryCount++;
        task.status = 'pending';
        task.error = error instanceof Error ? error.message : 'Unknown error';
        console.log(`🔄 Retrying chunk ${task.chunkId} (attempt ${task.retryCount}/${this.maxRetries})`);
      } else {
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : 'Unknown error';
        console.error(`💥 Chunk upload failed after ${this.maxRetries} retries: ${task.chunkId}`);
      }
    } finally {
      this.activeUploads--;
    }
  }

  /**
   * 統計情報を取得
   */
  getStats(): ChunkUploaderStats {
    const tasks = Array.from(this.queue.values());
    return {
      totalChunks: tasks.length,
      uploadedChunks: tasks.filter(t => t.status === 'completed').length,
      failedChunks: tasks.filter(t => t.status === 'failed').length,
      pendingChunks: tasks.filter(t => t.status === 'pending' || t.status === 'uploading').length,
    };
  }

  /**
   * すべてのチャンクがアップロード完了したか
   */
  isAllCompleted(): boolean {
    const stats = this.getStats();
    return stats.totalChunks > 0 && stats.pendingChunks === 0 && stats.failedChunks === 0;
  }

  /**
   * アップロード完了を待機
   */
  async waitForCompletion(): Promise<void> {
    while (!this.isAllCompleted()) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /**
   * 失敗したチャンクのリスト
   */
  getFailedChunks(): ChunkUploadTask[] {
    return Array.from(this.queue.values()).filter(t => t.status === 'failed');
  }
}
