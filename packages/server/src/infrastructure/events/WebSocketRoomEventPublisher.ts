/**
 * WebSocketRoomEventPublisher - WebSocket経由でRoomイベントを発行
 *
 * IRoomEventPublisherの実装
 * WebSocketManagerを使用してリアルタイム通知を送信
 */

import type { RoomId, RoomState, RecordingId } from '@maycast/common-types';
import type { IRoomEventPublisher } from '../../domain/events/IRoomEventPublisher.js';
import type { WebSocketManager } from '../websocket/WebSocketManager.js';

export class WebSocketRoomEventPublisher implements IRoomEventPublisher {
  private webSocketManager: WebSocketManager;

  constructor(webSocketManager: WebSocketManager) {
    this.webSocketManager = webSocketManager;
  }

  publishRoomStateChanged(roomId: RoomId, state: RoomState): void {
    this.webSocketManager.emitRoomStateChanged(roomId, state);
  }

  publishRecordingCreated(roomId: RoomId, recordingId: RecordingId): void {
    this.webSocketManager.emitRecordingCreated(roomId, recordingId);
  }
}
