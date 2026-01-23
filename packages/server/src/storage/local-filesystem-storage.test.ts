import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalFileSystemStorage } from './local-filesystem-storage.js';
import fs from 'fs/promises';
import path from 'path';

describe('LocalFileSystemStorage', () => {
  const testBasePath = './test-storage';
  let storage: LocalFileSystemStorage;

  beforeEach(async () => {
    storage = new LocalFileSystemStorage(testBasePath);
    // テスト前にクリーンアップ
    await fs.rm(testBasePath, { recursive: true, force: true });
  });

  afterEach(async () => {
    // テスト後にクリーンアップ
    await fs.rm(testBasePath, { recursive: true, force: true });
  });

  describe('putChunk', () => {
    it('should save a chunk to the filesystem', async () => {
      const recordingId = 'test-recording-1';
      const chunkId = 'chunk-001';
      const data = Buffer.from('test chunk data');

      await storage.putChunk(recordingId, chunkId, data);

      // ファイルが存在することを確認
      const chunkPath = path.join(testBasePath, recordingId, `${chunkId}.fmp4`);
      const savedData = await fs.readFile(chunkPath);
      expect(savedData.toString()).toBe('test chunk data');
    });

    it('should create directory automatically if it does not exist', async () => {
      const recordingId = 'test-recording-2';
      const chunkId = 'chunk-001';
      const data = Buffer.from('test data');

      await storage.putChunk(recordingId, chunkId, data);

      // ディレクトリが作成されていることを確認
      const recordingPath = path.join(testBasePath, recordingId);
      const stats = await fs.stat(recordingPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should overwrite existing chunk', async () => {
      const recordingId = 'test-recording-3';
      const chunkId = 'chunk-001';
      const data1 = Buffer.from('first data');
      const data2 = Buffer.from('second data');

      await storage.putChunk(recordingId, chunkId, data1);
      await storage.putChunk(recordingId, chunkId, data2);

      const retrievedData = await storage.getChunk(recordingId, chunkId);
      expect(retrievedData.toString()).toBe('second data');
    });
  });

  describe('getChunk', () => {
    it('should retrieve a saved chunk', async () => {
      const recordingId = 'test-recording-4';
      const chunkId = 'chunk-001';
      const data = Buffer.from('retrieved data');

      await storage.putChunk(recordingId, chunkId, data);
      const retrievedData = await storage.getChunk(recordingId, chunkId);

      expect(retrievedData.toString()).toBe('retrieved data');
    });

    it('should throw error when chunk does not exist', async () => {
      const recordingId = 'test-recording-5';
      const chunkId = 'non-existent-chunk';

      await expect(storage.getChunk(recordingId, chunkId)).rejects.toThrow(
        'Chunk not found: test-recording-5/non-existent-chunk'
      );
    });
  });

  describe('listChunks', () => {
    it('should list all chunks in a recording', async () => {
      const recordingId = 'test-recording-6';
      const chunks = [
        { id: 'chunk-001', data: Buffer.from('data 1') },
        { id: 'chunk-002', data: Buffer.from('data 2') },
        { id: 'chunk-003', data: Buffer.from('data 3') },
      ];

      for (const chunk of chunks) {
        await storage.putChunk(recordingId, chunk.id, chunk.data);
      }

      const chunkIds = await storage.listChunks(recordingId);
      expect(chunkIds).toEqual(['chunk-001', 'chunk-002', 'chunk-003']);
    });

    it('should return sorted chunk IDs', async () => {
      const recordingId = 'test-recording-7';
      const chunks = [
        { id: 'chunk-003', data: Buffer.from('data 3') },
        { id: 'chunk-001', data: Buffer.from('data 1') },
        { id: 'chunk-002', data: Buffer.from('data 2') },
      ];

      for (const chunk of chunks) {
        await storage.putChunk(recordingId, chunk.id, chunk.data);
      }

      const chunkIds = await storage.listChunks(recordingId);
      expect(chunkIds).toEqual(['chunk-001', 'chunk-002', 'chunk-003']);
    });

    it('should return empty array when recording directory does not exist', async () => {
      const recordingId = 'non-existent-recording';
      const chunkIds = await storage.listChunks(recordingId);
      expect(chunkIds).toEqual([]);
    });

    it('should filter out non-fmp4 files', async () => {
      const recordingId = 'test-recording-8';
      const recordingPath = path.join(testBasePath, recordingId);

      await fs.mkdir(recordingPath, { recursive: true });
      await fs.writeFile(path.join(recordingPath, 'chunk-001.fmp4'), 'data');
      await fs.writeFile(path.join(recordingPath, 'chunk-002.fmp4'), 'data');
      await fs.writeFile(path.join(recordingPath, 'metadata.json'), 'data');
      await fs.writeFile(path.join(recordingPath, 'readme.txt'), 'data');

      const chunkIds = await storage.listChunks(recordingId);
      expect(chunkIds).toEqual(['chunk-001', 'chunk-002']);
    });
  });

  describe('deleteChunk', () => {
    it('should delete a chunk', async () => {
      const recordingId = 'test-recording-9';
      const chunkId = 'chunk-001';
      const data = Buffer.from('data to delete');

      await storage.putChunk(recordingId, chunkId, data);
      await storage.deleteChunk(recordingId, chunkId);

      await expect(storage.getChunk(recordingId, chunkId)).rejects.toThrow(
        'Chunk not found'
      );
    });

    it('should not throw error when deleting non-existent chunk', async () => {
      const recordingId = 'test-recording-10';
      const chunkId = 'non-existent-chunk';

      await expect(storage.deleteChunk(recordingId, chunkId)).resolves.not.toThrow();
    });
  });

  describe('deleteRecording', () => {
    it('should delete entire recording directory', async () => {
      const recordingId = 'test-recording-11';
      const chunks = [
        { id: 'chunk-001', data: Buffer.from('data 1') },
        { id: 'chunk-002', data: Buffer.from('data 2') },
      ];

      for (const chunk of chunks) {
        await storage.putChunk(recordingId, chunk.id, chunk.data);
      }

      await storage.deleteRecording(recordingId);

      const chunkIds = await storage.listChunks(recordingId);
      expect(chunkIds).toEqual([]);
    });

    it('should not throw error when deleting non-existent recording', async () => {
      const recordingId = 'non-existent-recording';

      await expect(storage.deleteRecording(recordingId)).resolves.not.toThrow();
    });
  });
});
