import type { RoomId, Room } from '@maycast/common-types';
import type { IRoomRepository } from '../repositories/IRoomRepository.js';

/**
 * Room取得リクエスト
 */
export interface GetRoomRequest {
  roomId: RoomId;
}

/**
 * Room取得 Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. Roomを取得
 * 2. DTOに変換して返す
 */
export class GetRoomUseCase {
  private roomRepository: IRoomRepository;

  constructor(roomRepository: IRoomRepository) {
    this.roomRepository = roomRepository;
  }

  async execute(request: GetRoomRequest): Promise<Room | null> {
    const room = await this.roomRepository.findById(request.roomId);

    if (!room) {
      return null;
    }

    return room.toDTO();
  }
}
