import type { Request, Response } from 'express';
import { RoomNotFoundError } from '@maycast/common-types';
import type { CreateRoomUseCase } from '../../domain/usecases/CreateRoom.usecase.js';
import type { GetRoomUseCase } from '../../domain/usecases/GetRoom.usecase.js';
import type { UpdateRoomStateUseCase } from '../../domain/usecases/UpdateRoomState.usecase.js';
import type { GetRoomRecordingsUseCase } from '../../domain/usecases/GetRoomRecordings.usecase.js';
import type { DeleteRoomUseCase } from '../../domain/usecases/DeleteRoom.usecase.js';
import type { GetRoomByTokenUseCase } from '../../domain/usecases/GetRoomByToken.usecase.js';

/**
 * Room Controller
 *
 * HTTPリクエストを受け取り、Use Caseを実行し、レスポンスを返す
 * エラーハンドリングはミドルウェアに委譲
 *
 * セキュリティモデル:
 * - roomIdベースのエンドポイントはGuestモードで使用（roomIdはゲストと共有済み）
 * - accessTokenベースのエンドポイントはDirectorモード専用（トークンを知る人だけがアクセス可能）
 * - ルーム一覧APIは提供しない（情報漏洩防止）
 */
export class RoomController {
  private createRoomUseCase: CreateRoomUseCase;
  private getRoomUseCase: GetRoomUseCase;
  private updateRoomStateUseCase: UpdateRoomStateUseCase;
  private getRoomRecordingsUseCase: GetRoomRecordingsUseCase;
  private deleteRoomUseCase: DeleteRoomUseCase;
  private getRoomByTokenUseCase: GetRoomByTokenUseCase;

  constructor(
    createRoomUseCase: CreateRoomUseCase,
    getRoomUseCase: GetRoomUseCase,
    updateRoomStateUseCase: UpdateRoomStateUseCase,
    getRoomRecordingsUseCase: GetRoomRecordingsUseCase,
    deleteRoomUseCase: DeleteRoomUseCase,
    getRoomByTokenUseCase: GetRoomByTokenUseCase
  ) {
    this.createRoomUseCase = createRoomUseCase;
    this.getRoomUseCase = getRoomUseCase;
    this.updateRoomStateUseCase = updateRoomStateUseCase;
    this.getRoomRecordingsUseCase = getRoomRecordingsUseCase;
    this.deleteRoomUseCase = deleteRoomUseCase;
    this.getRoomByTokenUseCase = getRoomByTokenUseCase;
  }

  async create(_req: Request, res: Response): Promise<void> {
    const result = await this.createRoomUseCase.execute();

    res.status(201).json({
      room_id: result.roomId,
      access_token: result.accessToken,
      created_at: result.room.createdAt,
      state: result.room.state,
    });
  }

  /**
   * roomIdでRoom情報を取得（Guestモード用）
   * roomIdはゲストに共有済みなので、認可不要
   */
  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const room = await this.getRoomUseCase.execute({ roomId: id });

    if (!room) {
      throw new RoomNotFoundError(`Room not found: ${id}`);
    }

    res.json({
      id: room.id,
      state: room.state,
      created_at: room.createdAt,
      updated_at: room.updatedAt,
      recording_ids: room.recordingIds,
    });
  }

  /**
   * アクセストークンでRoom情報を取得（Directorモード用）
   */
  async getByToken(req: Request, res: Response): Promise<void> {
    const { accessToken } = req.params;

    const room = await this.getRoomByTokenUseCase.execute({ accessToken });

    if (!room) {
      throw new RoomNotFoundError(`Room not found for token`);
    }

    res.json({
      id: room.id,
      state: room.state,
      created_at: room.createdAt,
      updated_at: room.updatedAt,
      recording_ids: room.recordingIds,
    });
  }

  /**
   * アクセストークンでRoom状態を更新（Directorモード用）
   */
  async updateStateByToken(req: Request, res: Response): Promise<void> {
    const { accessToken } = req.params;
    const { state } = req.body;

    if (!state) {
      res.status(400).json({ error: 'State is required' });
      return;
    }

    const room = await this.getRoomByTokenUseCase.execute({ accessToken });
    if (!room) {
      throw new RoomNotFoundError(`Room not found for token`);
    }

    await this.updateRoomStateUseCase.execute({ roomId: room.id, state });

    res.status(200).json({ success: true });
  }

  /**
   * アクセストークンでRoom内のRecording一覧を取得（Directorモード用）
   */
  async getRecordingsByToken(req: Request, res: Response): Promise<void> {
    const { accessToken } = req.params;

    const room = await this.getRoomByTokenUseCase.execute({ accessToken });
    if (!room) {
      throw new RoomNotFoundError(`Room not found for token`);
    }

    const result = await this.getRoomRecordingsUseCase.execute({ roomId: room.id });

    res.json({
      room_id: result.roomId,
      recordings: result.recordings,
    });
  }

  /**
   * アクセストークンでRoomを削除（Directorモード用）
   */
  async deleteByToken(req: Request, res: Response): Promise<void> {
    const { accessToken } = req.params;

    const room = await this.getRoomByTokenUseCase.execute({ accessToken });
    if (!room) {
      throw new RoomNotFoundError(`Room not found for token`);
    }

    await this.deleteRoomUseCase.execute({ roomId: room.id });

    res.status(204).send();
  }
}
