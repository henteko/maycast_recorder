/**
 * DirectorPage - Director Mode用メインページ
 *
 * ルーム作成履歴一覧を表示（ローカルストレージベース）
 * ルーム作成 → 詳細ページに遷移
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, TrashIcon, ArrowTopRightOnSquareIcon, UsersIcon } from '@heroicons/react/24/solid';
import { RoomAPIClient } from '../../../infrastructure/api/room-api';
import type { RoomState } from '@maycast/common-types';
import { getServerUrl } from '../../../infrastructure/config/serverConfig';
import {
  getRoomHistory,
  addRoomToHistory,
  removeRoomFromHistory,
  type RoomHistoryEntry,
} from '../../../infrastructure/storage/roomHistory';
import { Button } from '../atoms/Button';
import { RoomStateBadge } from '../atoms/RoomStateBadge';

const stateBorderColors: Record<RoomState, string> = {
  idle: 'border-l-maycast-primary',
  recording: 'border-l-maycast-rec',
  finalizing: 'border-l-yellow-400',
  finished: 'border-l-maycast-safe',
};

export const DirectorPage: React.FC = () => {
  const navigate = useNavigate();
  const [history, setHistory] = useState<RoomHistoryEntry[]>(getRoomHistory);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomStates, setRoomStates] = useState<Map<string, RoomState>>(new Map());

  const refreshHistory = useCallback(() => {
    setHistory(getRoomHistory());
  }, []);

  // 各ルームのステータスを取得
  const fetchRoomStates = useCallback(async (entries: RoomHistoryEntry[]) => {
    if (entries.length === 0) return;

    const serverUrl = getServerUrl();
    const apiClient = new RoomAPIClient(serverUrl);

    const results = await Promise.allSettled(
      entries.map((entry) => apiClient.getRoomStatus(entry.roomId))
    );

    setRoomStates((prev) => {
      const next = new Map(prev);
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          next.set(entries[i].roomId, result.value.state);
        }
      });
      return next;
    });
  }, []);

  // 初回 & 履歴変更時にステータスを取得
  useEffect(() => {
    fetchRoomStates(history);
  }, [history, fetchRoomStates]);

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      const result = await apiClient.createRoom();

      const entry: RoomHistoryEntry = {
        roomId: result.room_id,
        accessKey: result.access_key,
        createdAt: result.created_at,
      };
      addRoomToHistory(entry);
      refreshHistory();

      // 詳細ページに遷移
      navigate(`/director/rooms/${result.room_id}?key=${result.access_key}`);
    } catch (err) {
      console.error('❌ [DirectorPage] Failed to create room:', err);
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRemoveFromHistory = (roomId: string) => {
    if (!confirm('Remove this room from history? This only removes it from your local history.')) {
      return;
    }
    removeRoomFromHistory(roomId);
    refreshHistory();
  };

  const handleOpenRoom = (entry: RoomHistoryEntry) => {
    navigate(`/director/rooms/${entry.roomId}?key=${entry.accessKey}`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex flex-col h-full bg-maycast-bg text-maycast-text">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-maycast-border/60">
        <div className="flex items-center gap-3">
          <div className="text-xl font-bold text-maycast-primary tracking-tight">
            Maycast Recorder
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-maycast-primary/15 rounded-full border border-maycast-primary/30">
            <UsersIcon className="w-3.5 h-3.5 text-maycast-primary" />
            <span className="text-maycast-primary/80 font-semibold">Director</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleCreateRoom} disabled={isCreating} variant="primary" size="sm">
            <PlusIcon className="w-5 h-5" />
            Create Room
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-maycast-rec/20 border border-maycast-rec/50 rounded-xl text-maycast-rec">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="flex flex-col items-center">
              <UsersIcon className="w-12 h-12 text-maycast-subtext/40 mb-4" />
              <p className="text-lg font-semibold text-maycast-text mb-1">
                No rooms yet
              </p>
              <p className="text-sm text-maycast-subtext mb-6">
                Create a room to get started
              </p>
              <Button onClick={handleCreateRoom} disabled={isCreating} variant="primary" size="sm">
                <PlusIcon className="w-5 h-5" />
                Create First Room
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="text-xs font-medium text-maycast-subtext uppercase tracking-wider mb-2">
              Rooms ({history.length})
            </div>
            {history.map((entry) => {
              const state = roomStates.get(entry.roomId);
              const borderColor = state ? stateBorderColors[state] : 'border-l-maycast-primary';
              return (
                <div
                  key={entry.roomId}
                  className={`bg-maycast-panel/50 rounded-xl border-l-[3px] ${borderColor} p-4 flex items-center justify-between hover:bg-maycast-panel/70 transition-colors cursor-pointer`}
                  onClick={() => handleOpenRoom(entry)}
                >
                  <div className="flex items-center gap-3">
                    <UsersIcon className="w-5 h-5 text-maycast-subtext" />
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-bold text-maycast-text font-mono">
                          Room {entry.roomId.substring(0, 8)}
                        </h3>
                        {state && <RoomStateBadge state={state} />}
                      </div>
                      <p className="text-xs text-maycast-subtext">
                        Created: {formatDate(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenRoom(entry);
                      }}
                      className="p-2 rounded-lg hover:bg-maycast-primary/10 transition-colors"
                    >
                      <ArrowTopRightOnSquareIcon className="w-4 h-4 text-maycast-primary" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFromHistory(entry.roomId);
                      }}
                      className="p-2 rounded-lg hover:bg-maycast-rec/10 transition-colors"
                    >
                      <TrashIcon className="w-4 h-4 text-maycast-subtext" />
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="flex items-start gap-3 px-4 py-3 bg-maycast-primary/5 border border-maycast-primary/15 rounded-xl mt-4">
              <svg className="w-4 h-4 text-maycast-primary/60 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-maycast-subtext leading-relaxed">
                This history is stored locally in this browser only. It is not synced or shared across other devices or browsers. If you clear your browser data, this history will be lost.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
