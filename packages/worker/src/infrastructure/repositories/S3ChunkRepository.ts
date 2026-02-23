import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import type { S3StorageConfig } from '../config/storageConfig.js';

/**
 * S3からfMP4チャンクをダウンロードするリポジトリ（Worker用・読み取り専用）
 *
 * Key Structure:
 * - Without roomId: {recordingId}/init.fmp4, {recordingId}/{chunkId}.fmp4
 * - With roomId: rooms/{roomId}/{recordingId}/init.fmp4, rooms/{roomId}/{recordingId}/{chunkId}.fmp4
 */
export class S3ChunkRepository {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  private getPrefix(recordingId: string, roomId?: string): string {
    if (roomId) {
      return `rooms/${roomId}/${recordingId}`;
    }
    return recordingId;
  }

  async getInitSegment(recordingId: string, roomId?: string): Promise<Buffer | null> {
    const key = `${this.getPrefix(recordingId, roomId)}/init.fmp4`;
    return this.getObject(key);
  }

  async getChunk(recordingId: string, chunkId: number, roomId?: string): Promise<Buffer | null> {
    const key = `${this.getPrefix(recordingId, roomId)}/${chunkId}.fmp4`;
    return this.getObject(key);
  }

  async listChunkIds(recordingId: string, roomId?: string): Promise<number[]> {
    const prefix = `${this.getPrefix(recordingId, roomId)}/`;
    const chunkIds: number[] = [];

    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (!obj.Key) continue;

          const fileName = obj.Key.slice(prefix.length);

          // init.fmp4, output.mp4, audio.m4a は除外
          if (fileName === 'init.fmp4') continue;
          if (!fileName.endsWith('.fmp4')) continue;

          const idStr = fileName.replace('.fmp4', '');
          const numericId = parseInt(idStr, 10);
          if (!isNaN(numericId)) {
            chunkIds.push(numericId);
          }
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return chunkIds.sort((a, b) => a - b);
  }

  private async getObject(key: string): Promise<Buffer | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      if (!response.Body) return null;

      const byteArray = await response.Body.transformToByteArray();
      return Buffer.from(byteArray);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }
}
