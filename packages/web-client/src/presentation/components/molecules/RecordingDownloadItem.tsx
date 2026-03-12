/**
 * RecordingDownloadItem - 録画ダウンロードアイテム
 */

import { DocumentArrowDownIcon, MusicalNoteIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/solid';
import { RecordingAPIClient, type RecordingInfo } from '../../../infrastructure/api/recording-api';
import { Button } from '../atoms/Button';
import type { RecordingDownloadStatus } from '../organisms/RecordingsDownloadSection';

interface RecordingDownloadItemProps {
  recordingId: string;
  recording: RecordingInfo | null;
  isLoading: boolean;
  onDownloadM4a: (recordingId: string) => void;
  guestName?: string;
  /** ダウンロード時のステータス（個別・バッチ共通） */
  downloadStatus?: RecordingDownloadStatus;
  /** ダウンロード時のチャンクプログレス（個別・バッチ共通） */
  downloadChunkProgress?: { current: number; total: number };
}

export const RecordingDownloadItem: React.FC<RecordingDownloadItemProps> = ({
  recordingId,
  recording,
  isLoading,
  onDownloadM4a,
  guestName,
  downloadStatus,
  downloadChunkProgress,
}) => {
  const duration = recording ? RecordingAPIClient.calculateDuration(recording) : null;

  const progressPercent = downloadChunkProgress && downloadChunkProgress.total > 0
    ? Math.round((downloadChunkProgress.current / downloadChunkProgress.total) * 100)
    : 0;

  const isDownloading = !!downloadStatus && downloadStatus !== 'done' && downloadStatus !== 'error';

  return (
    <div className="relative overflow-hidden bg-maycast-panel/40 rounded-xl border border-maycast-border/30 px-4 py-3">
      {/* ダウンロード時のプログレスバー背景 */}
      {downloadStatus === 'downloading' && downloadChunkProgress && (
        <div
          className="absolute inset-y-0 left-0 bg-maycast-primary/10 transition-[width] duration-200"
          style={{ width: `${progressPercent}%` }}
        />
      )}
      {downloadStatus === 'extracting' && (
        <div className="absolute inset-y-0 left-0 right-0 bg-amber-500/10 animate-pulse" />
      )}

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${
            downloadStatus === 'done' ? 'bg-maycast-safe/20' :
            downloadStatus === 'error' ? 'bg-red-500/20' :
            'bg-maycast-safe/20'
          }`}>
            {downloadStatus === 'done' ? (
              <CheckCircleIcon className="w-4 h-4 text-maycast-safe" />
            ) : downloadStatus === 'error' ? (
              <ExclamationCircleIcon className="w-4 h-4 text-red-400" />
            ) : (
              <DocumentArrowDownIcon className="w-4 h-4 text-maycast-safe" />
            )}
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
            <div className="flex items-center gap-2 text-xs text-maycast-text-secondary mt-0.5">
              {recording && (
                <>
                  {duration !== null && (
                    <span>{RecordingAPIClient.formatDuration(duration)}</span>
                  )}
                  {recording.chunk_count > 0 && (
                    <span>• {recording.chunk_count} chunks</span>
                  )}
                </>
              )}
              {/* ダウンロード進捗テキスト */}
              {downloadStatus === 'downloading' && downloadChunkProgress && (
                <span className="text-maycast-primary font-medium">
                  • Downloading {downloadChunkProgress.current}/{downloadChunkProgress.total} chunks
                </span>
              )}
              {downloadStatus === 'extracting' && (
                <span className="text-amber-400 font-medium">
                  • Extracting audio...
                </span>
              )}
              {downloadStatus === 'done' && (
                <span className="text-maycast-safe font-medium">
                  • Done
                </span>
              )}
              {downloadStatus === 'error' && (
                <span className="text-red-400 font-medium">
                  • Failed
                </span>
              )}
            </div>
          </div>
        </div>
        <Button
          onClick={() => onDownloadM4a(recordingId)}
          disabled={isLoading || isDownloading || !!downloadStatus}
          variant="success"
          size="sm"
          className="!py-2 !px-4 !text-sm"
        >
          {isDownloading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <MusicalNoteIcon className="w-4 h-4" />
              <span>M4A</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
