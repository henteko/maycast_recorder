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

interface RecordingsDownloadSectionProps {
  recordingIds: string[];
  onDownloadAll: () => void;
  isDownloadingAll: boolean;
  guests?: GuestInfo[];
}

export const RecordingsDownloadSection: React.FC<RecordingsDownloadSectionProps> = ({
  recordingIds,
  onDownloadAll,
  isDownloadingAll,
  guests = [],
}) => {
  const [recordings, setRecordings] = useState<Map<string, RecordingInfo>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
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
    setDownloadingIds((prev) => new Set(prev).add(recordingId));
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RecordingAPIClient(serverUrl);

      // Presigned URL対応: まずdownload-urlsを試行
      let blob: Blob;
      let filename: string | undefined;
      try {
        const downloadUrls = await apiClient.getDownloadUrls(recordingId);
        if (downloadUrls.directDownload) {
          const cloudService = new CloudDownloadService();
          blob = await cloudService.download(downloadUrls);
          filename = downloadUrls.filename;
        } else {
          blob = await apiClient.downloadRecording(recordingId);
          filename = downloadUrls.filename;
        }
      } catch {
        // download-urls APIが利用できない場合は既存のダウンロードにフォールバック
        blob = await apiClient.downloadRecording(recordingId);
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
      setDownloadingIds((prev) => {
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
                Downloading...
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
            isDownloading={downloadingIds.has(recordingId)}
            guestName={getGuestNameForRecording(recordingId)}
          />
        ))}
      </div>
    </div>
  );
};
