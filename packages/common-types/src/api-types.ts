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
  /** Worker処理済みm4aのPresigned URL（存在する場合のみ） */
  m4aUrl?: string;
  /** m4aのファイル名 */
  m4aFilename?: string;
}

export interface DownloadUrlsFallbackResponse {
  directDownload: false;
  filename: string;
  downloadUrl: string;
}

export type DownloadUrlsResponse = DownloadUrlsDirectResponse | DownloadUrlsFallbackResponse;

/**
 * GET /api/recordings/:id/upload-url/init-segment - Response
 * GET /api/recordings/:id/upload-url/chunk?chunk_id=N - Response
 *
 * S3バックエンドの場合: directUpload=true + presigned URL
 * ローカルバックエンドの場合: directUpload=false（従来のプロキシ方式を使用）
 */
export interface UploadUrlDirectResponse {
  directUpload: true;
  url: string;
  expiresIn: number;
}

export interface UploadUrlProxyResponse {
  directUpload: false;
}

export type UploadUrlResponse = UploadUrlDirectResponse | UploadUrlProxyResponse;
