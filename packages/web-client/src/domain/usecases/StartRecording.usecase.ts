import type { RecordingId, Recording } from '@maycast/common-types';
import { RecordingEntity } from '@maycast/common-types';
import type { IRecordingRepository } from '../repositories/IRecordingRepository';
import type { IMediaStreamService, ScreenCaptureOptions } from '../services/IMediaStreamService';
import { v4 as uuidv4 } from 'uuid';

/**
 * 録画開始リクエスト
 */
export interface StartRecordingRequest {
  screenOptions?: ScreenCaptureOptions;
}

/**
 * 録画開始レスポンス
 */
export interface StartRecordingResponse {
  recordingId: RecordingId;
  mediaStream: MediaStream;
  recording: Recording;
}

/**
 * 録画開始 Use Case
 *
 * ビジネスフロー:
 * 1. 新しいRecording Entityを作成
 * 2. メディアストリームを取得
 * 3. Recordingを永続化
 * 4. 録画状態を開始に遷移
 */
export class StartRecordingUseCase {
  private recordingRepository: IRecordingRepository;
  private mediaStreamService: IMediaStreamService;

  constructor(
    recordingRepository: IRecordingRepository,
    mediaStreamService: IMediaStreamService
  ) {
    this.recordingRepository = recordingRepository;
    this.mediaStreamService = mediaStreamService;
  }

  async execute(request: StartRecordingRequest): Promise<StartRecordingResponse> {
    // 1. Recording Entityの作成
    const recordingId = uuidv4();
    const recording = RecordingEntity.create(recordingId);

    // 2. メディアストリームの取得
    const mediaStream = await this.mediaStreamService.captureScreen(
      request.screenOptions ?? {
        video: true,
        audio: true,
      }
    );

    // 3. Recording情報の永続化
    await this.recordingRepository.save(recording);

    // 4. 録画開始状態に遷移
    recording.startRecording();
    await this.recordingRepository.updateState(recordingId, recording.getState());

    return {
      recordingId,
      mediaStream,
      recording: recording.toDTO(),
    };
  }
}
