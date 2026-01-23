/**
 * IStorageStrategy - ストレージ戦略インターフェース
 *
 * Standalone Mode と Remote Mode で保存方法を切り替えるための抽象化
 */

import type { RecordingId } from '@maycast/common-types';

export interface IStorageStrategy {
  /**
   * 録画セッションを初期化
   */
  initSession(recordingId: RecordingId): Promise<void>;

  /**
   * init segmentを保存
   */
  saveInitSegment(recordingId: RecordingId, data: Uint8Array): Promise<void>;

  /**
   * チャンクを保存
   * @returns チャンクID
   */
  saveChunk(recordingId: RecordingId, data: Uint8Array, timestamp: number): Promise<number>;

  /**
   * 録画セッションを完了
   */
  completeSession(recordingId: RecordingId): Promise<void>;

  /**
   * アップロード進捗を取得（オプショナル - Remote Mode用）
   */
  getUploadProgress?(): { uploaded: number; total: number };
}
