/**
 * RecordingDownloadItem - 録画ダウンロードアイテム
 */

import { DocumentArrowDownIcon, MusicalNoteIcon } from '@heroicons/react/24/solid';
import { RecordingAPIClient, type RecordingInfo } from '../../../infrastructure/api/recording-api';
import { Button } from '../atoms/Button';
import type { M4aDownloadProgress } from '../organisms/RecordingsDownloadSection';

interface RecordingDownloadItemProps {
  recordingId: string;
  recording: RecordingInfo | null;
  isLoading: boolean;
  onDownloadM4a: (recordingId: string) => void;
  isDownloadingM4a?: boolean;
  m4aDownloadProgress?: M4aDownloadProgress;
  guestName?: string;
}

export const RecordingDownloadItem: React.FC<RecordingDownloadItemProps> = ({
  recordingId,
  recording,
  isLoading,
  onDownloadM4a,
  isDownloadingM4a = false,
  m4aDownloadProgress,
  guestName,
}) => {
  const duration = recording ? RecordingAPIClient.calculateDuration(recording) : null;

  const progressPercent = m4aDownloadProgress?.chunkProgress
    ? Math.round((m4aDownloadProgress.chunkProgress.current / m4aDownloadProgress.chunkProgress.total) * 100)
    : 0;

  const progressLabel = (() => {
    if (!m4aDownloadProgress) return null;
    if (m4aDownloadProgress.phase === 'extracting') return 'Converting...';
    if (m4aDownloadProgress.chunkProgress) {
      return `${m4aDownloadProgress.chunkProgress.current}/${m4aDownloadProgress.chunkProgress.total}`;
    }
    return 'Downloading...';
  })();

  return (
    <div className="bg-maycast-panel/40 rounded-xl border border-maycast-border/30 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-maycast-safe/20 rounded-lg">
            <DocumentArrowDownIcon className="w-4 h-4 text-maycast-safe" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              {guestName && (
                <span className="text-sm font-semibold text-maycast-text">
                  {guestName}
                </span>
              )}
              <span className="text-sm font-mono text-maycast-text-secondary">
                {recordingId.substring(0, 8)}...
              </span>
            </div>
            {recording && (
              <div className="flex items-center gap-2 text-xs text-maycast-text-secondary mt-0.5">
                {duration !== null && (
                  <span>{RecordingAPIClient.formatDuration(duration)}</span>
                )}
                {recording.chunk_count > 0 && (
                  <span>• {recording.chunk_count} chunks</span>
                )}
              </div>
            )}
          </div>
        </div>
        <Button
          onClick={() => onDownloadM4a(recordingId)}
          disabled={isLoading || isDownloadingM4a}
          variant="success"
          size="sm"
          className="!py-2 !px-4 !text-sm"
        >
          {isDownloadingM4a ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {progressLabel && <span>{progressLabel}</span>}
            </>
          ) : (
            <>
              <MusicalNoteIcon className="w-4 h-4" />
              <span>M4A</span>
            </>
          )}
        </Button>
      </div>
      {isDownloadingM4a && m4aDownloadProgress?.phase === 'downloading' && m4aDownloadProgress.chunkProgress && (
        <div className="mt-2">
          <div className="w-full h-1.5 bg-maycast-border/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-maycast-safe rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
