/**
 * DirectorPage - Director Mode用メインページ
 *
 * Room一覧表示、作成、状態制御を行う
 */

import { useState } from 'react';
import { useRoomManagerWebSocket } from '../../hooks/useRoomManagerWebSocket';
import type { GuestInfo } from '@maycast/common-types';
import { DirectorHeader } from '../organisms/DirectorHeader';
import { RoomCard } from '../organisms/RoomCard';
import { EmptyRoomState } from '../organisms/EmptyRoomState';

export const DirectorPage: React.FC = () => {
  const {
    rooms,
    isLoading,
    error,
    isWebSocketConnected,
    guestsByRoom,
    createRoom,
    deleteRoom,
    updateRoomState,
    refreshRooms,
  } = useRoomManagerWebSocket(5000);

  const [isUpdating, setIsUpdating] = useState(false);

  const handleCreateRoom = async () => {
    setIsUpdating(true);
    await createRoom();
    setIsUpdating(false);
  };

  const handleStartRecording = async (roomId: string) => {
    setIsUpdating(true);
    await updateRoomState(roomId, 'recording');
    setIsUpdating(false);
  };

  const handleStopRecording = async (roomId: string) => {
    setIsUpdating(true);
    await updateRoomState(roomId, 'finalizing');
    setIsUpdating(false);
  };

  const handleFinalize = async (roomId: string) => {
    setIsUpdating(true);
    await updateRoomState(roomId, 'finished');
    setIsUpdating(false);
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm('Are you sure you want to delete this room?')) {
      return;
    }
    setIsUpdating(true);
    await deleteRoom(roomId);
    setIsUpdating(false);
  };

  const getGuestsForRoom = (roomId: string): GuestInfo[] => {
    const roomGuests = guestsByRoom.get(roomId);
    if (!roomGuests) return [];
    return Array.from(roomGuests.values());
  };

  // Loading
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-maycast-bg text-maycast-text">
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-maycast-primary border-t-transparent" />
          <div className="absolute inset-0 animate-ping rounded-full h-12 w-12 border-4 border-maycast-primary/30" />
        </div>
        <p className="text-maycast-text-secondary mt-4 font-medium">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-maycast-bg text-maycast-text">
      <DirectorHeader
        roomCount={rooms.length}
        isWebSocketConnected={isWebSocketConnected}
        isUpdating={isUpdating}
        onRefresh={refreshRooms}
        onCreateRoom={handleCreateRoom}
      />

      {/* Error */}
      {error && (
        <div className="mx-8 mt-4 p-4 bg-maycast-rec/20 border border-maycast-rec/50 rounded-xl text-maycast-rec">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {rooms.length === 0 ? (
          <EmptyRoomState isUpdating={isUpdating} onCreateRoom={handleCreateRoom} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                guests={getGuestsForRoom(room.id)}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
                onFinalize={handleFinalize}
                onDelete={handleDeleteRoom}
                isUpdating={isUpdating}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-maycast-border/50 text-center">
        <p className="text-maycast-text-secondary text-sm">
          ゲスト招待URLを参加者に共有してください。「録画を開始」を押すと、全員の録画が同時に開始されます。
        </p>
      </footer>
    </div>
  );
};
