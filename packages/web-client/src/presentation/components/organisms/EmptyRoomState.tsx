/**
 * EmptyRoomState - Roomがない時の空状態表示
 */

import { PlusIcon, UsersIcon } from '@heroicons/react/24/solid';
import { Button } from '../atoms/Button';

interface EmptyRoomStateProps {
  isUpdating: boolean;
  onCreateRoom: () => void;
}

export const EmptyRoomState: React.FC<EmptyRoomStateProps> = ({
  isUpdating,
  onCreateRoom,
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="bg-maycast-panel/30 backdrop-blur-md p-12 rounded-2xl border border-maycast-border/40 shadow-xl">
        <div className="flex flex-col items-center text-maycast-text-secondary">
          <div className="p-6 bg-maycast-primary/10 rounded-full mb-6">
            <UsersIcon className="w-16 h-16 text-maycast-primary/60" />
          </div>
          <p className="text-xl font-bold text-maycast-text mb-2">
            Roomがありません
          </p>
          <p className="text-sm mb-6 text-center">
            Roomを作成して、ゲストを招待しましょう
          </p>
          <Button onClick={onCreateRoom} disabled={isUpdating} variant="primary" size="sm">
            <PlusIcon className="w-5 h-5" />
            最初のRoomを作成
          </Button>
        </div>
      </div>
    </div>
  );
};
