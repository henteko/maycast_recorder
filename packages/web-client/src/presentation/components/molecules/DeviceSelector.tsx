interface DeviceSelectorProps {
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
  devices: MediaDeviceInfo[]
  deviceType: 'camera' | 'microphone'
}

export const DeviceSelector = ({ label, value, onChange, devices, deviceType }: DeviceSelectorProps) => {
  const defaultLabel = deviceType === 'camera' ? 'カメラ' : 'マイク'

  return (
    <div className="mb-6">
      <label className="block text-sm text-maycast-subtext mb-2 font-semibold">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full bg-white text-gray-900 px-4 py-3 rounded-xl border-2 border-maycast-border focus:border-maycast-primary focus:outline-none focus:ring-2 focus:ring-maycast-primary/50 font-medium cursor-pointer"
      >
        <option value="">デフォルト</option>
        {devices.map(device => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `${defaultLabel} ${device.deviceId.slice(0, 8)}`}
          </option>
        ))}
      </select>
    </div>
  )
}
