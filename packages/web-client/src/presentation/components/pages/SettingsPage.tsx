import React from 'react';
import { Cog6ToothIcon, CheckIcon } from '@heroicons/react/24/solid';
import { DeviceSelector } from '../molecules/DeviceSelector';
import { QualityPresetSelector } from '../molecules/QualityPresetSelector';
import { ServerUrlSettings } from '../molecules/ServerUrlSettings';
import type { RecorderSettings, QualityPreset } from '../../../types/settings';

interface SettingsPageProps {
  settings: RecorderSettings;
  onSettingsChange: (settings: RecorderSettings) => void;
  onSave: () => void;
  videoDevices: MediaDeviceInfo[];
  audioDevices: MediaDeviceInfo[];
  showServerSettings?: boolean; // Remote Modeでのみtrue
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onSettingsChange,
  onSave,
  videoDevices,
  audioDevices,
  showServerSettings = false,
}) => {
  return (
    <div className="flex flex-col h-full bg-maycast-bg text-maycast-text">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-maycast-border">
        <div className="flex items-center gap-3">
          <Cog6ToothIcon className="w-7 h-7 text-maycast-primary" />
          <h1 className="text-2xl font-bold text-maycast-text">設定</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Device Settings Card */}
          <div className="bg-maycast-panel/30 backdrop-blur-md p-6 rounded-2xl border border-maycast-border/40 shadow-xl">
            <h2 className="text-lg font-bold text-maycast-text mb-4 flex items-center gap-2">
              デバイス設定
            </h2>

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
          </div>

          {/* Quality Settings Card */}
          <div className="bg-maycast-panel/30 backdrop-blur-md p-6 rounded-2xl border border-maycast-border/40 shadow-xl">
            <h2 className="text-lg font-bold text-maycast-text mb-4 flex items-center gap-2">
              品質設定
            </h2>

            <QualityPresetSelector
              value={settings.qualityPreset}
              onChange={(value: QualityPreset) => onSettingsChange({ ...settings, qualityPreset: value })}
            />
          </div>

          {/* Server Settings Card - Remote Modeのみ表示 */}
          {showServerSettings && (
            <div className="bg-maycast-panel/30 backdrop-blur-md p-6 rounded-2xl border border-maycast-border/40 shadow-xl">
              <h2 className="text-lg font-bold text-maycast-text mb-4 flex items-center gap-2">
                サーバー設定
              </h2>

              <ServerUrlSettings />
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={onSave}
            className="w-full py-4 px-6 bg-maycast-safe hover:bg-maycast-safe/80 rounded-2xl font-bold text-lg transition-all shadow-2xl transform hover:scale-[1.02] flex items-center justify-center gap-3 text-white cursor-pointer"
          >
            <CheckIcon className="w-6 h-6" />
            設定を保存
          </button>
        </div>
      </div>
    </div>
  );
};
