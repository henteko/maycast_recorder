import type { Job } from 'bullmq';
import type pg from 'pg';
import type { TranscriptionJobPayload, TranscriptionJobResult } from '@maycast/common-types';
import { TranscribeRecordingUseCase } from '../domain/usecases/TranscribeRecording.usecase.js';
import type { S3ChunkRepository } from '../infrastructure/repositories/S3ChunkRepository.js';
import type { S3UploadService } from '../infrastructure/services/S3UploadService.js';
import type { DeepgramTranscriptionService } from '../infrastructure/services/DeepgramTranscriptionService.js';

/**
 * Transcription ジョブハンドラ
 *
 * m4aファイルをDeepgram APIで文字起こしし、VTT字幕ファイルを生成してS3に保存する
 */
export class TranscriptionJobHandler {
  private readonly useCase: TranscribeRecordingUseCase;

  constructor(
    private readonly pool: pg.Pool,
    chunkRepository: S3ChunkRepository,
    uploadService: S3UploadService,
    transcriptionService: DeepgramTranscriptionService,
    private readonly tempDir: string,
  ) {
    this.useCase = new TranscribeRecordingUseCase(chunkRepository, uploadService, transcriptionService);
  }

  async handle(job: Job<TranscriptionJobPayload>): Promise<TranscriptionJobResult> {
    const { roomId, recordingId, m4aKey } = job.data;
    const startTime = Date.now();

    console.log(`📝 [Worker] Processing transcription job ${job.id} for recording ${recordingId}`);

    try {
      // transcription_state を processing に更新
      await this.updateTranscriptionState(recordingId, 'processing');

      const result = await this.useCase.execute({
        recordingId,
        roomId,
        m4aKey,
        tempDir: this.tempDir,
      });

      // transcription_state を completed に更新
      await this.updateTranscriptionState(recordingId, 'completed', undefined, result.vttKey);

      const processingDurationMs = Date.now() - startTime;
      console.log(`✅ [Worker] Transcription job ${job.id} completed in ${processingDurationMs}ms`);

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`❌ [Worker] Transcription job ${job.id} failed:`, errorMessage);

      // transcription_state を failed に更新
      await this.updateTranscriptionState(recordingId, 'failed', errorMessage);

      throw err;
    }
  }

  private async updateTranscriptionState(
    recordingId: string,
    state: 'pending' | 'processing' | 'completed' | 'failed',
    error?: string,
    outputVttKey?: string,
  ): Promise<void> {
    try {
      if (state === 'completed' && outputVttKey) {
        await this.pool.query(
          `UPDATE recordings SET transcription_state = $1, transcription_error = NULL, output_vtt_key = $2, transcribed_at = NOW() WHERE id = $3`,
          [state, outputVttKey, recordingId],
        );
      } else if (state === 'failed') {
        await this.pool.query(
          `UPDATE recordings SET transcription_state = $1, transcription_error = $2 WHERE id = $3`,
          [state, error ?? null, recordingId],
        );
      } else {
        await this.pool.query(
          `UPDATE recordings SET transcription_state = $1 WHERE id = $2`,
          [state, recordingId],
        );
      }
    } catch (err) {
      console.error(`  ⚠️ [Worker] Failed to update transcription state for ${recordingId}:`, err);
    }
  }
}
