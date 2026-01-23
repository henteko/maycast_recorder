import express from 'express';
import type { ChunkController } from '../controllers/ChunkController';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * Chunks Router (Refactored)
 *
 * Controllerベースのルーティング
 */
export function createChunksRouter(chunkController: ChunkController): express.Router {
  const router = express.Router();

  /**
   * POST /api/recordings/:id/init-segment
   * Init Segmentをアップロード
   */
  router.post('/recordings/:id/init-segment', asyncHandler(async (req, res) => {
    await chunkController.uploadInitSegment(req, res);
  }));

  /**
   * POST /api/recordings/:id/chunks?chunk_id=N
   * チャンクをアップロード
   */
  router.post('/recordings/:id/chunks', asyncHandler(async (req, res) => {
    await chunkController.uploadChunk(req, res);
  }));

  return router;
}
