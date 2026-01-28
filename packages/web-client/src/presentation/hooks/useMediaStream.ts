import { useState, useCallback, useRef } from 'react';
import { useDI } from '../../infrastructure/di';
import type { IMediaStreamService } from '../../domain/services/IMediaStreamService';
import { ErrorHandler } from '../../shared/errors';

export interface MediaStreamOptions {
  videoDeviceId?: string;
  audioDeviceId?: string;
  width?: number;
  height?: number;
  frameRate?: number;
}

interface UseMediaStreamResult {
  stream: MediaStream | null;
  error: string | null;
  startCapture: (options?: MediaStreamOptions) => Promise<MediaStream | null>;
  stopCapture: () => void;
  isCapturing: boolean;
}

/**
 * useMediaStream Hook (Refactored)
 *
 * BrowserMediaStreamServiceを使用してメディアストリームを管理
 * カメラ/マイクのキャプチャに使用
 */
export const useMediaStream = (): UseMediaStreamResult => {
  const di = useDI();
  const mediaStreamService = di.resolve<IMediaStreamService>('MediaStreamService');

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const startCapture = useCallback(
    async (options?: MediaStreamOptions) => {
      try {
        setError(null);

        // 既存のストリームがあればそのまま返す（カメラ/マイクの再取得を避ける）
        if (streamRef.current) {
          console.log('📹 Reusing existing media stream');
          return streamRef.current;
        }

        // Build constraints for camera capture
        const videoConstraints: MediaTrackConstraints = {
          width: { ideal: options?.width || 1280 },
          height: { ideal: options?.height || 720 },
          frameRate: { ideal: options?.frameRate || 30 },
        };

        if (options?.videoDeviceId) {
          videoConstraints.deviceId = { exact: options.videoDeviceId };
        }

        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000,
        };

        if (options?.audioDeviceId) {
          audioConstraints.deviceId = { exact: options.audioDeviceId };
        }

        // Use BrowserMediaStreamService to capture camera
        const mediaStream = await mediaStreamService.captureCamera({
          video: videoConstraints,
          audio: audioConstraints,
        });

        streamRef.current = mediaStream;
        setStream(mediaStream);
        setIsCapturing(true);

        return mediaStream;
      } catch (err) {
        const errorMessage = ErrorHandler.handle(err);
        setError(errorMessage.message);
        console.error('❌ Failed to get media stream:', err);
        return null;
      }
    },
    [mediaStreamService]
  );

  const stopCapture = useCallback(() => {
    if (streamRef.current) {
      mediaStreamService.stopStream(streamRef.current);
      streamRef.current = null;
      setStream(null);
      setIsCapturing(false);
    }
  }, [mediaStreamService]);

  return {
    stream,
    error,
    startCapture,
    stopCapture,
    isCapturing,
  };
};
