import { PlayIcon, ArrowDownTrayIcon, TrashIcon, ArrowPathIcon, CheckIcon, ServerStackIcon } from '@heroicons/react/24/solid'
import { Button } from '../atoms/Button'
import { ProgressBar } from '../atoms/ProgressBar'

type ScreenState = 'standby' | 'recording' | 'completed'

interface ControlPanelProps {
  screenState: ScreenState
  savedChunks: number
  downloadProgress: {
    isDownloading: boolean
    current: number
    total: number
  }
  onDownload: () => void
  onNewRecording: () => void
  onDiscard: () => void
}

export const ControlPanel = ({
  screenState,
  savedChunks,
  downloadProgress,
  onDownload,
  onNewRecording,
  onDiscard,
}: ControlPanelProps) => {
  return (
    <div className="space-y-5 mb-8">
      {/* Recording Status Message */}
      {screenState === 'recording' && (
        <div className="bg-maycast-safe/30 backdrop-blur-md border border-maycast-safe/50 p-5 rounded-2xl shadow-xl">
          <div className="flex items-center justify-center gap-3">
            <div className="relative">
              <div className="w-4 h-4 bg-maycast-safe rounded-full animate-pulse" />
              <div className="absolute inset-0 w-4 h-4 bg-maycast-safe rounded-full animate-ping opacity-75" />
            </div>
            <ServerStackIcon className="w-6 h-6 text-maycast-safe/80" />
            <p className="text-white font-semibold text-lg">ローカルに保存中 (OPFS) - {savedChunks} chunks</p>
          </div>
        </div>
      )}

      {/* Completed Screen */}
      {screenState === 'completed' && savedChunks > 0 && (
        <div className="space-y-5">
          <div className="bg-maycast-safe/30 backdrop-blur-md p-6 rounded-2xl border border-maycast-safe/50 shadow-xl">
            <div className="flex items-center justify-center gap-3">
              <div className="p-2 bg-maycast-safe/20 rounded-full">
                <CheckIcon className="w-6 h-6 text-maycast-safe" />
              </div>
              <p className="text-center text-white font-semibold text-lg">
                録画が完了しました！{savedChunks}個のチャンクがOPFSに保存されています。
              </p>
            </div>
          </div>

          <button
            onClick={onDownload}
            disabled={downloadProgress.isDownloading}
            className={`w-full py-5 px-8 rounded-2xl font-bold text-xl transition-all shadow-2xl transform hover:scale-[1.02] flex items-center justify-center gap-3 ${
              downloadProgress.isDownloading
                ? 'bg-gray-600 cursor-not-allowed opacity-50'
                : 'bg-maycast-safe hover:bg-maycast-safe/80 cursor-pointer'
            }`}
          >
            {downloadProgress.isDownloading ? (
              <>
                <ArrowPathIcon className="w-6 h-6 animate-spin" />
                ダウンロード中... {downloadProgress.current}/{downloadProgress.total}
              </>
            ) : (
              <>
                <ArrowDownTrayIcon className="w-6 h-6" />
                MP4をダウンロード
              </>
            )}
          </button>

          {downloadProgress.isDownloading && (
            <ProgressBar current={downloadProgress.current} total={downloadProgress.total} />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Button onClick={onNewRecording} variant="primary" size="md">
              <PlayIcon className="w-5 h-5" />
              新しい録画
            </Button>
            <Button onClick={onDiscard} variant="danger" size="md">
              <TrashIcon className="w-5 h-5" />
              破棄
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
