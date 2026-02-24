import { mkdir, rm, open } from 'fs/promises';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { S3ChunkRepository } from '../../infrastructure/repositories/S3ChunkRepository.js';
import type { S3UploadService } from '../../infrastructure/services/S3UploadService.js';

const execFileAsync = promisify(execFile);

export interface ProcessRecordingRequest {
  recordingId: string;
  roomId: string;
  tempDir: string;
}

export interface ProcessRecordingResult {
  mp4Key: string;
  m4aKey: string;
  mp4Size: number;
  m4aSize: number;
}

/**
 * ProcessRecording UseCase
 *
 * S3からfMP4チャンクをダウンロード → MP4結合 → ffmpegでaudio track抽出 → S3にアップロード
 */
export class ProcessRecordingUseCase {
  constructor(
    private readonly chunkRepository: S3ChunkRepository,
    private readonly uploadService: S3UploadService,
  ) {}

  async execute(request: ProcessRecordingRequest): Promise<ProcessRecordingResult> {
    const { recordingId, roomId, tempDir } = request;
    const workDir = join(tempDir, recordingId);
    const inputPath = join(workDir, 'input.mp4');
    const audioPath = join(workDir, 'audio.m4a');

    try {
      await mkdir(workDir, { recursive: true });

      // 1. S3からinit segmentをダウンロード
      console.log(`  📥 [Worker] Downloading init segment for ${recordingId}`);
      const initSegment = await this.chunkRepository.getInitSegment(recordingId, roomId);
      if (!initSegment) {
        throw new Error(`Init segment not found for recording ${recordingId}`);
      }

      // 2. チャンクIDリスト取得
      const chunkIds = await this.chunkRepository.listChunkIds(recordingId, roomId);
      console.log(`  📋 [Worker] Found ${chunkIds.length} chunks for ${recordingId}`);

      if (chunkIds.length === 0) {
        throw new Error(`No chunks found for recording ${recordingId}`);
      }

      // 3. S3からチャンクを並列ダウンロード
      const maxConcurrency = 6;
      console.log(`  📥 [Worker] Downloading ${chunkIds.length} chunks (concurrency: ${maxConcurrency})`);
      const chunkBuffers = new Array<Buffer | Uint8Array>(chunkIds.length);
      let nextIndex = 0;

      const downloadWorker = async () => {
        while (true) {
          const idx = nextIndex++;
          if (idx >= chunkIds.length) break;
          const chunk = await this.chunkRepository.getChunk(recordingId, chunkIds[idx], roomId);
          if (!chunk) {
            throw new Error(`Chunk ${chunkIds[idx]} not found for recording ${recordingId}`);
          }
          chunkBuffers[idx] = chunk;
        }
      };

      const workers = Array.from(
        { length: Math.min(maxConcurrency, chunkIds.length) },
        () => downloadWorker(),
      );
      await Promise.all(workers);

      // 4. init + chunks を順番に結合して input.mp4 に書き込み
      console.log(`  🔗 [Worker] Writing init segment + ${chunkIds.length} chunks to input.mp4`);
      const fileHandle = await open(inputPath, 'w');
      try {
        await fileHandle.write(initSegment);
        for (const chunkBuffer of chunkBuffers) {
          await fileHandle.write(chunkBuffer);
        }
      } finally {
        await fileHandle.close();
      }

      // 5. ffmpegでaudio track抽出
      console.log(`  🎵 [Worker] Extracting audio track with ffmpeg for ${recordingId}`);
      try {
        await execFileAsync('ffmpeg', [
          '-i', inputPath,
          '-vn',
          '-acodec', 'copy',
          '-y',
          audioPath,
        ], {
          timeout: 300000, // 5分タイムアウト
        });
      } catch (err: unknown) {
        const error = err as Error & { stderr?: string };
        throw new Error(`ffmpeg failed for recording ${recordingId}: ${error.stderr || error.message}`);
      }

      // 6. output.mp4 と audio.m4a を S3 にアップロード
      const mp4Key = `rooms/${roomId}/${recordingId}/output.mp4`;
      const m4aKey = `rooms/${roomId}/${recordingId}/audio.m4a`;

      console.log(`  📤 [Worker] Uploading output.mp4 to S3 for ${recordingId}`);
      // input.mp4 を output.mp4 としてアップロード（元のfMP4を結合したもの）
      const mp4Size = await this.uploadService.uploadFile(inputPath, mp4Key, 'video/mp4');

      console.log(`  📤 [Worker] Uploading audio.m4a to S3 for ${recordingId}`);
      const m4aSize = await this.uploadService.uploadFile(audioPath, m4aKey, 'audio/mp4');

      console.log(`  ✅ [Worker] Processing complete for ${recordingId} (mp4: ${mp4Size} bytes, m4a: ${m4aSize} bytes)`);

      return { mp4Key, m4aKey, mp4Size, m4aSize };
    } finally {
      // 7. tempディレクトリをcleanup
      try {
        await rm(workDir, { recursive: true, force: true });
      } catch {
        // cleanup failure is non-fatal
      }
    }
  }
}

/**
 * ffmpegが利用可能か確認
 */
export async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * input.mp4のオーディオトラックの有無を確認
 */
export async function hasAudioTrack(inputPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=codec_type',
      '-of', 'csv=p=0',
      inputPath,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * オーディオトラック不在時にsilent audio付きのm4aを生成
 */
export async function generateSilentAudio(inputPath: string, outputPath: string): Promise<void> {
  // 動画の長さを取得
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    inputPath,
  ]);
  const duration = parseFloat(stdout.trim());

  await execFileAsync('ffmpeg', [
    '-f', 'lavfi',
    '-i', `anullsrc=channel_layout=stereo:sample_rate=48000`,
    '-t', String(duration),
    '-acodec', 'aac',
    '-y',
    outputPath,
  ]);
}
