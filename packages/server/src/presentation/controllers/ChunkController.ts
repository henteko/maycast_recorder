import type { Request, Response } from 'express';
import type { UploadInitSegmentUseCase } from '../../domain/usecases/UploadInitSegment.usecase';
import type { UploadChunkUseCase } from '../../domain/usecases/UploadChunk.usecase';

/**
 * Chunk Controller
 *
 * HTTPリクエストを受け取り、Use Caseを実行し、レスポンスを返す
 * エラーハンドリングはミドルウェアに委譲
 */
export class ChunkController {
  private uploadInitSegmentUseCase: UploadInitSegmentUseCase;
  private uploadChunkUseCase: UploadChunkUseCase;

  constructor(
    uploadInitSegmentUseCase: UploadInitSegmentUseCase,
    uploadChunkUseCase: UploadChunkUseCase
  ) {
    this.uploadInitSegmentUseCase = uploadInitSegmentUseCase;
    this.uploadChunkUseCase = uploadChunkUseCase;
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
}
