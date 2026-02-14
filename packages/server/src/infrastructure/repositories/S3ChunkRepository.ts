import type { RecordingId, ChunkId, RoomId } from '@maycast/common-types';
import type { IChunkRepository, ChunkDownloadUrl } from '../../domain/repositories/IChunkRepository.js';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3StorageConfig } from '../config/storageConfig.js';

/**
 * S3互換ストレージ Chunk Repository の実装
 *
 * Cloudflare R2, LocalStack, AWS S3 に対応
 *
 * Key Structure:
 * - Without roomId: {recordingId}/init.fmp4, {recordingId}/{chunkId}.fmp4
 * - With roomId: rooms/{roomId}/{recordingId}/init.fmp4, rooms/{roomId}/{recordingId}/{chunkId}.fmp4
 */
export class S3ChunkRepository implements IChunkRepository {
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

  private getPrefix(recordingId: RecordingId, roomId?: RoomId): string {
    if (roomId) {
      return `rooms/${roomId}/${recordingId}`;
    }
    return recordingId;
  }

  private getInitSegmentKey(recordingId: RecordingId, roomId?: RoomId): string {
    return `${this.getPrefix(recordingId, roomId)}/init.fmp4`;
  }

  private getChunkKey(recordingId: RecordingId, chunkId: ChunkId, roomId?: RoomId): string {
    return `${this.getPrefix(recordingId, roomId)}/${chunkId}.fmp4`;
  }

  async saveInitSegment(recordingId: RecordingId, data: Buffer, roomId?: RoomId): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.getInitSegmentKey(recordingId, roomId),
        Body: data,
      })
    );
  }

  async getInitSegment(recordingId: RecordingId, roomId?: RoomId): Promise<Buffer | null> {
    return this.getObject(this.getInitSegmentKey(recordingId, roomId));
  }

  async saveChunk(
    recordingId: RecordingId,
    chunkId: ChunkId,
    data: Buffer,
    roomId?: RoomId
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.getChunkKey(recordingId, chunkId, roomId),
        Body: data,
      })
    );
  }

  async getChunk(
    recordingId: RecordingId,
    chunkId: ChunkId,
    roomId?: RoomId
  ): Promise<Buffer | null> {
    return this.getObject(this.getChunkKey(recordingId, chunkId, roomId));
  }

  async listChunkIds(recordingId: RecordingId, roomId?: RoomId): Promise<ChunkId[]> {
    const prefix = `${this.getPrefix(recordingId, roomId)}/`;
    const chunkIds: ChunkId[] = [];

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

          // init.fmp4 は除外
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

    return chunkIds.sort((a, b) => Number(a) - Number(b));
  }

  async deleteAllChunks(recordingId: RecordingId, roomId?: RoomId): Promise<void> {
    const prefix = `${this.getPrefix(recordingId, roomId)}/`;

    let continuationToken: string | undefined;
    do {
      const listResponse = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        // DeleteObjects は最大1000件まで
        const objects = listResponse.Contents.filter((obj) => obj.Key).map((obj) => ({
          Key: obj.Key!,
        }));

        if (objects.length > 0) {
          await this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: { Objects: objects },
            })
          );
        }
      }

      continuationToken = listResponse.IsTruncated
        ? listResponse.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  async generateDownloadUrls(
    recordingId: RecordingId,
    roomId?: RoomId,
    expiresInSeconds: number = 3600
  ): Promise<ChunkDownloadUrl[]> {
    const urls: ChunkDownloadUrl[] = [];

    // Init Segment の署名付きURL
    const initKey = this.getInitSegmentKey(recordingId, roomId);
    const initUrl = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: initKey }),
      { expiresIn: expiresInSeconds }
    );
    urls.push({ type: 'init', url: initUrl });

    // 全チャンクIDを取得して署名付きURLを生成
    const chunkIds = await this.listChunkIds(recordingId, roomId);
    for (const chunkId of chunkIds) {
      const chunkKey = this.getChunkKey(recordingId, chunkId, roomId);
      const chunkUrl = await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: chunkKey }),
        { expiresIn: expiresInSeconds }
      );
      urls.push({ type: 'chunk', chunkId, url: chunkUrl });
    }

    return urls;
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
