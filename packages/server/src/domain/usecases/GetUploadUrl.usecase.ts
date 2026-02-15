import type { RecordingId } from '@maycast/common-types';
import type { UploadUrlResponse } from '@maycast/common-types';
import { RecordingNotFoundError } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository.js';
import type { IPresignedUrlService } from '../services/IPresignedUrlService.js';

export interface GetUploadUrlRequest {
  recordingId: RecordingId;
  type: 'init-segment' | 'chunk';
  chunkId?: number;
}

/**
 * アップロード用Presigned URL取得 Use Case
 *
 * S3バックエンドの場合: クライアントがS3に直接アップロードするためのPresigned URLを返す
 * ローカルバックエンドの場合: directUpload=false を返し、従来のプロキシ方式を使用
 */
export class GetUploadUrlUseCase {
  private recordingRepository: IRecordingRepository;
  private presignedUrlService: IPresignedUrlService;

  constructor(
    recordingRepository: IRecordingRepository,
    presignedUrlService: IPresignedUrlService
  ) {
    this.recordingRepository = recordingRepository;
    this.presignedUrlService = presignedUrlService;
  }

  async execute(request: GetUploadUrlRequest): Promise<UploadUrlResponse> {
    // Recordingの存在確認
    const recording = await this.recordingRepository.findById(request.recordingId);
    if (!recording) {
      throw new RecordingNotFoundError(`Recording not found: ${request.recordingId}`);
    }

    // S3直接アップロードをサポートしていない場合
    if (!this.presignedUrlService.isUploadSupported()) {
      return { directUpload: false };
    }

    const roomId = recording.getRoomId();
    const expiresIn = 900; // 15分

    if (request.type === 'init-segment') {
      const url = await this.presignedUrlService.getInitSegmentUploadUrl(
        request.recordingId,
        roomId,
        expiresIn
      );
      return { directUpload: true, url, expiresIn };
    } else {
      if (request.chunkId === undefined) {
        throw new Error('chunkId is required for chunk upload URL');
      }
      const url = await this.presignedUrlService.getChunkUploadUrl(
        request.recordingId,
        request.chunkId,
        roomId,
        expiresIn
      );
      return { directUpload: true, url, expiresIn };
    }
  }
}
