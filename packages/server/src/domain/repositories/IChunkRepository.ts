import type { RecordingId, ChunkId, RoomId } from '@maycast/common-types';

/**
 * チャンクダウンロードURL情報
 */
export interface ChunkDownloadUrl {
  type: 'init' | 'chunk';
  chunkId?: ChunkId;
  url: string;
}

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

  /**
   * チャンクの直接ダウンロードURLを生成
   * クラウドストレージの場合は署名付きURLを返す
   * ローカルストレージの場合はnullを返す（直接ダウンロード非対応）
   *
   * @param recordingId Recording ID
   * @param roomId Optional Room ID for Room-based storage path
   * @param expiresInSeconds URL有効期限（秒）デフォルト: 3600
   * @returns 署名付きURLの配列、または直接ダウンロード非対応の場合null
   */
  generateDownloadUrls(
    recordingId: RecordingId,
    roomId?: RoomId,
    expiresInSeconds?: number
  ): Promise<ChunkDownloadUrl[] | null>;
}
