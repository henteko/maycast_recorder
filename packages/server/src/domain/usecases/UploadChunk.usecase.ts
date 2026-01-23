import type { RecordingId, ChunkId } from '@maycast/common-types';
import { RecordingNotFoundError, InvalidChunkError } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository';
import type { IChunkRepository } from '../repositories/IChunkRepository';

/**
 * チャンクアップロードリクエスト
 */
export interface UploadChunkRequest {
  recordingId: RecordingId;
  chunkId: ChunkId;
  data: Buffer;
  hash?: string;
}

/**
 * チャンクアップロード Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. Recordingの存在確認
 * 2. チャンクデータの検証
 * 3. チャンクを保存
 * 4. チャンク数を増加
 */
export class UploadChunkUseCase {
  private recordingRepository: IRecordingRepository;
  private chunkRepository: IChunkRepository;

  constructor(
    recordingRepository: IRecordingRepository,
    chunkRepository: IChunkRepository
  ) {
    this.recordingRepository = recordingRepository;
    this.chunkRepository = chunkRepository;
  }

  async execute(request: UploadChunkRequest): Promise<void> {
    // 1. Recordingの存在確認
    const recording = await this.recordingRepository.findById(request.recordingId);
    if (!recording) {
      throw new RecordingNotFoundError(`Recording not found: ${request.recordingId}`);
    }

    // 2. チャンクデータの検証
    if (request.data.byteLength === 0) {
      throw new InvalidChunkError('Chunk data is empty');
    }

    // 3. チャンクを保存
    await this.chunkRepository.saveChunk(request.recordingId, request.chunkId, request.data);

    // 4. チャンク数を増加
    await this.recordingRepository.incrementChunkCount(request.recordingId);
  }
}
