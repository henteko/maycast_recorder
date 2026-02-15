import type { Request, Response } from 'express';
import type { UploadInitSegmentUseCase } from '../../domain/usecases/UploadInitSegment.usecase.js';
import type { UploadChunkUseCase } from '../../domain/usecases/UploadChunk.usecase.js';
import type { GetUploadUrlUseCase } from '../../domain/usecases/GetUploadUrl.usecase.js';
import type { ConfirmChunkUploadUseCase } from '../../domain/usecases/ConfirmChunkUpload.usecase.js';

/**
 * Chunk Controller
 *
 * HTTPリクエストを受け取り、Use Caseを実行し、レスポンスを返す
 * エラーハンドリングはミドルウェアに委譲
 */
export class ChunkController {
  private uploadInitSegmentUseCase: UploadInitSegmentUseCase;
  private uploadChunkUseCase: UploadChunkUseCase;
  private getUploadUrlUseCase: GetUploadUrlUseCase;
  private confirmChunkUploadUseCase: ConfirmChunkUploadUseCase;

  constructor(
    uploadInitSegmentUseCase: UploadInitSegmentUseCase,
    uploadChunkUseCase: UploadChunkUseCase,
    getUploadUrlUseCase: GetUploadUrlUseCase,
    confirmChunkUploadUseCase: ConfirmChunkUploadUseCase
  ) {
    this.uploadInitSegmentUseCase = uploadInitSegmentUseCase;
    this.uploadChunkUseCase = uploadChunkUseCase;
    this.getUploadUrlUseCase = getUploadUrlUseCase;
    this.confirmChunkUploadUseCase = confirmChunkUploadUseCase;
  }

  async uploadInitSegment(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const data = req.body as Buffer;

    if (!Buffer.isBuffer(data)) {
      res.status(400).json({ error: 'Request body must be binary data' });
      return;
    }

    await this.uploadInitSegmentUseCase.execute({ recordingId: id, data });

    res.status(200).json({ success: true });
  }

  async uploadChunk(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { chunk_id } = req.query;
    const data = req.body as Buffer;

    if (!chunk_id) {
      res.status(400).json({ error: 'chunk_id query parameter is required' });
      return;
    }

    if (!Buffer.isBuffer(data)) {
      res.status(400).json({ error: 'Request body must be binary data' });
      return;
    }

    const chunkId = parseInt(String(chunk_id), 10);
    if (isNaN(chunkId)) {
      res.status(400).json({ error: 'chunk_id must be a number' });
      return;
    }

    await this.uploadChunkUseCase.execute({ recordingId: id, chunkId, data });

    res.status(200).json({ success: true });
  }

  /**
   * Init Segmentアップロード用のPresigned URLを取得
   */
  async getInitSegmentUploadUrl(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const result = await this.getUploadUrlUseCase.execute({
      recordingId: id,
      type: 'init-segment',
    });

    res.status(200).json(result);
  }

  /**
   * チャンクアップロード用のPresigned URLを取得
   */
  async getChunkUploadUrl(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { chunk_id } = req.query;

    if (!chunk_id) {
      res.status(400).json({ error: 'chunk_id query parameter is required' });
      return;
    }

    const chunkId = parseInt(String(chunk_id), 10);
    if (isNaN(chunkId)) {
      res.status(400).json({ error: 'chunk_id must be a number' });
      return;
    }

    const result = await this.getUploadUrlUseCase.execute({
      recordingId: id,
      type: 'chunk',
      chunkId,
    });

    res.status(200).json(result);
  }

  /**
   * Init Segmentの直接アップロード完了を確認
   */
  async confirmInitSegmentUpload(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    await this.confirmChunkUploadUseCase.execute({
      recordingId: id,
      type: 'init-segment',
    });

    res.status(200).json({ success: true });
  }

  /**
   * チャンクの直接アップロード完了を確認
   */
  async confirmChunkUpload(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { chunk_id } = req.query;

    if (!chunk_id) {
      res.status(400).json({ error: 'chunk_id query parameter is required' });
      return;
    }

    const chunkId = parseInt(String(chunk_id), 10);
    if (isNaN(chunkId)) {
      res.status(400).json({ error: 'chunk_id must be a number' });
      return;
    }

    await this.confirmChunkUploadUseCase.execute({
      recordingId: id,
      type: 'chunk',
      chunkId,
    });

    res.status(200).json({ success: true });
  }
}
