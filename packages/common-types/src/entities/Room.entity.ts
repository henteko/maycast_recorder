import type { RoomId, RoomState, Room } from '../room.js';
import type { RecordingId } from '../recording.js';
import { InvalidRoomStateTransitionError } from '../errors/DomainErrors.js';

/**
 * Room ドメインエンティティ
 *
 * ビジネスルール:
 * - 状態遷移は idle -> recording -> finished の順序のみ許可
 * - Recording の追加/削除は idle または recording 状態でのみ可能
 * - 状態遷移時に適切なタイムスタンプを記録
 */
export class RoomEntity {
  private constructor(
    private readonly id: RoomId,
    private state: RoomState,
    private readonly createdAt: Date,
    private updatedAt: Date,
    private recordingIds: RecordingId[]
  ) {}

  /**
   * 新しいRoomを作成
   */
  static create(id: RoomId): RoomEntity {
    const now = new Date();
    return new RoomEntity(id, 'idle', now, now, []);
  }

  /**
   * 永続化されたデータからRoomを復元
   */
  static reconstitute(data: Room): RoomEntity {
    return new RoomEntity(
      data.id,
      data.state,
      new Date(data.createdAt),
      new Date(data.updatedAt),
      [...data.recordingIds]
    );
  }

  /**
   * ビジネスルール: 録画開始
   * idle 状態からのみ遷移可能
   */
  startRecording(): void {
    if (this.state !== 'idle') {
      throw new InvalidRoomStateTransitionError(
        `Cannot start recording from state: ${this.state}. Must be in 'idle' state.`
      );
    }
    this.state = 'recording';
    this.updatedAt = new Date();
  }

  /**
   * ビジネスルール: 録画終了
   * recording 状態からのみ遷移可能
   */
  finalize(): void {
    if (this.state !== 'recording') {
      throw new InvalidRoomStateTransitionError(
        `Cannot finalize from state: ${this.state}. Must be in 'recording' state.`
      );
    }
    this.state = 'finished';
    this.updatedAt = new Date();
  }

  /**
   * RecordingをRoomに追加
   */
  addRecording(recordingId: RecordingId): void {
    if (!this.recordingIds.includes(recordingId)) {
      this.recordingIds.push(recordingId);
      this.updatedAt = new Date();
    }
  }

  /**
   * RecordingをRoomから削除
   */
  removeRecording(recordingId: RecordingId): void {
    const index = this.recordingIds.indexOf(recordingId);
    if (index !== -1) {
      this.recordingIds.splice(index, 1);
      this.updatedAt = new Date();
    }
  }

  /**
   * アイドル状態かどうか
   */
  isIdle(): boolean {
    return this.state === 'idle';
  }

  /**
   * 録画中かどうか
   */
  isRecording(): boolean {
    return this.state === 'recording';
  }

  /**
   * 終了済みかどうか
   */
  isFinished(): boolean {
    return this.state === 'finished';
  }

  // Getters
  getId(): RoomId {
    return this.id;
  }

  getState(): RoomState {
    return this.state;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  getRecordingIds(): RecordingId[] {
    return [...this.recordingIds];
  }

  /**
   * DTOへの変換
   * 永続化やAPI通信用のプレーンなオブジェクトに変換
   */
  toDTO(): Room {
    return {
      id: this.id,
      state: this.state,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      recordingIds: [...this.recordingIds],
    };
  }
}
