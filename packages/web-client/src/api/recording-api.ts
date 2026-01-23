/**
 * Recording API Client
 * サーバーのRecording管理APIとの通信を担当
 */

export interface CreateRecordingResponse {
  recording_id: string;
  created_at: string;
  state: 'standby' | 'recording' | 'finalizing' | 'synced';
}

export interface RecordingInfo {
  id: string;
  state: 'standby' | 'recording' | 'finalizing' | 'synced';
  created_at: string;
  started_at?: string;
  finished_at?: string;
  metadata?: RecordingMetadata;
  chunk_count: number;
  room_id?: string;
}

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

export class RecordingAPIClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * サーバー接続確認
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * 新しいRecordingを作成
   */
  async createRecording(): Promise<CreateRecordingResponse> {
    console.log(`📡 [RecordingAPIClient] POST ${this.baseUrl}/api/recordings`);
    const response = await fetch(`${this.baseUrl}/api/recordings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`❌ [RecordingAPIClient] Failed to create recording: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to create recording: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ [RecordingAPIClient] Recording created:`, data);
    return data;
  }

  /**
   * Recording情報を取得
   */
  async getRecording(recordingId: string): Promise<RecordingInfo> {
    const response = await fetch(`${this.baseUrl}/api/recordings/${recordingId}`);

    if (!response.ok) {
      throw new Error(`Failed to get recording: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Recording状態を更新
   */
  async updateRecordingState(
    recordingId: string,
    state: 'standby' | 'recording' | 'finalizing' | 'synced'
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/recordings/${recordingId}/state`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update recording state: ${response.statusText}`);
    }
  }

  /**
   * Recordingメタデータを保存
   */
  async uploadRecordingMetadata(
    recordingId: string,
    metadata: RecordingMetadata
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/recordings/${recordingId}/metadata`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      throw new Error(`Failed to upload recording metadata: ${response.statusText}`);
    }
  }

  /**
   * Init Segmentをアップロード
   */
  async uploadInitSegment(
    recordingId: string,
    data: Uint8Array
  ): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/recordings/${recordingId}/init-segment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: data as BodyInit,
        keepalive: true, // Keep-Alive接続で高速化
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload init segment: ${response.status} ${response.statusText} - ${errorText}`);
    }
  }

  /**
   * チャンクをアップロード
   */
  async uploadChunk(
    recordingId: string,
    chunkId: string,
    data: Uint8Array,
    hash: string
  ): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/recordings/${recordingId}/chunks?chunk_id=${chunkId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Chunk-Hash': hash,
        },
        body: data as BodyInit,
        keepalive: true, // Keep-Alive接続で高速化
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload chunk: ${response.status} ${response.statusText} - ${errorText}`);
    }
  }

  /**
   * Recordingをダウンロード
   */
  async downloadRecording(recordingId: string): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/recordings/${recordingId}/download`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to download recording: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.blob();
  }
}
