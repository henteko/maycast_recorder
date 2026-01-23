/**
 * useDevices Hook
 *
 * 利用可能なメディアデバイス（カメラ/マイク）を列挙
 *
 * BrowserMediaStreamServiceを使用してデバイス情報を取得
 */

import { useState, useEffect } from 'react';
import { useDI } from '../../infrastructure/di';
import type { IMediaStreamService } from '../../domain/services/IMediaStreamService';

export const useDevices = () => {
  const di = useDI();
  const mediaStreamService = di.resolve<IMediaStreamService>('MediaStreamService');

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        const devices = await mediaStreamService.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        const audioInputs = devices.filter((d) => d.kind === 'audioinput');

        setVideoDevices(videoInputs);
        setAudioDevices(audioInputs);

        console.log('📹 Video devices:', videoInputs.length);
        console.log('🎤 Audio devices:', audioInputs.length);
      } catch (err) {
        console.error('❌ Failed to enumerate devices:', err);
      }
    };
    enumerateDevices();
  }, [mediaStreamService]);

  return {
    videoDevices,
    audioDevices,
  };
};
