/**
 * RecordingDownloadItem - 録画ダウンロードアイテム
 */

import { ArrowDownTrayIcon, DocumentArrowDownIcon } from '@heroicons/react/24/solid';
import { RecordingAPIClient, type RecordingInfo } from '../../../infrastructure/api/recording-api';
import type { DownloadProgress } from '../../../infrastructure/api/streaming-download';
import { Button } from '../atoms/Button';

interface RecordingDownloadItemProps {
  recordingId: string;
  recording: RecordingInfo | null;
  isLoading: boolean;
  onDownload: (recordingId: string) => void;
  isDownloading: boolean;
  guestName?: string;
  progress?: DownloadProgress;
}

export const RecordingDownloadItem: React.FC<RecordingDownloadItemProps> = ({
  recordingId,
  recording,
  isLoading,
  onDownload,
  isDownloading,
  guestName,
  progress,
}) => {
  const duration = recording ? RecordingAPIClient.calculateDuration(recording) : null;
  const progressPercent = progress ? Math.round(progress.progress * 100) : 0;

  return (
    <div className="bg-maycast-bg/50 backdrop-blur-sm px-4 py-3 rounded-xl border border-maycast-border/30">
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
          onClick={() => onDownload(recordingId)}
          disabled={isLoading || isDownloading}
          variant="success"
          size="sm"
          className="!py-2 !px-4 !text-sm"
        >
          {isDownloading ? (
            progress && progress.totalChunks > 0 ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{progressPercent}%</span>
              </>
            ) : (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Processing...</span>
              </>
            )
          ) : (
            <>
              <ArrowDownTrayIcon className="w-4 h-4" />
              <span>Download</span>
            </>
          )}
        </Button>
      </div>
      {/* ダウンロード進捗バー */}
      {isDownloading && progress && progress.totalChunks > 0 && (
        <div className="mt-2">
          <div className="w-full bg-maycast-bg/80 rounded-full h-1.5">
            <div
              className="bg-maycast-safe h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1 text-xs text-maycast-text-secondary">
            <span>
              {progress.completedChunks} / {progress.totalChunks} chunks
            </span>
            <span>{RecordingAPIClient.formatFileSize(progress.downloadedBytes)}</span>
          </div>
        </div>
      )}
    </div>
  );
};
