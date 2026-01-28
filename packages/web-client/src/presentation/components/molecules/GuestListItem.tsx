/**
 * GuestListItem - ゲスト一覧の1行表示
 */

import { VideoCameraIcon, VideoCameraSlashIcon, MicrophoneIcon } from '@heroicons/react/24/solid';
import type { GuestInfo } from '@maycast/common-types';
import { GuestSyncBadge } from '../atoms/GuestSyncBadge';

interface GuestListItemProps {
  guest: GuestInfo;
}

export const GuestListItem: React.FC<GuestListItemProps> = ({ guest }) => {
  const guestIdentifier = guest.guestId || guest.recordingId || 'unknown';
  const displayName = guest.name || `Guest ${guestIdentifier.substring(0, 6)}`;
  const mediaStatus = guest.mediaStatus;

  return (
    <div className="bg-maycast-bg/50 backdrop-blur-sm px-4 py-3 rounded-xl border border-maycast-border/30">
      {/* 上段: 名前とステータス */}
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
        </div>
        <div className="flex items-center gap-3">
          {/* メディアステータスアイコン */}
          {mediaStatus && (
            <div className="flex items-center gap-2">
              {/* カメラ状態 */}
              <div
                className={`p-1 rounded ${
                  mediaStatus.isCameraActive
                    ? 'bg-maycast-safe/20 text-maycast-safe'
                    : 'bg-gray-500/20 text-gray-400'
                }`}
                title={mediaStatus.isCameraActive ? 'カメラON' : 'カメラOFF'}
              >
                {mediaStatus.isCameraActive ? (
                  <VideoCameraIcon className="w-4 h-4" />
                ) : (
                  <VideoCameraSlashIcon className="w-4 h-4" />
                )}
              </div>
              {/* マイク状態 */}
              <div
                className={`p-1 rounded relative ${
                  mediaStatus.isMicMuted
                    ? 'bg-maycast-rec/20 text-maycast-rec'
                    : 'bg-maycast-safe/20 text-maycast-safe'
                }`}
                title={mediaStatus.isMicMuted ? 'ミュート' : 'マイクON'}
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
          {guest.syncState === 'uploading' && (
            <span className="text-xs text-maycast-text-secondary font-mono">
              {guest.uploadedChunks}/{guest.totalChunks}
            </span>
          )}
          <GuestSyncBadge syncState={guest.syncState} />
        </div>
      </div>

      {/* 下段: デバイス情報 */}
      {mediaStatus && (mediaStatus.cameraDevice || mediaStatus.micDevice) && (
        <div className="mt-2 pt-2 border-t border-maycast-border/20 space-y-1">
          {/* カメラデバイス */}
          {mediaStatus.cameraDevice && (
            <div className="flex items-center gap-2 text-xs text-maycast-text-secondary">
              <VideoCameraIcon className="w-3 h-3 flex-shrink-0" />
              <span>{mediaStatus.cameraDevice.label}</span>
            </div>
          )}
          {/* マイクデバイス */}
          {mediaStatus.micDevice && (
            <div className="flex items-center gap-2 text-xs text-maycast-text-secondary">
              <MicrophoneIcon className="w-3 h-3 flex-shrink-0" />
              <span>{mediaStatus.micDevice.label}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
