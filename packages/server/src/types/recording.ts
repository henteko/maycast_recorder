export type RecordingState = 'standby' | 'recording' | 'finalizing' | 'synced';

export interface RecordingMetadata {
  displayName?: string;
  deviceInfo?: {
    browser: string;
    os: string;
    screenResolution: string;
  };
  videoConfig?: {
    width: number;
    height: number;
    frameRate: number;
    bitrate: number;
  };
  audioConfig?: {
    sampleRate: number;
    channelCount: number;
    bitrate: number;
  };
}

export interface Recording {
  id: string;
  state: RecordingState;
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  metadata?: RecordingMetadata;
  chunkCount: number;
  roomId?: string; // Phase 4で使用（Phase 2ではnull）
}

export interface CreateRecordingResponse {
  recording_id: string;
  created_at: string;
  state: RecordingState;
}

export interface UpdateStateRequest {
  state: RecordingState;
}
