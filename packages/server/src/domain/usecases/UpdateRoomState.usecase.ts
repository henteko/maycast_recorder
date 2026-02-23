import type { RoomId, RoomState } from '@maycast/common-types';
import { RoomNotFoundError } from '@maycast/common-types';
import type { IRoomRepository } from '../repositories/IRoomRepository.js';
import type { IRoomEventPublisher } from '../events/IRoomEventPublisher.js';

/**
 * Room状態更新リクエスト
 */
export interface UpdateRoomStateRequest {
  roomId: RoomId;
  state: RoomState;
}

/**
 * Room状態更新 Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. Roomを取得
 * 2. Entity経由で状態遷移（ビジネスルール検証）
 * 3. 更新を永続化
 * 4. WebSocket経由でイベント通知
 */
export class UpdateRoomStateUseCase {
  private roomRepository: IRoomRepository;
  private roomEventPublisher: IRoomEventPublisher | null;

  constructor(
    roomRepository: IRoomRepository,
    roomEventPublisher: IRoomEventPublisher | null = null
  ) {
    this.roomRepository = roomRepository;
    this.roomEventPublisher = roomEventPublisher;
  }

  async execute(request: UpdateRoomStateRequest): Promise<void> {
    // 1. Roomを取得
    const room = await this.roomRepository.findById(request.roomId);

    if (!room) {
      throw new RoomNotFoundError(`Room not found: ${request.roomId}`);
    }

    // 2. Entity経由で状態遷移（ビジネスルール検証）
    switch (request.state) {
      case 'recording':
        room.startRecording();
        break;
      case 'finalizing':
        room.startFinalizing();
        break;
      case 'finished':
        room.finalize();
        break;
      case 'idle':
        // finished状態からのリセット（Room再利用）
        room.reset();
        break;
    }

    // 3. 更新を永続化
    await this.roomRepository.save(room);

    // 4. WebSocket経由でイベント通知
    if (this.roomEventPublisher) {
      this.roomEventPublisher.publishRoomStateChanged(request.roomId, request.state);

      // recording遷移時: 3秒後のT_startを算出してブロードキャスト
      if (request.state === 'recording') {
        const LEAD_TIME_MS = 3000;
        const startAtServerTime = Date.now() + LEAD_TIME_MS;
        this.roomEventPublisher.publishScheduledRecordingStart(
          request.roomId,
          startAtServerTime
        );
      }
    }
  }
}
