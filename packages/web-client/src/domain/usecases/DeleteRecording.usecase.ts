import type { RecordingId } from '@maycast/common-types';
import { RecordingNotFoundError } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository';
import type { IChunkRepository } from '../repositories/IChunkRepository';

/**
 * 録画削除リクエスト
 */
export interface DeleteRecordingRequest {
  recordingId: RecordingId;
}

/**
 * 録画削除 Use Case
 *
 * ビジネスフロー:
 * 1. Recordingの存在確認
 * 2. すべてのチャンクを削除
 * 3. Recordingメタデータを削除
 */
export class DeleteRecordingUseCase {
  private recordingRepository: IRecordingRepository;
  private chunkRepository: IChunkRepository;

  constructor(
    recordingRepository: IRecordingRepository,
    chunkRepository: IChunkRepository
  ) {
    this.recordingRepository = recordingRepository;
    this.chunkRepository = chunkRepository;
  }

  async execute(request: DeleteRecordingRequest): Promise<void> {
    // 1. Recordingの存在確認
    const recording = await this.recordingRepository.findById(request.recordingId);
    if (!recording) {
      throw new RecordingNotFoundError(
        `Recording not found: ${request.recordingId}`
      );
    }

    // 2. すべてのチャンクを削除
    await this.chunkRepository.deleteAllByRecording(request.recordingId);

    // 3. Recordingメタデータを削除
    await this.recordingRepository.delete(request.recordingId);
  }
}
