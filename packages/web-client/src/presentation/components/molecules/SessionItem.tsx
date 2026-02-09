import {
  ArrowDownTrayIcon,
  TrashIcon,
  CheckIcon,
  ServerStackIcon,
  VideoCameraIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/solid';
import type { Recording, RecordingId } from '@maycast/common-types';

interface SessionItemProps {
  recording: Recording;
  onDownload: (recordingId: RecordingId) => void;
  onDelete: (recordingId: RecordingId) => void;
  isDownloading: boolean;
}

export const SessionItem = ({ recording, onDownload, onDelete, isDownloading }: SessionItemProps) => {
  const startDate = recording.startTime ? new Date(recording.startTime) : null;
  const isValidStart = startDate && !isNaN(startDate.getTime());

  return (
    <div className="bg-maycast-panel/30 backdrop-blur-sm p-4 rounded-xl flex items-center justify-between border border-maycast-border/40 hover:border-maycast-border/60 transition-all">
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <p className="text-sm text-maycast-text font-medium">
            {isValidStart ? startDate.toLocaleString('en-US') : 'Invalid Date'}
          </p>
          {recording.state === 'synced' && (
            <span className="flex items-center gap-1 px-2 py-1 bg-maycast-safe/20 text-maycast-safe text-xs font-semibold rounded-lg border border-maycast-safe/30">
              <CheckIcon className="w-3 h-3" />
              Completed
            </span>
          )}
          {recording.state === 'interrupted' && (
            <span className="flex items-center gap-1 px-2 py-1 bg-orange-500/20 text-orange-300 text-xs font-semibold rounded-lg border border-orange-500/30">
              <ExclamationTriangleIcon className="w-3 h-3" />
              Interrupted
            </span>
          )}
          {recording.state !== 'synced' && recording.state !== 'interrupted' && (
            <span className="flex items-center gap-1 px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs font-semibold rounded-lg border border-yellow-500/30">
              <VideoCameraIcon className="w-3 h-3" />
              録画中
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-maycast-subtext">
          <span className="flex items-center gap-1">
            <ServerStackIcon className="w-3 h-3" />
            {recording.chunkCount || 0} chunks
          </span>
          <span>{((recording.totalSize || 0) / 1024 / 1024).toFixed(2)} MB</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onDownload(recording.id)}
          disabled={isDownloading}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            isDownloading
              ? 'bg-gray-600 cursor-not-allowed opacity-50'
              : 'bg-maycast-safe hover:bg-maycast-safe/80 shadow-lg cursor-pointer'
          }`}
          title="Download"
        >
          <ArrowDownTrayIcon className="w-5 h-5" />
        </button>
        <button
          onClick={() => onDelete(recording.id)}
          disabled={isDownloading}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            isDownloading
              ? 'bg-gray-600 cursor-not-allowed opacity-50'
              : 'bg-maycast-rec/20 hover:bg-maycast-rec/30 border border-maycast-rec/50 cursor-pointer'
          }`}
          title="Delete"
        >
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
