/**
 * DirectorHeader - Directorページヘッダー
 */

import { PlusIcon, ArrowPathIcon, UsersIcon } from '@heroicons/react/24/solid';
import { ConnectionBadge } from '../atoms/ConnectionBadge';
import { Button } from '../atoms/Button';

interface DirectorHeaderProps {
  roomCount: number;
  isWebSocketConnected: boolean;
  isUpdating: boolean;
  onRefresh: () => void;
  onCreateRoom: () => void;
}

export const DirectorHeader: React.FC<DirectorHeaderProps> = ({
  roomCount,
  isWebSocketConnected,
  isUpdating,
  onRefresh,
  onCreateRoom,
}) => {
  return (
    <div className="flex items-center justify-between px-8 py-6 border-b border-maycast-border">
      <div className="flex items-center gap-4">
        {/* Maycast Branding */}
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold text-maycast-primary">
            MAYCAST
          </div>
          <span className="px-2 py-0.5 text-xs font-semibold text-maycast-primary bg-maycast-primary/10 border border-maycast-primary/30 rounded">
            BETA
          </span>
        </div>
        <div className="w-px h-6 bg-maycast-border/50" />
        <div className="flex items-center gap-2 px-4 py-2 bg-maycast-primary/20 backdrop-blur-sm rounded-full border border-maycast-primary/30">
          <UsersIcon className="w-5 h-5 text-maycast-primary" />
          <span className="text-maycast-primary/80 font-semibold">Director</span>
        </div>
        <span className="text-maycast-text-secondary font-medium">
          {roomCount} Rooms
        </span>
        <ConnectionBadge isConnected={isWebSocketConnected} />
      </div>
      <div className="flex items-center gap-3">
        <Button
          onClick={onRefresh}
          disabled={isUpdating}
          variant="ghost"
          size="sm"
          className="!p-3 !border-maycast-border/30"
        >
          <ArrowPathIcon
            className={`w-5 h-5 text-maycast-text-secondary ${isUpdating ? 'animate-spin' : ''}`}
          />
        </Button>
        <Button onClick={onCreateRoom} disabled={isUpdating} variant="primary" size="sm">
          <PlusIcon className="w-5 h-5" />
          Roomを作成
        </Button>
      </div>
    </div>
  );
};
