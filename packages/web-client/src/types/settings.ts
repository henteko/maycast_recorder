export interface RecorderSettings {
  videoDeviceId?: string
  audioDeviceId?: string
}

export interface QualityConfig {
  width: number
  height: number
  bitrate: number
  framerate: number
  keyframeInterval: number // frames
}

export const STABLE_QUALITY_CONFIG: QualityConfig = {
  width: 1280,
  height: 720,
  bitrate: 2_000_000, // 2 Mbps
  framerate: 30,
  keyframeInterval: 30, // 1秒ごと (30fps)
}

const SETTINGS_KEY = 'maycast-recorder-settings'

export function saveDeviceSettings(settings: RecorderSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function loadDeviceSettings(): RecorderSettings {
  const saved = localStorage.getItem(SETTINGS_KEY)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      return {
        videoDeviceId: parsed.videoDeviceId,
        audioDeviceId: parsed.audioDeviceId,
      }
    } catch {
      // ignore
    }
  }
  return {}
}
