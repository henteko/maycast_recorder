/**
 * GuestNameInput - ゲスト名入力コンポーネント
 *
 * Roomに参加する前にゲスト名を入力させる
 */

import { useState } from 'react';
import { UserIcon } from '@heroicons/react/24/solid';
import { Button } from '../atoms/Button';

interface GuestNameInputProps {
  roomId: string;
  onJoin: (name: string) => void;
}

export const GuestNameInput: React.FC<GuestNameInputProps> = ({ roomId, onJoin }) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName) {
      onJoin(trimmedName);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-maycast-bg text-maycast-text">
      <div className="w-full max-w-md px-4">
        {/* Maycast Branding */}
        <div className="text-3xl font-bold text-maycast-primary text-center mb-8">
          Maycast Recorder
        </div>

        <div className="bg-maycast-panel/30 backdrop-blur-md p-8 rounded-2xl border border-maycast-border/40 shadow-xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-maycast-primary/20 rounded-full mb-4">
              <UserIcon className="w-8 h-8 text-maycast-primary" />
            </div>
            <h1 className="text-2xl font-bold text-maycast-text mb-2">
              Join Room
            </h1>
            <p className="text-sm text-maycast-text-secondary">
              Room ID: <span className="font-mono text-maycast-primary">{roomId}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="guestName"
                className="block text-sm font-semibold text-maycast-text mb-2"
              >
                Display Name
              </label>
              <input
                type="text"
                id="guestName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-3 bg-maycast-bg/50 border border-maycast-border/40 rounded-xl text-maycast-text placeholder-maycast-text/40 focus:outline-none focus:border-maycast-primary transition-colors"
                autoFocus
                maxLength={50}
              />
              <p className="mt-2 text-xs text-maycast-text/50">
                This name will be shown to the Director
              </p>
            </div>

            <Button
              onClick={() => {
                const trimmedName = name.trim();
                if (trimmedName) {
                  onJoin(trimmedName);
                }
              }}
              disabled={!name.trim()}
              variant="primary"
              size="md"
              className="w-full"
            >
              Join
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
