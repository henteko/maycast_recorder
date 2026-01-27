import { RecordingAPIClient } from '../../infrastructure/api/recording-api';
import type { RecordingMetadata, RecordingState } from '@maycast/common-types';

/**
 * RecordingManager
 * Recording全体のライフサイクルを管理
 */
export class RecordingManager {
  private recordingId: string | null = null;
  private currentState: RecordingState = 'standby';
  private apiClient: RecordingAPIClient;

  constructor(serverUrl: string) {
    this.apiClient = new RecordingAPIClient(serverUrl);
  }

  /**
   * サーバー接続確認
   */
  async checkServerConnection(): Promise<boolean> {
    return this.apiClient.checkHealth();
  }

  /**
   * 新しいRecordingを作成
   * @param roomId Optional Room ID for Guest Mode recordings
   */
  async createRecording(roomId?: string): Promise<string> {
    console.log('📡 [RecordingManager] Calling createRecording API...', roomId ? `(roomId: ${roomId})` : '');
    const response = await this.apiClient.createRecording(roomId);
    this.recordingId = response.recording_id;
    this.currentState = 'standby'; // 初期状態
    console.log(`📝 [RecordingManager] Recording created: ${this.recordingId}`);
    return this.recordingId;
  }

  /**
   * Recordingメタデータをアップロード
   */
  async uploadMetadata(metadata: RecordingMetadata): Promise<void> {
    if (!this.recordingId) {
      throw new Error('Recording not created yet');
    }

    await this.apiClient.uploadRecordingMetadata(this.recordingId, metadata);
    console.log('📋 Metadata uploaded');
  }

  /**
   * Recording状態を更新（冪等性を持つ）
   */
  async updateState(state: RecordingState): Promise<void> {
    if (!this.recordingId) {
      throw new Error('Recording not created yet');
    }

    // 既に目的の状態にある場合はスキップ
    if (this.currentState === state) {
      console.log(`⏭️ [RecordingManager] Already in state: ${state}, skipping transition`);
      return;
    }

    console.log(`🔄 [RecordingManager] State transition: ${this.currentState} → ${state}`);
    await this.apiClient.updateRecordingState(this.recordingId, state);
    this.currentState = state;
    console.log(`✅ [RecordingManager] State updated to: ${state}`);
  }

  /**
   * 録画開始
   */
  async startRecording(): Promise<void> {
    await this.updateState('recording');
  }

  /**
   * 録画停止（Finalizing状態に移行）
   */
  async stopRecording(): Promise<void> {
    await this.updateState('finalizing');
  }

  /**
   * 録画完了（Synced状態に移行）
   */
  async completeRecording(): Promise<void> {
    await this.updateState('synced');
  }

  /**
   * 現在のRecording IDを取得
   */
  getRecordingId(): string | null {
    return this.recordingId;
  }

  /**
   * API Clientを取得
   */
  getAPIClient(): RecordingAPIClient {
    return this.apiClient;
  }
}
