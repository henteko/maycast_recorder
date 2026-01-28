/**
 * RoomClosedScreen - Room終了画面
 */

import type { RoomState } from '@maycast/common-types';

interface RoomClosedScreenProps {
  roomId: string;
  roomState: RoomState;
}

export const RoomClosedScreen: React.FC<RoomClosedScreenProps> = ({ roomId, roomState }) => {
  const getMessage = () => {
    switch (roomState) {
      case 'finalizing':
        return '録画が終了し、データの同期中です。';
      case 'finished':
        return 'このRoomの録画は既に終了しています。';
      default:
        return 'このRoomには参加できません。';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-maycast-bg text-maycast-text">
      <div className="bg-maycast-panel/30 backdrop-blur-md p-12 rounded-2xl border border-maycast-border/40 shadow-xl max-w-md text-center">
        <div className="text-6xl mb-4">🚫</div>
        <h1 className="text-2xl font-bold mb-4 text-maycast-text">
          Roomに参加できません
        </h1>
        <p className="text-maycast-text-secondary mb-6">
          {getMessage()}
        </p>
        <div className="text-sm text-maycast-text-secondary/70 font-mono">
          Room ID: {roomId.substring(0, 8)}...
        </div>
      </div>
    </div>
  );
};
