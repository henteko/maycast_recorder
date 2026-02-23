import { Worker } from 'bullmq';
import { QUEUE_NAMES } from '@maycast/common-types';
import type { AudioExtractionJobPayload, AudioExtractionJobResult, TranscriptionJobPayload, TranscriptionJobResult } from '@maycast/common-types';
import { getWorkerConfig } from './infrastructure/config/workerConfig.js';
import { getStorageConfig } from './infrastructure/config/storageConfig.js';
import type { S3StorageConfig } from './infrastructure/config/storageConfig.js';
import { getAIConfig } from './infrastructure/config/aiConfig.js';
import { getPool, closePool } from './infrastructure/database/PostgresClient.js';
import { S3ChunkRepository } from './infrastructure/repositories/S3ChunkRepository.js';
import { S3UploadService } from './infrastructure/services/S3UploadService.js';
import { GeminiTranscriptionService } from './infrastructure/services/GeminiTranscriptionService.js';
import { AudioExtractionJobHandler } from './application/AudioExtractionJobHandler.js';
import { TranscriptionJobHandler } from './application/TranscriptionJobHandler.js';
import { checkFfmpegAvailable } from './domain/usecases/ProcessRecording.usecase.js';

async function main(): Promise<void> {
  console.log('🚀 [Worker] Maycast Audio Extraction Worker starting...');

  // ffmpeg の存在チェック
  const ffmpegAvailable = await checkFfmpegAvailable();
  if (!ffmpegAvailable) {
    console.error('❌ [Worker] ffmpeg is not available. Please install ffmpeg.');
    process.exit(1);
  }
  console.log('✅ [Worker] ffmpeg is available');

  // 設定の読み込み
  const workerConfig = getWorkerConfig();
  const storageConfig = getStorageConfig();

  if (storageConfig.backend !== 's3') {
    console.error('❌ [Worker] Worker requires S3 storage backend (STORAGE_BACKEND=s3)');
    process.exit(1);
  }

  const s3Config = storageConfig as S3StorageConfig;

  // インフラストラクチャの初期化
  const pool = getPool();
  const chunkRepository = new S3ChunkRepository(s3Config);
  const uploadService = new S3UploadService(s3Config);

  // ジョブハンドラの作成
  const jobHandler = new AudioExtractionJobHandler(
    pool,
    chunkRepository,
    uploadService,
    workerConfig.tempDir,
  );

  // BullMQ Worker の起動
  const worker = new Worker<AudioExtractionJobPayload, AudioExtractionJobResult>(
    QUEUE_NAMES.AUDIO_EXTRACTION,
    async (job) => jobHandler.handle(job),
    {
      connection: {
        host: workerConfig.redisHost,
        port: workerConfig.redisPort,
      },
      concurrency: workerConfig.concurrency,
    },
  );

  worker.on('completed', (job) => {
    console.log(`🎉 [Worker] Audio extraction job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ [Worker] Audio extraction job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('❌ [Worker] Audio extraction worker error:', err);
  });

  console.log(`✅ [Worker] Listening on queue "${QUEUE_NAMES.AUDIO_EXTRACTION}" with concurrency ${workerConfig.concurrency}`);
  console.log(`📁 [Worker] Temp directory: ${workerConfig.tempDir}`);

  // Transcription Worker（GEMINI_API_KEY が設定されている場合のみ起動）
  const aiConfig = getAIConfig();
  let transcriptionWorker: Worker<TranscriptionJobPayload, TranscriptionJobResult> | null = null;

  if (aiConfig) {
    const transcriptionService = new GeminiTranscriptionService(aiConfig);
    const transcriptionHandler = new TranscriptionJobHandler(
      pool,
      chunkRepository,
      uploadService,
      transcriptionService,
      workerConfig.tempDir,
    );

    transcriptionWorker = new Worker<TranscriptionJobPayload, TranscriptionJobResult>(
      QUEUE_NAMES.TRANSCRIPTION,
      async (job) => transcriptionHandler.handle(job),
      {
        connection: {
          host: workerConfig.redisHost,
          port: workerConfig.redisPort,
        },
        concurrency: 1, // Gemini APIレート制限を考慮して同時実行数1
      },
    );

    transcriptionWorker.on('completed', (job) => {
      console.log(`🎉 [Worker] Transcription job ${job.id} completed successfully`);
    });

    transcriptionWorker.on('failed', (job, err) => {
      console.error(`❌ [Worker] Transcription job ${job?.id} failed:`, err.message);
    });

    transcriptionWorker.on('error', (err) => {
      console.error('❌ [Worker] Transcription worker error:', err);
    });

    console.log(`✅ [Worker] Transcription worker listening on queue "${QUEUE_NAMES.TRANSCRIPTION}" (model: ${aiConfig.geminiModel})`);
  } else {
    console.log('ℹ️ [Worker] GEMINI_API_KEY not set, transcription worker disabled');
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 [Worker] Received ${signal}, shutting down gracefully...`);
    try {
      await worker.close();
      console.log('✅ [Worker] Audio extraction worker closed');
      if (transcriptionWorker) {
        await transcriptionWorker.close();
        console.log('✅ [Worker] Transcription worker closed');
      }
      await closePool();
      console.log('✅ [Worker] Database pool closed');
    } catch (err) {
      console.error('❌ [Worker] Error during shutdown:', err);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('❌ [Worker] Fatal error:', err);
  process.exit(1);
});
