import type { Request, Response } from 'express';
import { RecordingNotFoundError } from '@maycast/common-types';
import type { CreateRecordingUseCase } from '../../domain/usecases/CreateRecording.usecase';
import type { GetRecordingUseCase } from '../../domain/usecases/GetRecording.usecase';
import type { UpdateRecordingStateUseCase } from '../../domain/usecases/UpdateRecordingState.usecase';
import type { UpdateRecordingMetadataUseCase } from '../../domain/usecases/UpdateRecordingMetadata.usecase';
import type { DownloadRecordingUseCase } from '../../domain/usecases/DownloadRecording.usecase';

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

  constructor(
    createRecordingUseCase: CreateRecordingUseCase,
    getRecordingUseCase: GetRecordingUseCase,
    updateRecordingStateUseCase: UpdateRecordingStateUseCase,
    updateRecordingMetadataUseCase: UpdateRecordingMetadataUseCase,
    downloadRecordingUseCase: DownloadRecordingUseCase
  ) {
    this.createRecordingUseCase = createRecordingUseCase;
    this.getRecordingUseCase = getRecordingUseCase;
    this.updateRecordingStateUseCase = updateRecordingStateUseCase;
    this.updateRecordingMetadataUseCase = updateRecordingMetadataUseCase;
    this.downloadRecordingUseCase = downloadRecordingUseCase;
  }

  async create(_req: Request, res: Response): Promise<void> {
    const result = await this.createRecordingUseCase.execute();

    res.status(201).json({
      recording_id: result.recordingId,
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

    if (!state) {
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
}
