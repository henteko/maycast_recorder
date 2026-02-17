/**
 * RecordingDownloadItem - 録画ダウンロードアイテム
 */

import { ArrowDownTrayIcon, DocumentArrowDownIcon } from '@heroicons/react/24/solid';
import { RecordingAPIClient, type RecordingInfo } from '../../../infrastructure/api/recording-api';
import { Button } from '../atoms/Button';

interface RecordingDownloadItemProps {
  recordingId: string;
  recording: RecordingInfo | null;
  isLoading: boolean;
  onDownload: (recordingId: string) => void;
  isDownloading: boolean;
  chunkProgress?: { current: number; total: number };
  guestName?: string;
}

export const RecordingDownloadItem: React.FC<RecordingDownloadItemProps> = ({
  recordingId,
  recording,
  isLoading,
  onDownload,
  isDownloading,
  chunkProgress,
  guestName,
}) => {
  const duration = recording ? RecordingAPIClient.calculateDuration(recording) : null;

  return (
    <div className="flex items-center justify-between bg-maycast-bg/50 backdrop-blur-sm px-4 py-3 rounded-xl border border-maycast-border/30">
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
        onClick={() => onDownload(recordingId)}
        disabled={isLoading || isDownloading}
        variant="success"
        size="sm"
        className="!py-2 !px-4 !text-sm"
      >
        {isDownloading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>{chunkProgress && chunkProgress.total > 0
              ? `${chunkProgress.current}/${chunkProgress.total}`
              : 'Processing...'}</span>
          </>
        ) : (
          <>
            <ArrowDownTrayIcon className="w-4 h-4" />
            <span>Download</span>
          </>
        )}
      </Button>
    </div>
  );
};
