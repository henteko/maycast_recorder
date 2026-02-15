/**
 * Room Access Middleware
 *
 * x-room-access-key ヘッダーからaccessKeyを取得し、
 * ValidateRoomAccessUseCaseで検証する
 */

import type { Request, Response, NextFunction } from 'express';
import type { ValidateRoomAccessUseCase } from '../../domain/usecases/ValidateRoomAccess.usecase.js';

export function createRoomAccessMiddleware(
  validateRoomAccessUseCase: ValidateRoomAccessUseCase
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const roomId = req.params.id;
    const accessKey = req.headers['x-room-access-key'] as string | undefined;

    if (!accessKey) {
      const { RoomAccessDeniedError } = await import('@maycast/common-types');
      throw new RoomAccessDeniedError('Access key is required');
    }

    await validateRoomAccessUseCase.execute({ roomId, accessKey });
    next();
  };
}
