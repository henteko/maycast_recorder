// WebCodecs API type definitions (for better TypeScript support)

export interface VideoEncoderConfig {
  codec: string
  width: number
  height: number
  bitrate: number
  framerate?: number
  keyInterval?: number
}

export interface AudioEncoderConfig {
  codec: string
  sampleRate: number
  numberOfChannels: number
  bitrate: number
}

export interface ChunkStats {
  videoChunks: number
  audioChunks: number
  keyframes: number
  totalSize: number
}
