import type { RecordingId, RecordingState, RecordingMetadata } from '@maycast/common-types';
import { RecordingEntity } from '@maycast/common-types';

/**
 * Recording Repository Interface
 *
 * Recording エンティティの永続化を抽象化
 * 実装: IndexedDBRecordingRepository
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
   * チャンク数を更新
   */
  updateChunkCount(id: RecordingId, count: number): Promise<void>;

  /**
   * 合計サイズを更新
   */
  updateTotalSize(id: RecordingId, size: number): Promise<void>;
}
