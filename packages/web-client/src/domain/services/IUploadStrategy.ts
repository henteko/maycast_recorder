import type { RecordingId, ChunkId } from '@maycast/common-types';

/**
 * アップロード対象のパラメータ
 */
export interface UploadParams {
  recordingId: RecordingId;
  chunkId: ChunkId;
  data: ArrayBuffer;
  isInitSegment?: boolean;
}

/**
 * アップロード進捗
 */
export interface UploadProgress {
  uploaded: number;
  total: number;
  percentage: number;
}

/**
 * Upload Strategy Interface
 *
 * チャンクアップロード戦略を抽象化
 * 実装:
 * - NoOpUploadStrategy（アップロードなし、Standaloneモード用）
 * - RemoteUploadStrategy（サーバーへアップロード、Remoteモード用）
 */
export interface IUploadStrategy {
  /**
   * チャンクをアップロード
   */
  upload(params: UploadParams): Promise<void>;

  /**
   * アップロード進捗を取得
   */
  getProgress?(): UploadProgress;

  /**
   * すべてのアップロード完了を待つ
   */
  waitForCompletion?(): Promise<void>;

  /**
   * アップロードキューをクリア
   */
  clear?(): void;
}
