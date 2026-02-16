import type { RecordingId, ChunkId } from '@maycast/common-types';
import { RecordingNotFoundError } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository.js';

export interface ConfirmChunkUploadRequest {
  recordingId: RecordingId;
  type: 'init-segment' | 'chunk';
  chunkId?: ChunkId;
}

/**
 * チャンクアップロード確認 Use Case
 *
 * クライアントがS3に直接アップロードした後、サーバーに完了を通知する
 * チャンクの場合はチャンク数をインクリメントする
 */
export class ConfirmChunkUploadUseCase {
  private recordingRepository: IRecordingRepository;

  constructor(recordingRepository: IRecordingRepository) {
    this.recordingRepository = recordingRepository;
  }

  async execute(request: ConfirmChunkUploadRequest): Promise<void> {
    // Recordingの存在確認
    const recording = await this.recordingRepository.findById(request.recordingId);
    if (!recording) {
      throw new RecordingNotFoundError(`Recording not found: ${request.recordingId}`);
    }

    // チャンクの場合はカウントをインクリメント
    if (request.type === 'chunk') {
      await this.recordingRepository.incrementChunkCount(request.recordingId);
    }
  }
}
