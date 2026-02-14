/**
 * Streaming Download Utility
 *
 * クラウドストレージから署名付きURLを使って
 * チャンクファイルを直接ストリーミングダウンロードする
 */

import { RecordingAPIClient } from './recording-api';
import type { DirectDownloadUrlsResponse, ChunkDownloadUrlInfo } from './recording-api';

/**
 * ダウンロード進捗情報
 */
export interface DownloadProgress {
  /** 完了したチャンク数 */
  completedChunks: number;
  /** 総チャンク数 */
  totalChunks: number;
  /** ダウンロード済みバイト数 */
  downloadedBytes: number;
  /** 進捗率 (0-1) */
  progress: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

/**
 * 最大同時ダウンロード数
 */
const MAX_CONCURRENT_DOWNLOADS = 4;

/**
 * 単一チャンクをダウンロード
 */
async function downloadChunk(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download chunk: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

/**
 * チャンクを並列ダウンロードし、順序を維持して結合する
 *
 * init segmentを最初にダウンロードした後、
 * 残りのチャンクを並列でダウンロードしてBlobとして返す
 */
async function downloadChunksStreaming(
  chunks: ChunkDownloadUrlInfo[],
  onProgress?: ProgressCallback
): Promise<Blob> {
  const totalChunks = chunks.length;
  let completedChunks = 0;
  let downloadedBytes = 0;

  // 結果を格納する配列（順序維持のため事前確保）
  const results: ArrayBuffer[] = new Array(totalChunks);

  const reportProgress = () => {
    onProgress?.({
      completedChunks,
      totalChunks,
      downloadedBytes,
      progress: totalChunks > 0 ? completedChunks / totalChunks : 0,
    });
  };

  // 初回進捗報告
  reportProgress();

  // 並列ダウンロード（同時実行数制限付き）
  let nextIndex = 0;

  const downloadNext = async (): Promise<void> => {
    while (nextIndex < totalChunks) {
      const index = nextIndex++;
      const chunk = chunks[index];
      const buffer = await downloadChunk(chunk.url);
      results[index] = buffer;
      completedChunks++;
      downloadedBytes += buffer.byteLength;
      reportProgress();
    }
  };

  // 並列ワーカーを起動
  const workers: Promise<void>[] = [];
  const concurrency = Math.min(MAX_CONCURRENT_DOWNLOADS, totalChunks);
  for (let i = 0; i < concurrency; i++) {
    workers.push(downloadNext());
  }

  await Promise.all(workers);

  // 順序通りにBlobを構築
  return new Blob(results.map((buf) => new Uint8Array(buf)), {
    type: 'video/mp4',
  });
}

/**
 * 録画を直接クラウドストレージからストリーミングダウンロードする
 *
 * フロー:
 * 1. サーバーから署名付きURLリストを取得
 * 2. 各チャンクをクラウドストレージから直接並列ダウンロード
 * 3. 順序を維持してBlobに結合
 *
 * クラウドストレージ非対応の場合はサーバープロキシ方式にフォールバック
 *
 * @returns ダウンロード結果のBlob
 */
export async function streamingDownloadRecording(
  apiClient: RecordingAPIClient,
  recordingId: string,
  onProgress?: ProgressCallback
): Promise<Blob> {
  // 1. 署名付きURLを取得
  const urlsResponse = await apiClient.getDownloadUrls(recordingId);

  // 2. プロキシモードの場合はフォールバック
  if (urlsResponse.mode === 'proxy') {
    return apiClient.downloadRecording(recordingId);
  }

  const directResponse = urlsResponse as DirectDownloadUrlsResponse;

  // 3. チャンクを直接ダウンロード
  return downloadChunksStreaming(directResponse.chunks, onProgress);
}

/**
 * ブラウザダウンロードをトリガーする
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
