import { ArrowPathIcon, CheckIcon, TrashIcon, CloudArrowUpIcon, XMarkIcon } from '@heroicons/react/24/solid';
import type { Recording } from '@maycast/common-types';
import type { UnfinishedRecording } from '../../../infrastructure/upload/resume-upload';
import type { UploadProgress } from '../../../infrastructure/upload/types';

interface RecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  recording: Recording | null;
  onRecover: () => void;
  onDiscard: () => void;
  formatElapsedTime: (seconds: number) => string;
}

export const RecoveryModal = ({
  isOpen,
  onClose,
  recording,
  onRecover,
  onDiscard,
  formatElapsedTime,
}: RecoveryModalProps) => {
  if (!isOpen || !recording) return null

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
            {new Date(recording.startTime).toLocaleString('ja-JP')}
          </p>
          <p className="text-sm text-gray-700 mt-2">
            チャンク数: {recording.chunkCount} / サイズ: {(recording.totalSize / 1024 / 1024).toFixed(2)} MB
          </p>
          {recording.endTime && (
            <p className="text-sm text-gray-700 mt-1">
              録画時間: {formatElapsedTime(Math.floor((recording.endTime - recording.startTime) / 1000))}
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

/**
 * Resume Upload用のRecoveryModal
 * 複数のUnfinished Recordingに対応し、進捗表示機能を持つ
 */
interface ResumeUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  unfinishedRecordings: UnfinishedRecording[];
  onResumeAll: () => void;
  onSkip: () => void;
  uploadProgress: Map<string, UploadProgress>;
  isUploading: boolean;
  formatElapsedTime: (seconds: number) => string;
}

export const ResumeUploadModal = ({
  isOpen,
  onClose,
  unfinishedRecordings,
  onResumeAll,
  onSkip,
  uploadProgress,
  isUploading,
  formatElapsedTime,
}: ResumeUploadModalProps) => {
  if (!isOpen || unfinishedRecordings.length === 0) return null;

  // 全体の進捗を計算
  const totalProgress = Array.from(uploadProgress.values()).reduce(
    (acc, progress) => ({
      uploaded: acc.uploaded + progress.uploaded,
      total: acc.total + progress.total,
      pending: acc.pending + progress.pending,
      uploading: acc.uploading + progress.uploading,
      failed: acc.failed + progress.failed,
    }),
    { uploaded: 0, total: 0, pending: 0, uploading: 0, failed: 0 }
  );

  const progressPercent = totalProgress.total > 0
    ? Math.round((totalProgress.uploaded / totalProgress.total) * 100)
    : 0;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
      onClick={isUploading ? undefined : onClose}
    >
      <div
        className="bg-maycast-panel/95 backdrop-blur-xl border border-maycast-border/50 rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <CloudArrowUpIcon className="w-7 h-7 text-maycast-primary" />
            <h2 className="text-2xl font-bold text-maycast-text">
              {isUploading ? 'アップロード中...' : '未送信の録画を検出'}
            </h2>
          </div>
          {!isUploading && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          )}
        </div>

        <p className="text-maycast-subtext mb-6">
          {isUploading
            ? 'サーバーへのアップロードを実行しています。完了するまでお待ちください。'
            : `${unfinishedRecordings.length}件の録画データがサーバーに同期されていません。再アップロードしますか？`}
        </p>

        {/* 録画リスト */}
        <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
          {unfinishedRecordings.map((unfinished) => {
            const { recording, pendingChunks, initSegmentUploaded, missingChunkIds } = unfinished;
            const progress = uploadProgress.get(recording.id);
            const itemProgress = progress
              ? Math.round((progress.uploaded / progress.total) * 100)
              : 0;

            // 未送信チャンク数（pendingChunks + missingChunkIds）
            const pendingChunkCount = pendingChunks.length + missingChunkIds.length;

            return (
              <div
                key={recording.id}
                className="bg-white p-4 rounded-xl border-2 border-maycast-border"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm text-gray-600 font-semibold">
                      {new Date(recording.startTime).toLocaleString('ja-JP')}
                    </p>
                    {recording.endTime && (
                      <p className="text-xs text-gray-500 mt-1">
                        録画時間: {formatElapsedTime(Math.floor((recording.endTime - recording.startTime) / 1000))}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-700">
                      {(recording.totalSize / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                {/* 未送信情報 */}
                <div className="text-xs text-orange-600 mt-2">
                  {!initSegmentUploaded && <span className="mr-2">Init未送信</span>}
                  {pendingChunkCount > 0 && (
                    <span>{pendingChunkCount} チャンク未送信</span>
                  )}
                </div>

                {/* 進捗バー（アップロード中のみ） */}
                {isUploading && progress && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>アップロード中</span>
                      <span>{progress.uploaded} / {progress.total}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-maycast-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${itemProgress}%` }}
                      />
                    </div>
                    {progress.failed > 0 && (
                      <p className="text-xs text-red-500 mt-1">
                        {progress.failed} チャンク失敗
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 全体進捗（アップロード中かつ複数録画がある場合のみ） */}
        {isUploading && totalProgress.total > 0 && unfinishedRecordings.length > 1 && (
          <div className="mb-6 p-4 bg-gray-50 rounded-xl">
            <div className="flex justify-between text-sm text-gray-700 mb-2">
              <span>全体の進捗</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-maycast-primary h-3 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>完了: {totalProgress.uploaded}</span>
              <span>残り: {totalProgress.pending + totalProgress.uploading}</span>
              {totalProgress.failed > 0 && (
                <span className="text-red-500">失敗: {totalProgress.failed}</span>
              )}
            </div>
          </div>
        )}

        {/* ボタン */}
        <div className="flex gap-4">
          {isUploading ? (
            <div className="flex-1 py-3 px-6 bg-gray-300 rounded-xl font-bold flex items-center justify-center gap-2 text-gray-600 cursor-not-allowed">
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              アップロード中...
            </div>
          ) : (
            <>
              <button
                onClick={onResumeAll}
                className="flex-1 py-3 px-6 bg-maycast-primary hover:bg-maycast-primary/80 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 text-white cursor-pointer"
              >
                <CloudArrowUpIcon className="w-5 h-5" />
                再開する
              </button>
              <button
                onClick={onSkip}
                className="flex-1 py-3 px-6 bg-white hover:bg-gray-100 rounded-xl font-bold transition-all border-2 border-gray-300 flex items-center justify-center gap-2 text-gray-700 cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
                スキップ
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
