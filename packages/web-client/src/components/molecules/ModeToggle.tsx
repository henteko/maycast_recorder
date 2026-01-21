import React from 'react';

export type RecordingMode = 'standalone' | 'remote';

interface ModeToggleProps {
  mode: RecordingMode;
  onModeChange: (mode: RecordingMode) => void;
}

export const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onModeChange }) => {
  return (
    <div className="inline-flex rounded-lg bg-maycast-panel border border-maycast-border p-1">
      <button
        onClick={() => onModeChange('standalone')}
        className={`
          px-4 py-2 text-sm font-medium rounded-md transition-all
          ${
            mode === 'standalone'
              ? 'bg-maycast-primary text-white'
              : 'text-maycast-subtext hover:text-maycast-text'
          }
        `}
      >
        Standalone
      </button>
      <button
        onClick={() => onModeChange('remote')}
        className={`
          px-4 py-2 text-sm font-medium rounded-md transition-all
          ${
            mode === 'remote'
              ? 'bg-maycast-primary text-white'
              : 'text-maycast-subtext hover:text-maycast-text'
          }
        `}
      >
        Remote
      </button>
    </div>
  );
};
