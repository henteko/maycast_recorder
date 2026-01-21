import {
  ArrowDownTrayIcon,
  TrashIcon,
  CheckIcon,
  ServerStackIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/solid'
import type { SessionMetadata } from '../../storage/types'

interface SessionItemProps {
  session: SessionMetadata
  onDownload: (sessionId: string) => void
  onDelete: (sessionId: string) => void
  isDownloading: boolean
}

export const SessionItem = ({ session, onDownload, onDelete, isDownloading }: SessionItemProps) => {
  const startDate = session.startTime ? new Date(session.startTime) : null
  const isValidStart = startDate && !isNaN(startDate.getTime())

  return (
    <div className="bg-maycast-panel/30 backdrop-blur-sm p-4 rounded-xl flex items-center justify-between border border-maycast-border/40 hover:border-maycast-border/60 transition-all">
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <p className="text-sm text-maycast-text font-medium">
            {isValidStart ? startDate.toLocaleString('ja-JP') : 'Invalid Date'}
          </p>
          {session.isCompleted ? (
            <span className="flex items-center gap-1 px-2 py-1 bg-maycast-safe/20 text-maycast-safe text-xs font-semibold rounded-lg border border-maycast-safe/30">
              <CheckIcon className="w-3 h-3" />
              完了
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs font-semibold rounded-lg border border-yellow-500/30">
              <VideoCameraIcon className="w-3 h-3" />
              録画中
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-maycast-subtext">
          <span className="flex items-center gap-1">
            <ServerStackIcon className="w-3 h-3" />
            {session.totalChunks || 0} chunks
          </span>
          <span>{((session.totalSize || 0) / 1024 / 1024).toFixed(2)} MB</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onDownload(session.sessionId)}
          disabled={isDownloading}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            isDownloading
              ? 'bg-gray-600 cursor-not-allowed opacity-50'
              : 'bg-maycast-safe hover:bg-maycast-safe/80 shadow-lg cursor-pointer'
          }`}
          title="ダウンロード"
        >
          <ArrowDownTrayIcon className="w-5 h-5" />
        </button>
        <button
          onClick={() => onDelete(session.sessionId)}
          disabled={isDownloading}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            isDownloading
              ? 'bg-gray-600 cursor-not-allowed opacity-50'
              : 'bg-maycast-rec/20 hover:bg-maycast-rec/30 border border-maycast-rec/50 cursor-pointer'
          }`}
          title="削除"
        >
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
