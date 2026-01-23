import React, { useState } from 'react';
import { ServerIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import { getServerUrl, setServerUrl, getDefaultServerUrl } from '../../modes/remote/serverConfig';
import { RecordingAPIClient } from '../../api/recording-api';

export const ServerUrlSettings: React.FC = () => {
  const [url, setUrl] = useState(getServerUrl());
  const [isChecking, setIsChecking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connected' | 'disconnected'>('idle');

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    setConnectionStatus('idle');
  };

  const handleSave = () => {
    setServerUrl(url);
    setConnectionStatus('idle');
  };

  const handleReset = () => {
    const defaultUrl = getDefaultServerUrl();
    setUrl(defaultUrl);
    setServerUrl(defaultUrl);
    setConnectionStatus('idle');
  };

  const handleCheckConnection = async () => {
    setIsChecking(true);
    try {
      const client = new RecordingAPIClient(url);
      const isConnected = await client.checkHealth();
      setConnectionStatus(isConnected ? 'connected' : 'disconnected');
    } catch (err) {
      console.error('Connection check failed:', err);
      setConnectionStatus('disconnected');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ServerIcon className="w-5 h-5 text-maycast-primary" />
        <label className="text-sm font-semibold text-maycast-text">
          サーバーURL (Remote Mode用)
        </label>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="http://localhost:3000"
          className="flex-1 px-4 py-2 bg-maycast-bg/50 border border-maycast-border/40 rounded-xl text-maycast-text placeholder-maycast-text/40 focus:outline-none focus:border-maycast-primary transition-colors"
        />
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-maycast-primary/20 hover:bg-maycast-primary/30 text-maycast-primary rounded-xl font-medium transition-colors"
        >
          保存
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2 bg-maycast-panel/30 hover:bg-maycast-panel/50 text-maycast-text/70 rounded-xl font-medium transition-colors"
        >
          リセット
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleCheckConnection}
          disabled={isChecking}
          className="px-5 py-2 bg-maycast-safe/20 hover:bg-maycast-safe/30 text-maycast-safe rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isChecking ? '接続確認中...' : '接続テスト'}
        </button>

        {connectionStatus === 'connected' && (
          <div className="flex items-center gap-2 text-maycast-safe">
            <CheckCircleIcon className="w-5 h-5" />
            <span className="text-sm font-medium">接続成功</span>
          </div>
        )}

        {connectionStatus === 'disconnected' && (
          <div className="flex items-center gap-2 text-maycast-rec">
            <XCircleIcon className="w-5 h-5" />
            <span className="text-sm font-medium">接続失敗</span>
          </div>
        )}
      </div>

      <p className="text-xs text-maycast-text/50">
        Remote Modeで録画データをサーバーにアップロードする際のサーバーURLを設定します。
      </p>
    </div>
  );
};
