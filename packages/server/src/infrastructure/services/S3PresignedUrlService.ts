import type { RecordingId, RoomId } from '@maycast/common-types';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IPresignedUrlService } from '../../domain/services/IPresignedUrlService.js';
import type { S3StorageConfig } from '../config/storageConfig.js';

const DEFAULT_EXPIRES_IN = 3600; // 1時間

/**
 * S3 Presigned URL Service
 *
 * S3互換ストレージのPresigned URLを生成する
 * S3ChunkRepositoryと同じキー構造を使用
 *
 * publicEndpointが設定されている場合、Presigned URLはそのエンドポイントで生成される
 * （開発環境でnginx経由でアクセスする場合等）
 */
export class S3PresignedUrlService implements IPresignedUrlService {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    // Presigned URL用は publicEndpoint を優先（ブラウザからアクセス可能なURL）
    const endpoint = config.publicEndpoint || config.endpoint;
    this.client = new S3Client({
      endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  isSupported(): boolean {
    return true;
  }

  private getPrefix(recordingId: RecordingId, roomId?: RoomId): string {
    if (roomId) {
      return `rooms/${roomId}/${recordingId}`;
    }
    return recordingId;
  }

  async getInitSegmentUrl(
    recordingId: RecordingId,
    roomId?: RoomId,
    expiresIn: number = DEFAULT_EXPIRES_IN
  ): Promise<string> {
    const key = `${this.getPrefix(recordingId, roomId)}/init.fmp4`;
    return this.generatePresignedUrl(key, expiresIn);
  }

  async getChunkUrl(
    recordingId: RecordingId,
    chunkId: number,
    roomId?: RoomId,
    expiresIn: number = DEFAULT_EXPIRES_IN
  ): Promise<string> {
    const key = `${this.getPrefix(recordingId, roomId)}/${chunkId}.fmp4`;
    return this.generatePresignedUrl(key, expiresIn);
  }

  private async generatePresignedUrl(key: string, expiresIn: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }
}
