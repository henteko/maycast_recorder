import type { RoomId, RoomState, Room } from '../room.js';
import type { RecordingId } from '../recording.js';
import { InvalidRoomStateTransitionError } from '../errors/DomainErrors.js';

/**
 * Room ドメインエンティティ
 *
 * ビジネスルール:
 * - 状態遷移は idle -> recording -> finalizing -> finished の順序
 * - finalizing: Guest のアップロード完了待ち状態
 * - Recording の追加/削除は idle または recording 状態でのみ可能
 * - 状態遷移時に適切なタイムスタンプを記録
 * - finished から idle へのリセットが可能（Room再利用）
 * - accessKey によるURL認証をサポート
 */
export class RoomEntity {
  private constructor(
    private readonly id: RoomId,
    private readonly accessKey: string,
    private state: RoomState,
    private readonly createdAt: Date,
    private updatedAt: Date,
    private recordingIds: RecordingId[]
  ) {}

  /**
   * 新しいRoomを作成
   */
  static create(id: RoomId, accessKey: string): RoomEntity {
    const now = new Date();
    return new RoomEntity(id, accessKey, 'idle', now, now, []);
  }

  /**
   * 永続化されたデータからRoomを復元
   */
  static reconstitute(data: Room): RoomEntity {
    return new RoomEntity(
      data.id,
      data.accessKey,
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
   * ビジネスルール: 録画停止 → finalizing状態へ
   * recording 状態からのみ遷移可能
   * Guestのアップロード完了を待つ状態
   */
  startFinalizing(): void {
    if (this.state !== 'recording') {
      throw new InvalidRoomStateTransitionError(
        `Cannot start finalizing from state: ${this.state}. Must be in 'recording' state.`
      );
    }
    this.state = 'finalizing';
    this.updatedAt = new Date();
  }

  /**
   * ビジネスルール: 録画終了（全Guest同期完了）
   * finalizing 状態からのみ遷移可能
   */
  finalize(): void {
    if (this.state !== 'finalizing') {
      throw new InvalidRoomStateTransitionError(
        `Cannot finalize from state: ${this.state}. Must be in 'finalizing' state.`
      );
    }
    this.state = 'finished';
    this.updatedAt = new Date();
  }

  /**
   * ビジネスルール: Roomをリセット（再利用）
   * finished 状態からのみ遷移可能
   */
  reset(): void {
    if (this.state !== 'finished') {
      throw new InvalidRoomStateTransitionError(
        `Cannot reset from state: ${this.state}. Must be in 'finished' state.`
      );
    }
    this.state = 'idle';
    this.recordingIds = [];
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
   * アクセスキーを検証
   */
  validateAccessKey(key: string): boolean {
    return this.accessKey === key;
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
   * ファイナライズ中かどうか（Guest同期待ち）
   */
  isFinalizing(): boolean {
    return this.state === 'finalizing';
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

  getAccessKey(): string {
    return this.accessKey;
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
      accessKey: this.accessKey,
      state: this.state,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      recordingIds: [...this.recordingIds],
    };
  }
}
