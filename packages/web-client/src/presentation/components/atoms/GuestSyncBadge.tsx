/**
 * GuestSyncBadge - Guest同期状態バッジ
 */

import { CheckIcon } from '@heroicons/react/24/solid';
import type { GuestSyncState } from '@maycast/common-types';

interface GuestSyncBadgeProps {
  syncState: GuestSyncState;
}

export const GuestSyncBadge: React.FC<GuestSyncBadgeProps> = ({ syncState }) => {
  const stateConfig: Record<GuestSyncState, { label: string; bgColor: string; textColor: string; borderColor: string }> = {
    idle: { label: 'Idle', bgColor: 'bg-gray-500/20', textColor: 'text-gray-400', borderColor: 'border-gray-500/30' },
    recording: { label: '録画中', bgColor: 'bg-maycast-rec/20', textColor: 'text-maycast-rec', borderColor: 'border-maycast-rec/30' },
    uploading: { label: 'Syncing', bgColor: 'bg-yellow-500/20', textColor: 'text-yellow-400', borderColor: 'border-yellow-500/30' },
    synced: { label: 'Synced', bgColor: 'bg-maycast-safe/20', textColor: 'text-maycast-safe', borderColor: 'border-maycast-safe/30' },
    error: { label: 'Error', bgColor: 'bg-red-500/20', textColor: 'text-red-400', borderColor: 'border-red-500/30' },
  };
  const config = stateConfig[syncState];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.bgColor} ${config.textColor} ${config.borderColor}`}>
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
