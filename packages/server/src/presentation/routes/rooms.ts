import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { RoomController } from '../controllers/RoomController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

type AsyncMiddleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Rooms Router
 *
 * Controllerベースのルーティング
 * roomAccessMiddleware を適用して accessKey 検証を行う
 *
 * NOTE: JSONデータを扱うため、express.json()ミドルウェアを使用
 */
export function createRoomsRouter(
  roomController: RoomController,
  roomAccessMiddleware: AsyncMiddleware
): express.Router {
  const router = express.Router();

  // JSONデータをパース
  const jsonParser = express.json();

  /**
   * POST /api/rooms
   * 新しいRoomを作成（認証不要）
   */
  router.post(
    '/rooms',
    jsonParser,
    asyncHandler(async (req, res) => {
      await roomController.create(req, res);
    })
  );

  /**
   * GET /api/rooms/:id/status
   * Room状態のみ取得（認証不要、Guest用）
   */
  router.get(
    '/rooms/:id/status',
    asyncHandler(async (req, res) => {
      await roomController.getStatus(req, res);
    })
  );

  /**
   * GET /api/rooms/:id
   * Room情報を取得（accessKey必須）
   */
  router.get(
    '/rooms/:id',
    asyncHandler(async (req, res, next) => {
      await roomAccessMiddleware(req, res, next);
    }),
    asyncHandler(async (req, res) => {
      await roomController.getById(req, res);
    })
  );

  /**
   * PATCH /api/rooms/:id/state
   * Room状態を更新（accessKey必須）
   */
  router.patch(
    '/rooms/:id/state',
    asyncHandler(async (req, res, next) => {
      await roomAccessMiddleware(req, res, next);
    }),
    jsonParser,
    asyncHandler(async (req, res) => {
      await roomController.updateState(req, res);
    })
  );

  /**
   * GET /api/rooms/:id/recordings
   * Room内のRecording一覧を取得（accessKey必須）
   */
  router.get(
    '/rooms/:id/recordings',
    asyncHandler(async (req, res, next) => {
      await roomAccessMiddleware(req, res, next);
    }),
    asyncHandler(async (req, res) => {
      await roomController.getRecordings(req, res);
    })
  );

  /**
   * DELETE /api/rooms/:id
   * Roomを削除（accessKey必須）
   */
  router.delete(
    '/rooms/:id',
    asyncHandler(async (req, res, next) => {
      await roomAccessMiddleware(req, res, next);
    }),
    asyncHandler(async (req, res) => {
      await roomController.delete(req, res);
    })
  );

  return router;
}
