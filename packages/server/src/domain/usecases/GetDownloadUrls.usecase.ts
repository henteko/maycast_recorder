import type { RecordingId } from '@maycast/common-types';
import { RecordingNotFoundError } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository.js';
import type { IChunkRepository, ChunkDownloadUrl } from '../repositories/IChunkRepository.js';

/**
 * ダウンロードURL取得リクエスト
 */
export interface GetDownloadUrlsRequest {
  recordingId: RecordingId;
  expiresInSeconds?: number;
}

/**
 * ダウンロードURL取得レスポンス
 */
export interface GetDownloadUrlsResponse {
  recordingId: RecordingId;
  filename: string;
  chunks: ChunkDownloadUrl[];
}

/**
 * ダウンロードURL取得 Use Case
 *
 * クラウドストレージ（S3互換）の署名付きURLを生成し、
 * クライアントが直接クラウドからチャンクをストリーミングダウンロードできるようにする。
 *
 * ローカルストレージの場合はnullを返し、クライアントは従来のサーバープロキシ方式にフォールバックする。
 */
export class GetDownloadUrlsUseCase {
  private recordingRepository: IRecordingRepository;
  private chunkRepository: IChunkRepository;

  constructor(
    recordingRepository: IRecordingRepository,
    chunkRepository: IChunkRepository
  ) {
    this.recordingRepository = recordingRepository;
    this.chunkRepository = chunkRepository;
  }

  async execute(request: GetDownloadUrlsRequest): Promise<GetDownloadUrlsResponse | null> {
    // 1. Recordingの存在確認
    const recording = await this.recordingRepository.findById(request.recordingId);
    if (!recording) {
      throw new RecordingNotFoundError(`Recording not found: ${request.recordingId}`);
    }

    // roomIdを取得（Room用ストレージパスに使用）
    const roomId = recording.getRoomId();

    // 2. 署名付きURLを生成
    const urls = await this.chunkRepository.generateDownloadUrls(
      request.recordingId,
      roomId,
      request.expiresInSeconds
    );

    // ローカルストレージの場合はnull
    if (!urls) {
      return null;
    }

    // 3. ファイル名を生成
    const timestamp = recording.getCreatedAt().toISOString().replace(/[:.]/g, '-');
    const filename = `recording-${timestamp}.mp4`;

    return {
      recordingId: request.recordingId,
      filename,
      chunks: urls,
    };
  }
}
