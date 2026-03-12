/**
 * RecordingDownloadItem - 録画ダウンロードアイテム
 */

import { DocumentArrowDownIcon, MusicalNoteIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/solid';
import { RecordingAPIClient, type RecordingInfo } from '../../../infrastructure/api/recording-api';
import { Button } from '../atoms/Button';
<<<<<<< HEAD
import type { M4aDownloadProgress } from '../organisms/RecordingsDownloadSection';
=======
import type { RecordingDownloadStatus } from '../organisms/RecordingsDownloadSection';
>>>>>>> 048479f (複数ダウンロード時にm4aになるようにした)

interface RecordingDownloadItemProps {
  recordingId: string;
  recording: RecordingInfo | null;
  isLoading: boolean;
  onDownloadM4a: (recordingId: string) => void;
  isDownloadingM4a?: boolean;
  m4aDownloadProgress?: M4aDownloadProgress;
  guestName?: string;
  /** バッチダウンロード時のステータス */
  batchStatus?: RecordingDownloadStatus;
  /** バッチダウンロード時のチャンクプログレス */
  batchChunkProgress?: { current: number; total: number };
}

export const RecordingDownloadItem: React.FC<RecordingDownloadItemProps> = ({
  recordingId,
  recording,
  isLoading,
  onDownloadM4a,
  isDownloadingM4a = false,
  m4aDownloadProgress,
  guestName,
  batchStatus,
  batchChunkProgress,
}) => {
  const duration = recording ? RecordingAPIClient.calculateDuration(recording) : null;

<<<<<<< HEAD
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
=======
  const batchProgressPercent = batchChunkProgress && batchChunkProgress.total > 0
    ? Math.round((batchChunkProgress.current / batchChunkProgress.total) * 100)
    : 0;

  return (
    <div className="relative overflow-hidden bg-maycast-panel/40 rounded-xl border border-maycast-border/30 px-4 py-3">
      {/* バッチダウンロード時のプログレスバー背景 */}
      {batchStatus === 'downloading' && batchChunkProgress && (
        <div
          className="absolute inset-y-0 left-0 bg-maycast-primary/10 transition-[width] duration-200"
          style={{ width: `${batchProgressPercent}%` }}
        />
      )}
      {batchStatus === 'extracting' && (
        <div className="absolute inset-y-0 left-0 right-0 bg-amber-500/10 animate-pulse" />
      )}

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${
            batchStatus === 'done' ? 'bg-maycast-safe/20' :
            batchStatus === 'error' ? 'bg-red-500/20' :
            'bg-maycast-safe/20'
          }`}>
            {batchStatus === 'done' ? (
              <CheckCircleIcon className="w-4 h-4 text-maycast-safe" />
            ) : batchStatus === 'error' ? (
              <ExclamationCircleIcon className="w-4 h-4 text-red-400" />
            ) : (
              <DocumentArrowDownIcon className="w-4 h-4 text-maycast-safe" />
            )}
>>>>>>> 048479f (複数ダウンロード時にm4aになるようにした)
          </div>
          <div>
            <div className="flex items-center gap-2">
              {guestName && (
                <span className="text-sm font-semibold text-maycast-text">
                  {guestName}
                </span>
<<<<<<< HEAD
=======
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
              {/* バッチダウンロード進捗テキスト */}
              {batchStatus === 'downloading' && batchChunkProgress && (
                <span className="text-maycast-primary font-medium">
                  • Downloading {batchChunkProgress.current}/{batchChunkProgress.total} chunks
                </span>
              )}
              {batchStatus === 'extracting' && (
                <span className="text-amber-400 font-medium">
                  • Extracting audio...
                </span>
              )}
              {batchStatus === 'done' && (
                <span className="text-maycast-safe font-medium">
                  • Done
                </span>
              )}
              {batchStatus === 'error' && (
                <span className="text-red-400 font-medium">
                  • Failed
                </span>
>>>>>>> 048479f (複数ダウンロード時にm4aになるようにした)
              )}
              <span className="text-sm font-mono text-maycast-text-secondary">
                {recordingId.substring(0, 8)}...
              </span>
            </div>
<<<<<<< HEAD
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
=======
>>>>>>> 048479f (複数ダウンロード時にm4aになるようにした)
          </div>
        </div>
        <Button
          onClick={() => onDownloadM4a(recordingId)}
<<<<<<< HEAD
          disabled={isLoading || isDownloadingM4a}
=======
          disabled={isLoading || isDownloadingM4a || !!batchStatus}
>>>>>>> 048479f (複数ダウンロード時にm4aになるようにした)
          variant="success"
          size="sm"
          className="!py-2 !px-4 !text-sm"
        >
          {isDownloadingM4a ? (
<<<<<<< HEAD
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {progressLabel && <span>{progressLabel}</span>}
            </>
=======
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
>>>>>>> 048479f (複数ダウンロード時にm4aになるようにした)
          ) : (
            <>
              <MusicalNoteIcon className="w-4 h-4" />
              <span>M4A</span>
            </>
          )}
        </Button>
      </div>
<<<<<<< HEAD
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
=======
>>>>>>> 048479f (複数ダウンロード時にm4aになるようにした)
    </div>
  );
};
