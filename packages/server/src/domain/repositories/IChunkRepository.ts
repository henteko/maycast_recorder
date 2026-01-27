import type { RecordingId, ChunkId, RoomId } from '@maycast/common-types';

/**
 * Chunk Repository Interface (Server-side)
 *
 * Chunk データの永続化を抽象化
 * 実装: LocalFileSystemChunkRepository
 *
 * Storage Structure:
 * - Without roomId: /{recordingId}/
 * - With roomId: /rooms/{roomId}/{recordingId}/
 */
export interface IChunkRepository {
  /**
   * Init Segmentを保存
   * @param recordingId Recording ID
   * @param data Init segment data
   * @param roomId Optional Room ID for Room-based storage path
   */
  saveInitSegment(recordingId: RecordingId, data: Buffer, roomId?: RoomId): Promise<void>;

  /**
   * Init Segmentを取得
   * @param recordingId Recording ID
   * @param roomId Optional Room ID for Room-based storage path
   */
  getInitSegment(recordingId: RecordingId, roomId?: RoomId): Promise<Buffer | null>;

  /**
   * チャンクを保存
   * @param recordingId Recording ID
   * @param chunkId Chunk ID
   * @param data Chunk data
   * @param roomId Optional Room ID for Room-based storage path
   */
  saveChunk(recordingId: RecordingId, chunkId: ChunkId, data: Buffer, roomId?: RoomId): Promise<void>;

  /**
   * チャンクを取得
   * @param recordingId Recording ID
   * @param chunkId Chunk ID
   * @param roomId Optional Room ID for Room-based storage path
   */
  getChunk(recordingId: RecordingId, chunkId: ChunkId, roomId?: RoomId): Promise<Buffer | null>;

  /**
   * Recording に属するすべてのチャンクIDを取得
   * @param recordingId Recording ID
   * @param roomId Optional Room ID for Room-based storage path
   */
  listChunkIds(recordingId: RecordingId, roomId?: RoomId): Promise<ChunkId[]>;

  /**
   * Recording に属するすべてのチャンクを削除
   * @param recordingId Recording ID
   * @param roomId Optional Room ID for Room-based storage path
   */
  deleteAllChunks(recordingId: RecordingId, roomId?: RoomId): Promise<void>;
}
