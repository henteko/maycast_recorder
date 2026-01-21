import { ServerStackIcon, TrashIcon } from '@heroicons/react/24/solid';
import { SessionItem } from '../molecules/SessionItem';
import type { Recording, RecordingId } from '@maycast/common-types';

interface SessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordings: Recording[];
  onDownload: (recordingId: RecordingId) => void;
  onDelete: (recordingId: RecordingId) => void;
  onClearAll: () => void;
  isDownloading: boolean;
}

export const SessionsModal = ({
  isOpen,
  onClose,
  recordings,
  onDownload,
  onDelete,
  onClearAll,
  isDownloading,
}: SessionsModalProps) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-maycast-panel/95 backdrop-blur-xl border border-maycast-border/50 rounded-2xl p-8 max-w-3xl w-full mx-4 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ServerStackIcon className="w-7 h-7 text-maycast-primary" />
            <h2 className="text-2xl font-bold text-maycast-text">
              保存済み録画 <span className="text-maycast-primary">({recordings.length})</span>
            </h2>
          </div>
          {recordings.length > 0 && (
            <button
              onClick={onClearAll}
              className="px-4 py-2 bg-maycast-rec/20 hover:bg-maycast-rec/30 rounded-xl text-sm font-semibold transition-all border border-maycast-rec/50 flex items-center gap-2 text-white cursor-pointer"
            >
              <TrashIcon className="w-4 h-4" />
              すべて削除
            </button>
          )}
        </div>

        {recordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-maycast-subtext">
            <ServerStackIcon className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg">保存済み録画はありません</p>
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto pr-2">
            {recordings.map((recording) => (
              <SessionItem
                key={recording.id}
                recording={recording}
                onDownload={onDownload}
                onDelete={onDelete}
                isDownloading={isDownloading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
