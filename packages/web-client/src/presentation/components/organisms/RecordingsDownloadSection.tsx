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
  const fetchedIdsRef = useRef<Set<string>>(new Set());

  // recordingId -> guestName のマッピングを作成（WebSocket上のguest情報優先、fallbackとしてrecordingメタデータを使用）
  const getGuestNameForRecording = useCallback((recordingId: string): string | undefined => {
    const guest = guests.find((g) => g.recordingId === recordingId);
    if (guest?.name) return guest.name;
    // Guest切断後はrecordingメタデータから取得
    const recording = recordings.get(recordingId);
    return recording?.metadata?.participantName;
  }, [guests, recordings]);

  // Recording情報を取得
  useEffect(() => {
    const fetchRecordings = async () => {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);

      for (const recordingId of recordingIds) {
        // 既に取得済みまたは取得中の場合はスキップ
        if (fetchedIdsRef.current.has(recordingId)) continue;
        fetchedIdsRef.current.add(recordingId);

        setLoadingIds((prev) => new Set(prev).add(recordingId));
        try {
          const info = await apiClient.getRecording(recordingId);
          setRecordings((prev) => new Map(prev).set(recordingId, info));
        } catch (err) {
          console.error(`Failed to fetch recording ${recordingId}:`, err);
          // エラー時はrefから削除してリトライ可能に
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

  // 個別ダウンロード
  const handleDownload = useCallback(async (recordingId: string) => {
    setDownloadProgress((prev) => new Map(prev).set(recordingId, { current: 0, total: 0 }));
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);

      const onChunkProgress = (progress: { current: number; total: number }) => {
        setDownloadProgress((prev) => new Map(prev).set(recordingId, progress));
      };

      // Presigned URL対応: download-urlsを使用
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

      // ダウンロードリンクを作成
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
            isDownloading={downloadProgress.has(recordingId)}
            chunkProgress={downloadProgress.get(recordingId)}
            guestName={getGuestNameForRecording(recordingId)}
          />
        ))}
      </div>
    </div>
  );
};
