import type { RecordingId, RecordingMetadata } from '@maycast/common-types';
import { RecordingNotFoundError } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository';
import type { IUploadStrategy } from '../services/IUploadStrategy';

/**
 * 録画完了リクエスト
 */
export interface CompleteRecordingRequest {
  recordingId: RecordingId;
  metadata?: RecordingMetadata;
}

/**
 * 録画完了 Use Case
 *
 * ビジネスフロー:
 * 1. Recording Entityの取得
 * 2. メタデータの設定（オプション）
 * 3. 状態をfinalizingに遷移
 * 4. 残りのチャンクのアップロード完了を待つ
 * 5. 状態をsyncedに遷移
 */
export class CompleteRecordingUseCase {
  private recordingRepository: IRecordingRepository;
  private uploadStrategy: IUploadStrategy;

  constructor(
    recordingRepository: IRecordingRepository,
    uploadStrategy: IUploadStrategy
  ) {
    this.recordingRepository = recordingRepository;
    this.uploadStrategy = uploadStrategy;
  }

  async execute(request: CompleteRecordingRequest): Promise<void> {
    // 1. Recording Entityの取得
    const recording = await this.recordingRepository.findById(request.recordingId);
    if (!recording) {
      throw new RecordingNotFoundError(
        `Recording not found: ${request.recordingId}`
      );
    }

    // 2. メタデータの設定
    if (request.metadata) {
      recording.setMetadata(request.metadata);
      await this.recordingRepository.updateMetadata(
        request.recordingId,
        request.metadata
      );
    }

    // 3. 状態をfinalizingに遷移
    recording.finalize();
    await this.recordingRepository.updateState(
      request.recordingId,
      recording.getState()
    );

    // 4. 残りのチャンクのアップロード完了を待つ（Remote modeの場合）
    if (this.uploadStrategy.waitForCompletion) {
      try {
        await this.uploadStrategy.waitForCompletion();
      } catch (error) {
        console.warn('Upload completion failed:', error);
        // アップロード失敗してもローカルには保存されているので続行
      }
    }

    // 5. 状態をsyncedに遷移
    recording.markAsSynced();
    await this.recordingRepository.updateState(
      request.recordingId,
      recording.getState()
    );
  }
}
