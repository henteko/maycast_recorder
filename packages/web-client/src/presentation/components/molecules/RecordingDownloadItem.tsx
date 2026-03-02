/**
 * RecordingDownloadItem - 録画ダウンロードアイテム
 */

import { DocumentArrowDownIcon, MusicalNoteIcon } from '@heroicons/react/24/solid';
import { RecordingAPIClient, type RecordingInfo } from '../../../infrastructure/api/recording-api';
import { Button } from '../atoms/Button';

interface RecordingDownloadItemProps {
  recordingId: string;
  recording: RecordingInfo | null;
  isLoading: boolean;
  onDownloadM4a: (recordingId: string) => void;
  isDownloadingM4a?: boolean;
  guestName?: string;
}

export const RecordingDownloadItem: React.FC<RecordingDownloadItemProps> = ({
  recordingId,
  recording,
  isLoading,
  onDownloadM4a,
  isDownloadingM4a = false,
  guestName,
}) => {
  const duration = recording ? RecordingAPIClient.calculateDuration(recording) : null;

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
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            <MusicalNoteIcon className="w-4 h-4" />
            <span>M4A</span>
          </>
        )}
      </Button>
    </div>
  );
};
