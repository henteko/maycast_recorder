import { Queue } from 'bullmq';
import type { TranscriptionJobPayload } from '@maycast/common-types';
import { QUEUE_NAMES } from '@maycast/common-types';

let queue: Queue<TranscriptionJobPayload> | null = null;

/**
 * Transcription Queue を取得
 *
 * REDIS_HOST 環境変数が未設定の場合は null を返す（Redis無しでも動作可能）
 */
export function getTranscriptionQueue(): Queue<TranscriptionJobPayload> | null {
  const redisHost = process.env.REDIS_HOST;
  if (!redisHost) {
    return null;
  }

  if (!queue) {
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

    queue = new Queue<TranscriptionJobPayload>(QUEUE_NAMES.TRANSCRIPTION, {
      connection: {
        host: redisHost,
        port: redisPort,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 30000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }

  return queue;
}
