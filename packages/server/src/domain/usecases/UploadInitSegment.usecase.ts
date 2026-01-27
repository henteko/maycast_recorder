import type { RecordingId } from '@maycast/common-types';
import { RecordingNotFoundError, InvalidChunkError } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository';
import type { IChunkRepository } from '../repositories/IChunkRepository';

/**
 * Init Segmentアップロードリクエスト
 */
export interface UploadInitSegmentRequest {
  recordingId: RecordingId;
  data: Buffer;
}

/**
 * Init Segmentアップロード Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. Recordingの存在確認
 * 2. Init Segmentデータの検証
 * 3. Init Segmentを保存
 */
export class UploadInitSegmentUseCase {
  private recordingRepository: IRecordingRepository;
  private chunkRepository: IChunkRepository;

  constructor(
    recordingRepository: IRecordingRepository,
    chunkRepository: IChunkRepository
  ) {
    this.recordingRepository = recordingRepository;
    this.chunkRepository = chunkRepository;
  }

  async execute(request: UploadInitSegmentRequest): Promise<void> {
    // 1. Recordingの存在確認
    const recording = await this.recordingRepository.findById(request.recordingId);
    if (!recording) {
      throw new RecordingNotFoundError(`Recording not found: ${request.recordingId}`);
    }

    // 2. Init Segmentデータの検証
    if (request.data.byteLength === 0) {
      throw new InvalidChunkError('Init segment data is empty');
    }

    // 3. Init Segmentを保存 (roomIdがある場合はRoom用ストレージパスを使用)
    const roomId = recording.getRoomId();
    await this.chunkRepository.saveInitSegment(request.recordingId, request.data, roomId);
  }
}
