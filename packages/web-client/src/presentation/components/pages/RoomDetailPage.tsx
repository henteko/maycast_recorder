/**
 * RoomDetailPage - Room詳細ページ
 *
 * /director/rooms/:roomId?key=:accessKey
 * 単一ルームの操作（録画開始/停止、ダウンロード、削除等）を行う
 */

import { useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { PlayIcon, StopIcon, TrashIcon, ArrowLeftIcon } from '@heroicons/react/24/solid';
import JSZip from 'jszip';
import { useRoomDetail } from '../../hooks/useRoomDetail';
import { RecordingAPIClient } from '../../../infrastructure/api/recording-api';
import { CloudDownloadService } from '../../../infrastructure/download/CloudDownloadService';
import { getServerUrl } from '../../../infrastructure/config/serverConfig';
import { removeRoomFromHistory } from '../../../infrastructure/storage/roomHistory';
import { RoomStateBadge } from '../atoms/RoomStateBadge';
import { ConnectionBadge } from '../atoms/ConnectionBadge';
import { Button } from '../atoms/Button';
import { GuestUrlInput } from '../molecules/GuestUrlInput';
import { GuestListItem } from '../molecules/GuestListItem';
import { RecordingsDownloadSection, type DownloadAllProgress } from '../organisms/RecordingsDownloadSection';


export const RoomDetailPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const accessKey = searchParams.get('key');
  const navigate = useNavigate();

  const {
    room,
    guests,
    waveforms,
    isLoading,
    error,
    isAccessDenied,
    isWebSocketConnected,
    updateRoomState,
    deleteRoom,
    refreshRoom,
  } = useRoomDetail(roomId ?? null, accessKey, 5000);

  const [isUpdating, setIsUpdating] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadAllProgress, setDownloadAllProgress] = useState<DownloadAllProgress>({
    currentRecording: 0, totalRecordings: 0, currentChunk: 0, totalChunks: 0,
  });

  const guestUrl = roomId ? `${window.location.origin}/guest/${roomId}` : '';

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
    if (success && roomId) {
      removeRoomFromHistory(roomId);
      navigate('/director');
    }
    setIsUpdating(false);
  };

  const getGuestNameForRecording = useCallback((recordingId: string): string | undefined => {
    const guest = guests.find((g) => g.recordingId === recordingId);
    return guest?.name;
  }, [guests]);

  const handleDownloadAll = useCallback(async () => {
    if (!room || room.recording_ids.length === 0) return;

    const totalRecordings = room.recording_ids.length;
    setIsDownloadingAll(true);
    setDownloadAllProgress({ currentRecording: 0, totalRecordings, currentChunk: 0, totalChunks: 0 });
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);
      const zip = new JSZip();

      let completedRecordings = 0;
      for (const recordingId of room.recording_ids) {
        try {
          let blob: Blob;
          let fileName: string | undefined;
          const onChunkProgress = (progress: { current: number; total: number }) => {
            setDownloadAllProgress({
              currentRecording: completedRecordings,
              totalRecordings,
              currentChunk: progress.current,
              totalChunks: progress.total,
            });
          };
          const downloadUrls = await apiClient.getDownloadUrls(recordingId);
          if (downloadUrls.directDownload) {
            const cloudService = new CloudDownloadService();
            blob = await cloudService.download(downloadUrls, onChunkProgress);
            fileName = downloadUrls.filename;

            // m4aが利用可能な場合はZIPに追加
            if (downloadUrls.m4aUrl && downloadUrls.m4aFilename) {
              try {
                const m4aResponse = await fetch(downloadUrls.m4aUrl);
                if (m4aResponse.ok) {
                  const m4aBlob = await m4aResponse.blob();
                  zip.file(downloadUrls.m4aFilename, m4aBlob);
                }
              } catch (m4aErr) {
                console.error(`Failed to download m4a for ${recordingId}:`, m4aErr);
              }
            }

          } else {
            blob = await apiClient.downloadRecording(recordingId);
            fileName = downloadUrls.filename;
          }

          if (!fileName) {
            let guestName = getGuestNameForRecording(recordingId);
            if (!guestName) {
              try {
                const info = await apiClient.getRecording(recordingId);
                guestName = info.metadata?.participantName;
              } catch { /* ignore */ }
            }
            fileName = guestName
              ? `${guestName}-${recordingId.substring(0, 8)}.mp4`
              : `recording-${recordingId.substring(0, 8)}.mp4`;
          }
          zip.file(fileName, blob);
          completedRecordings++;
          setDownloadAllProgress((prev) => ({ ...prev, currentRecording: completedRecordings }));
        } catch (err) {
          console.error(`Failed to download recording ${recordingId}:`, err);
          completedRecordings++;
          setDownloadAllProgress((prev) => ({ ...prev, currentRecording: completedRecordings }));
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

  const headerBg: Record<string, string> = {
    idle: 'border-b border-maycast-border/60',
    recording: 'border-b-2 border-b-maycast-rec/50 bg-maycast-rec/5',
    finalizing: 'border-b-2 border-b-yellow-400/50 bg-yellow-400/5',
    finished: 'border-b border-maycast-border/60',
  };

  // Access Denied
  if (isAccessDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-maycast-bg text-maycast-text">
        <div className="bg-maycast-panel/50 rounded-xl border border-maycast-border/30 p-12 text-center">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-2xl font-bold mb-3">Access Denied</h1>
          <p className="text-maycast-text-secondary mb-6">
            The access key is invalid or missing.
          </p>
          <Button onClick={() => navigate('/director')} variant="primary" size="sm">
            <ArrowLeftIcon className="w-5 h-5" />
            Back to Director
          </Button>
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-maycast-bg text-maycast-text">
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-maycast-primary border-t-transparent" />
          <div className="absolute inset-0 animate-ping rounded-full h-12 w-12 border-4 border-maycast-primary/30" />
        </div>
        <p className="text-maycast-text-secondary mt-4 font-medium">Loading room...</p>
      </div>
    );
  }

  // Room not found
  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-maycast-bg text-maycast-text">
        <div className="bg-maycast-panel/50 rounded-xl border border-maycast-border/30 p-12 text-center">
          <h1 className="text-2xl font-bold mb-3">Room Not Found</h1>
          <p className="text-maycast-text-secondary mb-6">
            {error || 'The room does not exist.'}
          </p>
          <Button onClick={() => navigate('/director')} variant="primary" size="sm">
            <ArrowLeftIcon className="w-5 h-5" />
            Back to Director
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-maycast-bg text-maycast-text">
      {/* Header */}
      <div className={`sticky top-0 z-10 bg-maycast-bg/95 backdrop-blur-sm flex items-center justify-between px-6 py-3 ${headerBg[room.state] || 'border-b border-maycast-border/60'}`}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/director')}
            className="p-2 rounded-lg hover:bg-maycast-border/30 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5 text-maycast-text-secondary" />
          </button>
          <div className="text-lg font-bold text-maycast-primary tracking-tight">
            Maycast Recorder
          </div>
          <div className="w-px h-5 bg-maycast-border/40" />
          <h1 className="text-base font-bold text-maycast-text font-mono">
            Room {room.id.substring(0, 8)}
          </h1>
          <RoomStateBadge state={room.state} />
          <ConnectionBadge isConnected={isWebSocketConnected} />
        </div>
        <div className="flex items-center gap-3">
          {/* Recording controls in header */}
          {room.state === 'idle' && (
            <Button
              onClick={handleStartRecording}
              disabled={isUpdating}
              variant="primary"
              size="sm"
            >
              <PlayIcon className="w-4 h-4" />
              Start Recording
            </Button>
          )}
          {room.state === 'recording' && (
            <Button
              onClick={handleStopRecording}
              disabled={isUpdating}
              variant="danger"
              size="sm"
              className="!bg-maycast-rec !border-none"
            >
              <StopIcon className="w-4 h-4" />
              Stop Recording
            </Button>
          )}
          {room.state === 'finalizing' && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-yellow-400 font-medium">Syncing...</span>
              <Button
                onClick={handleFinalize}
                disabled={isUpdating}
                variant="success"
                size="sm"
              >
                Force Complete
              </Button>
            </div>
          )}
          {/* Delete button (idle/finished only) */}
          {(room.state === 'idle' || room.state === 'finished') && (
            <button
              onClick={handleDeleteRoom}
              disabled={isUpdating}
              className="p-2 rounded-lg hover:bg-maycast-rec/20 transition-colors disabled:opacity-50"
              title="Delete Room"
            >
              <TrashIcon className="w-4 h-4 text-maycast-rec" />
            </button>
          )}
          <button
            onClick={() => refreshRoom()}
            disabled={isUpdating}
            className="p-2 rounded-lg hover:bg-maycast-border/30 transition-colors disabled:opacity-50"
          >
            <svg className={`w-5 h-5 text-maycast-text-secondary ${isUpdating ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && !isAccessDenied && (
        <div className="mx-8 mt-4 p-4 bg-maycast-rec/20 border border-maycast-rec/50 rounded-xl text-maycast-rec">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Guest Invitation */}
          <div className="bg-maycast-panel/50 rounded-xl border border-maycast-border/30 p-5">
            {room.state === 'idle' ? (
              <>
                <GuestUrlInput url={guestUrl} />
                <p className="text-xs text-maycast-text-secondary mt-3">
                  Share this URL with participants before starting the recording. Guests can join and set up their microphone while waiting.
                </p>
              </>
            ) : room.state === 'recording' ? (
              <div className="bg-maycast-rec/10 rounded-xl border border-maycast-rec/20 p-3">
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <div className="w-3 h-3 bg-maycast-rec rounded-full animate-pulse" />
                  </div>
                  <p className="text-sm text-maycast-text-secondary">
                    Recording in progress. New guests cannot join at this time.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-3 h-3 bg-maycast-text-secondary/40 rounded-full" />
                <p className="text-sm text-maycast-text-secondary">
                  This room is no longer accepting new guests.
                </p>
              </div>
            )}
          </div>

          {/* Participants */}
          {guests.length > 0 && (
            <div className="bg-maycast-panel/50 rounded-xl border border-maycast-border/30 p-5">
              <label className="text-xs text-maycast-text-secondary mb-3 block font-medium">
                Participants ({guests.length})
              </label>
              <div className="space-y-2">
                {guests.map((guest) => {
                  const waveformInfo = waveforms.get(guest.guestId);
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

          {/* Downloads */}
          {room.state === 'finished' && room.recording_ids.length > 0 && (
            <div className="bg-maycast-panel/50 rounded-xl border border-maycast-border/30 p-5">
              <RecordingsDownloadSection
                recordingIds={room.recording_ids}
                onDownloadAll={handleDownloadAll}
                isDownloadingAll={isDownloadingAll}
                downloadAllProgress={downloadAllProgress}
                guests={guests}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
