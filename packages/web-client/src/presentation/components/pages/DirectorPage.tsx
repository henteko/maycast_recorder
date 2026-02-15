/**
 * DirectorPage - Director Mode用メインページ
 *
 * ルーム作成履歴一覧を表示（ローカルストレージベース）
 * ルーム作成 → 詳細ページに遷移
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, TrashIcon, ArrowTopRightOnSquareIcon, UsersIcon } from '@heroicons/react/24/solid';
import { RoomAPIClient } from '../../../infrastructure/api/room-api';
import { getServerUrl } from '../../../infrastructure/config/serverConfig';
import {
  getRoomHistory,
  addRoomToHistory,
  removeRoomFromHistory,
  type RoomHistoryEntry,
} from '../../../infrastructure/storage/roomHistory';
import { Button } from '../atoms/Button';

export const DirectorPage: React.FC = () => {
  const navigate = useNavigate();
  const [history, setHistory] = useState<RoomHistoryEntry[]>(getRoomHistory);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshHistory = useCallback(() => {
    setHistory(getRoomHistory());
  }, []);

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
          <span className="text-maycast-text-secondary font-medium">
            {history.length} Room{history.length !== 1 ? 's' : ''} in history
          </span>
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
        <div className="mx-8 mt-4 p-4 bg-maycast-rec/20 border border-maycast-rec/50 rounded-xl text-maycast-rec">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="bg-maycast-panel/30 backdrop-blur-md p-12 rounded-2xl border border-maycast-border/40 shadow-xl">
              <div className="flex flex-col items-center text-maycast-text-secondary">
                <div className="p-6 bg-maycast-primary/10 rounded-full mb-6">
                  <UsersIcon className="w-16 h-16 text-maycast-primary/60" />
                </div>
                <p className="text-xl font-bold text-maycast-text mb-2">
                  No Rooms
                </p>
                <p className="text-sm mb-6 text-center">
                  Create a room and invite guests
                </p>
                <Button onClick={handleCreateRoom} disabled={isCreating} variant="primary" size="sm">
                  <PlusIcon className="w-5 h-5" />
                  Create First Room
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-3">
            {history.map((entry) => (
              <div
                key={entry.roomId}
                className="bg-maycast-panel/30 backdrop-blur-md rounded-2xl border border-maycast-border/40 p-5 shadow-xl flex items-center justify-between hover:border-maycast-primary/30 transition-colors cursor-pointer"
                onClick={() => handleOpenRoom(entry)}
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-maycast-primary/10 rounded-xl">
                    <UsersIcon className="w-6 h-6 text-maycast-primary/60" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-maycast-text font-mono">
                      Room {entry.roomId.substring(0, 8)}
                    </h3>
                    <p className="text-sm text-maycast-text-secondary">
                      Created: {formatDate(entry.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenRoom(entry);
                    }}
                    className="p-3 rounded-xl border border-maycast-border/30 bg-transparent hover:bg-maycast-panel/50 transition-colors"
                  >
                    <ArrowTopRightOnSquareIcon className="w-5 h-5 text-maycast-primary" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFromHistory(entry.roomId);
                    }}
                    className="p-3 rounded-xl border border-maycast-border/30 bg-transparent hover:bg-maycast-panel/50 transition-colors"
                  >
                    <TrashIcon className="w-5 h-5 text-maycast-text-secondary" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-maycast-border/50 text-center">
        <p className="text-maycast-text-secondary text-sm">
          This history is saved only in this browser. It is not shared with other devices or browsers.
        </p>
      </footer>
    </div>
  );
};
