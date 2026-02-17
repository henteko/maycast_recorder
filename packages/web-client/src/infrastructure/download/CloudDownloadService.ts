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
  /**
   * Presigned URLからチャンクを全並列ダウンロードしてBlobを組み立てる
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

    // 2. 全チャンクを同時並列で取得（順序はPromise.allで維持）
    const chunkResults = await Promise.all(
      response.chunks.map(async (chunk) => {
        const data = await this.fetchData(chunk.url);
        current++;
        onProgress?.({ current, total });
        return data;
      })
    );

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
