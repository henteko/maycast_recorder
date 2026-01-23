/**
 * Error Handler
 *
 * アプリケーション全体のエラーを統一的に処理
 */

import { DomainError } from '@maycast/common-types';

export type ErrorLevel = 'info' | 'warning' | 'error';

export interface ErrorMessage {
  message: string;
  level: ErrorLevel;
  code?: string;
}

export class ErrorHandler {
  /**
   * エラーを処理してユーザーメッセージを返す
   */
  static handle(error: unknown): ErrorMessage {
    if (error instanceof DomainError) {
      return this.handleDomainError(error);
    } else if (error instanceof Error) {
      return this.handleGenericError(error);
    } else {
      return this.handleUnknownError(error);
    }
  }

  private static handleDomainError(error: DomainError): ErrorMessage {
    console.error(`[DomainError] ${error.code}:`, error.message);

    switch (error.code) {
      case 'RECORDING_NOT_FOUND':
        return {
          message: '録画が見つかりません',
          level: 'error',
          code: error.code,
        };

      case 'INVALID_STATE_TRANSITION':
        return {
          message: '無効な操作です。現在の状態では実行できません',
          level: 'error',
          code: error.code,
        };

      case 'INVALID_CHUNK':
        return {
          message: 'チャンクデータが無効です',
          level: 'error',
          code: error.code,
        };

      case 'STORAGE_FULL':
        return {
          message: 'ストレージ容量が不足しています。不要なファイルを削除してください',
          level: 'error',
          code: error.code,
        };

      case 'STORAGE_ACCESS_ERROR':
        return {
          message: 'ストレージへのアクセスに失敗しました',
          level: 'error',
          code: error.code,
        };

      case 'NETWORK_ERROR':
        return {
          message: 'ネットワークエラーが発生しました。接続を確認してください',
          level: 'error',
          code: error.code,
        };

      case 'UPLOAD_ERROR':
        return {
          message: 'アップロードに失敗しました。リトライします',
          level: 'warning',
          code: error.code,
        };

      default:
        return {
          message: `エラーが発生しました: ${error.message}`,
          level: 'error',
          code: error.code,
        };
    }
  }

  private static handleGenericError(error: Error): ErrorMessage {
    console.error('[GenericError]:', error);

    // 特定のエラーパターンを検出
    if (error.message.includes('QuotaExceededError')) {
      return {
        message: 'ストレージ容量が不足しています',
        level: 'error',
      };
    }

    if (error.message.includes('NotAllowedError')) {
      return {
        message: '操作が許可されていません。ブラウザの設定を確認してください',
        level: 'error',
      };
    }

    if (error.message.includes('NotSupportedError')) {
      return {
        message: 'この機能はお使いのブラウザではサポートされていません',
        level: 'error',
      };
    }

    return {
      message: `エラーが発生しました: ${error.message}`,
      level: 'error',
    };
  }

  private static handleUnknownError(error: unknown): ErrorMessage {
    console.error('[UnknownError]:', error);

    return {
      message: '不明なエラーが発生しました',
      level: 'error',
    };
  }

  /**
   * エラーをログに送信（本番環境用）
   */
  static logError(error: unknown, context?: Record<string, unknown>): void {
    if (import.meta.env.PROD) {
      // 本番環境ではログ収集サービスに送信
      // 例: Sentry, LogRocket, etc.
      console.log('[ErrorHandler] Would send to logging service:', {
        error: error instanceof Error ? error.message : String(error),
        context,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
