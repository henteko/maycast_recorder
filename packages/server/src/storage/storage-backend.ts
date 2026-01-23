/**
 * ストレージバックエンドのインターフェース
 * Phase 2ではローカルファイルシステム、将来的にはS3等も対応可能
 */
export interface StorageBackend {
  /**
   * チャンクを保存
   * @param recordingId Recording ID
   * @param chunkId チャンクID（例: "chunk-001"）
   * @param data チャンクのバイナリデータ
   */
  putChunk(recordingId: string, chunkId: string, data: Buffer): Promise<void>;

  /**
   * チャンクを取得
   * @param recordingId Recording ID
   * @param chunkId チャンクID
   * @returns チャンクのバイナリデータ
   */
  getChunk(recordingId: string, chunkId: string): Promise<Buffer>;

  /**
   * Recording内の全チャンクIDをリスト取得
   * @param recordingId Recording ID
   * @returns チャンクIDの配列（ソート済み）
   */
  listChunks(recordingId: string): Promise<string[]>;

  /**
   * チャンクを削除
   * @param recordingId Recording ID
   * @param chunkId チャンクID
   */
  deleteChunk(recordingId: string, chunkId: string): Promise<void>;

  /**
   * Recording全体を削除
   * @param recordingId Recording ID
   */
  deleteRecording(recordingId: string): Promise<void>;
}
