/**
 * RoomDetailPage - ルーム詳細ページ
 *
 * アクセストークンによるURLでアクセスし、ルームの録画制御・ダウンロードを行う
 * 認証不要、URLを知っている人だけがアクセスできるアーキテクチャ
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlayIcon,
  StopIcon,
  TrashIcon,
  UsersIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/solid';
import JSZip from 'jszip';
import { useRoomDetailWebSocket } from '../../hooks/useRoomDetailWebSocket';
import { RecordingAPIClient } from '../../../infrastructure/api/recording-api';
import { getServerUrl } from '../../../infrastructure/config/serverConfig';
import { removeRoomFromHistory } from '../../../infrastructure/storage/room-history';
import { RoomStateBadge } from '../atoms/RoomStateBadge';
import { ConnectionBadge } from '../atoms/ConnectionBadge';
import { Button } from '../atoms/Button';
import { GuestUrlInput } from '../molecules/GuestUrlInput';
import { GuestListItem } from '../molecules/GuestListItem';
import { RecordingsDownloadSection } from '../organisms/RecordingsDownloadSection';

interface RoomDetailPageProps {
  accessToken: string;
}

export const RoomDetailPage: React.FC<RoomDetailPageProps> = ({ accessToken }) => {
  const navigate = useNavigate();
  const {
    room,
    isLoading,
    error,
    isNotFound,
    isWebSocketConnected,
    guests,
    waveformsByGuest,
    updateRoomState,
    deleteRoom,
    refreshRoom,
  } = useRoomDetailWebSocket(accessToken);

  const [isUpdating, setIsUpdating] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  const handleStartRecording = async () => {
    setIsUpdating(true);
    await updateRoomState('recording');
    setIsUpdating(false);
  };

  const handleStopRecording = async () => {
    setIsUpdating(true);
    await updateRoomState('finalizing');
    setIsUpdating(false);
  };

  const handleFinalize = async () => {
    setIsUpdating(true);
    await updateRoomState('finished');
    setIsUpdating(false);
  };

  const handleDeleteRoom = async () => {
    if (!confirm('Are you sure you want to delete this room?')) {
      return;
    }
    setIsUpdating(true);
    const success = await deleteRoom();
    setIsUpdating(false);
    if (success) {
      removeRoomFromHistory(accessToken);
      navigate('/director');
    }
  };

  const getGuestNameForRecording = useCallback((recordingId: string): string | undefined => {
    const guest = guests.find((g) => g.recordingId === recordingId);
    return guest?.name;
  }, [guests]);

  const handleDownloadAll = useCallback(async () => {
    if (!room || room.recording_ids.length === 0) return;

    setIsDownloadingAll(true);
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);
      const zip = new JSZip();

      for (const recordingId of room.recording_ids) {
        try {
          const blob = await apiClient.downloadRecording(recordingId);
          const guestName = getGuestNameForRecording(recordingId);
          const fileName = guestName
            ? `${guestName}-${recordingId.substring(0, 8)}.mp4`
            : `recording-${recordingId.substring(0, 8)}.mp4`;
          zip.file(fileName, blob);
        } catch (err) {
          console.error(`Failed to download recording ${recordingId}:`, err);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `room-${room.id.substring(0, 8)}-recordings.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download all recordings:', err);
      alert(`Failed to download: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsDownloadingAll(false);
    }
  }, [room, getGuestNameForRecording]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Loading
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-maycast-bg text-maycast-text">
        <div className="text-3xl font-bold text-maycast-primary text-center mb-8">
          Maycast Recorder
        </div>
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-maycast-primary border-t-transparent" />
          <div className="absolute inset-0 animate-ping rounded-full h-12 w-12 border-4 border-maycast-primary/30" />
        </div>
        <p className="text-maycast-text-secondary mt-4 font-medium">Loading room...</p>
      </div>
    );
  }

  // Not Found
  if (isNotFound || !room) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-maycast-bg text-maycast-text">
        <div className="text-3xl font-bold text-maycast-primary text-center mb-8">
          Maycast Recorder
        </div>
        <div className="bg-maycast-panel/30 backdrop-blur-md p-12 rounded-2xl border border-maycast-border/40 shadow-xl text-center">
          <p className="text-xl font-bold text-maycast-text mb-2">Room Not Found</p>
          <p className="text-sm text-maycast-text-secondary mb-6">
            This room does not exist or the URL is invalid.
          </p>
          <Button onClick={() => navigate('/director')} variant="primary" size="sm">
            <ArrowLeftIcon className="w-5 h-5" />
            Back to Director
          </Button>
        </div>
      </div>
    );
  }

  const guestUrl = `${window.location.origin}/guest/${room.id}`;

  return (
    <div className="flex flex-col h-full bg-maycast-bg text-maycast-text">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-maycast-border">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => navigate('/director')}
            variant="ghost"
            size="sm"
            className="!p-3 !border-maycast-border/30"
          >
            <ArrowLeftIcon className="w-5 h-5 text-maycast-text-secondary" />
          </Button>
          <div className="text-2xl font-bold text-maycast-primary">
            Maycast Recorder
          </div>
          <div className="w-px h-6 bg-maycast-border/50" />
          <div className="flex items-center gap-2 px-4 py-2 bg-maycast-primary/20 backdrop-blur-sm rounded-full border border-maycast-primary/30">
            <UsersIcon className="w-5 h-5 text-maycast-primary" />
            <span className="text-maycast-primary/80 font-semibold">Director</span>
          </div>
          <ConnectionBadge isConnected={isWebSocketConnected} />
        </div>
        <Button
          onClick={refreshRoom}
          disabled={isUpdating}
          variant="ghost"
          size="sm"
          className="!p-3 !border-maycast-border/30"
        >
          <ArrowPathIcon
            className={`w-5 h-5 text-maycast-text-secondary ${isUpdating ? 'animate-spin' : ''}`}
          />
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
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Room Info */}
          <div className="bg-maycast-panel/30 backdrop-blur-md rounded-2xl border border-maycast-border/40 p-6 shadow-xl">
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-bold text-maycast-text font-mono">
                    Room {room.id.substring(0, 8)}
                  </h2>
                  <RoomStateBadge state={room.state} />
                </div>
                <p className="text-sm text-maycast-text-secondary">
                  Created: {formatDate(room.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-maycast-primary/10 rounded-full border border-maycast-primary/20">
                <UsersIcon className="w-4 h-4 text-maycast-primary" />
                <span className="font-semibold text-maycast-primary text-sm">
                  {guests.length}
                </span>
              </div>
            </div>

            {/* Guest URL */}
            <GuestUrlInput url={guestUrl} />
          </div>

          {/* Participants */}
          {guests.length > 0 && (
            <div className="bg-maycast-panel/30 backdrop-blur-md rounded-2xl border border-maycast-border/40 p-6 shadow-xl">
              <label className="text-sm text-maycast-text-secondary mb-3 block font-semibold">
                Participants ({guests.length})
              </label>
              <div className="space-y-2">
                {guests.map((guest) => {
                  const waveformInfo = waveformsByGuest.get(guest.guestId);
                  return (
                    <GuestListItem
                      key={guest.guestId}
                      guest={guest}
                      waveformData={waveformInfo?.waveformData ?? null}
                      isSilent={waveformInfo?.isSilent ?? false}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Downloads (for finished rooms) */}
          {room.state === 'finished' && room.recording_ids.length > 0 && (
            <RecordingsDownloadSection
              recordingIds={room.recording_ids}
              onDownloadAll={handleDownloadAll}
              isDownloadingAll={isDownloadingAll}
              guests={guests}
            />
          )}

          {/* Controls */}
          <div className="bg-maycast-panel/30 backdrop-blur-md rounded-2xl border border-maycast-border/40 p-6 shadow-xl">
            <label className="text-sm text-maycast-text-secondary mb-3 block font-semibold">
              Controls
            </label>
            <div className="flex items-center gap-3">
              {room.state === 'idle' && (
                <Button
                  onClick={handleStartRecording}
                  disabled={isUpdating}
                  variant="primary"
                  size="sm"
                  className="flex-1"
                >
                  <PlayIcon className="w-5 h-5" />
                  Start Recording
                </Button>
              )}
              {room.state === 'recording' && (
                <Button
                  onClick={handleStopRecording}
                  disabled={isUpdating}
                  variant="danger"
                  size="sm"
                  className="flex-1 !bg-maycast-rec hover:!bg-maycast-rec/80 !border-none"
                >
                  <StopIcon className="w-5 h-5" />
                  Stop Recording
                </Button>
              )}
              {room.state === 'finalizing' && (
                <div className="flex-1 bg-yellow-500/20 backdrop-blur-md p-4 rounded-xl border border-yellow-500/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-yellow-400">
                      <div className="relative">
                        <div className="w-4 h-4 bg-yellow-400 rounded-full animate-pulse" />
                        <div className="absolute inset-0 w-4 h-4 bg-yellow-400 rounded-full animate-ping opacity-75" />
                      </div>
                      <span className="font-semibold">Waiting for guest sync...</span>
                    </div>
                    <Button
                      onClick={handleFinalize}
                      disabled={isUpdating}
                      variant="success"
                      size="sm"
                      className="!py-2 !px-4"
                    >
                      Force Complete
                    </Button>
                  </div>
                </div>
              )}
              {room.state === 'finished' && room.recording_ids.length === 0 && (
                <div className="flex-1 text-center text-maycast-text-secondary text-sm py-3 bg-maycast-bg/50 rounded-xl">
                  No recording data
                </div>
              )}
              <Button
                onClick={handleDeleteRoom}
                disabled={isUpdating || room.state === 'recording' || room.state === 'finalizing'}
                variant="danger"
                size="sm"
                className="!p-3"
              >
                <TrashIcon className="w-5 h-5 text-maycast-rec" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-maycast-border/50 text-center">
        <p className="text-maycast-text-secondary text-sm">
          Share the guest invitation URL with participants. Press 'Start Recording' to begin recording for everyone simultaneously.
        </p>
      </footer>
    </div>
  );
};
