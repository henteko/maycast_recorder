import type {
  IUploadStrategy,
  UploadParams,
  UploadProgress,
} from '../../domain/services/IUploadStrategy';

/**
 * アップロードを行わない Upload Strategy の実装
 *
 * Standalone モードで使用
 * すべての操作は何もせず、ローカルストレージのみに保存
 */
export class NoOpUploadStrategy implements IUploadStrategy {
  async upload(_params: UploadParams): Promise<void> {
    // 何もしない（ローカルストレージのみ）
    return Promise.resolve();
  }

  getProgress(): UploadProgress {
    return {
      uploaded: 0,
      total: 0,
      percentage: 100, // アップロードがないので常に100%
    };
  }

  async waitForCompletion(): Promise<void> {
    // 何もしない
    return Promise.resolve();
  }

  clear(): void {
    // 何もしない
  }
}
