/**
 * DirectorPage - Director Mode用メインページ
 *
 * ルーム作成のエントリーポイント
 * ルーム作成後はルーム詳細ページ（/director/rooms/:accessToken）に遷移する
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, UsersIcon } from '@heroicons/react/24/solid';
import { RoomAPIClient } from '../../../infrastructure/api/room-api';
import { getServerUrl } from '../../../infrastructure/config/serverConfig';
import { Button } from '../atoms/Button';

export const DirectorPage: React.FC = () => {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      const result = await apiClient.createRoom();

      // ルーム詳細ページに遷移（アクセストークンをURLに含む）
      navigate(`/director/rooms/${result.access_token}`);
    } catch (err) {
      console.error('Failed to create room:', err);
      setError(err instanceof Error ? err.message : 'Failed to create room');
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-maycast-bg text-maycast-text">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-maycast-border">
        <div className="flex items-center gap-4">
          <div className="text-2xl font-bold text-maycast-primary">
            Maycast Recorder
          </div>
          <div className="w-px h-6 bg-maycast-border/50" />
          <div className="flex items-center gap-2 px-4 py-2 bg-maycast-primary/20 backdrop-blur-sm rounded-full border border-maycast-primary/30">
            <UsersIcon className="w-5 h-5 text-maycast-primary" />
            <span className="text-maycast-primary/80 font-semibold">Director</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-8 mt-4 p-4 bg-maycast-rec/20 border border-maycast-rec/50 rounded-xl text-maycast-rec">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-8 py-6">
        <div className="bg-maycast-panel/30 backdrop-blur-md p-12 rounded-2xl border border-maycast-border/40 shadow-xl">
          <div className="flex flex-col items-center text-maycast-text-secondary">
            <div className="p-6 bg-maycast-primary/10 rounded-full mb-6">
              <UsersIcon className="w-16 h-16 text-maycast-primary/60" />
            </div>
            <p className="text-xl font-bold text-maycast-text mb-2">
              Create a Recording Room
            </p>
            <p className="text-sm mb-6 text-center max-w-sm">
              Create a new room and invite guests. You will be redirected to the room management page.
            </p>
            <Button onClick={handleCreateRoom} disabled={isCreating} variant="primary" size="md">
              {isCreating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <PlusIcon className="w-5 h-5" />
                  Create Room
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-maycast-border/50 text-center">
        <p className="text-maycast-text-secondary text-sm">
          A unique room management URL will be generated. Bookmark it to access the room later.
        </p>
      </footer>
    </div>
  );
};
