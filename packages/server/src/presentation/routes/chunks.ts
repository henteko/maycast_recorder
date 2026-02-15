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
   * Init Segmentをアップロード（プロキシ方式）
   */
  router.post('/recordings/:id/init-segment', rawParser, asyncHandler(async (req, res) => {
    await chunkController.uploadInitSegment(req, res);
  }));

  /**
   * POST /api/recordings/:id/chunks?chunk_id=N
   * チャンクをアップロード（プロキシ方式）
   */
  router.post('/recordings/:id/chunks', rawParser, asyncHandler(async (req, res) => {
    await chunkController.uploadChunk(req, res);
  }));

  /**
   * GET /api/recordings/:id/upload-url/init-segment
   * Init Segmentアップロード用のPresigned URLを取得
   */
  router.get('/recordings/:id/upload-url/init-segment', asyncHandler(async (req, res) => {
    await chunkController.getInitSegmentUploadUrl(req, res);
  }));

  /**
   * GET /api/recordings/:id/upload-url/chunk?chunk_id=N
   * チャンクアップロード用のPresigned URLを取得
   */
  router.get('/recordings/:id/upload-url/chunk', asyncHandler(async (req, res) => {
    await chunkController.getChunkUploadUrl(req, res);
  }));

  /**
   * POST /api/recordings/:id/confirm-upload/init-segment
   * Init Segmentの直接アップロード完了を確認
   */
  router.post('/recordings/:id/confirm-upload/init-segment', asyncHandler(async (req, res) => {
    await chunkController.confirmInitSegmentUpload(req, res);
  }));

  /**
   * POST /api/recordings/:id/confirm-upload/chunk?chunk_id=N
   * チャンクの直接アップロード完了を確認
   */
  router.post('/recordings/:id/confirm-upload/chunk', asyncHandler(async (req, res) => {
    await chunkController.confirmChunkUpload(req, res);
  }));

  return router;
}
