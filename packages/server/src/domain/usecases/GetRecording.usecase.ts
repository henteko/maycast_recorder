import type { RecordingId, Recording } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository.js';

/**
 * 録画取得リクエスト
 */
export interface GetRecordingRequest {
  recordingId: RecordingId;
}

/**
 * 録画取得 Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. Recordingを取得
 * 2. DTOに変換して返す
 */
export class GetRecordingUseCase {
  private recordingRepository: IRecordingRepository;

  constructor(recordingRepository: IRecordingRepository) {
    this.recordingRepository = recordingRepository;
  }

  async execute(request: GetRecordingRequest): Promise<Recording | null> {
    const recording = await this.recordingRepository.findById(request.recordingId);

    if (!recording) {
      return null;
    }

    return recording.toDTO();
  }
}
