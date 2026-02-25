import type { RecordingId, RecordingState, RecordingMetadata } from '@maycast/common-types';
import { RecordingEntity } from '@maycast/common-types';

/**
 * Recording Repository Interface (Server-side)
 *
 * Recording エンティティの永続化を抽象化
 * 実装: InMemoryRecordingRepository (Phase 7でDB実装に置き換え予定)
 */
export interface IRecordingRepository {
  /**
   * Recordingを保存
   */
  save(recording: RecordingEntity): Promise<void>;

  /**
   * IDでRecordingを取得
   */
  findById(id: RecordingId): Promise<RecordingEntity | null>;

  /**
   * すべてのRecordingを取得
   */
  findAll(): Promise<RecordingEntity[]>;

  /**
   * Recordingを削除
   */
  delete(id: RecordingId): Promise<void>;

  /**
   * Recording状態を更新
   */
  updateState(id: RecordingId, state: RecordingState): Promise<void>;

  /**
   * Recordingメタデータを更新
   */
  updateMetadata(id: RecordingId, metadata: RecordingMetadata): Promise<void>;

  /**
   * チャンク数を増加
   */
  incrementChunkCount(id: RecordingId): Promise<void>;

  /**
   * Processing情報を取得
   */
  getProcessingInfo(id: RecordingId): Promise<{
    processingState: string | null;
    outputMp4Key: string | null;
    outputM4aKey: string | null;
  } | null>;

  /**
   * Processing状態を更新
   */
  updateProcessingState(
    id: RecordingId,
    state: 'pending' | 'processing' | 'completed' | 'failed',
    error?: string,
    outputKeys?: { mp4Key: string; m4aKey: string }
  ): Promise<void>;

}
