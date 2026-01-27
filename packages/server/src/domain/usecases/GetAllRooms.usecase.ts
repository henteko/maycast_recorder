import type { Room } from '@maycast/common-types';
import type { IRoomRepository } from '../repositories/IRoomRepository';

/**
 * 全Room取得 Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. すべてのRoomを取得
 * 2. DTOに変換して返す
 */
export class GetAllRoomsUseCase {
  private roomRepository: IRoomRepository;

  constructor(roomRepository: IRoomRepository) {
    this.roomRepository = roomRepository;
  }

  async execute(): Promise<Room[]> {
    const rooms = await this.roomRepository.findAll();
    return rooms.map((room) => room.toDTO());
  }
}
