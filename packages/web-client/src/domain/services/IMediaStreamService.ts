/**
 * 画面キャプチャオプション
 */
export interface ScreenCaptureOptions {
  video?: boolean | MediaTrackConstraints;
  audio?: boolean | MediaTrackConstraints;
  preferCurrentTab?: boolean;
}

/**
 * マイクキャプチャオプション
 */
export interface MicCaptureOptions {
  audio?: boolean | MediaTrackConstraints;
}

/**
 * MediaStream Service Interface
 *
 * メディアストリーム取得を抽象化
 * 実装: BrowserMediaStreamService（getDisplayMedia, getUserMedia）
 */
export interface IMediaStreamService {
  /**
   * 画面共有のMediaStreamを取得
   */
  captureScreen(options: ScreenCaptureOptions): Promise<MediaStream>;

  /**
   * マイクのMediaStreamを取得
   */
  captureMic(options: MicCaptureOptions): Promise<MediaStream>;

  /**
   * MediaStreamを停止
   */
  stopStream(stream: MediaStream): void;

  /**
   * 利用可能なデバイス一覧を取得
   */
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
}
