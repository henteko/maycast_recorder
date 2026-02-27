export interface RecorderSettings {
  audioDeviceId?: string
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
        audioDeviceId: parsed.audioDeviceId,
      }
    } catch {
      // ignore
    }
  }
  return {}
}
