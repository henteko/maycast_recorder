import type { RecordingId, DownloadUrlsResponse } from '@maycast/common-types';
import { RecordingNotFoundError } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository.js';
import type { IChunkRepository } from '../repositories/IChunkRepository.js';
import type { IPresignedUrlService } from '../services/IPresignedUrlService.js';

export interface GetDownloadUrlsRequest {
  recordingId: RecordingId;
  serverBaseUrl: string;
}

/**
 * ダウンロードURL取得 Use Case
 *
 * S3バックエンドの場合はPresigned URLを返し、
 * ローカルバックエンドの場合は既存のサーバー経由ダウンロードURLを返す
 */
export class GetDownloadUrlsUseCase {
  constructor(
    private recordingRepository: IRecordingRepository,
    private chunkRepository: IChunkRepository,
    private presignedUrlService: IPresignedUrlService
  ) {}

  async execute(request: GetDownloadUrlsRequest): Promise<DownloadUrlsResponse> {
    // 1. Recordingの存在確認
    const recording = await this.recordingRepository.findById(request.recordingId);
    if (!recording) {
      throw new RecordingNotFoundError(`Recording not found: ${request.recordingId}`);
    }

    const roomId = recording.getRoomId();

    // 2. ファイル名を生成
    const timestamp = recording.getCreatedAt().toISOString().replace(/[:.]/g, '-');
    const participantName = recording.getMetadata()?.participantName;
    const filename = participantName
      ? `${participantName}-${timestamp}.mp4`
      : `recording-${timestamp}.mp4`;

    // 3. Presigned URLサポートチェック
    if (!this.presignedUrlService.isSupported()) {
      return {
        directDownload: false,
        filename,
        downloadUrl: `${request.serverBaseUrl}/api/recordings/${request.recordingId}/download`,
      };
    }

    // 4. チャンクID一覧を取得
    const chunkIds = await this.chunkRepository.listChunkIds(request.recordingId, roomId);

    // 5. Presigned URL生成
    const expiresIn = 3600;
    const initSegmentUrl = await this.presignedUrlService.getInitSegmentUrl(
      request.recordingId,
      roomId,
      expiresIn
    );

    const chunks = await Promise.all(
      chunkIds.map(async (chunkId) => ({
        url: await this.presignedUrlService.getChunkUrl(
          request.recordingId,
          chunkId,
          roomId,
          expiresIn
        ),
        chunkId,
      }))
    );

    // 6. ソート済みレスポンス
    chunks.sort((a, b) => a.chunkId - b.chunkId);

    // 7. Processing済みm4aのURL生成（存在する場合）
    let m4aUrl: string | undefined;
    let m4aFilename: string | undefined;
    const processingInfo = await this.recordingRepository.getProcessingInfo(request.recordingId);
    if (processingInfo?.processingState === 'completed' && processingInfo.outputM4aKey) {
      m4aUrl = await this.presignedUrlService.getPresignedUrlForKey(
        processingInfo.outputM4aKey,
        expiresIn
      );
      m4aFilename = participantName
        ? `${participantName}-${timestamp}.m4a`
        : `recording-${timestamp}.m4a`;
    }

    // 8. Transcription済みVTTのURL生成（存在する場合）
    let vttUrl: string | undefined;
    let vttFilename: string | undefined;
    const transcriptionInfo = await this.recordingRepository.getTranscriptionInfo(request.recordingId);
    if (transcriptionInfo?.transcriptionState === 'completed' && transcriptionInfo.outputVttKey) {
      vttUrl = await this.presignedUrlService.getPresignedUrlForKey(
        transcriptionInfo.outputVttKey,
        expiresIn
      );
      vttFilename = participantName
        ? `${participantName}-${timestamp}.vtt`
        : `recording-${timestamp}.vtt`;
    }

    return {
      directDownload: true,
      filename,
      initSegment: { url: initSegmentUrl },
      chunks,
      totalChunks: chunks.length,
      expiresIn,
      m4aUrl,
      m4aFilename,
      vttUrl,
      vttFilename,
    };
  }
}
