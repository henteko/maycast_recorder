export interface WorkerConfig {
  redisHost: string;
  redisPort: number;
  concurrency: number;
  tempDir: string;
}

export function getWorkerConfig(): WorkerConfig {
  const redisHost = process.env.REDIS_HOST;
  if (!redisHost) {
    throw new Error('REDIS_HOST environment variable is required');
  }

  return {
    redisHost,
    redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
    tempDir: process.env.WORKER_TEMP_DIR || '/tmp/maycast-worker',
  };
}
