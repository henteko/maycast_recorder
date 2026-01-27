import type { RoomId, Recording } from '@maycast/common-types';
import { RoomNotFoundError } from '@maycast/common-types';
import type { IRoomRepository } from '../repositories/IRoomRepository';
import type { IRecordingRepository } from '../repositories/IRecordingRepository';

/**
 * Room内Recording一覧取得リクエスト
 */
export interface GetRoomRecordingsRequest {
  roomId: RoomId;
}

/**
 * Room内Recording一覧取得レスポンス
 */
export interface GetRoomRecordingsResponse {
  roomId: RoomId;
  recordings: Recording[];
}

/**
 * Room内Recording一覧取得 Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. Roomを取得
 * 2. Room内のRecording IDsを取得
 * 3. 各Recordingを取得してDTOに変換
 */
export class GetRoomRecordingsUseCase {
  private roomRepository: IRoomRepository;
  private recordingRepository: IRecordingRepository;

  constructor(
    roomRepository: IRoomRepository,
    recordingRepository: IRecordingRepository
  ) {
    this.roomRepository = roomRepository;
    this.recordingRepository = recordingRepository;
  }

  async execute(request: GetRoomRecordingsRequest): Promise<GetRoomRecordingsResponse> {
    // 1. Roomを取得
    const room = await this.roomRepository.findById(request.roomId);

    if (!room) {
      throw new RoomNotFoundError(`Room not found: ${request.roomId}`);
    }

    // 2. Room内のRecording IDsを取得
    const recordingIds = room.getRecordingIds();

    // 3. 各Recordingを取得してDTOに変換
    const recordings: Recording[] = [];
    for (const recordingId of recordingIds) {
      const recording = await this.recordingRepository.findById(recordingId);
      if (recording) {
        recordings.push(recording.toDTO());
      }
    }

    return {
      roomId: request.roomId,
      recordings,
    };
  }
}
