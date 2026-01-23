/**
 * API Request/Response Type Definitions
 * サーバーAPIとの通信で使用する型定義
 */

import type { RecordingState } from './recording';

/**
 * POST /api/recordings - Response
 * 新しいRecordingを作成したときのレスポンス
 */
export interface CreateRecordingResponse {
  recording_id: string;
  created_at: string;
  state: RecordingState;
}

/**
 * PATCH /api/recordings/:id/state - Request
 * Recording状態を更新するリクエスト
 */
export interface UpdateStateRequest {
  state: RecordingState;
}
