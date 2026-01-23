/**
 * Recording ID型定義
 *
 * ローカル（OPFS）用とリモート（サーバー）用を明確に区別
 */

import type { RecordingId } from '@maycast/common-types';

/**
 * ローカルRecording ID (クライアント側で生成、OPFS用)
 */
export type LocalRecordingId = RecordingId & { readonly __brand: 'LocalRecordingId' };

/**
 * リモートRecording ID (サーバー側で生成、API通信用)
 */
export type RemoteRecordingId = RecordingId & { readonly __brand: 'RemoteRecordingId' };

/**
 * RecordingIdをLocalRecordingIdとしてキャスト
 */
export function asLocalRecordingId(id: RecordingId): LocalRecordingId {
  return id as LocalRecordingId;
}

/**
 * RecordingIdをRemoteRecordingIdとしてキャスト
 */
export function asRemoteRecordingId(id: RecordingId): RemoteRecordingId {
  return id as RemoteRecordingId;
}

/**
 * LocalRecordingIdを通常のRecordingIdに変換
 */
export function toRecordingId(id: LocalRecordingId | RemoteRecordingId): RecordingId {
  return id as RecordingId;
}
