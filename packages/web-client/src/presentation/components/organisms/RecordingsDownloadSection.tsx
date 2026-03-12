/**
 * RecordingsDownloadSection - 録画ダウンロードセクション
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowDownTrayIcon, CheckIcon } from '@heroicons/react/24/solid';
import { RecordingAPIClient, type RecordingInfo } from '../../../infrastructure/api/recording-api';
import { CloudDownloadService, type DownloadProgress } from '../../../infrastructure/download/CloudDownloadService';
import { AudioExtractionService } from '../../../infrastructure/download/AudioExtractionService';
import { getServerUrl } from '../../../infrastructure/config/serverConfig';
import { Button } from '../atoms/Button';
import { RecordingDownloadItem } from '../molecules/RecordingDownloadItem';
import type { GuestInfo } from '@maycast/common-types';

export type RecordingDownloadStatus = 'waiting' | 'downloading' | 'extracting' | 'done' | 'error';

export interface DownloadAllProgress {
  /** 各レコーディングのステータス */
  statuses: Map<string, RecordingDownloadStatus>;
  /** 各レコーディングのチャンクプログレス */
  chunkProgress: Map<string, { current: number; total: number }>;
  /** 完了数 */
  completedCount: number;
  /** 合計数 */
  totalCount: number;
}

export type M4aDownloadPhase = 'downloading' | 'extracting';

export interface M4aDownloadProgress {
  phase: M4aDownloadPhase;
  chunkProgress?: DownloadProgress;
}

interface RecordingsDownloadSectionProps {
  recordingIds: string[];
  onDownloadAll: () => void;
  isDownloadingAll: boolean;
  downloadAllProgress?: DownloadAllProgress;
  guests?: GuestInfo[];
}

export const RecordingsDownloadSection: React.FC<RecordingsDownloadSectionProps> = ({
  recordingIds,
  onDownloadAll,
  isDownloadingAll,
  downloadAllProgress,
  guests = [],
}) => {
  const [recordings, setRecordings] = useState<Map<string, RecordingInfo>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [m4aDownloading, setM4aDownloading] = useState<Set<string>>(new Set());
  const [m4aProgress, setM4aProgress] = useState<Map<string, M4aDownloadProgress>>(new Map());
  const fetchedIdsRef = useRef<Set<string>>(new Set());

  // recordingId -> guestName のマッピングを作成
  const getGuestNameForRecording = useCallback((recordingId: string): string | undefined => {
    const guest = guests.find((g) => g.recordingId === recordingId);
    if (guest?.name) return guest.name;
    const recording = recordings.get(recordingId);
    return recording?.metadata?.participantName;
  }, [guests, recordings]);

  // Recording情報を取得（初回）
  useEffect(() => {
    const fetchRecordings = async () => {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);

      for (const recordingId of recordingIds) {
        if (fetchedIdsRef.current.has(recordingId)) continue;
        fetchedIdsRef.current.add(recordingId);

        setLoadingIds((prev) => new Set(prev).add(recordingId));
        try {
          const info = await apiClient.getRecording(recordingId);
          setRecordings((prev) => new Map(prev).set(recordingId, info));
        } catch (err) {
          console.error(`Failed to fetch recording ${recordingId}:`, err);
          fetchedIdsRef.current.delete(recordingId);
        } finally {
          setLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(recordingId);
            return next;
          });
        }
      }
    };

    fetchRecordings();
  }, [recordingIds]);

  // 個別ダウンロード（M4A） - クライアントサイドで音声抽出
  const handleDownloadM4a = useCallback(async (recordingId: string) => {
    setM4aDownloading((prev) => new Set(prev).add(recordingId));
    setM4aProgress((prev) => new Map(prev).set(recordingId, { phase: 'downloading' }));
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);

      // 1. MP4データをダウンロード
      let mp4Blob: Blob;
      const downloadUrls = await apiClient.getDownloadUrls(recordingId);
      if (downloadUrls.directDownload) {
        const cloudService = new CloudDownloadService();
        mp4Blob = await cloudService.download(downloadUrls, (progress) => {
          setM4aProgress((prev) => new Map(prev).set(recordingId, {
            phase: 'downloading',
            chunkProgress: progress,
          }));
        });
      } else {
        mp4Blob = await apiClient.downloadRecording(recordingId);
      }

      // 2. AudioExtractionServiceで音声を抽出
      setM4aProgress((prev) => new Map(prev).set(recordingId, { phase: 'extracting' }));
      const audioService = new AudioExtractionService();
      const m4aBlob = await audioService.extract(await mp4Blob.arrayBuffer());

      // 3. M4Aとしてダウンロード
      const guestName = getGuestNameForRecording(recordingId);
      const filename = guestName
        ? `${guestName}-${recordingId.substring(0, 8)}.m4a`
        : `recording-${recordingId.substring(0, 8)}.m4a`;

      const url = URL.createObjectURL(m4aBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`Failed to download m4a for ${recordingId}:`, err);
      alert(`Failed to download audio: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setM4aDownloading((prev) => {
        const next = new Set(prev);
        next.delete(recordingId);
        return next;
      });
      setM4aProgress((prev) => {
        const next = new Map(prev);
        next.delete(recordingId);
        return next;
      });
    }
  }, [getGuestNameForRecording]);

  if (recordingIds.length === 0) {
    return (
      <div className="text-sm text-maycast-text-secondary text-center py-4">
        No recording data
      </div>
    );
  }

  return (
    <div className="bg-maycast-safe/10 p-5 rounded-xl border border-maycast-safe/30">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckIcon className="w-5 h-5 text-maycast-safe" />
          <span className="font-semibold text-maycast-text">
            Recording Complete ({recordingIds.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {recordingIds.length > 1 && (
            <Button
              onClick={onDownloadAll}
              disabled={isDownloadingAll}
              variant="success"
              size="sm"
              className="!py-2 !px-4 !text-sm"
            >
              {isDownloadingAll ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {downloadAllProgress && downloadAllProgress.totalCount > 0
                    ? `${downloadAllProgress.completedCount}/${downloadAllProgress.totalCount}`
                    : 'Downloading...'}
                </>
              ) : (
                <>
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  Download All
                </>
              )}
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-3">
<<<<<<< HEAD
        {recordingIds.map((recordingId) => (
          <RecordingDownloadItem
            key={recordingId}
            recordingId={recordingId}
            recording={recordings.get(recordingId) || null}
            isLoading={loadingIds.has(recordingId)}
            onDownloadM4a={handleDownloadM4a}
            isDownloadingM4a={m4aDownloading.has(recordingId)}
            m4aDownloadProgress={m4aProgress.get(recordingId)}
            guestName={getGuestNameForRecording(recordingId)}
          />
        ))}
=======
        {recordingIds.map((recordingId) => {
          const batchStatus = isDownloadingAll
            ? downloadAllProgress?.statuses.get(recordingId)
            : undefined;
          const batchChunkProgress = isDownloadingAll
            ? downloadAllProgress?.chunkProgress.get(recordingId)
            : undefined;
          return (
            <RecordingDownloadItem
              key={recordingId}
              recordingId={recordingId}
              recording={recordings.get(recordingId) || null}
              isLoading={loadingIds.has(recordingId)}
              onDownloadM4a={handleDownloadM4a}
              isDownloadingM4a={m4aDownloading.has(recordingId)}
              guestName={getGuestNameForRecording(recordingId)}
              batchStatus={batchStatus}
              batchChunkProgress={batchChunkProgress}
            />
          );
        })}
>>>>>>> 048479f (複数ダウンロード時にm4aになるようにした)
      </div>
    </div>
  );
};
