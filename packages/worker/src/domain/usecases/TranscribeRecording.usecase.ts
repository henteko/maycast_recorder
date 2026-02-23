import { GeminiTranscriptionService } from '../../infrastructure/services/GeminiTranscriptionService.js';
import type { S3ChunkRepository } from '../../infrastructure/repositories/S3ChunkRepository.js';
import type { S3UploadService } from '../../infrastructure/services/S3UploadService.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';

export interface TranscribeRecordingRequest {
  recordingId: string;
  roomId: string;
  m4aKey: string;
  tempDir: string;
}

export interface TranscribeRecordingResult {
  vttKey: string;
  vttSize: number;
}

/**
 * TranscribeRecording UseCase
 *
 * S3からm4aをダウンロード → Gemini APIで文字起こし → VTT生成 → S3にアップロード
 */
export class TranscribeRecordingUseCase {
  constructor(
    private readonly chunkRepository: S3ChunkRepository,
    private readonly uploadService: S3UploadService,
    private readonly transcriptionService: GeminiTranscriptionService,
  ) {}

  async execute(request: TranscribeRecordingRequest): Promise<TranscribeRecordingResult> {
    const { recordingId, roomId, m4aKey, tempDir } = request;
    const workDir = join(tempDir, `transcribe-${recordingId}`);
    const vttPath = join(workDir, 'subtitle.vtt');

    try {
      await mkdir(workDir, { recursive: true });

      // 1. S3からm4aをダウンロード
      console.log(`  📥 [Worker] Downloading m4a for transcription: ${m4aKey}`);
      const m4aBuffer = await this.chunkRepository.getObjectByKey(m4aKey);
      if (!m4aBuffer) {
        throw new Error(`M4A file not found at key: ${m4aKey}`);
      }

      // 2. Gemini APIで文字起こし
      console.log(`  🎤 [Worker] Transcribing with Gemini API for ${recordingId} (${m4aBuffer.length} bytes)`);
      const segments = await this.transcriptionService.transcribe(m4aBuffer);
      console.log(`  📝 [Worker] Got ${segments.length} transcription segments for ${recordingId}`);

      // 3. VTT生成
      const vttContent = GeminiTranscriptionService.toWebVTT(segments);
      await writeFile(vttPath, vttContent, 'utf-8');

      // 4. S3にアップロード
      const vttKey = `rooms/${roomId}/${recordingId}/subtitle.vtt`;
      console.log(`  📤 [Worker] Uploading VTT to S3: ${vttKey}`);
      const vttSize = await this.uploadService.uploadFile(vttPath, vttKey, 'text/vtt');

      console.log(`  ✅ [Worker] Transcription complete for ${recordingId} (${vttSize} bytes)`);

      return { vttKey, vttSize };
    } finally {
      try {
        await rm(workDir, { recursive: true, force: true });
      } catch {
        // cleanup failure is non-fatal
      }
    }
  }
}
