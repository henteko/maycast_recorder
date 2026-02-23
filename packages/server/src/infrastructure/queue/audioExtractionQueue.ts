import { Queue } from 'bullmq';
import type { AudioExtractionJobPayload } from '@maycast/common-types';
import { QUEUE_NAMES } from '@maycast/common-types';

let queue: Queue<AudioExtractionJobPayload> | null = null;

/**
 * Audio Extraction Queue を取得
 *
 * REDIS_HOST 環境変数が未設定の場合は null を返す（Redis無しでも動作可能）
 */
export function getAudioExtractionQueue(): Queue<AudioExtractionJobPayload> | null {
  const redisHost = process.env.REDIS_HOST;
  if (!redisHost) {
    return null;
  }

  if (!queue) {
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

    queue = new Queue<AudioExtractionJobPayload>(QUEUE_NAMES.AUDIO_EXTRACTION, {
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
