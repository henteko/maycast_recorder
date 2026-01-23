import { useState, useEffect } from 'react';
import { RecordingManager } from './RecordingManager';
import { getServerUrl, setServerUrl, getDefaultServerUrl } from './serverConfig';

export const RemoteRecorder: React.FC = () => {
  const [serverUrl, setServerUrlState] = useState(getServerUrl());
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [recordingManager, setRecordingManager] = useState<RecordingManager | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRecordingManager(new RecordingManager(serverUrl));
  }, [serverUrl]);

  const handleServerUrlChange = (newUrl: string) => {
    setServerUrlState(newUrl);
    setServerUrl(newUrl);
    setIsConnected(false);
  };

  const handleCheckConnection = async () => {
    if (!recordingManager) return;

    setIsChecking(true);
    setError(null);

    try {
      const connected = await recordingManager.checkServerConnection();
      setIsConnected(connected);
      if (!connected) {
        setError('Failed to connect to server');
      }
    } catch (err) {
      setIsConnected(false);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsChecking(false);
    }
  };

  const handleCreateRecording = async () => {
    if (!recordingManager) return;

    setError(null);

    try {
      const id = await recordingManager.createRecording();
      setRecordingId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create recording');
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Remote Mode</h1>

      {/* Server Configuration */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Server Configuration</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Server URL
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => handleServerUrlChange(e.target.value)}
              placeholder="http://localhost:3000"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => handleServerUrlChange(getDefaultServerUrl())}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleCheckConnection}
            disabled={isChecking}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isChecking ? 'Checking...' : 'Check Connection'}
          </button>

          {isConnected && (
            <div className="flex items-center gap-2 text-green-600">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="font-medium">Connected</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-600">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Recording Controls */}
      {isConnected && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Recording</h2>

          {!recordingId ? (
            <button
              onClick={handleCreateRecording}
              className="px-6 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 font-semibold"
            >
              Create Recording
            </button>
          ) : (
            <div>
              <div className="mb-4 p-4 bg-gray-100 rounded-md">
                <p className="text-sm text-gray-600 mb-1">Recording ID</p>
                <p className="font-mono text-sm">{recordingId}</p>
              </div>

              <div className="text-sm text-gray-600">
                <p>✅ Recording created successfully!</p>
                <p className="mt-2">
                  Next steps: Implement actual recording with chunk upload
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Phase 2A-5 TODO */}
      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <h3 className="font-semibold mb-2">Phase 2A-5 Implementation Progress</h3>
        <ul className="text-sm space-y-1">
          <li>✅ Server URL configuration</li>
          <li>✅ Server connection check</li>
          <li>✅ Recording creation</li>
          <li>⏳ Recording state management</li>
          <li>⏳ Chunk upload integration</li>
          <li>⏳ WebCodecs recording engine</li>
          <li>⏳ Error handling and retry</li>
        </ul>
      </div>
    </div>
  );
};
