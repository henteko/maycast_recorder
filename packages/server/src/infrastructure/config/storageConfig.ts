export type StorageBackend = 'local' | 's3';

export interface LocalStorageConfig {
  backend: 'local';
  storagePath: string;
}

export interface S3StorageConfig {
  backend: 's3';
  endpoint: string;
  /** Presigned URL生成用の公開エンドポイント（ブラウザからアクセス可能なURL） */
  publicEndpoint?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  forcePathStyle: boolean;
}

export type StorageConfig = LocalStorageConfig | S3StorageConfig;

/**
 * 環境変数からストレージ設定を取得
 *
 * STORAGE_BACKEND=local (default): ローカルファイルシステム
 * STORAGE_BACKEND=s3: S3互換ストレージ (Cloudflare R2, LocalStack, AWS S3)
 */
export function getStorageConfig(): StorageConfig {
  const backend = (process.env.STORAGE_BACKEND || 'local') as StorageBackend;

  if (backend === 's3') {
    const endpoint = process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'S3 storage backend requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY environment variables'
      );
    }

    return {
      backend: 's3',
      endpoint,
      publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || undefined,
      bucket,
      accessKeyId,
      secretAccessKey,
      region: process.env.S3_REGION || 'auto',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    };
  }

  return {
    backend: 'local',
    storagePath: process.env.STORAGE_PATH || './recordings-data',
  };
}
