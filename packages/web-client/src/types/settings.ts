export type QualityPreset = 'stability' | 'quality'

export interface RecorderSettings {
  videoDeviceId?: string
  audioDeviceId?: string
  qualityPreset: QualityPreset
}

export interface QualityConfig {
  width: number
  height: number
  bitrate: number
  framerate: number
  keyframeInterval: number // frames
}

export const QUALITY_PRESETS: Record<QualityPreset, QualityConfig> = {
  stability: {
    width: 1280,
    height: 720,
    bitrate: 2_000_000, // 2 Mbps
    framerate: 30,
    keyframeInterval: 30, // 1秒ごと (30fps)
  },
  quality: {
    width: 1920,
    height: 1080,
    bitrate: 5_000_000, // 5 Mbps
    framerate: 30,
    keyframeInterval: 90, // 3秒ごと (30fps)
  },
}

const SETTINGS_KEY = 'maycast-recorder-settings'

export function saveSettings(settings: RecorderSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function loadSettings(): RecorderSettings {
  const saved = localStorage.getItem(SETTINGS_KEY)
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch (err) {
      console.error('Failed to parse settings:', err)
    }
  }

  // Default settings
  return {
    qualityPreset: 'stability',
  }
}
