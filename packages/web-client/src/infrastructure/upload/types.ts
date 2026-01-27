/**
 * Remote Mode用の型定義
 */

import type { RecordingId } from '@maycast/common-types';

/**
 * チャンクアップロード状態
 */
export type UploadState = 'pending' | 'uploading' | 'uploaded' | 'failed';

/**
 * チャンクアップロード状態の詳細情報
 */
export interface ChunkUploadStatus {
  recordingId: RecordingId;
  chunkId: number;
  state: UploadState;
  retryCount: number;
  lastAttempt: number; // timestamp
  hash?: string; // Blake3ハッシュ（16進数文字列）
  error?: string;
}

/**
 * アップロード進捗情報
 */
export interface UploadProgress {
  uploaded: number;
  total: number;
  pending: number;
  uploading: number;
  failed: number;
}
