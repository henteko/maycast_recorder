import type { QualityPreset } from '../../../types/settings'

interface QualityPresetSelectorProps {
  value: QualityPreset
  onChange: (value: QualityPreset) => void
}

export const QualityPresetSelector = ({ value, onChange }: QualityPresetSelectorProps) => {
  return (
    <div className="mb-6">
      <label className="block text-sm text-maycast-subtext mb-2 font-semibold">画質プリセット</label>
      <div className="space-y-3">
        <label className="flex items-center p-4 bg-white rounded-xl cursor-pointer hover:bg-gray-50 border-2 border-maycast-border hover:border-maycast-primary transition-all">
          <input
            type="radio"
            name="quality"
            value="stability"
            checked={value === 'stability'}
            onChange={(e) => onChange(e.target.value as QualityPreset)}
            className="mr-3 w-4 h-4 cursor-pointer"
          />
          <div className="flex-1">
            <p className="font-bold text-gray-900">Stability Mode（安定優先）</p>
            <p className="text-sm text-gray-600">720p / 2Mbps / 1秒ごとキーフレーム</p>
          </div>
        </label>

        <label className="flex items-center p-4 bg-white rounded-xl cursor-pointer hover:bg-gray-50 border-2 border-maycast-border hover:border-maycast-primary transition-all">
          <input
            type="radio"
            name="quality"
            value="quality"
            checked={value === 'quality'}
            onChange={(e) => onChange(e.target.value as QualityPreset)}
            className="mr-3 w-4 h-4 cursor-pointer"
          />
          <div className="flex-1">
            <p className="font-bold text-gray-900">Quality Mode（高画質）</p>
            <p className="text-sm text-gray-600">1080p / 5Mbps / 3秒ごとキーフレーム</p>
          </div>
        </label>
      </div>
    </div>
  )
}
