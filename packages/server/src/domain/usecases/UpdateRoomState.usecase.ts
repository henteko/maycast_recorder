import type { RoomId, RoomState } from '@maycast/common-types';
import { RoomNotFoundError } from '@maycast/common-types';
import type { IRoomRepository } from '../repositories/IRoomRepository';

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
 */
export class UpdateRoomStateUseCase {
  private roomRepository: IRoomRepository;

  constructor(roomRepository: IRoomRepository) {
    this.roomRepository = roomRepository;
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
      case 'finished':
        room.finalize();
        break;
      case 'idle':
        // idle への遷移は新規作成時のみ
        throw new RoomNotFoundError(
          `Cannot transition to 'idle' state. This state is only valid at creation.`
        );
    }

    // 3. 更新を永続化
    await this.roomRepository.save(room);
  }
}
