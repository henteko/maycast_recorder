import type { RecordingId, ChunkId } from '@maycast/common-types';
import type { IChunkRepository } from '../../domain/repositories/IChunkRepository';
import fs from 'fs/promises';
import path from 'path';

/**
 * ローカルファイルシステム Chunk Repository の実装
 *
 * 既存のLocalFileSystemStorageをラップして、
 * IChunkRepository インターフェースを実装
 */
export class LocalFileSystemChunkRepository implements IChunkRepository {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  private getRecordingPath(recordingId: RecordingId): string {
    return path.join(this.basePath, recordingId);
  }

  private getInitSegmentPath(recordingId: RecordingId): string {
    return path.join(this.getRecordingPath(recordingId), 'init.fmp4');
  }

  private getChunkPath(recordingId: RecordingId, chunkId: ChunkId): string {
    return path.join(this.getRecordingPath(recordingId), `${chunkId}.fmp4`);
  }

  async saveInitSegment(recordingId: RecordingId, data: Buffer): Promise<void> {
    const recordingPath = this.getRecordingPath(recordingId);
    const initSegmentPath = this.getInitSegmentPath(recordingId);

    await fs.mkdir(recordingPath, { recursive: true });
    await fs.writeFile(initSegmentPath, data);
  }

  async getInitSegment(recordingId: RecordingId): Promise<Buffer | null> {
    const initSegmentPath = this.getInitSegmentPath(recordingId);

    try {
      return await fs.readFile(initSegmentPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async saveChunk(recordingId: RecordingId, chunkId: ChunkId, data: Buffer): Promise<void> {
    const recordingPath = this.getRecordingPath(recordingId);
    const chunkPath = this.getChunkPath(recordingId, chunkId);

    await fs.mkdir(recordingPath, { recursive: true });
    await fs.writeFile(chunkPath, data);
  }

  async getChunk(recordingId: RecordingId, chunkId: ChunkId): Promise<Buffer | null> {
    const chunkPath = this.getChunkPath(recordingId, chunkId);

    try {
      return await fs.readFile(chunkPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async listChunkIds(recordingId: RecordingId): Promise<ChunkId[]> {
    const recordingPath = this.getRecordingPath(recordingId);

    try {
      const files = await fs.readdir(recordingPath);

      const chunkIds: ChunkId[] = [];
      for (const file of files) {
        // init.fmp4 は除外
        if (file === 'init.fmp4') continue;

        // *.fmp4 ファイルのみ対象
        if (!file.endsWith('.fmp4')) continue;

        // ファイル名から拡張子を除いてchunkIdとする
        const chunkId = file.replace('.fmp4', '');

        // 数値に変換できるかチェック
        const numericId = parseInt(chunkId, 10);
        if (!isNaN(numericId)) {
          chunkIds.push(numericId);
        }
      }

      // 数値順にソート
      return chunkIds.sort((a, b) => Number(a) - Number(b));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async deleteAllChunks(recordingId: RecordingId): Promise<void> {
    const recordingPath = this.getRecordingPath(recordingId);

    try {
      await fs.rm(recordingPath, { recursive: true, force: true });
    } catch (error) {
      // ディレクトリが存在しない場合は無視
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
