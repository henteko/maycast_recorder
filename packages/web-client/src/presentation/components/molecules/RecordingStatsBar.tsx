interface RecordingStatsBarProps {
  isRecording: boolean;
  elapsedTime: number;
  savedChunks: number;
  totalSize: number;
  screenState: 'standby' | 'recording' | 'completed';
  waitingMessage?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatElapsedTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const RecordingStatsBar: React.FC<RecordingStatsBarProps> = ({
  isRecording,
  elapsedTime,
  savedChunks,
  totalSize,
  screenState,
  waitingMessage,
}) => {
  if (screenState === 'recording' && isRecording) {
    return (
      <div className="flex items-center justify-between bg-black/20 rounded-xl px-4 py-3 text-sm text-maycast-text">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-maycast-rec opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-maycast-rec" />
          </span>
          <span className="font-semibold text-maycast-rec">REC</span>
          <span className="border-r border-maycast-border h-4 mx-1" />
          <span className="font-mono">{formatElapsedTime(elapsedTime)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Chunks: {savedChunks}</span>
          <span className="border-r border-maycast-border h-4" />
          <span>{formatFileSize(totalSize)}</span>
        </div>
      </div>
    );
  }

  if (screenState === 'standby') {
    return (
      <div className="flex items-center justify-center bg-black/20 rounded-xl px-4 py-3 text-sm text-maycast-subtext">
        <span className="animate-pulse">
          {waitingMessage || 'Waiting for Director...'}
        </span>
      </div>
    );
  }

  if (screenState === 'completed') {
    return (
      <div className="flex items-center justify-center bg-black/20 rounded-xl px-4 py-3 text-sm text-maycast-safe">
        Recording complete
      </div>
    );
  }

  return null;
};
