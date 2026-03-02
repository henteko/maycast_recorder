/**
 * MicDeviceCard - マイクデバイス選択カード
 *
 * ラジオボタン風のデバイス選択UI
 * 選択中のデバイスには AudioWaveform を表示
 */

import { AudioWaveform } from './AudioWaveform';

interface MicDeviceCardProps {
  device: MediaDeviceInfo;
  index: number;
  isSelected: boolean;
  stream: MediaStream | null;
  onSelect: () => void;
  /** 波形データを外部に送信するコールバック（Director送信用） */
  onWaveformData?: (data: number[], isSilent: boolean) => void;
  /** 波形データ送信間隔（ミリ秒） */
  waveformDataInterval?: number;
}

export const MicDeviceCard: React.FC<MicDeviceCardProps> = ({
  device,
  index,
  isSelected,
  stream,
  onSelect,
  onWaveformData,
  waveformDataInterval,
}) => {
  const label = device.label || `Microphone ${index + 1}`;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? 'bg-maycast-primary/10 border-maycast-primary/50'
          : 'bg-maycast-bg/30 border-maycast-border/30 hover:border-maycast-border/60'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Radio indicator */}
        <div className="flex-shrink-0">
          {isSelected ? (
            <div className="w-5 h-5 rounded-full border-2 border-maycast-primary flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-maycast-primary" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-maycast-border/60" />
          )}
        </div>

        {/* Device info */}
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${isSelected ? 'text-maycast-text' : 'text-maycast-text/70'}`}>
            {label}
          </div>

          {/* Waveform for selected device */}
          {isSelected && stream && (
            <div className="mt-2">
              <AudioWaveform
                stream={stream}
                width={280}
                height={32}
                color="#06B6D4"
                backgroundColor="transparent"
                showSilenceWarning={true}
                onWaveformData={onWaveformData}
                waveformDataInterval={waveformDataInterval}
              />
            </div>
          )}
        </div>
      </div>
    </button>
  );
};
