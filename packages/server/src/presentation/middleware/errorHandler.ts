/**
 * Error Handler Middleware
 *
 * Express用のエラーハンドリングミドルウェア
 */

import type { Request, Response, NextFunction } from 'express';
import { DomainError } from '@maycast/common-types';

/**
 * エラーハンドリングミドルウェア
 *
 * ドメインエラーを適切なHTTPステータスコードに変換してレスポンス
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // レスポンスが既に送信されている場合はデフォルトのエラーハンドラーに委譲
  if (res.headersSent) {
    return next(error);
  }

  console.error('[ErrorHandler]', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  if (error instanceof DomainError) {
    handleDomainError(error, res);
  } else {
    handleGenericError(error, res);
  }
}

/**
 * ドメインエラーをHTTPレスポンスに変換
 */
function handleDomainError(error: DomainError, res: Response): void {
  const statusCode = getStatusCodeForDomainError(error);

  res.status(statusCode).json({
    error: error.message,
    code: error.code,
  });
}

/**
 * ドメインエラーコードをHTTPステータスコードに変換
 */
function getStatusCodeForDomainError(error: DomainError): number {
  switch (error.code) {
    // 404 Not Found
    case 'RECORDING_NOT_FOUND':
    case 'CHUNK_NOT_FOUND':
    case 'ROOM_NOT_FOUND':
      return 404;

    // 403 Forbidden
    case 'ROOM_ACCESS_DENIED':
      return 403;

    // 400 Bad Request
    case 'INVALID_STATE_TRANSITION':
    case 'INVALID_OPERATION':
    case 'INVALID_CHUNK':
    case 'INVALID_ROOM_STATE_TRANSITION':
      return 400;

    // 507 Insufficient Storage
    case 'STORAGE_FULL':
      return 507;

    // 500 Internal Server Error
    case 'STORAGE_ACCESS_ERROR':
      return 500;

    // 502 Bad Gateway (外部サービスへの接続エラー)
    case 'NETWORK_ERROR':
      return 502;

    // 503 Service Unavailable (アップロードサービス利用不可)
    case 'UPLOAD_ERROR':
      return 503;

    // デフォルトは500
    default:
      return 500;
  }
}

/**
 * 汎用エラーをHTTPレスポンスに変換
 */
function handleGenericError(error: Error, res: Response): void {
  // 本番環境では詳細なエラーメッセージを隠す
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(500).json({
    error: isDevelopment ? error.message : 'Internal server error',
    ...(isDevelopment && { stack: error.stack }),
  });
}

/**
 * 非同期ルートハンドラーをラップしてエラーを next() に渡す
 *
 * 使用例:
 * router.get('/path', asyncHandler(async (req, res) => {
 *   const result = await someAsyncOperation();
 *   res.json(result);
 * }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
