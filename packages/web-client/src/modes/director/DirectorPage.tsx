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
  SignalSlashIcon,
  ArrowDownTrayIcon,
  DocumentArrowDownIcon,
  CheckIcon,
} from '@heroicons/react/24/solid';
import { useRoomManagerWebSocket } from '../../presentation/hooks/useRoomManagerWebSocket';
import type { RoomInfo } from '../../infrastructure/api/room-api';
import { RecordingAPIClient, type RecordingInfo } from '../../infrastructure/api/recording-api';
import type { RoomState, GuestInfo, GuestSyncState } from '@maycast/common-types';
import { getServerUrl } from '../../modes/remote/serverConfig';

/**
 * Room状態に応じたバッジを表示（StatusBadge風スタイル）
 */
const RoomStateBadge: React.FC<{ state: RoomState }> = ({ state }) => {
  if (state === 'idle') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-maycast-primary/20 backdrop-blur-sm rounded-full border border-maycast-primary/30">
        <div className="w-2 h-2 bg-maycast-primary rounded-full" />
        <span className="text-maycast-primary/80 font-semibold text-sm">待機中</span>
      </div>
    );
  }

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-maycast-rec/20 backdrop-blur-sm rounded-full border border-maycast-rec/30">
        <div className="relative">
          <div className="w-2 h-2 bg-maycast-rec rounded-full animate-pulse" />
          <div className="absolute inset-0 w-2 h-2 bg-maycast-rec rounded-full animate-ping opacity-75" />
        </div>
        <span className="text-maycast-rec/80 font-semibold text-sm">録画中</span>
      </div>
    );
  }

  if (state === 'finalizing') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/20 backdrop-blur-sm rounded-full border border-yellow-500/30">
        <div className="relative">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          <div className="absolute inset-0 w-2 h-2 bg-yellow-400 rounded-full animate-ping opacity-75" />
        </div>
        <span className="text-yellow-400/80 font-semibold text-sm">同期中</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-maycast-safe/20 backdrop-blur-sm rounded-full border border-maycast-safe/30">
      <CheckIcon className="w-4 h-4 text-maycast-safe" />
      <span className="text-maycast-safe/80 font-semibold text-sm">完了</span>
    </div>
  );
};

/**
 * Guest同期状態バッジ
 */
