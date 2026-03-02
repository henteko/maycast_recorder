import { useState } from 'react';
import type { RecordingId } from '@maycast/common-types';
import { useDI } from '../../infrastructure/di';
import type { DownloadRecordingUseCase } from '../../domain/usecases/DownloadRecording.usecase';
import { AudioExtractionService } from '../../infrastructure/download/AudioExtractionService';

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
      setDownloadProgress({ isDownloading: true, current: 0, total: 0 });

      const result = await downloadRecordingUseCase.execute({
        recordingId,
        onProgress: (progress) => {
          setDownloadProgress({ isDownloading: true, ...progress });
        },
      });

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

  const downloadM4aById = async (recordingId: RecordingId) => {
    try {
      setDownloadProgress({ isDownloading: true, current: 0, total: 0 });

      const result = await downloadRecordingUseCase.execute({
        recordingId,
        onProgress: (progress) => {
          setDownloadProgress({ isDownloading: true, ...progress });
        },
      });

      // Extract audio from MP4
      const audioExtractor = new AudioExtractionService();
      const mp4ArrayBuffer = await result.blob.arrayBuffer();
      const m4aBlob = await audioExtractor.extract(mp4ArrayBuffer);

      // Download the M4A file
      const m4aFilename = result.filename.replace(/\.mp4$/, '.m4a');
      const url = URL.createObjectURL(m4aBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = m4aFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('✅ Downloaded M4A:', m4aBlob.size, 'bytes');

      setDownloadProgress({ isDownloading: false, current: 0, total: 0 });
    } catch (err) {
      console.error('❌ M4A Download error:', err);
      setDownloadProgress({ isDownloading: false, current: 0, total: 0 });
      throw err;
    }
  };

  return {
    downloadProgress,
    downloadRecordingById,
    downloadM4aById,
    // Deprecated alias for backward compatibility
    downloadSessionById: downloadRecordingById,
  };
};
