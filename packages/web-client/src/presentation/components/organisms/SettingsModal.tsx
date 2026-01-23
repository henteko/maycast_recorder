import { CogIcon } from '@heroicons/react/24/solid'
import { DeviceSelector } from '../molecules/DeviceSelector'
import { QualityPresetSelector } from '../molecules/QualityPresetSelector'
import type { RecorderSettings, QualityPreset } from '../../../types/settings'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: RecorderSettings
  onSettingsChange: (settings: RecorderSettings) => void
  onSave: () => void
  videoDevices: MediaDeviceInfo[]
  audioDevices: MediaDeviceInfo[]
}

export const SettingsModal = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onSave,
  videoDevices,
  audioDevices,
}: SettingsModalProps) => {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-maycast-panel/95 backdrop-blur-xl border border-maycast-border/50 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-6">
          <CogIcon className="w-7 h-7 text-maycast-primary" />
          <h2 className="text-2xl font-bold text-maycast-text">設定</h2>
        </div>

        <DeviceSelector
          label="カメラ"
          value={settings.videoDeviceId}
          onChange={(value) => onSettingsChange({ ...settings, videoDeviceId: value })}
          devices={videoDevices}
          deviceType="camera"
        />

        <DeviceSelector
          label="マイク"
          value={settings.audioDeviceId}
          onChange={(value) => onSettingsChange({ ...settings, audioDeviceId: value })}
          devices={audioDevices}
          deviceType="microphone"
        />

        <QualityPresetSelector
          value={settings.qualityPreset}
          onChange={(value: QualityPreset) => onSettingsChange({ ...settings, qualityPreset: value })}
        />

        <div className="flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-6 bg-white hover:bg-gray-100 rounded-xl font-bold transition-all border-2 border-maycast-border text-gray-900 cursor-pointer"
          >
            キャンセル
          </button>
          <button
            onClick={onSave}
            className="flex-1 py-3 px-6 bg-maycast-primary hover:bg-maycast-primary/80 rounded-xl font-bold transition-all shadow-lg text-white cursor-pointer"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
