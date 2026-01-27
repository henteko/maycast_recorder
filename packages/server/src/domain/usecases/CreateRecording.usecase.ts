import { RecordingEntity, RoomNotFoundError } from '@maycast/common-types';
import type { RecordingId, Recording, RoomId } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository';
import type { IRoomRepository } from '../repositories/IRoomRepository';
import { v4 as uuidv4 } from 'uuid';

/**
 * 録画作成リクエスト
 */
export interface CreateRecordingRequest {
  roomId?: RoomId;
}

/**
 * 録画作成レスポンス
 */
export interface CreateRecordingResponse {
  recordingId: RecordingId;
  recording: Recording;
}

/**
 * 録画作成 Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. roomIdが指定されている場合、Roomの存在確認
 * 2. 新しいRecording Entityを作成
 * 3. Recordingを永続化
 * 4. roomIdが指定されている場合、RoomにRecordingを追加
 */
export class CreateRecordingUseCase {
  private recordingRepository: IRecordingRepository;
  private roomRepository: IRoomRepository;

  constructor(
    recordingRepository: IRecordingRepository,
    roomRepository: IRoomRepository
  ) {
    this.recordingRepository = recordingRepository;
    this.roomRepository = roomRepository;
  }

  async execute(request?: CreateRecordingRequest): Promise<CreateRecordingResponse> {
    const roomId = request?.roomId;

    // 1. roomIdが指定されている場合、Roomの存在確認
    if (roomId) {
      const room = await this.roomRepository.findById(roomId);
      if (!room) {
        throw new RoomNotFoundError(`Room not found: ${roomId}`);
      }
    }

    // 2. Recording Entityの作成
    const recordingId = uuidv4();
    const recording = RecordingEntity.create(recordingId, roomId);

    // 3. Recording情報の永続化
    await this.recordingRepository.save(recording);

    // 4. roomIdが指定されている場合、RoomにRecordingを追加
    if (roomId) {
      await this.roomRepository.addRecording(roomId, recordingId);
    }

    return {
      recordingId,
      recording: recording.toDTO(),
    };
  }
}
