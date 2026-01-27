/**
 * DirectorPage - Director Mode用メインページ
 *
 * Room一覧表示、作成、状態制御を行う
 */

import React, { useState } from 'react';
import {
  PlusIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
  UsersIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/solid';
import { useRoomManager } from '../../presentation/hooks/useRoomManager';
import type { RoomInfo } from '../../infrastructure/api/room-api';
import type { RoomState } from '@maycast/common-types';

/**
 * Room状態に応じたバッジを表示
 */
const RoomStateBadge: React.FC<{ state: RoomState }> = ({ state }) => {
  const stateConfig = {
    idle: {
      label: 'Idle',
      bgColor: 'bg-gray-500/20',
      textColor: 'text-gray-400',
      dotColor: 'bg-gray-400',
    },
    recording: {
      label: 'Recording',
      bgColor: 'bg-maycast-rec/20',
      textColor: 'text-maycast-rec',
      dotColor: 'bg-maycast-rec animate-pulse',
    },
    finished: {
      label: 'Finished',
      bgColor: 'bg-green-500/20',
      textColor: 'text-green-400',
      dotColor: 'bg-green-400',
    },
  };

  const config = stateConfig[state];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
      <span className={`w-2 h-2 rounded-full ${config.dotColor}`}></span>
      {config.label}
    </span>
  );
};

/**
 * Roomカード
 */
const RoomCard: React.FC<{
  room: RoomInfo;
  onStartRecording: (roomId: string) => void;
  onStopRecording: (roomId: string) => void;
  onDelete: (roomId: string) => void;
  isUpdating: boolean;
}> = ({ room, onStartRecording, onStopRecording, onDelete, isUpdating }) => {
  const [copied, setCopied] = useState(false);
  const guestUrl = `${window.location.origin}/guest/${room.id}`;

  const copyGuestUrl = async () => {
    try {
      await navigator.clipboard.writeText(guestUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-maycast-panel rounded-xl border border-maycast-border p-6 shadow-lg">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-lg font-semibold text-maycast-text font-mono">
              {room.id.substring(0, 8)}...
            </h3>
            <RoomStateBadge state={room.state} />
          </div>
          <p className="text-sm text-maycast-text-secondary">
            Created: {formatDate(room.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2 text-maycast-text-secondary">
          <UsersIcon className="w-5 h-5" />
          <span className="font-medium">{room.recording_ids.length}</span>
        </div>
      </div>

      {/* Guest URL */}
      <div className="mb-4">
        <label className="text-xs text-maycast-text-secondary mb-1 block">Guest URL</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={guestUrl}
            className="flex-1 bg-maycast-bg text-maycast-text text-sm px-3 py-2 rounded-lg border border-maycast-border font-mono"
          />
          <button
            onClick={copyGuestUrl}
            className="px-3 py-2 bg-maycast-bg hover:bg-maycast-border rounded-lg transition-colors"
            title="Copy URL"
          >
            <ClipboardDocumentIcon className="w-5 h-5 text-maycast-text-secondary" />
          </button>
        </div>
        {copied && (
          <p className="text-xs text-green-400 mt-1">Copied to clipboard!</p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {room.state === 'idle' && (
          <button
            onClick={() => onStartRecording(room.id)}
            disabled={isUpdating}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-maycast-rec hover:bg-maycast-rec/80 rounded-xl text-white font-semibold transition-colors disabled:opacity-50"
          >
            <PlayIcon className="w-5 h-5" />
            Start Recording
          </button>
        )}
        {room.state === 'recording' && (
          <button
            onClick={() => onStopRecording(room.id)}
            disabled={isUpdating}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-600 hover:bg-gray-500 rounded-xl text-white font-semibold transition-colors disabled:opacity-50"
          >
            <StopIcon className="w-5 h-5" />
            Stop Recording
          </button>
        )}
        {room.state === 'finished' && (
          <div className="flex-1 text-center text-maycast-text-secondary text-sm py-2.5">
            Recording completed
          </div>
        )}
        <button
          onClick={() => onDelete(room.id)}
          disabled={isUpdating || room.state === 'recording'}
          className="p-2.5 bg-maycast-bg hover:bg-maycast-rec/20 rounded-xl transition-colors disabled:opacity-50"
          title={room.state === 'recording' ? 'Stop recording before deleting' : 'Delete room'}
        >
          <TrashIcon className="w-5 h-5 text-maycast-rec" />
        </button>
      </div>
    </div>
  );
};

export const DirectorPage: React.FC = () => {
  const {
    rooms,
    isLoading,
    error,
    createRoom,
    deleteRoom,
    updateRoomState,
    refreshRooms,
  } = useRoomManager(3000); // 3秒ポーリング

  const [isUpdating, setIsUpdating] = useState(false);

  const handleCreateRoom = async () => {
    setIsUpdating(true);
    await createRoom();
    setIsUpdating(false);
  };

  const handleStartRecording = async (roomId: string) => {
    setIsUpdating(true);
    await updateRoomState(roomId, 'recording');
    setIsUpdating(false);
  };

  const handleStopRecording = async (roomId: string) => {
    setIsUpdating(true);
    await updateRoomState(roomId, 'finished');
    setIsUpdating(false);
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm('Are you sure you want to delete this room?')) {
      return;
    }
    setIsUpdating(true);
    await deleteRoom(roomId);
    setIsUpdating(false);
  };

  // Loading
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-maycast-bg text-maycast-text">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-maycast-accent border-t-transparent mb-4"></div>
        <p className="text-maycast-text-secondary">Loading rooms...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-maycast-bg text-maycast-text">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-maycast-border">
        <div className="flex items-center gap-3">
          <UsersIcon className="w-7 h-7 text-maycast-primary" />
          <h1 className="text-2xl font-bold">
            Director Mode <span className="text-maycast-primary">({rooms.length} rooms)</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refreshRooms}
            disabled={isUpdating}
            className="p-2.5 bg-maycast-panel hover:bg-maycast-border rounded-xl transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <ArrowPathIcon className={`w-5 h-5 text-maycast-text-secondary ${isUpdating ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleCreateRoom}
            disabled={isUpdating}
            className="flex items-center gap-2 px-4 py-2.5 bg-maycast-primary hover:bg-maycast-primary/80 rounded-xl text-white font-semibold transition-colors disabled:opacity-50"
          >
            <PlusIcon className="w-5 h-5" />
            Create Room
          </button>
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
        {rooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="bg-maycast-panel/30 backdrop-blur-md p-12 rounded-2xl border border-maycast-border/40 shadow-xl">
              <div className="flex flex-col items-center text-maycast-text-secondary">
                <UsersIcon className="w-20 h-20 mb-4 opacity-50" />
                <p className="text-lg font-medium mb-4">No rooms yet</p>
                <button
                  onClick={handleCreateRoom}
                  disabled={isUpdating}
                  className="flex items-center gap-2 px-6 py-3 bg-maycast-primary hover:bg-maycast-primary/80 rounded-xl text-white font-semibold transition-colors disabled:opacity-50"
                >
                  <PlusIcon className="w-5 h-5" />
                  Create Your First Room
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
                onDelete={handleDeleteRoom}
                isUpdating={isUpdating}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-maycast-border text-center text-maycast-text-secondary text-sm">
        Share the Guest URL with participants. They will automatically start recording when you press "Start Recording".
      </footer>
    </div>
  );
};
