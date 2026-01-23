import type { RecordingId, ChunkId } from '@maycast/common-types';

/**
 * Chunk Repository Interface (Server-side)
 *
 * Chunk データの永続化を抽象化
 * 実装: LocalFileSystemChunkRepository
 */
export interface IChunkRepository {
  /**
   * Init Segmentを保存
   */
  saveInitSegment(recordingId: RecordingId, data: Buffer): Promise<void>;

  /**
   * Init Segmentを取得
   */
  getInitSegment(recordingId: RecordingId): Promise<Buffer | null>;

  /**
   * チャンクを保存
   */
  saveChunk(recordingId: RecordingId, chunkId: ChunkId, data: Buffer): Promise<void>;

  /**
   * チャンクを取得
   */
  getChunk(recordingId: RecordingId, chunkId: ChunkId): Promise<Buffer | null>;

  /**
   * Recording に属するすべてのチャンクIDを取得
   */
  listChunkIds(recordingId: RecordingId): Promise<ChunkId[]>;

  /**
   * Recording に属するすべてのチャンクを削除
   */
  deleteAllChunks(recordingId: RecordingId): Promise<void>;
}
