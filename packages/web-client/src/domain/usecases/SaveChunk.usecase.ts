import type { RecordingId, ChunkId } from '@maycast/common-types';
import { InvalidChunkError } from '@maycast/common-types';
import type { IChunkRepository } from '../repositories/IChunkRepository';
import type { IUploadStrategy } from '../services/IUploadStrategy';

/**
 * チャンク保存リクエスト
 */
export interface SaveChunkRequest {
  recordingId: RecordingId;
  data: ArrayBuffer;
  timestamp: number;
  isInitSegment: boolean;
  hash?: string;
  hasKeyframe?: boolean;
}

/**
 * チャンク保存レスポンス
 */
export interface SaveChunkResponse {
  chunkId: ChunkId;
}

/**
 * チャンク保存 Use Case
 *
 * ビジネスフロー:
 * 1. チャンクの検証
 * 2. ローカルストレージに保存
 * 3. アップロード戦略に委譲（Remote modeの場合のみアップロード）
 */
export class SaveChunkUseCase {
  private chunkRepository: IChunkRepository;
  private uploadStrategy: IUploadStrategy;

  constructor(
    chunkRepository: IChunkRepository,
    uploadStrategy: IUploadStrategy
  ) {
    this.chunkRepository = chunkRepository;
    this.uploadStrategy = uploadStrategy;
  }

  async execute(request: SaveChunkRequest): Promise<SaveChunkResponse> {
    // 1. チャンクの検証
    if (request.data.byteLength === 0) {
      throw new InvalidChunkError('Chunk data is empty');
    }

    if (request.timestamp < 0) {
      throw new InvalidChunkError('Chunk timestamp must be non-negative');
    }

    // 2. ローカル保存
    let chunkId: ChunkId;
    if (request.isInitSegment) {
      await this.chunkRepository.saveInitSegment(request.recordingId, request.data);
      chunkId = -1; // Init Segmentは特別なID
    } else {
      chunkId = await this.chunkRepository.save({
        recordingId: request.recordingId,
        data: request.data,
        timestamp: request.timestamp,
        isInitSegment: request.isInitSegment,
        hash: request.hash,
        hasKeyframe: request.hasKeyframe,
      });
    }

    // 3. アップロード戦略に委譲（Remote modeの場合のみ実行）
    try {
      await this.uploadStrategy.upload({
        recordingId: request.recordingId,
        chunkId,
        data: request.data,
        isInitSegment: request.isInitSegment,
      });
    } catch (error) {
      // アップロード失敗してもローカル保存は成功
      console.warn('Upload failed, but chunk saved locally:', error);
    }

    return { chunkId };
  }
}
