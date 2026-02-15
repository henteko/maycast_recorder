/**
 * Room History Storage
 * ローカルストレージにルーム作成履歴を保存
 */

const STORAGE_KEY = 'maycast-room-history';

export interface RoomHistoryEntry {
  roomId: string;
  accessKey: string;
  createdAt: string;
}

export function getRoomHistory(): RoomHistoryEntry[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data) as RoomHistoryEntry[];
  } catch {
    return [];
  }
}

export function addRoomToHistory(entry: RoomHistoryEntry): void {
  const history = getRoomHistory();
  // 重複防止
  const filtered = history.filter((h) => h.roomId !== entry.roomId);
  filtered.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function removeRoomFromHistory(roomId: string): void {
  const history = getRoomHistory();
  const filtered = history.filter((h) => h.roomId !== roomId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}
