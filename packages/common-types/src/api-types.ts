/**
 * API Request/Response Type Definitions
 * サーバーAPIとの通信で使用する型定義
 */

import type { RecordingState } from './recording.js';

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

/**
 * GET /api/recordings/:id/download-urls - Response
 * クラウドストレージからの直接ダウンロード用URL
 */
export interface DownloadUrlsDirectResponse {
  directDownload: true;
  filename: string;
  initSegment: { url: string };
  chunks: { url: string; chunkId: number }[];
  totalChunks: number;
  expiresIn: number;
}

export interface DownloadUrlsFallbackResponse {
  directDownload: false;
  filename: string;
  downloadUrl: string;
}

export type DownloadUrlsResponse = DownloadUrlsDirectResponse | DownloadUrlsFallbackResponse;
