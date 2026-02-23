/**
 * Recording API Client
 * サーバーのRecording管理APIとの通信を担当
 */

import type {
  RecordingState,
  RecordingMetadata,
  CreateRecordingResponse,
  DownloadUrlsResponse,
  UploadUrlResponse,
} from '@maycast/common-types';

/**
 * サーバーから返されるRecording情報
 * (API Response用の型)
 */
export type ProcessingState = 'pending' | 'processing' | 'completed' | 'failed';

export interface RecordingInfo {
  id: string;
  state: RecordingState;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  metadata?: RecordingMetadata;
  chunk_count: number;
  room_id?: string;
  processing_state?: ProcessingState | null;
  transcription_state?: ProcessingState | null;
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
   * @param roomId Optional Room ID for Guest Mode recordings
   */
  async createRecording(roomId?: string): Promise<CreateRecordingResponse> {
    const url = roomId
      ? `${this.baseUrl}/api/recordings?roomId=${encodeURIComponent(roomId)}`
      : `${this.baseUrl}/api/recordings`;

    console.log(`📡 [RecordingAPIClient] POST ${url}`);
    const response = await fetch(url, {
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
    state: RecordingState
  ): Promise<void> {
    console.log('🔄 [RecordingAPI] Updating recording state:', { recordingId, state });

    const response = await fetch(`${this.baseUrl}/api/recordings/${recordingId}/state`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [RecordingAPI] Failed to update state:', {
        status: response.status,
        statusText: response.statusText,
        errorText,
      });
      throw new Error(`Failed to update recording state: ${response.status} ${response.statusText} - ${errorText}`);
    }

    console.log('✅ [RecordingAPI] State updated successfully');
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
    // タイムアウト設定（30秒）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(
        `${this.baseUrl}/api/recordings/${recordingId}/init-segment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: data as BodyInit,
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload init segment: ${response.status} ${response.statusText} - ${errorText}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Upload timeout: init segment took longer than 30 seconds');
      }
      throw error;
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
    // タイムアウト設定（30秒）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(
        `${this.baseUrl}/api/recordings/${recordingId}/chunks?chunk_id=${chunkId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Chunk-Hash': hash,
          },
          body: data as BodyInit,
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload chunk: ${response.status} ${response.statusText} - ${errorText}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Upload timeout: chunk ${chunkId} took longer than 30 seconds`);
      }
      throw error;
    }
  }

  /**
   * Init Segmentアップロード用のPresigned URLを取得
   */
  async getInitSegmentUploadUrl(recordingId: string): Promise<UploadUrlResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/recordings/${recordingId}/upload-url/init-segment`
    );

    if (!response.ok) {
      throw new Error(`Failed to get init segment upload URL: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * チャンクアップロード用のPresigned URLを取得
   */
  async getChunkUploadUrl(recordingId: string, chunkId: string): Promise<UploadUrlResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/recordings/${recordingId}/upload-url/chunk?chunk_id=${chunkId}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get chunk upload URL: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Init Segmentの直接アップロード完了をサーバーに通知
   */
  async confirmInitSegmentUpload(recordingId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/recordings/${recordingId}/confirm-upload/init-segment`,
      { method: 'POST' }
    );

    if (!response.ok) {
      throw new Error(`Failed to confirm init segment upload: ${response.statusText}`);
    }
  }

  /**
   * チャンクの直接アップロード完了をサーバーに通知
   */
  async confirmChunkUpload(recordingId: string, chunkId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/recordings/${recordingId}/confirm-upload/chunk?chunk_id=${chunkId}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      throw new Error(`Failed to confirm chunk upload: ${response.statusText}`);
    }
  }

  /**
   * Presigned URLを使ってS3に直接アップロード
   */
  async uploadToPresignedUrl(url: string, data: Uint8Array): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: data as BodyInit,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Direct upload failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Direct upload timeout: took longer than 60 seconds');
      }
      throw error;
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

  /**
   * ダウンロードURLs取得（Presigned URL対応）
   */
  async getDownloadUrls(recordingId: string): Promise<DownloadUrlsResponse> {
    const response = await fetch(`${this.baseUrl}/api/recordings/${recordingId}/download-urls`);

    if (!response.ok) {
      throw new Error(`Failed to get download URLs: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * ダウンロードURLを取得（直接リンク用）
   */
  getDownloadUrl(recordingId: string): string {
    return `${this.baseUrl}/api/recordings/${recordingId}/download`;
  }

  /**
   * Recording時間を計算（秒）
   */
  static calculateDuration(recording: RecordingInfo): number | null {
    if (!recording.started_at || !recording.finished_at) {
      return null;
    }
    const start = new Date(recording.started_at).getTime();
    const end = new Date(recording.finished_at).getTime();
    return Math.floor((end - start) / 1000);
  }

  /**
   * 時間をフォーマット (MM:SS or HH:MM:SS)
   */
  static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * ファイルサイズをフォーマット
   */
  static formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}
