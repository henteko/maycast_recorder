/**
 * RoomCard - Roomカード
 */

import { useState, useCallback } from 'react';
import { PlayIcon, StopIcon, TrashIcon, UsersIcon } from '@heroicons/react/24/solid';
import JSZip from 'jszip';
import type { RoomInfo } from '../../../infrastructure/api/room-api';
import { RecordingAPIClient } from '../../../infrastructure/api/recording-api';
import type { GuestInfo } from '@maycast/common-types';
import { getServerUrl } from '../../../infrastructure/config/serverConfig';
import { RoomStateBadge } from '../atoms/RoomStateBadge';
import { Button } from '../atoms/Button';
import { GuestUrlInput } from '../molecules/GuestUrlInput';
import { GuestListItem } from '../molecules/GuestListItem';
import { RecordingsDownloadSection } from './RecordingsDownloadSection';

interface RoomCardProps {
  room: RoomInfo;
  guests: GuestInfo[];
  /** ゲスト毎の波形データ (guestId -> { waveformData, isSilent }) */
  waveformsByGuest?: Map<string, { waveformData: number[]; isSilent: boolean }>;
  onStartRecording: (roomId: string) => void;
  onStopRecording: (roomId: string) => void;
  onFinalize: (roomId: string) => void;
  onDelete: (roomId: string) => void;
  isUpdating: boolean;
}

export const RoomCard: React.FC<RoomCardProps> = ({
  room,
  guests,
  waveformsByGuest,
  onStartRecording,
  onStopRecording,
  onFinalize,
  onDelete,
  isUpdating,
}) => {
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const guestUrl = `${window.location.origin}/guest/${room.id}`;

  // ゲスト名を取得するヘルパー関数
  const getGuestNameForRecording = useCallback((recordingId: string): string | undefined => {
    const guest = guests.find((g) => g.recordingId === recordingId);
    return guest?.name;
  }, [guests]);

  // 全録画を一括ダウンロード (ZIP形式)
  const handleDownloadAll = useCallback(async () => {
    if (room.recording_ids.length === 0) return;

    setIsDownloadingAll(true);
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);
      const zip = new JSZip();

      // 各録画をダウンロードしてZIPに追加
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

      // ZIPファイルを生成してダウンロード
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
  }, [room.recording_ids, room.id, getGuestNameForRecording]);

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
          <span className="font-semibold text-maycast-primary text-sm">
            {room.recording_ids.length}
          </span>
        </div>
      </div>

      {/* Guest URL */}
      <div className="mb-5">
        <GuestUrlInput url={guestUrl} />
      </div>

      {/* Guests */}
      {guests.length > 0 && (
        <div className="mb-5">
          <label className="text-xs text-maycast-text-secondary mb-2 block font-medium">
            参加者 ({guests.length}名)
          </label>
          <div className="space-y-2">
            {guests.map((guest) => {
              const waveformInfo = waveformsByGuest?.get(guest.guestId);
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
        <div className="mb-5">
          <RecordingsDownloadSection
            recordingIds={room.recording_ids}
            onDownloadAll={handleDownloadAll}
            isDownloadingAll={isDownloadingAll}
            guests={guests}
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {room.state === 'idle' && (
          <Button
            onClick={() => onStartRecording(room.id)}
            disabled={isUpdating}
            variant="primary"
            size="sm"
            className="flex-1"
          >
            <PlayIcon className="w-5 h-5" />
            録画を開始
          </Button>
        )}
        {room.state === 'recording' && (
          <Button
            onClick={() => onStopRecording(room.id)}
            disabled={isUpdating}
            variant="danger"
            size="sm"
            className="flex-1 !bg-maycast-rec hover:!bg-maycast-rec/80 !border-none"
          >
            <StopIcon className="w-5 h-5" />
            録画を停止
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
                <span className="font-semibold">ゲストの同期を待機中...</span>
              </div>
              <Button
                onClick={() => onFinalize(room.id)}
                disabled={isUpdating}
                variant="success"
                size="sm"
                className="!py-2 !px-4"
              >
                強制完了
              </Button>
            </div>
          </div>
        )}
        {room.state === 'finished' && room.recording_ids.length === 0 && (
          <div className="flex-1 text-center text-maycast-text-secondary text-sm py-3 bg-maycast-bg/50 rounded-xl">
            録画データがありません
          </div>
        )}
        <Button
          onClick={() => onDelete(room.id)}
          disabled={isUpdating || room.state === 'recording' || room.state === 'finalizing'}
          variant="danger"
          size="sm"
          className="!p-3"
        >
          <TrashIcon className="w-5 h-5 text-maycast-rec" />
        </Button>
      </div>
    </div>
  );
};
