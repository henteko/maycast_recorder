import { RecordingEntity } from '@maycast/common-types';
import type { RecordingId, Recording } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository';
import { v4 as uuidv4 } from 'uuid';

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
 * 1. 新しいRecording Entityを作成
 * 2. Recordingを永続化
 */
export class CreateRecordingUseCase {
  private recordingRepository: IRecordingRepository;

  constructor(recordingRepository: IRecordingRepository) {
    this.recordingRepository = recordingRepository;
  }

  async execute(): Promise<CreateRecordingResponse> {
    // 1. Recording Entityの作成
    const recordingId = uuidv4();
    const recording = RecordingEntity.create(recordingId);

    // 2. Recording情報の永続化
    await this.recordingRepository.save(recording);

    return {
      recordingId,
      recording: recording.toDTO(),
    };
  }
}
