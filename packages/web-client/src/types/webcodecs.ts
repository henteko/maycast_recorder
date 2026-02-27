// WebCodecs API type definitions (for better TypeScript support)

export interface AudioEncoderConfig {
  codec: string
  sampleRate: number
  numberOfChannels: number
  bitrate: number
}

export interface ChunkStats {
  audioChunks: number
  totalSize: number
}
