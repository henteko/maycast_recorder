import express from 'express';
import type { RoomController } from '../controllers/RoomController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

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
   * GET /api/rooms
   * 全Room一覧を取得
   */
  router.get(
    '/rooms',
    asyncHandler(async (req, res) => {
      await roomController.getAll(req, res);
    })
  );

  /**
   * GET /api/rooms/by-token/:accessToken
   * アクセストークンでRoom情報を取得（ルーム詳細ページ用）
   */
  router.get(
    '/rooms/by-token/:accessToken',
    asyncHandler(async (req, res) => {
      await roomController.getByToken(req, res);
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

  /**
   * DELETE /api/rooms/:id
   * Roomを削除
   */
  router.delete(
    '/rooms/:id',
    asyncHandler(async (req, res) => {
      await roomController.delete(req, res);
    })
  );

  return router;
}
