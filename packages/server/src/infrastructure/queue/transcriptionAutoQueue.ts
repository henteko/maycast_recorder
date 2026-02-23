import { Job, QueueEvents } from 'bullmq';
import { QUEUE_NAMES } from '@maycast/common-types';
import type { AudioExtractionJobPayload, AudioExtractionJobResult } from '@maycast/common-types';
import { getAudioExtractionQueue } from './audioExtractionQueue.js';
import { getTranscriptionQueue } from './transcriptionQueue.js';
import type { IRecordingRepository } from '../../domain/repositories/IRecordingRepository.js';

/**
 * AudioExtraction完了後にTranscriptionジョブを自動投入する
 *
 * BullMQのQueueEventsでaudio-extractionキューの完了を監視し、
 * 各recordingのm4aキーに対してtranscriptionジョブを投入する
 */
export async function setupTranscriptionAutoQueue(
  recordingRepository: IRecordingRepository,
): Promise<void> {
  const redisHost = process.env.REDIS_HOST;
  if (!redisHost) {
    console.log('ℹ️ [Server] Redis not configured, skipping transcription auto-queue setup');
    return;
  }

  const audioQueue = getAudioExtractionQueue();
  const transcriptionQueue = getTranscriptionQueue();
  if (!audioQueue || !transcriptionQueue) {
    console.log('ℹ️ [Server] Queue not available, skipping transcription auto-queue setup');
    return;
  }

  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

  const queueEvents = new QueueEvents(QUEUE_NAMES.AUDIO_EXTRACTION, {
    connection: {
      host: redisHost,
      port: redisPort,
    },
  });

  queueEvents.on('completed', async ({ jobId }) => {
    try {
      // Job.fromId で完了済みジョブの結果を安全に取得
      const job = await Job.fromId<AudioExtractionJobPayload, AudioExtractionJobResult>(audioQueue, jobId);
      if (!job || !job.returnvalue) {
        console.warn(`⚠️ [Server] Could not retrieve completed job ${jobId}`);
        return;
      }

      const result = job.returnvalue;

      for (const [recordingId, output] of Object.entries(result.outputs)) {
        if (!output.m4aKey) continue;

        // recordingからroomIdを取得
        const recording = await recordingRepository.findById(recordingId);
        if (!recording) continue;
        const roomId = recording.getRoomId();
        if (!roomId) continue;

        // transcription_stateをpendingに更新
        await recordingRepository.updateTranscriptionState(recordingId, 'pending');

        await transcriptionQueue.add(`transcribe-${recordingId}`, {
          roomId,
          recordingId,
          m4aKey: output.m4aKey,
          createdAt: new Date().toISOString(),
        });

        console.log(`📝 [Server] Transcription job enqueued for recording ${recordingId} (audio extraction job ${jobId})`);
      }
    } catch (err) {
      console.error(`❌ [Server] Failed to enqueue transcription job from audio extraction job ${jobId}:`, err);
    }
  });

  console.log('✅ [Server] Transcription auto-queue listening for audio extraction completions');
}
