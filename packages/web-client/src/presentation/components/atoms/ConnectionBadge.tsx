/**
 * ConnectionBadge - WebSocket接続状態バッジ
 */

import { SignalSlashIcon } from '@heroicons/react/24/solid';

interface ConnectionBadgeProps {
  isConnected: boolean;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({ isConnected }) => {
  if (isConnected) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-maycast-safe/20 rounded-full border border-maycast-safe/30">
        <div className="relative">
          <div className="w-2 h-2 bg-maycast-safe rounded-full" />
          <div className="absolute inset-0 w-2 h-2 bg-maycast-safe rounded-full animate-ping opacity-75" />
        </div>
        <span className="text-maycast-safe/80 font-medium text-xs">Live</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/20 rounded-full border border-yellow-500/30">
      <SignalSlashIcon className="w-3.5 h-3.5 text-yellow-400" />
      <span className="text-yellow-400/80 font-medium text-xs">Polling</span>
    </div>
  );
};
