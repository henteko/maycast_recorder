export interface AudioExtractionJobPayload {
  roomId: string;
  recordingIds: string[];
  createdAt: string;
}

export interface AudioExtractionJobResult {
  outputs: Record<string, {
    mp4Key: string;
    m4aKey: string;
    mp4Size: number;
    m4aSize: number;
  }>;
  processingDurationMs: number;
}

export const QUEUE_NAMES = {
  AUDIO_EXTRACTION: 'audio-extraction',
} as const;
