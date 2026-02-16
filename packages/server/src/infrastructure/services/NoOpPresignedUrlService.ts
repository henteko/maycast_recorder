import type { IPresignedUrlService } from '../../domain/services/IPresignedUrlService.js';

/**
 * NoOp Presigned URL Service
 *
 * ローカルストレージバックエンド用のno-op実装
 * Presigned URLの生成をサポートしない
 */
export class NoOpPresignedUrlService implements IPresignedUrlService {
  isSupported(): boolean {
    return false;
  }

  async getInitSegmentUrl(): Promise<string> {
    throw new Error('Presigned URLs are not supported with local storage backend');
  }

  async getChunkUrl(): Promise<string> {
    throw new Error('Presigned URLs are not supported with local storage backend');
  }

  isUploadSupported(): boolean {
    return false;
  }

  async getInitSegmentUploadUrl(): Promise<string> {
    throw new Error('Upload presigned URLs are not supported with local storage backend');
  }

  async getChunkUploadUrl(): Promise<string> {
    throw new Error('Upload presigned URLs are not supported with local storage backend');
  }
}
