/**
 * GuestCompletePage - Guest専用録画完了ページ
 *
 * 録画セッション完了後に表示される。
 * 次回のDirector URL案内と直近の録画リストを表示する。
 */

import { CheckCircleIcon, ArrowDownTrayIcon, VideoCameraIcon } from '@heroicons/react/24/solid';
import type { Recording, RecordingId } from '@maycast/common-types';

interface GuestCompletePageProps {
  recordings: Recording[];
  onDownload: (id: RecordingId) => Promise<void>;
  isDownloading: boolean;
}

const formatDuration = (startTime: number, endTime: number | undefined): string => {
  if (!endTime) return '--:--';
  const durationSec = Math.floor((endTime - startTime) / 1000);
  const hours = Math.floor(durationSec / 3600);
  const minutes = Math.floor((durationSec % 3600) / 60);
  const secs = durationSec % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const GuestCompletePage: React.FC<GuestCompletePageProps> = ({
  recordings,
  onDownload,
  isDownloading,
}) => {
  const recentRecordings = recordings.slice(0, 3);

  return (
    <div className="flex flex-col items-center justify-center h-full bg-maycast-bg text-maycast-text">
      <div className="w-full max-w-md px-4">
        {/* Maycast Branding */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="text-3xl font-bold text-maycast-primary">
            MAYCAST
          </div>
          <span className="px-2 py-0.5 text-xs font-semibold text-maycast-primary bg-maycast-primary/10 border border-maycast-primary/30 rounded">
            BETA
          </span>
        </div>

        <div className="bg-maycast-panel/30 backdrop-blur-md p-8 rounded-2xl border border-maycast-border/40 shadow-xl">
          {/* Completion message */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-maycast-safe/20 rounded-full mb-4">
              <CheckCircleIcon className="w-8 h-8 text-maycast-safe" />
            </div>
            <h1 className="text-2xl font-bold text-maycast-text mb-3">
              録画セッションが完了しました
            </h1>
            <p className="text-sm text-maycast-subtext leading-relaxed">
              次回の録画は、Directorから共有されたURLにアクセスしてください。
            </p>
          </div>

          {/* Recent recordings list */}
          {recentRecordings.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-px bg-maycast-border/40" />
                <span className="text-xs font-semibold text-maycast-subtext px-2">録画履歴</span>
                <div className="flex-1 h-px bg-maycast-border/40" />
              </div>

              <div className="space-y-3">
                {recentRecordings.map((recording) => {
                  const startDate = recording.startTime ? new Date(recording.startTime) : null;
                  const isValidStart = startDate && !isNaN(startDate.getTime());

                  return (
                    <div
                      key={recording.id}
                      className="flex items-center gap-3 p-3 bg-maycast-bg/50 rounded-xl border border-maycast-border/30"
                    >
                      <div className="shrink-0">
                        <VideoCameraIcon className="w-5 h-5 text-maycast-primary/60" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-maycast-text truncate">
                          {isValidStart ? startDate.toLocaleString('ja-JP') : 'Unknown'}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-maycast-subtext mt-0.5">
                          <span>{formatDuration(recording.startTime, recording.endTime)}</span>
                          <span>{formatSize(recording.totalSize || 0)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => onDownload(recording.id)}
                        disabled={isDownloading}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                          isDownloading
                            ? 'bg-gray-600 cursor-not-allowed opacity-50'
                            : 'bg-maycast-safe/20 hover:bg-maycast-safe/30 text-maycast-safe border border-maycast-safe/30 cursor-pointer'
                        }`}
                      >
                        <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                        DL
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
