/**
 * RoomStateBadge - Room状態に応じたバッジを表示
 */

import { CheckIcon } from '@heroicons/react/24/solid';
import type { RoomState } from '@maycast/common-types';

interface RoomStateBadgeProps {
  state: RoomState;
}

export const RoomStateBadge: React.FC<RoomStateBadgeProps> = ({ state }) => {
  if (state === 'idle') {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1 bg-maycast-primary/20 rounded-full border border-maycast-primary/30">
        <div className="w-1.5 h-1.5 bg-maycast-primary rounded-full" />
        <span className="text-maycast-primary/80 font-semibold text-xs">Standby</span>
      </div>
    );
  }

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1 bg-maycast-rec/20 rounded-full border border-maycast-rec/30">
        <div className="relative">
          <div className="w-1.5 h-1.5 bg-maycast-rec rounded-full animate-pulse" />
          <div className="absolute inset-0 w-1.5 h-1.5 bg-maycast-rec rounded-full animate-ping opacity-75" />
        </div>
        <span className="text-maycast-rec/80 font-semibold text-xs">録画中</span>
      </div>
    );
  }

  if (state === 'finalizing') {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1 bg-yellow-500/20 rounded-full border border-yellow-500/30">
        <div className="relative">
          <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
          <div className="absolute inset-0 w-1.5 h-1.5 bg-yellow-400 rounded-full animate-ping opacity-75" />
        </div>
        <span className="text-yellow-400/80 font-semibold text-xs">Syncing</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-2.5 py-1 bg-maycast-safe/20 rounded-full border border-maycast-safe/30">
      <CheckIcon className="w-4 h-4 text-maycast-safe" />
      <span className="text-maycast-safe/80 font-semibold text-xs">Complete</span>
    </div>
  );
};
