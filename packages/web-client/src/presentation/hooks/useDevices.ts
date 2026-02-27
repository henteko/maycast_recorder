/**
 * useDevices Hook
 *
 * 利用可能なオーディオデバイス（マイク）を列挙
 *
 * BrowserMediaStreamServiceを使用してデバイス情報を取得
 * streamを渡すと、getUserMedia完了後にデバイスラベル付きで再列挙する
 */

import { useState, useEffect, useCallback } from 'react';
import { useDI } from '../../infrastructure/di';
import type { IMediaStreamService } from '../../domain/services/IMediaStreamService';

export const useDevices = (stream?: MediaStream | null) => {
  const di = useDI();
  const mediaStreamService = di.resolve<IMediaStreamService>('MediaStreamService');

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);

  const enumerate = useCallback(async () => {
    try {
      const devices = await mediaStreamService.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');

      setAudioDevices(audioInputs);

      console.log('🎤 Audio devices:', audioInputs.length);
    } catch (err) {
      console.error('❌ Failed to enumerate devices:', err);
    }
  }, [mediaStreamService]);

  // 初回マウント時 + stream変更時（getUserMedia完了後）に再列挙
  useEffect(() => {
    let cancelled = false;

    mediaStreamService.enumerateDevices().then((devices) => {
      if (cancelled) return;
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');

      setAudioDevices(audioInputs);
    }).catch((err) => {
      console.error('❌ Failed to enumerate devices:', err);
    });

    return () => { cancelled = true; };
  }, [mediaStreamService, stream]);

  // デバイスの接続/切断を検知して再列挙
  useEffect(() => {
    navigator.mediaDevices.addEventListener('devicechange', enumerate);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', enumerate);
    };
  }, [enumerate]);

  return {
    audioDevices,
    refreshDevices: enumerate,
  };
};
