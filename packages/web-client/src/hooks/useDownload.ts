import { useState } from 'react';
import type { RecordingId } from '@maycast/common-types';
import { useDI } from '../infrastructure/di';
import type { DownloadRecordingUseCase } from '../domain/usecases/DownloadRecording.usecase';

export interface DownloadProgress {
  isDownloading: boolean;
  current: number;
  total: number;
}

export const useDownload = () => {
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    isDownloading: false,
    current: 0,
    total: 0,
  });

  const di = useDI();
  const downloadRecordingUseCase = di.resolve<DownloadRecordingUseCase>('DownloadRecordingUseCase');

  const downloadRecordingById = async (recordingId: RecordingId) => {
    try {
      setDownloadProgress({ isDownloading: true, current: 0, total: 1 });

      const result = await downloadRecordingUseCase.execute({ recordingId });

      setDownloadProgress({ isDownloading: true, current: 1, total: 1 });

      // Download the file
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('✅ Downloaded:', result.blob.size, 'bytes');

      setDownloadProgress({ isDownloading: false, current: 0, total: 0 });
    } catch (err) {
      console.error('❌ Download error:', err);
      setDownloadProgress({ isDownloading: false, current: 0, total: 0 });
      throw err;
    }
  };

  return {
    downloadProgress,
    downloadRecordingById,
    // Deprecated alias for backward compatibility
    downloadSessionById: downloadRecordingById,
  };
};
