/**
 * IRoomEventPublisher - Room関連イベント発行インターフェース
 *
 * Domain層からInfrastructure層へのイベント通知を抽象化
 */

import type { RoomId, RoomState, RecordingId } from '@maycast/common-types';

export interface IRoomEventPublisher {
  /**
   * Room状態変更イベントを発行
   */
  publishRoomStateChanged(roomId: RoomId, state: RoomState): void;

  /**
   * Recording作成イベントを発行
   */
  publishRecordingCreated(roomId: RoomId, recordingId: RecordingId): void;

  /**
   * スケジュール録画開始イベントを発行
   */
  publishScheduledRecordingStart(roomId: RoomId, startAtServerTime: number): void;
}
