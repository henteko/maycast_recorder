import type { RecordingId } from '../recording.js';
import type { ChunkId, ChunkMetadata } from '../chunk.js';
import { InvalidChunkError } from '../errors/DomainErrors.js';

/**
 * Chunk ドメインエンティティ
 *
 * ビジネスルール:
 * - チャンクデータは空であってはならない
 * - タイムスタンプは0以上である必要がある
 * - Init Segmentは特別なチャンクとして扱う
 */
export class ChunkEntity {
  private constructor(
    private readonly recordingId: RecordingId,
    private readonly chunkId: ChunkId,
    private readonly data: ArrayBuffer,
    private readonly timestamp: number,
    private readonly isInitSegment: boolean,
    private readonly hash?: string,
    private readonly hasKeyframe?: boolean,
    private readonly createdAt: Date = new Date()
  ) {}

  /**
   * 新しいChunkを作成
   */
  static create(params: {
    recordingId: RecordingId;
    chunkId: ChunkId;
    data: ArrayBuffer;
    timestamp: number;
    isInitSegment: boolean;
    hash?: string;
    hasKeyframe?: boolean;
  }): ChunkEntity {
    // ビジネスルール: データは空であってはならない
    if (params.data.byteLength === 0) {
      throw new InvalidChunkError('Chunk data cannot be empty');
    }

    // ビジネスルール: タイムスタンプは0以上
    if (params.timestamp < 0) {
      throw new InvalidChunkError('Chunk timestamp must be non-negative');
    }

    return new ChunkEntity(
      params.recordingId,
      params.chunkId,
      params.data,
      params.timestamp,
      params.isInitSegment,
      params.hash,
      params.hasKeyframe,
      new Date()
    );
  }

  /**
   * 永続化されたメタデータとデータからChunkを復元
   */
  static reconstitute(metadata: ChunkMetadata, data: ArrayBuffer): ChunkEntity {
    return new ChunkEntity(
      metadata.recordingId,
      metadata.chunkId,
      data,
      metadata.timestamp,
      false, // メタデータにisInitSegmentがない場合はfalse
      metadata.hash,
      metadata.hasKeyframe,
      new Date(metadata.createdAt)
    );
  }

  // Getters
  getRecordingId(): RecordingId {
    return this.recordingId;
  }

  getChunkId(): ChunkId {
    return this.chunkId;
  }

  getData(): ArrayBuffer {
    return this.data;
  }

  getTimestamp(): number {
    return this.timestamp;
  }

  getIsInitSegment(): boolean {
    return this.isInitSegment;
  }

  getHash(): string | undefined {
    return this.hash;
  }

  getHasKeyframe(): boolean | undefined {
    return this.hasKeyframe;
  }

  getSize(): number {
    return this.data.byteLength;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  /**
   * メタデータのみをDTOとして取得
   * データは含まない（データは別途保存）
   */
  toMetadataDTO(): ChunkMetadata {
    return {
      recordingId: this.recordingId,
      chunkId: this.chunkId,
      timestamp: this.timestamp,
      size: this.data.byteLength,
      hash: this.hash,
      hasKeyframe: this.hasKeyframe,
      createdAt: this.createdAt.getTime(),
    };
  }
}
