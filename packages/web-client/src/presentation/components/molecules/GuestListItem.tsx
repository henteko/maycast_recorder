/**
 * GuestListItem - ゲスト一覧の1行表示
 */

import { MicrophoneIcon } from '@heroicons/react/24/solid';
import type { GuestInfo } from '@maycast/common-types';
import { GuestSyncBadge } from '../atoms/GuestSyncBadge';
import { WaveformDisplay } from '../atoms/WaveformDisplay';

interface GuestListItemProps {
  guest: GuestInfo;
  /** 波形データ（Director用） */
  waveformData?: number[] | null;
  /** 無音状態かどうか（Guest側で判定） */
  isSilent?: boolean;
}

const ClockSyncBadge: React.FC<{ guest: GuestInfo }> = ({ guest }) => {
  const clockSync = guest.clockSyncStatus;
  if (!clockSync) return null;

  if (clockSync.status === 'idle') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-500/20 text-gray-400">
        Not synced
      </span>
    );
  }

  if (clockSync.status === 'syncing') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/20 text-yellow-400">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
        Syncing...
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-maycast-safe/20 text-maycast-safe">
      <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
      {`±${Math.round(clockSync.accuracyMs)}ms`}
    </span>
  );
};

export const GuestListItem: React.FC<GuestListItemProps> = ({ guest, waveformData, isSilent = false }) => {
  const guestIdentifier = guest.guestId || guest.recordingId || 'unknown';
  const displayName = guest.name || `Guest ${guestIdentifier.substring(0, 6)}`;
  const mediaStatus = guest.mediaStatus;

  return (
    <div className="bg-maycast-panel/40 rounded-xl border border-maycast-border/30 p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              guest.isConnected ? 'bg-maycast-safe' : 'bg-gray-400'
            }`}
          />
          <span className="text-sm font-medium text-maycast-text">
            {displayName}
          </span>
          <ClockSyncBadge guest={guest} />
        </div>
        <div className="flex items-center gap-3">
          {/* メディアステータスアイコン */}
          {mediaStatus && (
            <div className="flex items-center gap-2">
              {/* マイク状態 */}
              <div
                className={`p-1 rounded relative ${
                  mediaStatus.isMicMuted
                    ? 'bg-maycast-rec/20 text-maycast-rec'
                    : 'bg-maycast-safe/20 text-maycast-safe'
                }`}
                title={mediaStatus.isMicMuted ? 'Muted' : 'Mic ON'}
              >
                <MicrophoneIcon className="w-4 h-4" />
                {mediaStatus.isMicMuted && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-0.5 h-5 bg-maycast-rec rotate-45" />
                  </div>
                )}
              </div>
            </div>
          )}
          {(guest.syncState === 'recording' || guest.syncState === 'uploading') && (guest.uploadedChunks !== undefined && guest.totalChunks !== undefined) && guest.totalChunks > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-maycast-text-secondary font-mono">
                {guest.uploadedChunks}/{guest.totalChunks} chunks
              </span>
            </div>
          )}
          {/* 波形表示（横並び） */}
          {waveformData && (
            <WaveformDisplay
              waveformData={waveformData}
              width={120}
              height={24}
              color={mediaStatus?.isMicMuted ? '#ef4444' : '#22c55e'}
              backgroundColor="rgba(0,0,0,0.3)"
              isSilent={isSilent}
            />
          )}
          <GuestSyncBadge syncState={guest.syncState} />
        </div>
      </div>
    </div>
  );
};
