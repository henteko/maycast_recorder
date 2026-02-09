import { PlayIcon, ArrowDownTrayIcon, TrashIcon, ArrowPathIcon, CheckIcon } from '@heroicons/react/24/solid'
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
      {/* Completed Screen */}
      {screenState === 'completed' && savedChunks > 0 && (
        <div className="space-y-5">
          <div className="bg-maycast-safe/30 backdrop-blur-md p-6 rounded-2xl border border-maycast-safe/50 shadow-xl">
            <div className="flex items-center justify-center gap-3">
              <div className="p-2 bg-maycast-safe/20 rounded-full">
                <CheckIcon className="w-6 h-6 text-maycast-safe" />
              </div>
              <p className="text-center text-white font-semibold text-lg">
                Recording complete! {savedChunks} chunks saved to OPFS.
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
                Downloading... {downloadProgress.current}/{downloadProgress.total}
              </>
            ) : (
              <>
                <ArrowDownTrayIcon className="w-6 h-6" />
                Download MP4
              </>
            )}
          </button>

          {downloadProgress.isDownloading && (
            <ProgressBar current={downloadProgress.current} total={downloadProgress.total} />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Button onClick={onNewRecording} variant="primary" size="md">
              <PlayIcon className="w-5 h-5" />
              New Recording
            </Button>
            <Button onClick={onDiscard} variant="danger" size="md">
              <TrashIcon className="w-5 h-5" />
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
