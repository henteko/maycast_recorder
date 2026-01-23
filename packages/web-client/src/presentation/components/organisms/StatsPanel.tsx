import { VideoCameraIcon, MicrophoneIcon } from '@heroicons/react/24/solid'
import type { ChunkStats } from '../../../types/webcodecs'

interface StatsPanelProps {
  stats: ChunkStats
}

export const StatsPanel = ({ stats }: StatsPanelProps) => {
  return (
    <div className="grid grid-cols-3 gap-6 mb-8">
      <div className="bg-maycast-primary/20 backdrop-blur-md p-6 rounded-2xl border border-maycast-primary/30 shadow-xl">
        <div className="flex items-center gap-2 mb-3">
          <VideoCameraIcon className="w-5 h-5 text-maycast-primary" />
          <p className="text-maycast-primary/80 text-sm font-semibold">Video Chunks</p>
        </div>
        <p className="text-4xl font-bold text-maycast-text">{stats.videoChunks}</p>
      </div>
      <div className="bg-maycast-rust/20 backdrop-blur-md p-6 rounded-2xl border border-maycast-rust/30 shadow-xl">
        <div className="flex items-center gap-2 mb-3">
          <MicrophoneIcon className="w-5 h-5 text-maycast-rust" />
          <p className="text-maycast-rust/80 text-sm font-semibold">Audio Chunks</p>
        </div>
        <p className="text-4xl font-bold text-maycast-text">{stats.audioChunks}</p>
      </div>
      <div className="bg-maycast-primary/20 backdrop-blur-md p-6 rounded-2xl border border-maycast-primary/30 shadow-xl">
        <p className="text-maycast-primary/80 text-sm font-semibold mb-3">Total Size</p>
        <p className="text-4xl font-bold text-maycast-text">
          {(stats.totalSize / 1024 / 1024).toFixed(2)} <span className="text-2xl text-maycast-subtext">MB</span>
        </p>
      </div>
    </div>
  )
}
