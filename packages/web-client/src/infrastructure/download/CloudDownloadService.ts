import type { DownloadUrlsDirectResponse } from '@maycast/common-types';

export interface DownloadProgress {
  current: number;
  total: number;
}

/**
 * Cloud Download Service
 *
 * Presigned URLを使ってS3から直接チャンクを取得し、
 * Blobとして組み立てる
 */
export class CloudDownloadService {
  private readonly maxConcurrency = 6;

  /**
   * Presigned URLからチャンクを並列ダウンロードしてBlobを組み立てる
   * 同時接続数を制限してブラウザのリソース枯渇を防ぐ
   */
  async download(
    response: DownloadUrlsDirectResponse,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<Blob> {
    const total = 1 + response.chunks.length; // init segment + chunks
    let current = 0;

    // 1. Init Segmentを取得
    const initData = await this.fetchData(response.initSegment.url);
    current++;
    onProgress?.({ current, total });

    // 2. 並列数を制限してチャンクを取得（順序は維持）
    const chunkResults = new Array<ArrayBuffer>(response.chunks.length);
    let nextIndex = 0;

    const worker = async () => {
      while (true) {
        const idx = nextIndex++;
        if (idx >= response.chunks.length) break;
        chunkResults[idx] = await this.fetchData(response.chunks[idx].url);
        current++;
        onProgress?.({ current, total });
      }
    };

    const workers = Array.from(
      { length: Math.min(this.maxConcurrency, response.chunks.length) },
      () => worker()
    );
    await Promise.all(workers);

    // 3. Blobとして組み立て
    return new Blob([initData, ...chunkResults], { type: 'video/mp4' });
  }

  private async fetchData(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    return response.arrayBuffer();
  }
}
