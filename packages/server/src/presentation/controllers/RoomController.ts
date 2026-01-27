import type { Request, Response } from 'express';
import { RoomNotFoundError } from '@maycast/common-types';
import type { CreateRoomUseCase } from '../../domain/usecases/CreateRoom.usecase';
import type { GetRoomUseCase } from '../../domain/usecases/GetRoom.usecase';
import type { UpdateRoomStateUseCase } from '../../domain/usecases/UpdateRoomState.usecase';
import type { GetRoomRecordingsUseCase } from '../../domain/usecases/GetRoomRecordings.usecase';

/**
 * Room Controller
 *
 * HTTPリクエストを受け取り、Use Caseを実行し、レスポンスを返す
 * エラーハンドリングはミドルウェアに委譲
 */
export class RoomController {
  private createRoomUseCase: CreateRoomUseCase;
  private getRoomUseCase: GetRoomUseCase;
  private updateRoomStateUseCase: UpdateRoomStateUseCase;
  private getRoomRecordingsUseCase: GetRoomRecordingsUseCase;

  constructor(
    createRoomUseCase: CreateRoomUseCase,
    getRoomUseCase: GetRoomUseCase,
    updateRoomStateUseCase: UpdateRoomStateUseCase,
    getRoomRecordingsUseCase: GetRoomRecordingsUseCase
  ) {
    this.createRoomUseCase = createRoomUseCase;
    this.getRoomUseCase = getRoomUseCase;
    this.updateRoomStateUseCase = updateRoomStateUseCase;
    this.getRoomRecordingsUseCase = getRoomRecordingsUseCase;
  }

  async create(_req: Request, res: Response): Promise<void> {
    const result = await this.createRoomUseCase.execute();

    res.status(201).json({
      room_id: result.roomId,
      created_at: result.room.createdAt,
      state: result.room.state,
    });
  }

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

  async updateState(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { state } = req.body;

    if (!state) {
      res.status(400).json({ error: 'State is required' });
      return;
    }

    await this.updateRoomStateUseCase.execute({ roomId: id, state });

    res.status(200).json({ success: true });
  }

  async getRecordings(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const result = await this.getRoomRecordingsUseCase.execute({ roomId: id });

    res.json({
      room_id: result.roomId,
      recordings: result.recordings,
    });
  }
}
