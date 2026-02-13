import type { RecordingId } from '@maycast/common-types';
import { RecordingNotFoundError } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository.js';
import type { IChunkRepository } from '../repositories/IChunkRepository.js';
import { Readable } from 'stream';

/**
 * ダウンロードリクエスト
 */
export interface DownloadRecordingRequest {
  recordingId: RecordingId;
}

/**
 * ダウンロードレスポンス
 */
export interface DownloadRecordingResponse {
  stream: Readable;
  filename: string;
}

/**
 * 録画ダウンロード Use Case (Server-side)
 *
 * ビジネスフロー:
 * 1. Recordingの存在確認
 * 2. Init Segmentとすべてのチャンクを取得
 * 3. ストリームとして結合
 * 4. ファイル名を生成
 */
export class DownloadRecordingUseCase {
  private recordingRepository: IRecordingRepository;
  private chunkRepository: IChunkRepository;

  constructor(
    recordingRepository: IRecordingRepository,
    chunkRepository: IChunkRepository
  ) {
    this.recordingRepository = recordingRepository;
    this.chunkRepository = chunkRepository;
  }

  async execute(request: DownloadRecordingRequest): Promise<DownloadRecordingResponse> {
    // 1. Recordingの存在確認
    const recording = await this.recordingRepository.findById(request.recordingId);
    if (!recording) {
      throw new RecordingNotFoundError(`Recording not found: ${request.recordingId}`);
    }

    // roomIdを取得（Room用ストレージパスに使用）
    const roomId = recording.getRoomId();

    // 2. Init Segmentとすべてのチャンクを取得
    const initSegment = await this.chunkRepository.getInitSegment(request.recordingId, roomId);
    if (!initSegment) {
      throw new Error('Init segment not found');
    }

    const chunkIds = await this.chunkRepository.listChunkIds(request.recordingId, roomId);

    // 3. ストリームとして結合
    const chunks: Buffer[] = [initSegment];

    for (const chunkId of chunkIds.sort((a, b) => Number(a) - Number(b))) {
      const chunk = await this.chunkRepository.getChunk(request.recordingId, chunkId, roomId);
      if (chunk) {
        chunks.push(chunk);
      }
    }

    const combinedBuffer = Buffer.concat(chunks);
    const stream = Readable.from(combinedBuffer);

    // 4. ファイル名を生成
    const timestamp = recording.getCreatedAt().toISOString().replace(/[:.]/g, '-');
    const filename = `recording-${timestamp}.mp4`;

    return { stream, filename };
  }
}
