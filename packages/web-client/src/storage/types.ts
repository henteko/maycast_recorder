export interface ChunkMetadata {
  sessionId: string
  chunkId: number
  timestamp: number // マイクロ秒
  size: number
  hash?: string // Blake3ハッシュ（将来の実装用）
  createdAt: number // Unix timestamp (ms)
}

export interface SessionMetadata {
  sessionId: string
  startTime: number
  endTime?: number
  totalChunks: number
  totalSize: number
  isCompleted: boolean
}
