import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { S3ChunkRepository } from '../S3ChunkRepository.js';
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { S3StorageConfig } from '../../config/storageConfig.js';

const TEST_CONFIG: S3StorageConfig = {
  backend: 's3',
  endpoint: process.env.TEST_S3_ENDPOINT || 'http://localhost:4577',
  bucket: 'maycast-recordings',
  accessKeyId: 'test',
  secretAccessKey: 'test',
  region: 'us-east-1',
  forcePathStyle: true,
};

/**
 * テスト前にバケット内の全オブジェクトを削除
 */
async function cleanBucket(): Promise<void> {
  const client = new S3Client({
    endpoint: TEST_CONFIG.endpoint,
    region: TEST_CONFIG.region,
    forcePathStyle: TEST_CONFIG.forcePathStyle,
    credentials: {
      accessKeyId: TEST_CONFIG.accessKeyId,
      secretAccessKey: TEST_CONFIG.secretAccessKey,
    },
  });

  let continuationToken: string | undefined;
  do {
    const listResponse = await client.send(
      new ListObjectsV2Command({
        Bucket: TEST_CONFIG.bucket,
        ContinuationToken: continuationToken,
      })
    );

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      const objects = listResponse.Contents.filter((obj) => obj.Key).map((obj) => ({
        Key: obj.Key!,
      }));
      if (objects.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: TEST_CONFIG.bucket,
            Delete: { Objects: objects },
          })
        );
      }
    }

    continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
  } while (continuationToken);

  client.destroy();
}

describe('S3ChunkRepository', () => {
  const repository = new S3ChunkRepository(TEST_CONFIG);

  beforeEach(async () => {
    await cleanBucket();
  });

  afterAll(async () => {
    await cleanBucket();
  });

  describe('saveInitSegment / getInitSegment', () => {
    it('Init Segmentを保存して取得できる', async () => {
      const data = Buffer.from('init-segment-data');
      await repository.saveInitSegment('rec-001', data);

      const result = await repository.getInitSegment('rec-001');
      expect(result).not.toBeNull();
      expect(result!.toString()).toBe('init-segment-data');
    });

    it('roomId付きでInit Segmentを保存して取得できる', async () => {
      const data = Buffer.from('room-init-segment');
      await repository.saveInitSegment('rec-001', data, 'room-001');

      const result = await repository.getInitSegment('rec-001', 'room-001');
      expect(result).not.toBeNull();
      expect(result!.toString()).toBe('room-init-segment');
    });

    it('存在しないInit SegmentはnullをReturnする', async () => {
      const result = await repository.getInitSegment('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('saveChunk / getChunk', () => {
    it('チャンクを保存して取得できる', async () => {
      const data = Buffer.from('chunk-data-001');
      await repository.saveChunk('rec-001', 0, data);

      const result = await repository.getChunk('rec-001', 0);
      expect(result).not.toBeNull();
      expect(result!.toString()).toBe('chunk-data-001');
    });

    it('roomId付きでチャンクを保存して取得できる', async () => {
      const data = Buffer.from('room-chunk-data');
      await repository.saveChunk('rec-001', 1, data, 'room-001');

      const result = await repository.getChunk('rec-001', 1, 'room-001');
      expect(result).not.toBeNull();
      expect(result!.toString()).toBe('room-chunk-data');
    });

    it('存在しないチャンクはnullを返す', async () => {
      const result = await repository.getChunk('rec-001', 999);
      expect(result).toBeNull();
    });
  });

  describe('listChunkIds', () => {
    it('チャンクIDを数値順にリストできる', async () => {
      await repository.saveInitSegment('rec-001', Buffer.from('init'));
      await repository.saveChunk('rec-001', 2, Buffer.from('chunk-2'));
      await repository.saveChunk('rec-001', 0, Buffer.from('chunk-0'));
      await repository.saveChunk('rec-001', 10, Buffer.from('chunk-10'));
      await repository.saveChunk('rec-001', 1, Buffer.from('chunk-1'));

      const chunkIds = await repository.listChunkIds('rec-001');
      expect(chunkIds).toEqual([0, 1, 2, 10]);
    });

    it('roomId付きでチャンクIDをリストできる', async () => {
      await repository.saveChunk('rec-001', 0, Buffer.from('data'), 'room-001');
      await repository.saveChunk('rec-001', 1, Buffer.from('data'), 'room-001');

      const chunkIds = await repository.listChunkIds('rec-001', 'room-001');
      expect(chunkIds).toEqual([0, 1]);
    });

    it('チャンクがない場合は空配列を返す', async () => {
      const chunkIds = await repository.listChunkIds('non-existent');
      expect(chunkIds).toEqual([]);
    });

    it('init.fmp4はリストに含まれない', async () => {
      await repository.saveInitSegment('rec-001', Buffer.from('init'));
      await repository.saveChunk('rec-001', 0, Buffer.from('chunk'));

      const chunkIds = await repository.listChunkIds('rec-001');
      expect(chunkIds).toEqual([0]);
    });
  });

  describe('deleteAllChunks', () => {
    it('Recording配下の全チャンクを削除できる', async () => {
      await repository.saveInitSegment('rec-001', Buffer.from('init'));
      await repository.saveChunk('rec-001', 0, Buffer.from('chunk-0'));
      await repository.saveChunk('rec-001', 1, Buffer.from('chunk-1'));

      await repository.deleteAllChunks('rec-001');

      expect(await repository.getInitSegment('rec-001')).toBeNull();
      expect(await repository.getChunk('rec-001', 0)).toBeNull();
      expect(await repository.getChunk('rec-001', 1)).toBeNull();
      expect(await repository.listChunkIds('rec-001')).toEqual([]);
    });

    it('roomId付きで全チャンクを削除できる', async () => {
      await repository.saveInitSegment('rec-001', Buffer.from('init'), 'room-001');
      await repository.saveChunk('rec-001', 0, Buffer.from('chunk'), 'room-001');

      await repository.deleteAllChunks('rec-001', 'room-001');

      expect(await repository.getInitSegment('rec-001', 'room-001')).toBeNull();
      expect(await repository.getChunk('rec-001', 0, 'room-001')).toBeNull();
    });

    it('存在しないRecordingの削除でもエラーにならない', async () => {
      await expect(repository.deleteAllChunks('non-existent')).resolves.not.toThrow();
    });
  });
});
