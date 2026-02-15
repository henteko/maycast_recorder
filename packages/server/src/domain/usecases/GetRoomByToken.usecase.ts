import type { Room } from '@maycast/common-types';
import type { IRoomRepository } from '../repositories/IRoomRepository.js';

/**
 * アクセストークンによるRoom取得リクエスト
 */
export interface GetRoomByTokenRequest {
  accessToken: string;
}

/**
 * アクセストークンによるRoom取得 Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. アクセストークンでRoomを検索
 * 2. DTOに変換して返す
 */
export class GetRoomByTokenUseCase {
  private roomRepository: IRoomRepository;

  constructor(roomRepository: IRoomRepository) {
    this.roomRepository = roomRepository;
  }

  async execute(request: GetRoomByTokenRequest): Promise<Room | null> {
    const room = await this.roomRepository.findByAccessToken(request.accessToken);

    if (!room) {
      return null;
    }

    return room.toDTO();
  }
}
