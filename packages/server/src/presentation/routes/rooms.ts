import express from 'express';
import type { RoomController } from '../controllers/RoomController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * Rooms Router
 *
 * セキュリティモデル:
 * - POST /api/rooms: ルーム作成（認証不要、アクセストークンを返す）
 * - GET /api/rooms/:id: roomIdでルーム情報取得（Guestモード用、roomIdは共有済み）
 * - GET /api/rooms/by-token/:accessToken: トークンでルーム情報取得（Directorモード用）
 * - PATCH /api/rooms/by-token/:accessToken/state: トークンで状態更新（Directorモード用）
 * - GET /api/rooms/by-token/:accessToken/recordings: トークンで録音一覧取得（Directorモード用）
 * - DELETE /api/rooms/by-token/:accessToken: トークンでルーム削除（Directorモード用）
 *
 * roomId単体での状態変更・削除・一覧取得APIは提供しない（セキュリティ上の理由）
 */
export function createRoomsRouter(roomController: RoomController): express.Router {
  const router = express.Router();

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
   * GET /api/rooms/by-token/:accessToken
   * アクセストークンでRoom情報を取得（Directorモード用）
   */
  router.get(
    '/rooms/by-token/:accessToken',
    asyncHandler(async (req, res) => {
      await roomController.getByToken(req, res);
    })
  );

  /**
   * PATCH /api/rooms/by-token/:accessToken/state
   * アクセストークンでRoom状態を更新（Directorモード用）
   */
  router.patch(
    '/rooms/by-token/:accessToken/state',
    jsonParser,
    asyncHandler(async (req, res) => {
      await roomController.updateStateByToken(req, res);
    })
  );

  /**
   * GET /api/rooms/by-token/:accessToken/recordings
   * アクセストークンでRoom内のRecording一覧を取得（Directorモード用）
   */
  router.get(
    '/rooms/by-token/:accessToken/recordings',
    asyncHandler(async (req, res) => {
      await roomController.getRecordingsByToken(req, res);
    })
  );

  /**
   * DELETE /api/rooms/by-token/:accessToken
   * アクセストークンでRoomを削除（Directorモード用）
   */
  router.delete(
    '/rooms/by-token/:accessToken',
    asyncHandler(async (req, res) => {
      await roomController.deleteByToken(req, res);
    })
  );

  /**
   * GET /api/rooms/:id
   * roomIdでRoom情報を取得（Guestモード用）
   */
  router.get(
    '/rooms/:id',
    asyncHandler(async (req, res) => {
      await roomController.getById(req, res);
    })
  );

  return router;
}
