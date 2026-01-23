import express from 'express';
import type { ChunkController } from '../presentation/controllers/ChunkController';

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
  router.post('/recordings/:id/init-segment', (req, res) => {
    chunkController.uploadInitSegment(req, res);
  });

  /**
   * POST /api/recordings/:id/chunks?chunk_id=N
   * チャンクをアップロード
   */
  router.post('/recordings/:id/chunks', (req, res) => {
    chunkController.uploadChunk(req, res);
  });

  return router;
}
