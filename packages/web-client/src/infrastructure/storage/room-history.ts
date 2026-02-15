/**
 * Room History - ローカルストレージベースのルーム作成履歴
 *
 * クライアントごとにルーム作成履歴を保持する（ローカルファースト）
 * 他のクライアントからは見えない
 */

import type { RoomState } from '@maycast/common-types';

const STORAGE_KEY = 'maycast-room-history';

export interface RoomHistoryEntry {
  /** アクセストークン（ルーム詳細URLのキー） */
  accessToken: string;
  /** ルームID（短縮表示用） */
  roomId: string;
  /** 作成日時（ISO 8601） */
  createdAt: string;
  /** 最後に確認したルーム状態（キャッシュ） */
  lastKnownState?: RoomState;
}

/**
 * ルーム作成履歴を保存
 */
export function addRoomToHistory(entry: RoomHistoryEntry): void {
  const history = loadRoomHistory();
  // 重複を避ける（同じaccessTokenがあれば上書き）
  const filtered = history.filter((e) => e.accessToken !== entry.accessToken);
  filtered.unshift(entry); // 最新を先頭に
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/**
 * ルーム作成履歴を読み込み
 */
export function loadRoomHistory(): RoomHistoryEntry[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (err) {
      console.error('Failed to parse room history:', err);
    }
  }
  return [];
}

/**
 * 履歴からルームを削除
 */
export function removeRoomFromHistory(accessToken: string): void {
  const history = loadRoomHistory();
  const filtered = history.filter((e) => e.accessToken !== accessToken);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/**
 * 履歴のルーム状態を更新（キャッシュ）
 */
export function updateRoomHistoryState(accessToken: string, state: RoomState): void {
  const history = loadRoomHistory();
  const updated = history.map((e) =>
    e.accessToken === accessToken ? { ...e, lastKnownState: state } : e
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
