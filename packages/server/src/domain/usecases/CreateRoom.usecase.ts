import { RoomEntity } from '@maycast/common-types';
import type { RoomId, Room } from '@maycast/common-types';
import type { IRoomRepository } from '../repositories/IRoomRepository';
import { v4 as uuidv4 } from 'uuid';

/**
 * Room作成レスポンス
 */
export interface CreateRoomResponse {
  roomId: RoomId;
  room: Room;
}

/**
 * Room作成 Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. 新しいRoom Entityを作成
 * 2. Roomを永続化
 */
export class CreateRoomUseCase {
  private roomRepository: IRoomRepository;

  constructor(roomRepository: IRoomRepository) {
    this.roomRepository = roomRepository;
  }

  async execute(): Promise<CreateRoomResponse> {
    // 1. Room Entityの作成
    const roomId = uuidv4();
    const room = RoomEntity.create(roomId);

    // 2. Room情報の永続化
    await this.roomRepository.save(room);

    return {
      roomId,
      room: room.toDTO(),
    };
  }
}
