import type { RecordingId } from '@maycast/common-types';
import { RecordingNotFoundError } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository';
import type { IChunkRepository } from '../repositories/IChunkRepository';

/**
 * ダウンロードリクエスト
 */
export interface DownloadRecordingRequest {
  recordingId: RecordingId;
  onProgress?: (progress: { current: number; total: number }) => void;
}

/**
 * ダウンロードレスポンス
 */
export interface DownloadRecordingResponse {
  blob: Blob;
  filename: string;
}

/**
 * 録画ダウンロード Use Case
 *
 * ビジネスフロー:
 * 1. Recordingの存在確認
 * 2. Init Segmentとすべてのチャンクを取得
 * 3. チャンクを結合してBlobを生成
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
      throw new RecordingNotFoundError(
        `Recording not found: ${request.recordingId}`
      );
    }

    // 2. Init Segmentとすべてのチャンクを取得
    const initSegment = await this.chunkRepository.getInitSegment(request.recordingId);
    if (!initSegment) {
      throw new Error('Init segment not found');
    }

    const chunkMetadataList = await this.chunkRepository.findAllByRecording(
      request.recordingId
    );

    // チャンクIDでソート（数値順）
    const sortedChunks = chunkMetadataList
      .filter((m) => m.chunkId !== -1) // Init Segmentを除外
      .sort((a, b) => {
        const idA = typeof a.chunkId === 'number' ? a.chunkId : parseInt(String(a.chunkId), 10);
        const idB = typeof b.chunkId === 'number' ? b.chunkId : parseInt(String(b.chunkId), 10);
        return idA - idB;
      });

    // 3. チャンクを結合
    const total = 1 + sortedChunks.length; // init segment + chunks
    let current = 0;

    const chunks: ArrayBuffer[] = [initSegment];
    current++;
    request.onProgress?.({ current, total });

    for (const metadata of sortedChunks) {
      const chunkData = await this.chunkRepository.findById(
        request.recordingId,
        metadata.chunkId
      );
      if (chunkData) {
        chunks.push(chunkData);
      }
      current++;
      request.onProgress?.({ current, total });
    }

    const blob = new Blob(chunks, { type: 'video/mp4' });

    // 4. ファイル名を生成
    const timestamp = recording.getCreatedAt().toISOString().replace(/[:.]/g, '-');
    const filename = `recording-${timestamp}.mp4`;

    return { blob, filename };
  }
}
