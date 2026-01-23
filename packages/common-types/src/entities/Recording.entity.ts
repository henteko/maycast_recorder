import type { RecordingId, RecordingState, RecordingMetadata, Recording } from '../recording.js';
import {
  InvalidStateTransitionError,
  InvalidOperationError,
} from '../errors/DomainErrors.js';

/**
 * Recording ドメインエンティティ
 *
 * ビジネスルール:
 * - 状態遷移は standby -> recording -> finalizing -> synced の順序のみ許可
 * - メタデータは standby または recording 状態でのみ設定可能
 * - 状態遷移時に適切なタイムスタンプを記録
 */
export class RecordingEntity {
  private constructor(
    private readonly id: RecordingId,
    private state: RecordingState,
    private metadata: RecordingMetadata | undefined,
    private readonly createdAt: Date,
    private startedAt: Date | undefined,
    private finishedAt: Date | undefined,
    private chunkCount: number,
    private totalSize: number
  ) {}

  /**
   * 新しいRecordingを作成
   */
  static create(id: RecordingId): RecordingEntity {
    return new RecordingEntity(
      id,
      'standby',
      undefined,
      new Date(),
      undefined,
      undefined,
      0,
      0
    );
  }

  /**
   * 永続化されたデータからRecordingを復元
   */
  static reconstitute(data: Recording): RecordingEntity {
    return new RecordingEntity(
      data.id,
      data.state,
      data.metadata,
      new Date(data.createdAt),
      data.startTime ? new Date(data.startTime) : undefined,
      data.endTime ? new Date(data.endTime) : undefined,
      data.chunkCount,
      data.totalSize
    );
  }

  /**
   * ビジネスルール: 録画開始
   * standby 状態からのみ遷移可能
   */
  startRecording(): void {
    if (this.state !== 'standby') {
      throw new InvalidStateTransitionError(
        `Cannot start recording from state: ${this.state}. Must be in 'standby' state.`
      );
    }
    this.state = 'recording';
    this.startedAt = new Date();
  }

  /**
   * ビジネスルール: 録画完了（ファイナライズ開始）
   * recording 状態からのみ遷移可能
   */
  finalize(): void {
    if (this.state !== 'recording') {
      throw new InvalidStateTransitionError(
        `Cannot finalize from state: ${this.state}. Must be in 'recording' state.`
      );
    }
    this.state = 'finalizing';
    this.finishedAt = new Date();
  }

  /**
   * ビジネスルール: 同期完了
   * finalizing 状態からのみ遷移可能
   */
  markAsSynced(): void {
    if (this.state !== 'finalizing') {
      throw new InvalidStateTransitionError(
        `Cannot mark as synced from state: ${this.state}. Must be in 'finalizing' state.`
      );
    }
    this.state = 'synced';
  }

  /**
   * ビジネスルール: メタデータ設定
   * standby または recording 状態でのみ設定可能
   */
  setMetadata(metadata: RecordingMetadata): void {
    if (this.state !== 'standby' && this.state !== 'recording') {
      throw new InvalidOperationError(
        `Cannot update metadata in state: ${this.state}. Metadata can only be updated in 'standby' or 'recording' state.`
      );
    }
    this.metadata = metadata;
  }

  /**
   * チャンク数を増加
   */
  incrementChunkCount(): void {
    this.chunkCount += 1;
  }

  /**
   * 合計サイズを加算
   */
  addSize(bytes: number): void {
    this.totalSize += bytes;
  }

  /**
   * 録画の継続時間（ミリ秒）を計算
   */
  getDuration(): number | null {
    if (!this.startedAt) {
      return null;
    }
    const endTime = this.finishedAt || new Date();
    return endTime.getTime() - this.startedAt.getTime();
  }

  /**
   * 録画中かどうか
   */
  isRecording(): boolean {
    return this.state === 'recording';
  }

  /**
   * 完了済みかどうか
   */
  isCompleted(): boolean {
    return this.state === 'finalizing' || this.state === 'synced';
  }

  // Getters
  getId(): RecordingId {
    return this.id;
  }

  getState(): RecordingState {
    return this.state;
  }

  getMetadata(): RecordingMetadata | undefined {
    return this.metadata;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getStartedAt(): Date | undefined {
    return this.startedAt;
  }

  getFinishedAt(): Date | undefined {
    return this.finishedAt;
  }

  getChunkCount(): number {
    return this.chunkCount;
  }

  getTotalSize(): number {
    return this.totalSize;
  }

  /**
   * DTOへの変換
   * 永続化やAPI通信用のプレーンなオブジェクトに変換
   */
  toDTO(): Recording {
    return {
      id: this.id,
      state: this.state,
      metadata: this.metadata,
      chunkCount: this.chunkCount,
      totalSize: this.totalSize,
      startTime: this.startedAt ? this.startedAt.getTime() : new Date().getTime(),
      endTime: this.finishedAt ? this.finishedAt.getTime() : undefined,
      createdAt: this.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
