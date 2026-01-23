/**
 * ドメインエラーの基底クラス
 */
export abstract class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = this.constructor.name;
    // prototypeチェーンの復元（TypeScriptのextends Errorの問題対応）
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Recording関連エラー
 */
export class RecordingNotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 'RECORDING_NOT_FOUND');
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_STATE_TRANSITION');
  }
}

export class InvalidOperationError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_OPERATION');
  }
}

/**
 * Chunk関連エラー
 */
export class InvalidChunkError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_CHUNK');
  }
}

export class ChunkNotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 'CHUNK_NOT_FOUND');
  }
}

/**
 * ネットワーク関連エラー
 */
export class NetworkError extends DomainError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR');
  }
}

export class UploadError extends DomainError {
  constructor(message: string) {
    super(message, 'UPLOAD_ERROR');
  }
}

/**
 * ストレージ関連エラー
 */
export class StorageFullError extends DomainError {
  constructor(message: string) {
    super(message, 'STORAGE_FULL');
  }
}

export class StorageAccessError extends DomainError {
  constructor(message: string) {
    super(message, 'STORAGE_ACCESS_ERROR');
  }
}
