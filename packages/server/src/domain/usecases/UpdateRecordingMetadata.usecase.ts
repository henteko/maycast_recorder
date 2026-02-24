import type { RecordingId, RecordingMetadata } from '@maycast/common-types';
import { RecordingNotFoundError } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository.js';

/**
 * 録画メタデータ更新リクエスト
 */
export interface UpdateRecordingMetadataRequest {
  recordingId: RecordingId;
  metadata: RecordingMetadata;
}

/**
 * 録画メタデータ更新 Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. Recordingを取得
 * 2. メタデータを設定
 * 3. メタデータを永続化
 */
export class UpdateRecordingMetadataUseCase {
  private recordingRepository: IRecordingRepository;

  constructor(recordingRepository: IRecordingRepository) {
    this.recordingRepository = recordingRepository;
  }

  async execute(request: UpdateRecordingMetadataRequest): Promise<void> {
    const recording = await this.recordingRepository.findById(request.recordingId);

    if (!recording) {
      throw new RecordingNotFoundError(`Recording not found: ${request.recordingId}`);
    }

    // 既存のメタデータとマージ（participantName等の既存フィールドを保持）
    const existingMetadata = recording.getMetadata() || {};
    const mergedMetadata = { ...existingMetadata, ...request.metadata };

    // Entityのビジネスルールでメタデータ設定
    recording.setMetadata(mergedMetadata);

    await this.recordingRepository.updateMetadata(request.recordingId, mergedMetadata);
  }
}
