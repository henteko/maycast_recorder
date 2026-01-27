import express from 'express';
import type { RoomController } from '../controllers/RoomController';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * Rooms Router
 *
 * Controllerベースのルーティング
 *
 * NOTE: JSONデータを扱うため、express.json()ミドルウェアを使用
 */
export function createRoomsRouter(roomController: RoomController): express.Router {
  const router = express.Router();

  // JSONデータをパース
  const jsonParser = express.json();

  /**
   * POST /api/rooms
   * 新しいRoomを作成
   */
  router.post(
    '/rooms',
    jsonParser,
    asyncHandler(async (req, res) => {
      await roomController.create(req, res);
    })
  );

  /**
   * GET /api/rooms/:id
   * Room情報を取得
   */
  router.get(
    '/rooms/:id',
    asyncHandler(async (req, res) => {
      await roomController.getById(req, res);
    })
  );

  /**
   * PATCH /api/rooms/:id/state
   * Room状態を更新
   */
  router.patch(
    '/rooms/:id/state',
    jsonParser,
    asyncHandler(async (req, res) => {
      await roomController.updateState(req, res);
    })
  );

  /**
   * GET /api/rooms/:id/recordings
   * Room内のRecording一覧を取得
   */
  router.get(
    '/rooms/:id/recordings',
    asyncHandler(async (req, res) => {
      await roomController.getRecordings(req, res);
    })
  );

  return router;
}
