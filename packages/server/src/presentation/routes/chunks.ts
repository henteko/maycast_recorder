import express from 'express';
import type { ChunkController } from '../controllers/ChunkController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * Chunks Router (Refactored)
 *
 * Controllerベースのルーティング
 *
 * NOTE: バイナリデータを扱うため、express.raw()ミドルウェアを使用
 */
export function createChunksRouter(chunkController: ChunkController): express.Router {
  const router = express.Router();

  // バイナリデータをBufferとしてパース（50MBまで）
  const rawParser = express.raw({
    type: 'application/octet-stream',
    limit: '50mb'
  });

  /**
   * POST /api/recordings/:id/init-segment
   * Init Segmentをアップロード
   */
  router.post('/recordings/:id/init-segment', rawParser, asyncHandler(async (req, res) => {
    await chunkController.uploadInitSegment(req, res);
  }));

  /**
   * POST /api/recordings/:id/chunks?chunk_id=N
   * チャンクをアップロード
   */
  router.post('/recordings/:id/chunks', rawParser, asyncHandler(async (req, res) => {
    await chunkController.uploadChunk(req, res);
  }));

  return router;
}
