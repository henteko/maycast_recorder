import type { Job } from 'bullmq';
import type pg from 'pg';
import type { AudioExtractionJobPayload, AudioExtractionJobResult } from '@maycast/common-types';
import { ProcessRecordingUseCase } from '../domain/usecases/ProcessRecording.usecase.js';
import type { S3ChunkRepository } from '../infrastructure/repositories/S3ChunkRepository.js';
import type { S3UploadService } from '../infrastructure/services/S3UploadService.js';

/**
 * Audio Extraction ジョブハンドラ
 *
 * recordingIds をループして各 recording を処理する
 * 1つの recording が失敗しても残りは処理続行
 */
export class AudioExtractionJobHandler {
  private readonly useCase: ProcessRecordingUseCase;

  constructor(
    private readonly pool: pg.Pool,
    chunkRepository: S3ChunkRepository,
    uploadService: S3UploadService,
    private readonly tempDir: string,
  ) {
    this.useCase = new ProcessRecordingUseCase(chunkRepository, uploadService);
  }

  async handle(job: Job<AudioExtractionJobPayload>): Promise<AudioExtractionJobResult> {
    const { roomId, recordingIds } = job.data;
    const startTime = Date.now();

    console.log(`🎬 [Worker] Processing job ${job.id} for room ${roomId} with ${recordingIds.length} recordings`);

    const outputs: AudioExtractionJobResult['outputs'] = {};
    let processedCount = 0;

    for (const recordingId of recordingIds) {
      try {
        // processing_state を processing に更新
        await this.updateProcessingState(recordingId, 'processing');

        console.log(`  🎙️ [Worker] Processing recording ${recordingId} (${processedCount + 1}/${recordingIds.length})`);

        const result = await this.useCase.execute({
          recordingId,
          roomId,
          tempDir: this.tempDir,
        });

        // processing_state を completed に更新
        await this.updateProcessingState(recordingId, 'completed', undefined, {
          mp4Key: result.mp4Key,
          m4aKey: result.m4aKey,
        });

        outputs[recordingId] = result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`  ❌ [Worker] Failed to process recording ${recordingId}:`, errorMessage);

        // processing_state を failed に更新
        await this.updateProcessingState(recordingId, 'failed', errorMessage);
      }

      processedCount++;
      await job.updateProgress(Math.round((processedCount / recordingIds.length) * 100));
    }

    const processingDurationMs = Date.now() - startTime;

    console.log(`✅ [Worker] Job ${job.id} completed in ${processingDurationMs}ms (${Object.keys(outputs).length}/${recordingIds.length} successful)`);

    return { outputs, processingDurationMs };
  }

  private async updateProcessingState(
    recordingId: string,
    state: 'pending' | 'processing' | 'completed' | 'failed',
    error?: string,
    outputKeys?: { mp4Key: string; m4aKey: string },
  ): Promise<void> {
    try {
      if (state === 'completed' && outputKeys) {
        await this.pool.query(
          `UPDATE recordings SET processing_state = $1, processing_error = NULL, output_mp4_key = $2, output_m4a_key = $3, processed_at = NOW() WHERE id = $4`,
          [state, outputKeys.mp4Key, outputKeys.m4aKey, recordingId],
        );
      } else if (state === 'failed') {
        await this.pool.query(
          `UPDATE recordings SET processing_state = $1, processing_error = $2 WHERE id = $3`,
          [state, error ?? null, recordingId],
        );
      } else {
        await this.pool.query(
          `UPDATE recordings SET processing_state = $1 WHERE id = $2`,
          [state, recordingId],
        );
      }
    } catch (err) {
      console.error(`  ⚠️ [Worker] Failed to update processing state for ${recordingId}:`, err);
    }
  }
}
