/**
 * useErrorHandler Hook
 *
 * エラーハンドリングのためのReact Hook
 */

import { useCallback } from 'react';
import { ErrorHandler, type ErrorMessage } from './ErrorHandler';

/**
 * エラーハンドリングのためのHook
 *
 * エラーを処理してユーザーにメッセージを表示
 */
export function useErrorHandler() {
  const handleError = useCallback((error: unknown, context?: Record<string, unknown>) => {
    const errorMessage = ErrorHandler.handle(error);

    // エラーをログに送信
    ErrorHandler.logError(error, context);

    // ユーザーにメッセージを表示
    showErrorMessage(errorMessage);

    return errorMessage;
  }, []);

  return { handleError };
}

/**
 * エラーメッセージを表示
 *
 * 現在は alert を使用していますが、将来的には Toast UI に置き換えることができます
 */
function showErrorMessage(errorMessage: ErrorMessage): void {
  // TODO: より洗練された通知UI (Toast, Snackbar など) に置き換える
  const prefix = errorMessage.level === 'error' ? '❌' : errorMessage.level === 'warning' ? '⚠️' : 'ℹ️';

  if (import.meta.env.DEV) {
    // 開発環境ではコンソールに詳細を出力
    console.log(`${prefix} [${errorMessage.level.toUpperCase()}]`, errorMessage.message);
    if (errorMessage.code) {
      console.log('Error code:', errorMessage.code);
    }
  }

  // 本番環境やエラーレベルに応じて alert を表示
  if (errorMessage.level === 'error') {
    alert(`${prefix} ${errorMessage.message}`);
  }
}
