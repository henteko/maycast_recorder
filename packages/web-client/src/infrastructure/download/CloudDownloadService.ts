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
   * Presigned URLからチャンクを直接ダウンロードしてBlobを組み立てる
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

    // 2. チャンクを順番に取得
    const parts: ArrayBuffer[] = [initData];
    for (const chunk of response.chunks) {
      const chunkData = await this.fetchData(chunk.url);
      parts.push(chunkData);
      current++;
      onProgress?.({ current, total });
    }

    // 3. Blobとして組み立て
    return new Blob(parts, { type: 'video/mp4' });
  }

  private async fetchData(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    return response.arrayBuffer();
  }
}
