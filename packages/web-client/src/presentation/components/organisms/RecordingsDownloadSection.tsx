/**
 * RecordingsDownloadSection - 録画ダウンロードセクション
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowDownTrayIcon, CheckIcon } from '@heroicons/react/24/solid';
import { RecordingAPIClient, type RecordingInfo } from '../../../infrastructure/api/recording-api';
import { CloudDownloadService } from '../../../infrastructure/download/CloudDownloadService';
import { AudioExtractionService } from '../../../infrastructure/download/AudioExtractionService';
import { getServerUrl } from '../../../infrastructure/config/serverConfig';
import { Button } from '../atoms/Button';
import { RecordingDownloadItem } from '../molecules/RecordingDownloadItem';
import type { GuestInfo } from '@maycast/common-types';

export interface DownloadAllProgress {
  currentRecording: number;
  totalRecordings: number;
  currentChunk: number;
  totalChunks: number;
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
  const [downloadProgress, setDownloadProgress] = useState<Map<string, { current: number; total: number }>>(new Map());
  const [m4aDownloading, setM4aDownloading] = useState<Set<string>>(new Set());
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

  // 個別ダウンロード（MP4）
  const handleDownload = useCallback(async (recordingId: string) => {
    setDownloadProgress((prev) => new Map(prev).set(recordingId, { current: 0, total: 0 }));
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);

      const onChunkProgress = (progress: { current: number; total: number }) => {
        setDownloadProgress((prev) => new Map(prev).set(recordingId, progress));
      };

      let blob: Blob;
      let filename: string | undefined;
      const downloadUrls = await apiClient.getDownloadUrls(recordingId);
      if (downloadUrls.directDownload) {
        const cloudService = new CloudDownloadService();
        blob = await cloudService.download(downloadUrls, onChunkProgress);
        filename = downloadUrls.filename;
      } else {
        blob = await apiClient.downloadRecording(recordingId);
        filename = downloadUrls.filename;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      if (!filename) {
        const guestName = getGuestNameForRecording(recordingId);
        filename = guestName
          ? `${guestName}-${recordingId.substring(0, 8)}.mp4`
          : `recording-${recordingId.substring(0, 8)}.mp4`;
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`Failed to download recording ${recordingId}:`, err);
      alert(`Failed to download recording: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDownloadProgress((prev) => {
        const next = new Map(prev);
        next.delete(recordingId);
        return next;
      });
    }
  }, [getGuestNameForRecording]);

  // 個別ダウンロード（M4A） - クライアントサイドで音声抽出
  const handleDownloadM4a = useCallback(async (recordingId: string) => {
    setM4aDownloading((prev) => new Set(prev).add(recordingId));
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);

      // 1. MP4データをダウンロード（handleDownloadと同じ方法）
      let mp4Blob: Blob;
      const downloadUrls = await apiClient.getDownloadUrls(recordingId);
      if (downloadUrls.directDownload) {
        const cloudService = new CloudDownloadService();
        mp4Blob = await cloudService.download(downloadUrls);
      } else {
        mp4Blob = await apiClient.downloadRecording(recordingId);
      }

      // 2. AudioExtractionServiceで音声を抽出
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
                  {downloadAllProgress && downloadAllProgress.totalRecordings > 0
                    ? `${downloadAllProgress.currentRecording}/${downloadAllProgress.totalRecordings}`
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
        {recordingIds.map((recordingId) => (
          <RecordingDownloadItem
            key={recordingId}
            recordingId={recordingId}
            recording={recordings.get(recordingId) || null}
            isLoading={loadingIds.has(recordingId)}
            onDownload={handleDownload}
            onDownloadM4a={handleDownloadM4a}
            isDownloading={downloadProgress.has(recordingId)}
            isDownloadingM4a={m4aDownloading.has(recordingId)}
            chunkProgress={downloadProgress.get(recordingId)}
            guestName={getGuestNameForRecording(recordingId)}
            hasM4a={(() => {
              const rec = recordings.get(recordingId);
              return !!rec && rec.state !== 'standby';
            })()}
          />
        ))}
      </div>
    </div>
  );
};
