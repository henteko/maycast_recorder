import express from 'express';
import type { RecordingController } from '../controllers/RecordingController';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * Recordings Router (Refactored)
 *
 * Controllerベースのルーティング
 */
export function createRecordingsRouter(
  recordingController: RecordingController
): express.Router {
  const router = express.Router();

  /**
   * POST /api/recordings
   * 新しいRecordingを作成
   */
  router.post('/recordings', asyncHandler(async (req, res) => {
    await recordingController.create(req, res);
  }));

  /**
   * GET /api/recordings/:id
   * Recording情報を取得
   */
  router.get('/recordings/:id', asyncHandler(async (req, res) => {
    await recordingController.getById(req, res);
  }));

  /**
   * PATCH /api/recordings/:id/state
   * Recording状態を更新
   */
  router.patch('/recordings/:id/state', asyncHandler(async (req, res) => {
    await recordingController.updateState(req, res);
  }));

  /**
   * PATCH /api/recordings/:id/metadata
   * Recordingメタデータを更新
   */
  router.patch('/recordings/:id/metadata', asyncHandler(async (req, res) => {
    await recordingController.updateMetadata(req, res);
  }));

  /**
   * GET /api/recordings/:id/download
   * Recording（MP4ファイル）をダウンロード
   */
  router.get('/recordings/:id/download', asyncHandler(async (req, res) => {
    await recordingController.download(req, res);
  }));

  return router;
}
