import express from 'express';
import type { RecordingController } from '../controllers/RecordingController';

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
  router.post('/recordings', (req, res) => {
    recordingController.create(req, res);
  });

  /**
   * GET /api/recordings/:id
   * Recording情報を取得
   */
  router.get('/recordings/:id', (req, res) => {
    recordingController.getById(req, res);
  });

  /**
   * PATCH /api/recordings/:id/state
   * Recording状態を更新
   */
  router.patch('/recordings/:id/state', (req, res) => {
    recordingController.updateState(req, res);
  });

  /**
   * PATCH /api/recordings/:id/metadata
   * Recordingメタデータを更新
   */
  router.patch('/recordings/:id/metadata', (req, res) => {
    recordingController.updateMetadata(req, res);
  });

  /**
   * GET /api/recordings/:id/download
   * Recording（MP4ファイル）をダウンロード
   */
  router.get('/recordings/:id/download', (req, res) => {
    recordingController.download(req, res);
  });

  return router;
}
