import { MicrophoneIcon } from '@heroicons/react/24/solid'

interface RecordingIndicatorProps {
  elapsedTime: string
}

export const RecordingIndicator = ({ elapsedTime }: RecordingIndicatorProps) => {
  return (
    <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
      <div className="flex items-center gap-3 bg-maycast-rec bg-opacity-95 backdrop-blur-sm px-5 py-3 rounded-full shadow-2xl border-2 border-maycast-rec/80">
        <div className="relative">
          <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
          <div className="absolute inset-0 w-3 h-3 bg-white rounded-full animate-ping opacity-75" />
        </div>
        <MicrophoneIcon className="w-5 h-5 text-white" />
        <span className="text-base font-bold tracking-wider text-white">REC</span>
      </div>
      <div className="bg-black/70 backdrop-blur-md px-7 py-3 rounded-2xl shadow-2xl border border-white/30">
        <span className="text-3xl font-mono font-bold text-white tabular-nums">{elapsedTime}</span>
      </div>
    </div>
  )
}
