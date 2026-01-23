/**
 * ChunkStorage - OPFS + IndexedDB 統合インターフェース
 *
 * チャンクの保存・読み出しを管理する
 */

import * as opfs from './opfs';
import * as metadata from './metadata';
import type { ChunkMetadata, RecordingId, RecordingState, Recording } from '@maycast/common-types';

export class ChunkStorage {
  private _recordingId: RecordingId;
  private chunkCounter: number = 0;

  constructor(recordingId: RecordingId) {
    this._recordingId = recordingId;
  }

  get recordingId(): RecordingId {
    return this._recordingId;
  }

  /**
   * 録画セッションを初期化
   */
  async initSession(): Promise<void> {
    const now = new Date();
    const recording: Recording = {
      id: this._recordingId,
      state: 'standby' as RecordingState,
      chunkCount: 0,
      totalSize: 0,
      startTime: now.getTime(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await metadata.saveRecording(recording);
    console.log('✅ Recording initialized:', this._recordingId);
  }

  /**
   * init segmentを保存
   */
  async saveInitSegment(data: Uint8Array): Promise<void> {
    await opfs.writeInitSegment(this._recordingId, data);
    console.log('✅ Init segment saved:', data.length, 'bytes');
  }

  /**
   * チャンクを保存
   */
  async saveChunk(data: Uint8Array, timestamp: number): Promise<number> {
    const chunkId = this.chunkCounter++;

    // OPFSに保存
    await opfs.writeChunk(this._recordingId, chunkId, data);

    // メタデータをIndexedDBに保存
    const chunkMetadata: ChunkMetadata = {
      recordingId: this._recordingId,
      chunkId,
      timestamp,
      size: data.length,
      createdAt: Date.now(),
    };
    await metadata.saveChunkMetadata(chunkMetadata);

    // 録画統計を更新
    await this.updateRecordingStats(data.length);

    console.log(`💾 Chunk saved: #${chunkId}, ${data.length} bytes`);

    return chunkId;
  }

  /**
   * チャンクを読み出す
   */
  async loadChunk(chunkId: number): Promise<Uint8Array> {
    return opfs.readChunk(this._recordingId, chunkId);
  }

  /**
   * init segmentを読み出す
   */
  async loadInitSegment(): Promise<Uint8Array> {
    return opfs.readInitSegment(this._recordingId);
  }

  /**
   * チャンク一覧を取得
   */
  async listChunks(): Promise<ChunkMetadata[]> {
    return metadata.listChunkMetadata(this._recordingId);
  }

  /**
   * 録画統計を更新
   */
  private async updateRecordingStats(addedSize: number): Promise<void> {
    const recording = await metadata.getRecording(this._recordingId);
    if (!recording) return;

    recording.chunkCount++;
    recording.totalSize += addedSize;
    recording.updatedAt = new Date().toISOString();

    await metadata.saveRecording(recording);
  }

  /**
   * 録画を完了
   */
  async completeSession(): Promise<void> {
    const recording = await metadata.getRecording(this._recordingId);
    if (!recording) return;

    const now = new Date();
    recording.state = 'synced' as RecordingState;
    recording.endTime = now.getTime();
    recording.updatedAt = now.toISOString();

    await metadata.saveRecording(recording);
    console.log('✅ Recording completed:', this._recordingId);
  }

  /**
   * 録画を削除
   */
  async deleteSession(): Promise<void> {
    let opfsError: Error | null = null;
    let metadataError: Error | null = null;

    // OPFSを削除（エラーでも続行）
    try {
      await opfs.deleteSession(this._recordingId);
    } catch (err) {
      opfsError = err instanceof Error ? err : new Error(String(err));
      console.warn('⚠️ OPFS deletion failed (continuing):', this._recordingId, err);
    }

    // IndexedDBメタデータを削除（エラーでも続行）
    try {
      await metadata.deleteRecording(this._recordingId);
    } catch (err) {
      metadataError = err instanceof Error ? err : new Error(String(err));
      console.warn('⚠️ Metadata deletion failed:', this._recordingId, err);
    }

    // 両方失敗した場合のみエラーを投げる
    if (opfsError && metadataError) {
      throw new Error(`Failed to delete recording: OPFS error: ${opfsError.message}, Metadata error: ${metadataError.message}`);
    }

    console.log('🗑️ Recording deleted:', this._recordingId);
  }

  /**
   * 録画情報を取得
   */
  async getRecordingInfo(): Promise<Recording | null> {
    return metadata.getRecording(this._recordingId);
  }
}

/**
 * すべての録画一覧を取得
 */
export async function listAllRecordings(): Promise<Recording[]> {
  return metadata.listRecordings();
}

/**
 * 録画IDを生成 (UUID v4形式)
 */
export function generateRecordingId(): RecordingId {
  // Simple UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
