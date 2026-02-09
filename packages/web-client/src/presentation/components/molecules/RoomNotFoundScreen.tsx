/**
 * RoomNotFoundScreen - Room未発見エラー画面
 */

interface RoomNotFoundScreenProps {
  roomId: string;
  isRoomNotFound: boolean;
  errorMessage?: string | null;
}

export const RoomNotFoundScreen: React.FC<RoomNotFoundScreenProps> = ({
  roomId,
  isRoomNotFound,
  errorMessage,
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-maycast-bg text-maycast-text">
      <div className="bg-maycast-panel/30 backdrop-blur-md p-12 rounded-2xl border border-maycast-border/40 shadow-xl">
        <div className="flex flex-col items-center">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold mb-2">Room Not Found</h1>
          <p className="text-maycast-text-secondary mb-4 text-center">
            {isRoomNotFound
              ? `Room "${roomId}" does not exist.`
              : errorMessage || 'An error occurred.'}
          </p>
          <p className="text-maycast-text-secondary text-sm">
            Please check the URL and try again.
          </p>
        </div>
      </div>
    </div>
  );
};
