import type { RecordingId, ChunkId, ChunkMetadata } from '@maycast/common-types';
import type { IChunkRepository, ChunkData } from '../../domain/repositories/IChunkRepository';
import * as OPFS from '../storage/opfs';
import * as metadata from '../storage/metadata';

/**
 * OPFS + IndexedDB を使用した Chunk Repository の実装
 *
 * - チャンクデータ: OPFS (Origin Private File System)
 * - チャンクメタデータ: IndexedDB
 *
 * 既存の opfs.ts と metadata.ts の低レベルAPIをラップして、
 * IChunkRepository インターフェースを実装
 */
export class OPFSChunkRepository implements IChunkRepository {
  async save(chunk: ChunkData): Promise<ChunkId> {
    const { recordingId, data, timestamp, isInitSegment, hash, hasKeyframe } = chunk;

    if (isInitSegment) {
      // Init Segmentは特別な扱い
      await OPFS.writeInitSegment(recordingId, new Uint8Array(data));
      return -1; // Init SegmentのIDは -1
    }

    // 次のチャンクIDを取得
    const chunkId = await this.getNextChunkId(recordingId);

    // OPFSに保存
    await OPFS.writeChunk(recordingId, chunkId, new Uint8Array(data));

    // メタデータをIndexedDBに保存
    const chunkMetadata: ChunkMetadata = {
      recordingId,
      chunkId,
      timestamp,
      size: data.byteLength,
      hash,
      hasKeyframe,
      createdAt: Date.now(),
    };

    await metadata.saveChunkMetadata(chunkMetadata);

    return chunkId;
  }

  async findById(recordingId: RecordingId, chunkId: ChunkId): Promise<ArrayBuffer | null> {
    try {
      const data = await OPFS.readChunk(recordingId, chunkId);
      return data.buffer as ArrayBuffer;
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        return null;
      }
      throw error;
    }
  }

  async findAllByRecording(recordingId: RecordingId): Promise<ChunkMetadata[]> {
    return await metadata.listChunkMetadata(recordingId);
  }

  async delete(_recordingId: RecordingId, _chunkId: ChunkId): Promise<void> {
    // OPFS からチャンクファイルを削除
    // Note: opfs.ts には個別のチャンク削除機能がないため、
    // ここでは実装をスキップ（必要に応じて opfs.ts に追加）
    console.warn('Individual chunk deletion not implemented in OPFS');

    // IndexedDB からメタデータを削除
    // Note: metadata.ts には個別のチャンクメタデータ削除機能がないため、
    // ここでは実装をスキップ（必要に応じて metadata.ts に追加）
    console.warn('Individual chunk metadata deletion not implemented');
  }

  async deleteAllByRecording(recordingId: RecordingId): Promise<void> {
    // OPFS から録画全体を削除
    await OPFS.deleteSession(recordingId);

    // IndexedDB からメタデータを削除
    // metadata.deleteRecording は Recording と Chunk 両方を削除する
    await metadata.deleteRecording(recordingId);
  }

  async saveInitSegment(recordingId: RecordingId, data: ArrayBuffer): Promise<void> {
    await OPFS.writeInitSegment(recordingId, new Uint8Array(data));
  }

  async getInitSegment(recordingId: RecordingId): Promise<ArrayBuffer | null> {
    try {
      const data = await OPFS.readInitSegment(recordingId);
      return data.buffer as ArrayBuffer;
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 次のチャンクIDを取得
   * 既存のチャンクIDの最大値 + 1
   */
  private async getNextChunkId(recordingId: RecordingId): Promise<ChunkId> {
    const chunks = await metadata.listChunkMetadata(recordingId);

    if (chunks.length === 0) {
      return 0;
    }

    const maxId = Math.max(...chunks.map(c => c.chunkId));
    return maxId + 1;
  }
}
