import { ArrowPathIcon, CheckIcon, TrashIcon } from '@heroicons/react/24/solid'
import type { SessionMetadata } from '../../storage/types'

interface RecoveryModalProps {
  isOpen: boolean
  onClose: () => void
  session: SessionMetadata | null
  onRecover: () => void
  onDiscard: () => void
  formatElapsedTime: (seconds: number) => string
}

export const RecoveryModal = ({
  isOpen,
  onClose,
  session,
  onRecover,
  onDiscard,
  formatElapsedTime,
}: RecoveryModalProps) => {
  if (!isOpen || !session) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-maycast-panel/95 backdrop-blur-xl border border-maycast-border/50 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <ArrowPathIcon className="w-7 h-7 text-maycast-primary" />
          <h2 className="text-2xl font-bold text-maycast-text">セッションの復元</h2>
        </div>
        <p className="text-maycast-subtext mb-6">
          前回の収録が正常に完了していません。復元しますか？
        </p>

        <div className="bg-white p-4 rounded-xl mb-6 border-2 border-maycast-border">
          <p className="text-sm text-gray-600 font-semibold mb-2">セッション情報</p>
          <p className="text-lg text-gray-900 font-bold mt-2">
            {new Date(session.startTime).toLocaleString('ja-JP')}
          </p>
          <p className="text-sm text-gray-700 mt-2">
            チャンク数: {session.totalChunks} / サイズ: {(session.totalSize / 1024 / 1024).toFixed(2)} MB
          </p>
          {session.endTime && (
            <p className="text-sm text-gray-700 mt-1">
              録画時間: {formatElapsedTime(Math.floor((session.endTime - session.startTime) / 1000))}
            </p>
          )}
        </div>

        <div className="flex gap-4">
          <button
            onClick={onRecover}
            className="flex-1 py-3 px-6 bg-maycast-primary hover:bg-maycast-primary/80 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 text-white cursor-pointer"
          >
            <CheckIcon className="w-5 h-5" />
            復元する
          </button>
          <button
            onClick={onDiscard}
            className="flex-1 py-3 px-6 bg-white hover:bg-gray-100 rounded-xl font-bold transition-all border-2 border-maycast-rec flex items-center justify-center gap-2 text-gray-900 cursor-pointer"
          >
            <TrashIcon className="w-5 h-5" />
            破棄する
          </button>
        </div>
      </div>
    </div>
  )
}
