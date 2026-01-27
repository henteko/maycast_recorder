/**
 * DirectorPage - Director Mode用メインページ
 *
 * Room一覧表示、作成、状態制御を行う
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  PlusIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
  UsersIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
  SignalIcon,
  SignalSlashIcon,
  ArrowDownTrayIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/solid';
import { useRoomManagerWebSocket } from '../../presentation/hooks/useRoomManagerWebSocket';
import type { RoomInfo } from '../../infrastructure/api/room-api';
import { RecordingAPIClient, type RecordingInfo } from '../../infrastructure/api/recording-api';
import type { RoomState, GuestInfo, GuestSyncState } from '@maycast/common-types';
import { getServerUrl } from '../../modes/remote/serverConfig';

/**
 * Room状態に応じたバッジを表示
 */
const RoomStateBadge: React.FC<{ state: RoomState }> = ({ state }) => {
  const stateConfig: Record<RoomState, { label: string; bgColor: string; textColor: string; dotColor: string }> = {
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
    finalizing: {
      label: 'Syncing',
      bgColor: 'bg-yellow-500/20',
      textColor: 'text-yellow-400',
      dotColor: 'bg-yellow-400 animate-pulse',
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
 * Guest同期状態バッジ
 */
const GuestSyncBadge: React.FC<{ syncState: GuestSyncState }> = ({ syncState }) => {
  const stateConfig: Record<GuestSyncState, { label: string; bgColor: string; textColor: string }> = {
    idle: { label: 'Waiting', bgColor: 'bg-gray-500/20', textColor: 'text-gray-400' },
    recording: { label: 'Recording', bgColor: 'bg-maycast-rec/20', textColor: 'text-maycast-rec' },
    uploading: { label: 'Uploading', bgColor: 'bg-yellow-500/20', textColor: 'text-yellow-400' },
    synced: { label: 'Synced', bgColor: 'bg-green-500/20', textColor: 'text-green-400' },
    error: { label: 'Error', bgColor: 'bg-red-500/20', textColor: 'text-red-400' },
  };
  const config = stateConfig[syncState];
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs ${config.bgColor} ${config.textColor}`}>
      {config.label}
    </span>
  );
};

/**
 * Recording ダウンロードアイテム
 */
const RecordingDownloadItem: React.FC<{
  recordingId: string;
  recording: RecordingInfo | null;
  isLoading: boolean;
  onDownload: (recordingId: string) => void;
  isDownloading: boolean;
}> = ({ recordingId, recording, isLoading, onDownload, isDownloading }) => {
  const duration = recording ? RecordingAPIClient.calculateDuration(recording) : null;

  return (
    <div className="flex items-center justify-between bg-maycast-bg px-3 py-2 rounded-lg">
      <div className="flex items-center gap-3">
        <DocumentArrowDownIcon className="w-4 h-4 text-maycast-accent" />
        <div>
          <span className="text-sm font-mono text-maycast-text">
            {recordingId.substring(0, 8)}...
          </span>
          {recording && (
            <div className="flex items-center gap-2 text-xs text-maycast-text-secondary">
              {duration !== null && (
                <span>{RecordingAPIClient.formatDuration(duration)}</span>
              )}
              {recording.chunk_count > 0 && (
                <span>• {recording.chunk_count} chunks</span>
              )}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={() => onDownload(recordingId)}
        disabled={isLoading || isDownloading}
        className="p-2 bg-maycast-primary/20 hover:bg-maycast-primary/30 rounded-lg transition-colors disabled:opacity-50"
        title="Download MP4"
      >
        {isDownloading ? (
          <div className="w-4 h-4 border-2 border-maycast-primary border-t-transparent rounded-full animate-spin" />
        ) : (
          <ArrowDownTrayIcon className="w-4 h-4 text-maycast-primary" />
        )}
      </button>
    </div>
  );
};

/**
 * Recordings ダウンロードセクション
 */
const RecordingsDownloadSection: React.FC<{
  recordingIds: string[];
  onDownloadAll: () => void;
  isDownloadingAll: boolean;
}> = ({ recordingIds, onDownloadAll, isDownloadingAll }) => {
  const [recordings, setRecordings] = useState<Map<string, RecordingInfo>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  // Recording情報を取得
  useEffect(() => {
    const fetchRecordings = async () => {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);

      for (const recordingId of recordingIds) {
        if (recordings.has(recordingId)) continue;

        setLoadingIds((prev) => new Set(prev).add(recordingId));
        try {
          const info = await apiClient.getRecording(recordingId);
          setRecordings((prev) => new Map(prev).set(recordingId, info));
        } catch (err) {
          console.error(`Failed to fetch recording ${recordingId}:`, err);
        } finally {
          setLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(recordingId);
            return next;
          });
        }
      }
    };

    fetchRecordings();
  }, [recordingIds]);

  // 個別ダウンロード
  const handleDownload = useCallback(async (recordingId: string) => {
    setDownloadingIds((prev) => new Set(prev).add(recordingId));
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);
      const blob = await apiClient.downloadRecording(recordingId);

      // ダウンロードリンクを作成
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${recordingId.substring(0, 8)}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`Failed to download recording ${recordingId}:`, err);
      alert(`Failed to download recording: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(recordingId);
        return next;
      });
    }
  }, []);

  if (recordingIds.length === 0) {
    return (
      <div className="text-sm text-maycast-text-secondary text-center py-2">
        No recordings available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs text-maycast-text-secondary">
          Recordings ({recordingIds.length})
        </label>
        {recordingIds.length > 1 && (
          <button
            onClick={onDownloadAll}
            disabled={isDownloadingAll}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-maycast-primary/20 hover:bg-maycast-primary/30 text-maycast-primary rounded-lg transition-colors disabled:opacity-50"
          >
            {isDownloadingAll ? (
              <>
                <div className="w-3 h-3 border-2 border-maycast-primary border-t-transparent rounded-full animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <ArrowDownTrayIcon className="w-3 h-3" />
                Download All
              </>
            )}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {recordingIds.map((recordingId) => (
          <RecordingDownloadItem
            key={recordingId}
            recordingId={recordingId}
            recording={recordings.get(recordingId) || null}
            isLoading={loadingIds.has(recordingId)}
            onDownload={handleDownload}
            isDownloading={downloadingIds.has(recordingId)}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * Roomカード
 */
const RoomCard: React.FC<{
  room: RoomInfo;
  guests: GuestInfo[];
  onStartRecording: (roomId: string) => void;
  onStopRecording: (roomId: string) => void;
  onFinalize: (roomId: string) => void;
  onDelete: (roomId: string) => void;
  isUpdating: boolean;
}> = ({ room, guests, onStartRecording, onStopRecording, onFinalize, onDelete, isUpdating }) => {
  const [copied, setCopied] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const guestUrl = `${window.location.origin}/guest/${room.id}`;

  // 全録画を一括ダウンロード
  const handleDownloadAll = useCallback(async () => {
    if (room.recording_ids.length === 0) return;

    setIsDownloadingAll(true);
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);

      // 各録画を順番にダウンロード
      for (let i = 0; i < room.recording_ids.length; i++) {
        const recordingId = room.recording_ids[i];
        try {
          const blob = await apiClient.downloadRecording(recordingId);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `recording-${recordingId.substring(0, 8)}.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          // 連続ダウンロードの間に少し待機
          if (i < room.recording_ids.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch (err) {
          console.error(`Failed to download recording ${recordingId}:`, err);
        }
      }
    } catch (err) {
      console.error('Failed to download all recordings:', err);
      alert(`Failed to download: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsDownloadingAll(false);
    }
  }, [room.recording_ids]);

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

      {/* Guests */}
      {guests.length > 0 && (
        <div className="mb-4">
          <label className="text-xs text-maycast-text-secondary mb-2 block">
            Guests ({guests.length})
          </label>
          <div className="space-y-2">
            {guests.map((guest) => (
              <div
                key={guest.recordingId}
                className="flex items-center justify-between bg-maycast-bg px-3 py-2 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${guest.isConnected ? 'bg-green-400' : 'bg-gray-400'}`} />
                  <span className="text-sm font-mono text-maycast-text-secondary">
                    {guest.recordingId.substring(0, 8)}...
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {guest.syncState === 'uploading' && (
                    <span className="text-xs text-maycast-text-secondary">
                      {guest.uploadedChunks}/{guest.totalChunks}
                    </span>
                  )}
                  <GuestSyncBadge syncState={guest.syncState} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Downloads (for finished rooms) */}
      {room.state === 'finished' && room.recording_ids.length > 0 && (
        <div className="mb-4">
          <RecordingsDownloadSection
            recordingIds={room.recording_ids}
            onDownloadAll={handleDownloadAll}
            isDownloadingAll={isDownloadingAll}
          />
        </div>
      )}

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
        {room.state === 'finalizing' && (
          <>
            <div className="flex-1 flex items-center justify-center gap-2 text-yellow-400 text-sm py-2.5">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-yellow-400 border-t-transparent" />
              Waiting for guests to sync...
            </div>
            <button
              onClick={() => onFinalize(room.id)}
              disabled={isUpdating}
              className="px-3 py-2 bg-green-600 hover:bg-green-500 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-50"
              title="Force finish (skip waiting for guests)"
            >
              Force Finish
            </button>
          </>
        )}
        {room.state === 'finished' && room.recording_ids.length === 0 && (
          <div className="flex-1 text-center text-maycast-text-secondary text-sm py-2.5">
            Recording completed (no recordings)
          </div>
        )}
        <button
          onClick={() => onDelete(room.id)}
          disabled={isUpdating || room.state === 'recording' || room.state === 'finalizing'}
          className="p-2.5 bg-maycast-bg hover:bg-maycast-rec/20 rounded-xl transition-colors disabled:opacity-50"
          title={room.state === 'recording' || room.state === 'finalizing' ? 'Stop recording before deleting' : 'Delete room'}
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
    isWebSocketConnected,
    guestsByRoom,
    createRoom,
    deleteRoom,
    updateRoomState,
    refreshRooms,
  } = useRoomManagerWebSocket(5000); // WebSocket + フォールバック5秒ポーリング

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
    // recording -> finalizing（Guestの同期待ち状態へ）
    await updateRoomState(roomId, 'finalizing');
    setIsUpdating(false);
  };

  const handleFinalize = async (roomId: string) => {
    setIsUpdating(true);
    // finalizing -> finished（強制終了）
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

  // Room毎のGuest配列を取得
  const getGuestsForRoom = (roomId: string): GuestInfo[] => {
    const roomGuests = guestsByRoom.get(roomId);
    if (!roomGuests) return [];
    return Array.from(roomGuests.values());
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
          {isWebSocketConnected ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
              <SignalIcon className="w-3.5 h-3.5" />
              Live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
              <SignalSlashIcon className="w-3.5 h-3.5" />
              Polling
            </span>
          )}
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
                guests={getGuestsForRoom(room.id)}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
                onFinalize={handleFinalize}
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
