import { RoomNotFoundError, RoomAccessDeniedError } from '@maycast/common-types';
import type { RoomId } from '@maycast/common-types';
import type { IRoomRepository } from '../repositories/IRoomRepository.js';

/**
 * Roomアクセスキー検証リクエスト
 */
export interface ValidateRoomAccessRequest {
  roomId: RoomId;
  accessKey: string;
}

/**
 * Roomアクセスキー検証 Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. Roomを取得
 * 2. accessKeyを検証
 */
export class ValidateRoomAccessUseCase {
  private roomRepository: IRoomRepository;

  constructor(roomRepository: IRoomRepository) {
    this.roomRepository = roomRepository;
  }

  async execute(request: ValidateRoomAccessRequest): Promise<void> {
    const room = await this.roomRepository.findById(request.roomId);

    if (!room) {
      throw new RoomNotFoundError(`Room not found: ${request.roomId}`);
    }

    if (!room.validateAccessKey(request.accessKey)) {
      throw new RoomAccessDeniedError(`Access denied for room: ${request.roomId}`);
    }
  }
}