const GuestSyncBadge: React.FC<{ syncState: GuestSyncState }> = ({ syncState }) => {
  const stateConfig: Record<GuestSyncState, { label: string; bgColor: string; textColor: string; borderColor: string }> = {
    idle: { label: '待機中', bgColor: 'bg-gray-500/20', textColor: 'text-gray-400', borderColor: 'border-gray-500/30' },
    recording: { label: '録画中', bgColor: 'bg-maycast-rec/20', textColor: 'text-maycast-rec', borderColor: 'border-maycast-rec/30' },
    uploading: { label: '同期中', bgColor: 'bg-yellow-500/20', textColor: 'text-yellow-400', borderColor: 'border-yellow-500/30' },
    synced: { label: '完了', bgColor: 'bg-maycast-safe/20', textColor: 'text-maycast-safe', borderColor: 'border-maycast-safe/30' },
    error: { label: 'エラー', bgColor: 'bg-red-500/20', textColor: 'text-red-400', borderColor: 'border-red-500/30' },
  };
  const config = stateConfig[syncState];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium backdrop-blur-sm border ${config.bgColor} ${config.textColor} ${config.borderColor}`}>
      {syncState === 'uploading' && (
        <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse mr-1.5" />
      )}
      {syncState === 'synced' && (
        <CheckIcon className="w-3 h-3 mr-1" />
      )}
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
    <div className="flex items-center justify-between bg-maycast-bg/50 backdrop-blur-sm px-4 py-3 rounded-xl border border-maycast-border/30">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-maycast-safe/20 rounded-lg">
          <DocumentArrowDownIcon className="w-4 h-4 text-maycast-safe" />
        </div>
        <div>
          <span className="text-sm font-mono text-maycast-text">
            {recordingId.substring(0, 8)}...
          </span>
          {recording && (
            <div className="flex items-center gap-2 text-xs text-maycast-text-secondary mt-0.5">
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
        className="px-4 py-2 bg-maycast-safe hover:bg-maycast-safe/80 rounded-xl font-medium text-sm text-white transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:transform-none flex items-center gap-2"
        title="MP4をダウンロード"
      >
        {isDownloading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>処理中...</span>
          </>
        ) : (
          <>
            <ArrowDownTrayIcon className="w-4 h-4" />
            <span>ダウンロード</span>
          </>
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
      <div className="text-sm text-maycast-text-secondary text-center py-4">
        録画データがありません
      </div>
    );
  }

  return (
    <div className="bg-maycast-safe/10 backdrop-blur-md p-5 rounded-2xl border border-maycast-safe/30 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckIcon className="w-5 h-5 text-maycast-safe" />
          <span className="font-semibold text-maycast-text">
            録画完了 ({recordingIds.length}件)
          </span>
        </div>
        {recordingIds.length > 1 && (
          <button
            onClick={onDownloadAll}
            disabled={isDownloadingAll}
            className="flex items-center gap-2 px-4 py-2 bg-maycast-safe hover:bg-maycast-safe/80 text-white rounded-xl font-medium text-sm transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:transform-none"
          >
            {isDownloadingAll ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ダウンロード中...
              </>
            ) : (
              <>
                <ArrowDownTrayIcon className="w-4 h-4" />
                すべてダウンロード
              </>
            )}
          </button>
        )}
      </div>
      <div className="space-y-3">
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
    <div className="bg-maycast-panel/30 backdrop-blur-md rounded-2xl border border-maycast-border/40 p-6 shadow-xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-bold text-maycast-text font-mono">
              Room {room.id.substring(0, 8)}
            </h3>
            <RoomStateBadge state={room.state} />
          </div>
          <p className="text-sm text-maycast-text-secondary">
            作成: {formatDate(room.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-maycast-primary/10 rounded-full border border-maycast-primary/20">
          <UsersIcon className="w-4 h-4 text-maycast-primary" />
          <span className="font-semibold text-maycast-primary text-sm">{room.recording_ids.length}</span>
        </div>
      </div>

      {/* Guest URL */}
      <div className="mb-5">
        <label className="text-xs text-maycast-text-secondary mb-2 block font-medium">ゲスト招待URL</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={guestUrl}
            className="flex-1 bg-maycast-bg/50 text-maycast-text text-sm px-4 py-2.5 rounded-xl border border-maycast-border/50 font-mono focus:outline-none focus:border-maycast-primary/50"
          />
          <button
            onClick={copyGuestUrl}
            className={`px-4 py-2.5 rounded-xl transition-all transform hover:scale-[1.02] ${
              copied
                ? 'bg-maycast-safe text-white'
                : 'bg-maycast-primary/20 hover:bg-maycast-primary/30 text-maycast-primary'
            }`}
            title="URLをコピー"
          >
            {copied ? (
              <CheckIcon className="w-5 h-5" />
            ) : (
              <ClipboardDocumentIcon className="w-5 h-5" />
            )}
          </button>
        </div>
        {copied && (
          <p className="text-xs text-maycast-safe mt-2 font-medium">クリップボードにコピーしました!</p>
        )}
      </div>

      {/* Guests */}
      {guests.length > 0 && (
        <div className="mb-5">
          <label className="text-xs text-maycast-text-secondary mb-2 block font-medium">
            参加者 ({guests.length}名)
          </label>
          <div className="space-y-2">
            {guests.map((guest) => (
              <div
                key={guest.recordingId}
                className="flex items-center justify-between bg-maycast-bg/50 backdrop-blur-sm px-4 py-3 rounded-xl border border-maycast-border/30"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${guest.isConnected ? 'bg-maycast-safe' : 'bg-gray-400'}`} />
                  <span className="text-sm font-mono text-maycast-text">
                    Guest {guest.recordingId.substring(0, 6)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {guest.syncState === 'uploading' && (
                    <span className="text-xs text-maycast-text-secondary font-mono">
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
        <div className="mb-5">
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
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-maycast-primary hover:bg-maycast-primary/80 rounded-xl text-white font-bold text-base transition-all transform hover:scale-[1.02] shadow-lg disabled:opacity-50 disabled:transform-none"
          >
            <PlayIcon className="w-5 h-5" />
            録画を開始
          </button>
        )}
        {room.state === 'recording' && (
          <button
            onClick={() => onStopRecording(room.id)}
            disabled={isUpdating}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-maycast-rec hover:bg-maycast-rec/80 rounded-xl text-white font-bold text-base transition-all transform hover:scale-[1.02] shadow-lg disabled:opacity-50 disabled:transform-none"
          >
            <StopIcon className="w-5 h-5" />
            録画を停止
          </button>
        )}
        {room.state === 'finalizing' && (
          <div className="flex-1 bg-yellow-500/20 backdrop-blur-md p-4 rounded-xl border border-yellow-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-yellow-400">
                <div className="relative">
                  <div className="w-4 h-4 bg-yellow-400 rounded-full animate-pulse" />
                  <div className="absolute inset-0 w-4 h-4 bg-yellow-400 rounded-full animate-ping opacity-75" />
                </div>
                <span className="font-semibold">ゲストの同期を待機中...</span>
              </div>
              <button
                onClick={() => onFinalize(room.id)}
                disabled={isUpdating}
                className="px-4 py-2 bg-maycast-safe hover:bg-maycast-safe/80 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50"
                title="ゲストの同期を待たずに完了"
              >
                強制完了
              </button>
            </div>
          </div>
        )}
        {room.state === 'finished' && room.recording_ids.length === 0 && (
          <div className="flex-1 text-center text-maycast-text-secondary text-sm py-3 bg-maycast-bg/50 rounded-xl">
            録画データがありません
          </div>
        )}
        <button
          onClick={() => onDelete(room.id)}
          disabled={isUpdating || room.state === 'recording' || room.state === 'finalizing'}
          className="p-3 bg-maycast-bg/50 hover:bg-maycast-rec/20 rounded-xl transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:transform-none border border-maycast-border/30"
          title={room.state === 'recording' || room.state === 'finalizing' ? '録画中は削除できません' : 'Roomを削除'}
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
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-maycast-primary border-t-transparent"></div>
          <div className="absolute inset-0 animate-ping rounded-full h-12 w-12 border-4 border-maycast-primary/30"></div>
        </div>
        <p className="text-maycast-text-secondary mt-4 font-medium">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-maycast-bg text-maycast-text">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-maycast-border">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-maycast-primary/20 backdrop-blur-sm rounded-full border border-maycast-primary/30">
            <UsersIcon className="w-5 h-5 text-maycast-primary" />
            <span className="text-maycast-primary/80 font-semibold">Director</span>
          </div>
          <span className="text-maycast-text-secondary font-medium">{rooms.length} Rooms</span>
          {isWebSocketConnected ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-maycast-safe/20 backdrop-blur-sm rounded-full border border-maycast-safe/30">
              <div className="relative">
                <div className="w-2 h-2 bg-maycast-safe rounded-full" />
                <div className="absolute inset-0 w-2 h-2 bg-maycast-safe rounded-full animate-ping opacity-75" />
              </div>
              <span className="text-maycast-safe/80 font-medium text-sm">Live</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/20 backdrop-blur-sm rounded-full border border-yellow-500/30">
              <SignalSlashIcon className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-yellow-400/80 font-medium text-sm">Polling</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refreshRooms}
            disabled={isUpdating}
            className="p-3 bg-maycast-panel/50 hover:bg-maycast-border/50 rounded-xl transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:transform-none border border-maycast-border/30"
            title="更新"
          >
            <ArrowPathIcon className={`w-5 h-5 text-maycast-text-secondary ${isUpdating ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleCreateRoom}
            disabled={isUpdating}
            className="flex items-center gap-2 px-5 py-3 bg-maycast-primary hover:bg-maycast-primary/80 rounded-xl text-white font-bold transition-all transform hover:scale-[1.02] shadow-lg disabled:opacity-50 disabled:transform-none"
          >
            <PlusIcon className="w-5 h-5" />
            Roomを作成
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
                <div className="p-6 bg-maycast-primary/10 rounded-full mb-6">
                  <UsersIcon className="w-16 h-16 text-maycast-primary/60" />
                </div>
                <p className="text-xl font-bold text-maycast-text mb-2">Roomがありません</p>
                <p className="text-sm mb-6 text-center">
                  Roomを作成して、ゲストを招待しましょう
                </p>
                <button
                  onClick={handleCreateRoom}
                  disabled={isUpdating}
                  className="flex items-center gap-2 px-6 py-3 bg-maycast-primary hover:bg-maycast-primary/80 rounded-xl text-white font-bold transition-all transform hover:scale-[1.02] shadow-lg disabled:opacity-50 disabled:transform-none"
                >
                  <PlusIcon className="w-5 h-5" />
                  最初のRoomを作成
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
      <footer className="px-8 py-4 border-t border-maycast-border/50 text-center">
        <p className="text-maycast-text-secondary text-sm">
          ゲスト招待URLを参加者に共有してください。「録画を開始」を押すと、全員の録画が同時に開始されます。
        </p>
      </footer>
    </div>
  );
};
