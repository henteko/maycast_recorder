import type { RoomId } from '@maycast/common-types';
import { RoomNotFoundError } from '@maycast/common-types';
import type { IRoomRepository } from '../repositories/IRoomRepository.js';

/**
 * Room削除リクエスト
 */
export interface DeleteRoomRequest {
  roomId: RoomId;
}

/**
 * Room削除 Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. Roomの存在確認
 * 2. Roomを削除
 */
export class DeleteRoomUseCase {
  private roomRepository: IRoomRepository;

  constructor(roomRepository: IRoomRepository) {
    this.roomRepository = roomRepository;
  }

  async execute(request: DeleteRoomRequest): Promise<void> {
    const room = await this.roomRepository.findById(request.roomId);

    if (!room) {
      throw new RoomNotFoundError(`Room not found: ${request.roomId}`);
    }

    await this.roomRepository.delete(request.roomId);
  }
}
