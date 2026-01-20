/**
 * ChunkStorage - OPFS + IndexedDB 統合インターフェース
 *
 * チャンクの保存・読み出しを管理する
 */

import * as opfs from './opfs'
import * as metadata from './metadata'
import type { ChunkMetadata, SessionMetadata } from './types'

export class ChunkStorage {
  private _sessionId: string
  private chunkCounter: number = 0

  constructor(sessionId: string) {
    this._sessionId = sessionId
  }

  get sessionId(): string {
    return this._sessionId
  }

  /**
   * セッションを初期化
   */
  async initSession(): Promise<void> {
    const sessionMetadata: SessionMetadata = {
      sessionId: this._sessionId,
      startTime: Date.now(),
      totalChunks: 0,
      totalSize: 0,
      isCompleted: false,
    }

    await metadata.saveSessionMetadata(sessionMetadata)
    console.log('✅ Session initialized:', this._sessionId)
  }

  /**
   * init segmentを保存
   */
  async saveInitSegment(data: Uint8Array): Promise<void> {
    await opfs.writeInitSegment(this._sessionId, data)
    console.log('✅ Init segment saved:', data.length, 'bytes')
  }

  /**
   * チャンクを保存
   */
  async saveChunk(data: Uint8Array, timestamp: number): Promise<number> {
    const chunkId = this.chunkCounter++

    // OPFSに保存
    await opfs.writeChunk(this._sessionId, chunkId, data)

    // メタデータをIndexedDBに保存
    const chunkMetadata: ChunkMetadata = {
      sessionId: this._sessionId,
      chunkId,
      timestamp,
      size: data.length,
      createdAt: Date.now(),
    }
    await metadata.saveChunkMetadata(chunkMetadata)

    // セッション統計を更新
    await this.updateSessionStats(data.length)

    console.log(`💾 Chunk saved: #${chunkId}, ${data.length} bytes`)

    return chunkId
  }

  /**
   * チャンクを読み出す
   */
  async loadChunk(chunkId: number): Promise<Uint8Array> {
    return opfs.readChunk(this._sessionId, chunkId)
  }

  /**
   * init segmentを読み出す
   */
  async loadInitSegment(): Promise<Uint8Array> {
    return opfs.readInitSegment(this._sessionId)
  }

  /**
   * チャンク一覧を取得
   */
  async listChunks(): Promise<ChunkMetadata[]> {
    return metadata.listChunkMetadata(this._sessionId)
  }

  /**
   * セッション統計を更新
   */
  private async updateSessionStats(addedSize: number): Promise<void> {
    const session = await metadata.getSessionMetadata(this._sessionId)
    if (!session) return

    session.totalChunks++
    session.totalSize += addedSize

    await metadata.saveSessionMetadata(session)
  }

  /**
   * セッションを完了
   */
  async completeSession(): Promise<void> {
    const session = await metadata.getSessionMetadata(this._sessionId)
    if (!session) return

    session.isCompleted = true
    session.endTime = Date.now()

    await metadata.saveSessionMetadata(session)
    console.log('✅ Session completed:', this._sessionId)
  }

  /**
   * セッションを削除
   */
  async deleteSession(): Promise<void> {
    let opfsError: Error | null = null
    let metadataError: Error | null = null

    // OPFSを削除（エラーでも続行）
    try {
      await opfs.deleteSession(this._sessionId)
    } catch (err) {
      opfsError = err instanceof Error ? err : new Error(String(err))
      console.warn('⚠️ OPFS deletion failed (continuing):', this._sessionId, err)
    }

    // IndexedDBメタデータを削除（エラーでも続行）
    try {
      await metadata.deleteSessionMetadata(this._sessionId)
    } catch (err) {
      metadataError = err instanceof Error ? err : new Error(String(err))
      console.warn('⚠️ Metadata deletion failed:', this._sessionId, err)
    }

    // 両方失敗した場合のみエラーを投げる
    if (opfsError && metadataError) {
      throw new Error(`Failed to delete session: OPFS error: ${opfsError.message}, Metadata error: ${metadataError.message}`)
    }

    console.log('🗑️ Session deleted:', this._sessionId)
  }

  /**
   * セッション情報を取得
   */
  async getSessionInfo(): Promise<SessionMetadata | null> {
    return metadata.getSessionMetadata(this._sessionId)
  }
}

/**
 * すべてのセッション一覧を取得
 */
export async function listAllSessions(): Promise<SessionMetadata[]> {
  return metadata.listSessionMetadata()
}

/**
 * セッションIDを生成
 */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
