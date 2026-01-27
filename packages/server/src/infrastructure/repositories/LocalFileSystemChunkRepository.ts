import type { RecordingId, ChunkId, RoomId } from '@maycast/common-types';
import type { IChunkRepository } from '../../domain/repositories/IChunkRepository';
import fs from 'fs/promises';
import path from 'path';

/**
 * ローカルファイルシステム Chunk Repository の実装
 *
 * Storage Structure:
 * - Without roomId: /{basePath}/{recordingId}/
 * - With roomId: /{basePath}/rooms/{roomId}/{recordingId}/
 */
export class LocalFileSystemChunkRepository implements IChunkRepository {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Recording用のストレージパスを取得
   * roomIdがある場合は /rooms/{roomId}/{recordingId}/ を返す
   */
  private getRecordingPath(recordingId: RecordingId, roomId?: RoomId): string {
    if (roomId) {
      return path.join(this.basePath, 'rooms', roomId, recordingId);
    }
    return path.join(this.basePath, recordingId);
  }

  private getInitSegmentPath(recordingId: RecordingId, roomId?: RoomId): string {
    return path.join(this.getRecordingPath(recordingId, roomId), 'init.fmp4');
  }

  private getChunkPath(recordingId: RecordingId, chunkId: ChunkId, roomId?: RoomId): string {
    return path.join(this.getRecordingPath(recordingId, roomId), `${chunkId}.fmp4`);
  }

  async saveInitSegment(recordingId: RecordingId, data: Buffer, roomId?: RoomId): Promise<void> {
    const recordingPath = this.getRecordingPath(recordingId, roomId);
    const initSegmentPath = this.getInitSegmentPath(recordingId, roomId);

    await fs.mkdir(recordingPath, { recursive: true });
    await fs.writeFile(initSegmentPath, data);
  }

  async getInitSegment(recordingId: RecordingId, roomId?: RoomId): Promise<Buffer | null> {
    const initSegmentPath = this.getInitSegmentPath(recordingId, roomId);

    try {
      return await fs.readFile(initSegmentPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async saveChunk(recordingId: RecordingId, chunkId: ChunkId, data: Buffer, roomId?: RoomId): Promise<void> {
    const recordingPath = this.getRecordingPath(recordingId, roomId);
    const chunkPath = this.getChunkPath(recordingId, chunkId, roomId);

    await fs.mkdir(recordingPath, { recursive: true });
    await fs.writeFile(chunkPath, data);
  }

  async getChunk(recordingId: RecordingId, chunkId: ChunkId, roomId?: RoomId): Promise<Buffer | null> {
    const chunkPath = this.getChunkPath(recordingId, chunkId, roomId);

    try {
      return await fs.readFile(chunkPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async listChunkIds(recordingId: RecordingId, roomId?: RoomId): Promise<ChunkId[]> {
    const recordingPath = this.getRecordingPath(recordingId, roomId);

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

  async deleteAllChunks(recordingId: RecordingId, roomId?: RoomId): Promise<void> {
    const recordingPath = this.getRecordingPath(recordingId, roomId);

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
