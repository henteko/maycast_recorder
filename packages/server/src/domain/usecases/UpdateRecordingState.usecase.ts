import type { RecordingId, RecordingState } from '@maycast/common-types';
import { RecordingNotFoundError } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository';

/**
 * 録画状態更新リクエスト
 */
export interface UpdateRecordingStateRequest {
  recordingId: RecordingId;
  state: RecordingState;
}

/**
 * 録画状態更新 Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. Recordingを取得
 * 2. Entityのビジネスルールで状態遷移
 * 3. 状態を永続化
 */
export class UpdateRecordingStateUseCase {
  private recordingRepository: IRecordingRepository;

  constructor(recordingRepository: IRecordingRepository) {
    this.recordingRepository = recordingRepository;
  }

  async execute(request: UpdateRecordingStateRequest): Promise<void> {
    const recording = await this.recordingRepository.findById(request.recordingId);

    if (!recording) {
      throw new RecordingNotFoundError(`Recording not found: ${request.recordingId}`);
    }

    // Entityのビジネスルールで状態遷移
    switch (request.state) {
      case 'recording':
        recording.startRecording();
        break;
      case 'finalizing':
        recording.finalize();
        break;
      case 'synced':
        recording.markAsSynced();
        break;
      default:
        // standbyへの遷移は許可しない
        throw new Error(`Invalid state transition to: ${request.state}`);
    }

    await this.recordingRepository.updateState(request.recordingId, recording.getState());
  }
}
