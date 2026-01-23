import type {
  IMediaStreamService,
  ScreenCaptureOptions,
  CameraCaptureOptions,
} from '../../domain/services/IMediaStreamService';

/**
 * ブラウザの MediaDevices API を使用した MediaStream Service の実装
 *
 * getDisplayMedia, getUserMedia を使用してメディアストリームを取得
 */
export class BrowserMediaStreamService implements IMediaStreamService {
  async captureScreen(options: ScreenCaptureOptions): Promise<MediaStream> {
    try {
      // getDisplayMedia の制約
      const displayMediaOptions: DisplayMediaStreamOptions = {
        video: options.video !== false ? (options.video || true) : false,
        audio: options.audio !== false ? (options.audio || true) : false,
      };

      // Chrome の preferCurrentTab オプション（実験的機能）
      if (options.preferCurrentTab && 'preferCurrentTab' in displayMediaOptions) {
        (displayMediaOptions as unknown as { preferCurrentTab: boolean }).preferCurrentTab = true;
      }

      const mediaStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

      console.log('✅ Screen capture acquired:', {
        videoTracks: mediaStream.getVideoTracks().length,
        audioTracks: mediaStream.getAudioTracks().length,
      });

      return mediaStream;
    } catch (error) {
      console.error('❌ Failed to capture screen:', error);
      throw new Error(
        `Screen capture failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async captureCamera(options: CameraCaptureOptions): Promise<MediaStream> {
    try {
      const constraints: MediaStreamConstraints = {
        video: options.video || true,
        audio: options.audio || true,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      console.log('✅ Camera capture acquired:', {
        videoTracks: mediaStream.getVideoTracks().length,
        audioTracks: mediaStream.getAudioTracks().length,
      });

      return mediaStream;
    } catch (error) {
      console.error('❌ Failed to capture camera:', error);
      throw new Error(
        `Camera capture failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  stopStream(stream: MediaStream): void {
    stream.getTracks().forEach((track) => {
      track.stop();
      console.log(`Stopped track: ${track.kind}`);
    });
  }

  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices;
    } catch (error) {
      console.error('❌ Failed to enumerate devices:', error);
      throw new Error(
        `Device enumeration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
