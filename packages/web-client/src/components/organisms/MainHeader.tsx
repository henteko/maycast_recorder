import React from 'react';
import { PlayIcon, StopIcon } from '@heroicons/react/24/solid';
import { StatusBadge } from '../atoms/StatusBadge';
import type { ScreenState } from '../../types/recorder';

interface MainHeaderProps {
  screenState: ScreenState;
  isRecording: boolean;
  wasmInitialized: boolean;
  onStartStop: () => void;
}

export const MainHeader: React.FC<MainHeaderProps> = ({
  screenState,
  isRecording,
  wasmInitialized,
  onStartStop,
}) => {
  return (
    <div className="flex items-center justify-between px-8 py-6 border-b border-maycast-border">
      <StatusBadge state={screenState} />

      {screenState !== 'completed' && (
        <button
          onClick={onStartStop}
          disabled={!wasmInitialized}
          className={`py-3 px-6 rounded-xl font-bold text-base transition-all shadow-lg transform hover:scale-[1.02] flex items-center gap-2 ${
            isRecording
              ? 'bg-maycast-rec hover:bg-maycast-rec/80 cursor-pointer text-white'
              : wasmInitialized
              ? 'bg-maycast-primary hover:bg-maycast-primary/80 cursor-pointer text-white'
              : 'bg-gray-600 cursor-not-allowed opacity-50 text-white'
          }`}
        >
          {isRecording ? (
            <>
              <StopIcon className="w-5 h-5" />
              録画を停止
            </>
          ) : (
            <>
              <PlayIcon className="w-5 h-5" />
              録画を開始
            </>
          )}
        </button>
      )}
    </div>
  );
};
