/**
 * DirectorPage - Director Mode用メインページ
 *
 * ルーム作成のエントリーポイント + ローカル作成履歴の表示
 * ルーム作成後はルーム詳細ページ（/director/rooms/:accessToken）に遷移する
 * 作成履歴はクライアントのlocalStorageに保持（ローカルファースト）
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, UsersIcon, TrashIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/solid';
import { RoomAPIClient } from '../../../infrastructure/api/room-api';
import { getServerUrl } from '../../../infrastructure/config/serverConfig';
import {
  loadRoomHistory,
  addRoomToHistory,
  removeRoomFromHistory,
  updateRoomHistoryState,
  type RoomHistoryEntry,
} from '../../../infrastructure/storage/room-history';
import { Button } from '../atoms/Button';
import { RoomStateBadge } from '../atoms/RoomStateBadge';

export const DirectorPage: React.FC = () => {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RoomHistoryEntry[]>([]);

  // 履歴を読み込み
  useEffect(() => {
    setHistory(loadRoomHistory());
  }, []);

  // 履歴のルーム状態をバックグラウンドで更新
  useEffect(() => {
    if (history.length === 0) return;

    const updateStates = async () => {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);

      for (const entry of history) {
        try {
          const room = await apiClient.getRoomByToken(entry.accessToken);
          if (room.state !== entry.lastKnownState) {
            updateRoomHistoryState(entry.accessToken, room.state);
            setHistory((prev) =>
              prev.map((e) =>
                e.accessToken === entry.accessToken ? { ...e, lastKnownState: room.state } : e
              )
            );
          }
        } catch {
          // ルームが削除済みの場合は無視（履歴には残す）
        }
      }
    };

    updateStates();
  }, [history.length]); // eslint-disable-line react-hooks/exhaustive-deps -- 初回と履歴数変更時のみ

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      const result = await apiClient.createRoom();

      // ローカル履歴に保存
      const entry: RoomHistoryEntry = {
        accessToken: result.access_token,
        roomId: result.room_id,
        createdAt: result.created_at,
        lastKnownState: result.state,
      };
      addRoomToHistory(entry);
      setHistory(loadRoomHistory());

      // ルーム詳細ページに遷移
      navigate(`/director/rooms/${result.access_token}`);
    } catch (err) {
      console.error('Failed to create room:', err);
      setError(err instanceof Error ? err.message : 'Failed to create room');
      setIsCreating(false);
    }
  };

  const handleRemoveFromHistory = useCallback((accessToken: string) => {
    removeRoomFromHistory(accessToken);
    setHistory(loadRoomHistory());
  }, []);

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
      <div className="flex items-center justify-between px-8 py-6 border-b border-maycast-border">
        <div className="flex items-center gap-4">
          <div className="text-2xl font-bold text-maycast-primary">
            Maycast Recorder
          </div>
          <div className="w-px h-6 bg-maycast-border/50" />
          <div className="flex items-center gap-2 px-4 py-2 bg-maycast-primary/20 backdrop-blur-sm rounded-full border border-maycast-primary/30">
            <UsersIcon className="w-5 h-5 text-maycast-primary" />
            <span className="text-maycast-primary/80 font-semibold">Director</span>
          </div>
        </div>
        <Button onClick={handleCreateRoom} disabled={isCreating} variant="primary" size="sm">
          {isCreating ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <PlusIcon className="w-5 h-5" />
              Create Room
            </>
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-8 mt-4 p-4 bg-maycast-rec/20 border border-maycast-rec/50 rounded-xl text-maycast-rec">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {history.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center h-full">
            <div className="bg-maycast-panel/30 backdrop-blur-md p-12 rounded-2xl border border-maycast-border/40 shadow-xl">
              <div className="flex flex-col items-center text-maycast-text-secondary">
                <div className="p-6 bg-maycast-primary/10 rounded-full mb-6">
                  <UsersIcon className="w-16 h-16 text-maycast-primary/60" />
                </div>
                <p className="text-xl font-bold text-maycast-text mb-2">
                  Create a Recording Room
                </p>
                <p className="text-sm mb-6 text-center max-w-sm">
                  Create a new room and invite guests. You will be redirected to the room management page.
                </p>
                <Button onClick={handleCreateRoom} disabled={isCreating} variant="primary" size="md">
                  {isCreating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <PlusIcon className="w-5 h-5" />
                      Create Room
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Room History */
          <div className="max-w-3xl mx-auto">
            <h2 className="text-sm font-semibold text-maycast-text-secondary mb-4">
              Room History ({history.length})
            </h2>
            <div className="space-y-3">
              {history.map((entry) => (
                <div
                  key={entry.accessToken}
                  className="bg-maycast-panel/30 backdrop-blur-md rounded-2xl border border-maycast-border/40 p-5 shadow-xl flex items-center justify-between gap-4 hover:border-maycast-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-bold text-maycast-text font-mono">
                          Room {entry.roomId.substring(0, 8)}
                        </span>
                        {entry.lastKnownState && (
                          <RoomStateBadge state={entry.lastKnownState} />
                        )}
                      </div>
                      <p className="text-xs text-maycast-text-secondary">
                        Created: {formatDate(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      onClick={() => navigate(`/director/rooms/${entry.accessToken}`)}
                      variant="primary"
                      size="sm"
                      className="!py-2 !px-4"
                    >
                      <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                      Open
                    </Button>
                    <Button
                      onClick={() => handleRemoveFromHistory(entry.accessToken)}
                      variant="danger"
                      size="sm"
                      className="!p-2"
                    >
                      <TrashIcon className="w-4 h-4 text-maycast-rec" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-maycast-border/50 text-center">
        <p className="text-maycast-text-secondary text-sm">
          Room history is stored locally on this device.
        </p>
      </footer>
    </div>
  );
};
