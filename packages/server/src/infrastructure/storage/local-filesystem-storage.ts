import { StorageBackend } from './storage-backend.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * ローカルファイルシステムを使用したストレージ実装
 */
export class LocalFileSystemStorage implements StorageBackend {
  private basePath: string;

  /**
   * @param basePath ストレージのベースパス（例: "./recordings-data"）
   */
  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Recording用のディレクトリパスを取得
   */
  private getRecordingPath(recordingId: string): string {
    return path.join(this.basePath, recordingId);
  }

  /**
   * Init Segmentのファイルパスを取得
   */
  private getInitSegmentPath(recordingId: string): string {
    return path.join(this.getRecordingPath(recordingId), 'init.fmp4');
  }

  /**
   * チャンクのファイルパスを取得
   */
  private getChunkPath(recordingId: string, chunkId: string): string {
    return path.join(this.getRecordingPath(recordingId), `${chunkId}.fmp4`);
  }

  /**
   * Init Segmentを保存
   */
  async putInitSegment(recordingId: string, data: Buffer): Promise<void> {
    const recordingPath = this.getRecordingPath(recordingId);
    const initSegmentPath = this.getInitSegmentPath(recordingId);

    // ディレクトリが存在しない場合は作成
    await fs.mkdir(recordingPath, { recursive: true });

    // Init Segmentを保存
    await fs.writeFile(initSegmentPath, data);
  }

  /**
   * Init Segmentを取得
   */
  async getInitSegment(recordingId: string): Promise<Buffer> {
    const initSegmentPath = this.getInitSegmentPath(recordingId);

    try {
      return await fs.readFile(initSegmentPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Init segment not found: ${recordingId}`);
      }
      throw error;
    }
  }

  /**
   * チャンクを保存
   */
  async putChunk(recordingId: string, chunkId: string, data: Buffer): Promise<void> {
    const recordingPath = this.getRecordingPath(recordingId);
    const chunkPath = this.getChunkPath(recordingId, chunkId);

    // ディレクトリが存在しない場合は作成
    await fs.mkdir(recordingPath, { recursive: true });

    // チャンクを保存
    await fs.writeFile(chunkPath, data);
  }

  /**
   * チャンクを取得
   */
  async getChunk(recordingId: string, chunkId: string): Promise<Buffer> {
    const chunkPath = this.getChunkPath(recordingId, chunkId);

    try {
      return await fs.readFile(chunkPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Chunk not found: ${recordingId}/${chunkId}`);
      }
      throw error;
    }
  }

  /**
   * Recording内の全チャンクIDをリスト取得
   */
  async listChunks(recordingId: string): Promise<string[]> {
    const recordingPath = this.getRecordingPath(recordingId);

    try {
      const files = await fs.readdir(recordingPath);

      // .fmp4ファイルのみをフィルタリングし、init.fmp4を除外し、拡張子を除去して数値順にソート
      const chunkIds = files
        .filter(file => file.endsWith('.fmp4') && file !== 'init.fmp4')
        .map(file => file.replace('.fmp4', ''))
        .sort((a, b) => {
          // 数値として比較
          const numA = parseInt(a, 10);
          const numB = parseInt(b, 10);
          return numA - numB;
        });

      return chunkIds;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // ディレクトリが存在しない場合は空配列を返す
        return [];
      }
      throw error;
    }
  }

  /**
   * チャンクを削除
   */
  async deleteChunk(recordingId: string, chunkId: string): Promise<void> {
    const chunkPath = this.getChunkPath(recordingId, chunkId);

    try {
      await fs.unlink(chunkPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // ファイルが存在しない場合は無視
        return;
      }
      throw error;
    }
  }

  /**
   * Recording全体を削除
   */
  async deleteRecording(recordingId: string): Promise<void> {
    const recordingPath = this.getRecordingPath(recordingId);

    try {
      await fs.rm(recordingPath, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // ディレクトリが存在しない場合は無視
        return;
      }
      throw error;
    }
  }
}
