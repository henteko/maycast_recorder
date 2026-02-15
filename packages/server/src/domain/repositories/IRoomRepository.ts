import type { RoomId, RoomState, RecordingId } from '@maycast/common-types';
import { RoomEntity } from '@maycast/common-types';

/**
 * Room Repository Interface (Server-side)
 *
 * Room エンティティの永続化を抽象化
 * 実装: InMemoryRoomRepository (Phase 7でDB実装に置き換え予定)
 */
export interface IRoomRepository {
  /**
   * Roomを保存
   */
  save(room: RoomEntity): Promise<void>;

  /**
   * IDでRoomを取得
   */
  findById(id: RoomId): Promise<RoomEntity | null>;

  /**
   * アクセストークンでRoomを取得
   */
  findByAccessToken(accessToken: string): Promise<RoomEntity | null>;

  /**
   * すべてのRoomを取得
   */
  findAll(): Promise<RoomEntity[]>;

  /**
   * Roomを削除
   */
  delete(id: RoomId): Promise<void>;

  /**
   * Room状態を更新
   */
  updateState(id: RoomId, state: RoomState): Promise<void>;

  /**
   * RoomにRecordingを追加
   */
  addRecording(id: RoomId, recordingId: RecordingId): Promise<void>;

  /**
   * RoomからRecordingを削除
   */
  removeRecording(id: RoomId, recordingId: RecordingId): Promise<void>;
}
