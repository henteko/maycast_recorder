import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { S3StorageConfig } from '../config/storageConfig.js';

/**
 * S3へのファイルアップロードサービス（Worker用）
 *
 * output.mp4 と audio.m4a を S3 にアップロードする
 */
export class S3UploadService {
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

  /**
   * ローカルファイルをS3にアップロード
   */
  async uploadFile(localPath: string, s3Key: string, contentType: string): Promise<number> {
    const fileStat = await stat(localPath);
    const stream = createReadStream(localPath);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: stream,
        ContentType: contentType,
        ContentLength: fileStat.size,
      })
    );

    return fileStat.size;
  }
}
