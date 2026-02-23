/**
 * RecordingsDownloadSection - 録画ダウンロードセクション
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowDownTrayIcon, CheckIcon } from '@heroicons/react/24/solid';
import { RecordingAPIClient, type RecordingInfo } from '../../../infrastructure/api/recording-api';
import { CloudDownloadService } from '../../../infrastructure/download/CloudDownloadService';
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
  const [m4aAvailable, setM4aAvailable] = useState<Map<string, { url: string; filename: string }>>(new Map());
  const [vttDownloading, setVttDownloading] = useState<Set<string>>(new Set());
  const [vttAvailable, setVttAvailable] = useState<Map<string, { url: string; filename: string }>>(new Map());
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // recordingId -> guestName のマッピングを作成
  const getGuestNameForRecording = useCallback((recordingId: string): string | undefined => {
    const guest = guests.find((g) => g.recordingId === recordingId);
    if (guest?.name) return guest.name;
    const recording = recordings.get(recordingId);
    return recording?.metadata?.participantName;
  }, [guests, recordings]);

  // m4a/vtt利用可能性をチェック
  const checkDownloadAvailability = useCallback(async (recordingId: string) => {
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);
      const downloadUrls = await apiClient.getDownloadUrls(recordingId);
      if (downloadUrls.directDownload) {
        if (downloadUrls.m4aUrl && downloadUrls.m4aFilename) {
          setM4aAvailable((prev) => new Map(prev).set(recordingId, {
            url: downloadUrls.m4aUrl!,
            filename: downloadUrls.m4aFilename!,
          }));
        }
        if (downloadUrls.vttUrl && downloadUrls.vttFilename) {
          setVttAvailable((prev) => new Map(prev).set(recordingId, {
            url: downloadUrls.vttUrl!,
            filename: downloadUrls.vttFilename!,
          }));
        }
      }
    } catch {
      // 無視
    }
  }, []);

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

          // completedならm4a/vttチェック
          if (info.processing_state === 'completed' || info.transcription_state === 'completed') {
            checkDownloadAvailability(recordingId);
          }
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
  }, [recordingIds, checkDownloadAvailability]);

  // processing中またはtranscription中のrecordingをポーリング
  useEffect(() => {
    const hasInProgress = Array.from(recordings.values()).some(
      (r) =>
        r.processing_state === 'pending' || r.processing_state === 'processing' ||
        r.transcription_state === 'pending' || r.transcription_state === 'processing'
    );

    if (!hasInProgress) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    if (pollingRef.current) return; // already polling

    pollingRef.current = setInterval(async () => {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);

      for (const [recordingId, rec] of recordings) {
        const processingInProgress = rec.processing_state === 'pending' || rec.processing_state === 'processing';
        const transcriptionInProgress = rec.transcription_state === 'pending' || rec.transcription_state === 'processing';
        if (!processingInProgress && !transcriptionInProgress) continue;

        try {
          const info = await apiClient.getRecording(recordingId);
          setRecordings((prev) => new Map(prev).set(recordingId, info));

          // completedに遷移したらm4a/vttチェック
          if (info.processing_state === 'completed' || info.transcription_state === 'completed') {
            checkDownloadAvailability(recordingId);
          }
        } catch {
          // ポーリング失敗は無視
        }
      }
    }, 5000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [recordings, checkDownloadAvailability]);

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

  // 個別ダウンロード（M4A）
  const handleDownloadM4a = useCallback(async (recordingId: string) => {
    const m4aInfo = m4aAvailable.get(recordingId);
    if (!m4aInfo) return;

    setM4aDownloading((prev) => new Set(prev).add(recordingId));
    try {
      const response = await fetch(m4aInfo.url);
      if (!response.ok) {
        throw new Error(`Failed to download m4a: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = m4aInfo.filename;
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
  }, [m4aAvailable]);

  // 個別ダウンロード（VTT）
  const handleDownloadVtt = useCallback(async (recordingId: string) => {
    const vttInfo = vttAvailable.get(recordingId);
    if (!vttInfo) return;

    setVttDownloading((prev) => new Set(prev).add(recordingId));
    try {
      const response = await fetch(vttInfo.url);
      if (!response.ok) {
        throw new Error(`Failed to download vtt: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = vttInfo.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`Failed to download vtt for ${recordingId}:`, err);
      alert(`Failed to download subtitle: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setVttDownloading((prev) => {
        const next = new Set(prev);
        next.delete(recordingId);
        return next;
      });
    }
  }, [vttAvailable]);

  if (recordingIds.length === 0) {
    return (
      <div className="text-sm text-maycast-text-secondary text-center py-4">
        No recording data
      </div>
    );
  }

  return (
    <div className="bg-maycast-safe/10 backdrop-blur-md p-5 rounded-2xl border border-maycast-safe/30 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckIcon className="w-5 h-5 text-maycast-safe" />
          <span className="font-semibold text-maycast-text">
            Recording Complete ({recordingIds.length})
          </span>
        </div>
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
      <div className="space-y-3">
        {recordingIds.map((recordingId) => (
          <RecordingDownloadItem
            key={recordingId}
            recordingId={recordingId}
            recording={recordings.get(recordingId) || null}
            isLoading={loadingIds.has(recordingId)}
            onDownload={handleDownload}
            onDownloadM4a={handleDownloadM4a}
            onDownloadVtt={handleDownloadVtt}
            isDownloading={downloadProgress.has(recordingId)}
            isDownloadingM4a={m4aDownloading.has(recordingId)}
            isDownloadingVtt={vttDownloading.has(recordingId)}
            chunkProgress={downloadProgress.get(recordingId)}
            guestName={getGuestNameForRecording(recordingId)}
            hasM4a={m4aAvailable.has(recordingId)}
            hasVtt={vttAvailable.has(recordingId)}
          />
        ))}
      </div>
    </div>
  );
};
