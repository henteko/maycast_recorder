import type { Request, Response } from 'express';
import { RecordingNotFoundError } from '@maycast/common-types';
import type { CreateRecordingUseCase } from '../../domain/usecases/CreateRecording.usecase.js';
import type { GetRecordingUseCase } from '../../domain/usecases/GetRecording.usecase.js';
import type { UpdateRecordingStateUseCase } from '../../domain/usecases/UpdateRecordingState.usecase.js';
import type { UpdateRecordingMetadataUseCase } from '../../domain/usecases/UpdateRecordingMetadata.usecase.js';
import type { DownloadRecordingUseCase } from '../../domain/usecases/DownloadRecording.usecase.js';
import type { GetDownloadUrlsUseCase } from '../../domain/usecases/GetDownloadUrls.usecase.js';

/**
 * Recording Controller
 *
 * HTTPリクエストを受け取り、Use Caseを実行し、レスポンスを返す
 * エラーハンドリングはミドルウェアに委譲
 */
export class RecordingController {
  private createRecordingUseCase: CreateRecordingUseCase;
  private getRecordingUseCase: GetRecordingUseCase;
  private updateRecordingStateUseCase: UpdateRecordingStateUseCase;
  private updateRecordingMetadataUseCase: UpdateRecordingMetadataUseCase;
  private downloadRecordingUseCase: DownloadRecordingUseCase;
  private getDownloadUrlsUseCase: GetDownloadUrlsUseCase;

  constructor(
    createRecordingUseCase: CreateRecordingUseCase,
    getRecordingUseCase: GetRecordingUseCase,
    updateRecordingStateUseCase: UpdateRecordingStateUseCase,
    updateRecordingMetadataUseCase: UpdateRecordingMetadataUseCase,
    downloadRecordingUseCase: DownloadRecordingUseCase,
    getDownloadUrlsUseCase: GetDownloadUrlsUseCase
  ) {
    this.createRecordingUseCase = createRecordingUseCase;
    this.getRecordingUseCase = getRecordingUseCase;
    this.updateRecordingStateUseCase = updateRecordingStateUseCase;
    this.updateRecordingMetadataUseCase = updateRecordingMetadataUseCase;
    this.downloadRecordingUseCase = downloadRecordingUseCase;
    this.getDownloadUrlsUseCase = getDownloadUrlsUseCase;
  }

  async create(req: Request, res: Response): Promise<void> {
    const roomId = req.query.roomId as string | undefined;

    const result = await this.createRecordingUseCase.execute({ roomId });

    res.status(201).json({
      recording_id: result.recordingId,
      room_id: result.recording.roomId,
      created_at: result.recording.createdAt,
      state: result.recording.state,
    });
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const recording = await this.getRecordingUseCase.execute({ recordingId: id });

    if (!recording) {
      throw new RecordingNotFoundError(`Recording not found: ${id}`);
    }

    res.json({
      id: recording.id,
      room_id: recording.roomId,
      state: recording.state,
      created_at: recording.createdAt,
      started_at: recording.startTime,
      finished_at: recording.endTime,
      metadata: recording.metadata,
      chunk_count: recording.chunkCount,
    });
  }

  async updateState(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { state } = req.body;

    console.log('🔍 [RecordingController.updateState] Request received:', {
      id,
      body: req.body,
      state,
      contentType: req.headers['content-type'],
    });

    if (!state) {
      console.error('❌ [RecordingController.updateState] State is missing');
      res.status(400).json({ error: 'State is required' });
      return;
    }

    await this.updateRecordingStateUseCase.execute({ recordingId: id, state });

    res.status(200).json({ success: true });
  }

  async updateMetadata(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const metadata = req.body;

    await this.updateRecordingMetadataUseCase.execute({ recordingId: id, metadata });

    res.status(200).json({ success: true });
  }

  async download(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const result = await this.downloadRecordingUseCase.execute({ recordingId: id });

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);

    result.stream.pipe(res);
  }

  async getDownloadUrls(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const result = await this.getDownloadUrlsUseCase.execute({ recordingId: id });

    if (!result) {
      // ローカルストレージの場合は直接ダウンロード非対応
      res.status(200).json({
        mode: 'proxy',
        message: 'Direct download not available. Use /api/recordings/:id/download instead.',
      });
      return;
    }

    res.json({
      mode: 'direct',
      recording_id: result.recordingId,
      filename: result.filename,
      chunks: result.chunks.map((chunk) => ({
        type: chunk.type,
        chunk_id: chunk.chunkId,
        url: chunk.url,
      })),
    });
  }
}
