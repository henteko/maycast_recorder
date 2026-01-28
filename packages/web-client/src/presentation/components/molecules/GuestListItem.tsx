/**
 * GuestListItem - ゲスト一覧の1行表示
 */

import type { GuestInfo } from '@maycast/common-types';
import { GuestSyncBadge } from '../atoms/GuestSyncBadge';

interface GuestListItemProps {
  guest: GuestInfo;
}

export const GuestListItem: React.FC<GuestListItemProps> = ({ guest }) => {
  const guestIdentifier = guest.guestId || guest.recordingId || 'unknown';
  const displayName = guest.name || `Guest ${guestIdentifier.substring(0, 6)}`;

  return (
    <div className="flex items-center justify-between bg-maycast-bg/50 backdrop-blur-sm px-4 py-3 rounded-xl border border-maycast-border/30">
      <div className="flex items-center gap-3">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            guest.isConnected ? 'bg-maycast-safe' : 'bg-gray-400'
          }`}
        />
        <span className="text-sm text-maycast-text">
          {displayName}
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
  );
};
