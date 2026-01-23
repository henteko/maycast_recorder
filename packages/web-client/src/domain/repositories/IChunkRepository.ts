import type { RecordingId, ChunkId, ChunkMetadata } from '@maycast/common-types';

/**
 * Chunk保存用のデータ構造
 */
export interface ChunkData {
  recordingId: RecordingId;
  data: ArrayBuffer;
  timestamp: number;
  isInitSegment: boolean;
  hash?: string;
  hasKeyframe?: boolean;
}

/**
 * Chunk Repository Interface
 *
 * Chunk エンティティの永続化を抽象化
 * 実装: OPFSChunkRepository（OPFS + IndexedDB）
 */
export interface IChunkRepository {
  /**
   * チャンクを保存
   * @returns 保存されたチャンクのID
   */
  save(chunk: ChunkData): Promise<ChunkId>;

  /**
   * チャンクを取得
   */
  findById(recordingId: RecordingId, chunkId: ChunkId): Promise<ArrayBuffer | null>;

  /**
   * Recording に属するすべてのチャンクメタデータを取得
   */
  findAllByRecording(recordingId: RecordingId): Promise<ChunkMetadata[]>;

  /**
   * チャンクを削除
   */
  delete(recordingId: RecordingId, chunkId: ChunkId): Promise<void>;

  /**
   * Recording に属するすべてのチャンクを削除
   */
  deleteAllByRecording(recordingId: RecordingId): Promise<void>;

  /**
   * Init Segmentを保存
   */
  saveInitSegment(recordingId: RecordingId, data: ArrayBuffer): Promise<void>;

  /**
   * Init Segmentを取得
   */
  getInitSegment(recordingId: RecordingId): Promise<ArrayBuffer | null>;
}
