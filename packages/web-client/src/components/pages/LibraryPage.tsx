import React from 'react';
import { ServerStackIcon, TrashIcon } from '@heroicons/react/24/solid';
import { SessionItem } from '../molecules/SessionItem';
import type { SessionMetadata } from '../../storage/types';

interface LibraryPageProps {
  sessions: SessionMetadata[];
  onDownload: (sessionId: string) => Promise<void>;
  onDelete: (sessionId: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  isDownloading: boolean;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({
  sessions,
  onDownload,
  onDelete,
  onClearAll,
  isDownloading,
}) => {
  return (
    <div className="flex flex-col h-full bg-maycast-bg text-maycast-text">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-maycast-border">
        <div className="flex items-center gap-3">
          <ServerStackIcon className="w-7 h-7 text-maycast-primary" />
          <h1 className="text-2xl font-bold text-maycast-text">
            保存済みセッション <span className="text-maycast-primary">({sessions.length})</span>
          </h1>
        </div>
        {sessions.length > 0 && (
          <button
            onClick={onClearAll}
            className="px-4 py-2 bg-maycast-rec/20 hover:bg-maycast-rec/30 rounded-xl text-sm font-semibold transition-all border border-maycast-rec/50 flex items-center gap-2 text-white cursor-pointer shadow-lg"
          >
            <TrashIcon className="w-4 h-4" />
            すべて削除
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="bg-maycast-panel/30 backdrop-blur-md p-12 rounded-2xl border border-maycast-border/40 shadow-xl">
              <div className="flex flex-col items-center text-maycast-subtext">
                <ServerStackIcon className="w-20 h-20 mb-4 opacity-50" />
                <p className="text-lg font-medium">保存済みセッションはありません</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {sessions.map((session) => (
              <SessionItem
                key={session.sessionId}
                session={session}
                onDownload={onDownload}
                onDelete={onDelete}
                isDownloading={isDownloading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
