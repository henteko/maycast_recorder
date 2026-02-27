/**
 * RecordingDownloadItem - 録画ダウンロードアイテム
 */

import { ArrowDownTrayIcon, DocumentArrowDownIcon, MusicalNoteIcon } from '@heroicons/react/24/solid';
import { RecordingAPIClient, type RecordingInfo, type ProcessingState } from '../../../infrastructure/api/recording-api';
import { Button } from '../atoms/Button';

interface RecordingDownloadItemProps {
  recordingId: string;
  recording: RecordingInfo | null;
  isLoading: boolean;
  onDownload: (recordingId: string) => void;
  onDownloadM4a?: (recordingId: string) => void;
  isDownloading: boolean;
  isDownloadingM4a?: boolean;
  chunkProgress?: { current: number; total: number };
  guestName?: string;
  hasM4a?: boolean;
}

function ProcessingBadge({ state }: { state: ProcessingState }) {
  switch (state) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
          <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full" />
          Queued
        </span>
      );
    case 'processing':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
          Processing
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/20 text-green-400 border border-green-500/30">
          <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
          Ready
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/20 text-red-400 border border-red-500/30">
          <div className="w-1.5 h-1.5 bg-red-400 rounded-full" />
          Failed
        </span>
      );
  }
}

export const RecordingDownloadItem: React.FC<RecordingDownloadItemProps> = ({
  recordingId,
  recording,
  isLoading,
  onDownload,
  onDownloadM4a,
  isDownloading,
  isDownloadingM4a = false,
  chunkProgress,
  guestName,
  hasM4a = false,
}) => {
  const duration = recording ? RecordingAPIClient.calculateDuration(recording) : null;
  const processingState = recording?.processing_state;

  return (
    <div className="flex items-center justify-between bg-maycast-panel/40 rounded-xl border border-maycast-border/30 px-4 py-3">
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
            {processingState && (
              <ProcessingBadge state={processingState} />
            )}
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
      <div className="flex items-center gap-2">
        {hasM4a && onDownloadM4a && (
          <Button
            onClick={() => onDownloadM4a(recordingId)}
            disabled={isLoading || isDownloadingM4a}
            variant="ghost"
            size="sm"
            className="!py-2 !px-3 !text-sm !border-maycast-primary/30"
          >
            {isDownloadingM4a ? (
              <div className="w-4 h-4 border-2 border-maycast-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <MusicalNoteIcon className="w-4 h-4 text-maycast-primary" />
                <span>M4A</span>
              </>
            )}
          </Button>
        )}
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
              <span>MP4</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
