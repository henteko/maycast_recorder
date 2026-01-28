/**
 * WebSocketRoomClient - Socket.IO クライアント
 *
 * Room単位のリアルタイム通信を管理
 * - Room状態変更の受信
 * - Guest参加/離脱の通知受信
 * - Recording作成の通知受信
 */

import { io, Socket } from 'socket.io-client';
import type {
  RoomStateChanged,
  RecordingCreated,
  GuestSyncState,
  GuestSyncStateChanged,
  GuestSyncComplete,
  GuestSyncError,
} from '@maycast/common-types';

/**
 * クライアントからサーバーへのイベント
 */
interface ClientToServerEvents {
  join_room: (data: { roomId: string; recordingId?: string; name?: string }) => void;
  leave_room: (data: { roomId: string }) => void;
  guest_sync_update: (data: {
    roomId: string;
    recordingId: string;
    syncState: GuestSyncState;
    uploadedChunks: number;
    totalChunks: number;
  }) => void;
  guest_sync_complete: (data: {
    roomId: string;
    recordingId: string;
    totalChunks: number;
  }) => void;
  guest_sync_error: (data: {
    roomId: string;
    recordingId: string;
    errorMessage: string;
    failedChunks: number;
  }) => void;
}

/**
 * サーバーからクライアントへのイベント
 */
interface ServerToClientEvents {
  room_state_changed: (data: RoomStateChanged) => void;
  recording_created: (data: RecordingCreated) => void;
  guest_joined: (data: { roomId: string; guestCount: number; recordingId?: string; name?: string }) => void;
  guest_left: (data: { roomId: string; guestCount: number; recordingId?: string; name?: string }) => void;
  guest_sync_state_changed: (data: GuestSyncStateChanged) => void;
  guest_sync_complete: (data: GuestSyncComplete) => void;
  guest_sync_error: (data: GuestSyncError) => void;
  error: (data: { message: string }) => void;
}

/**
 * イベントリスナー
 */
export interface RoomEventListeners {
  onRoomStateChanged?: (data: RoomStateChanged) => void;
  onRecordingCreated?: (data: RecordingCreated) => void;
  onGuestJoined?: (data: { roomId: string; guestCount: number; recordingId?: string; name?: string }) => void;
  onGuestLeft?: (data: { roomId: string; guestCount: number; recordingId?: string; name?: string }) => void;
  onGuestSyncStateChanged?: (data: GuestSyncStateChanged) => void;
  onGuestSyncComplete?: (data: GuestSyncComplete) => void;
  onGuestSyncError?: (data: GuestSyncError) => void;
  onError?: (data: { message: string }) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * WebSocket Room Client
 */
export class WebSocketRoomClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private serverUrl: string;
  private currentRoomId: string | null = null;
  private currentRecordingId: string | null = null;
  private currentName: string | null = null;
  private listeners: RoomEventListeners = {};
  private isConnected = false;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  /**
   * WebSocket接続を開始
   */
  connect(listeners: RoomEventListeners = {}): void {
    if (this.socket) {
      console.log('⚠️ [WebSocketRoomClient] Already connected');
      return;
    }

    this.listeners = listeners;

    console.log(`🔌 [WebSocketRoomClient] Connecting to ${this.serverUrl}`);
    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.setupEventHandlers();
  }

  /**
   * イベントハンドラーの設定
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ [WebSocketRoomClient] Connected');
      this.isConnected = true;
      this.listeners.onConnect?.();

      // 再接続時にRoomに再参加
      if (this.currentRoomId) {
        this.joinRoom(this.currentRoomId, this.currentRecordingId ?? undefined, this.currentName ?? undefined);
      }
    });

    this.socket.on('disconnect', () => {
      console.log('🔌 [WebSocketRoomClient] Disconnected');
      this.isConnected = false;
      this.listeners.onDisconnect?.();
    });

    this.socket.on('room_state_changed', (data) => {
      console.log('📡 [WebSocketRoomClient] room_state_changed:', data);
      this.listeners.onRoomStateChanged?.(data);
    });

    this.socket.on('recording_created', (data) => {
      console.log('📡 [WebSocketRoomClient] recording_created:', data);
      this.listeners.onRecordingCreated?.(data);
    });

    this.socket.on('guest_joined', (data) => {
      console.log('📡 [WebSocketRoomClient] guest_joined:', data);
      this.listeners.onGuestJoined?.(data);
    });

    this.socket.on('guest_left', (data) => {
      console.log('📡 [WebSocketRoomClient] guest_left:', data);
      this.listeners.onGuestLeft?.(data);
    });

    this.socket.on('error', (data) => {
      console.error('❌ [WebSocketRoomClient] error:', data);
      this.listeners.onError?.(data);
    });

    this.socket.on('guest_sync_state_changed', (data) => {
      console.log('📡 [WebSocketRoomClient] guest_sync_state_changed:', data);
      this.listeners.onGuestSyncStateChanged?.(data);
    });

    this.socket.on('guest_sync_complete', (data) => {
      console.log('📡 [WebSocketRoomClient] guest_sync_complete:', data);
      this.listeners.onGuestSyncComplete?.(data);
    });

    this.socket.on('guest_sync_error', (data) => {
      console.log('📡 [WebSocketRoomClient] guest_sync_error:', data);
      this.listeners.onGuestSyncError?.(data);
    });
  }

  /**
   * Roomに参加
   * @param roomId Room ID
   * @param recordingId Recording ID（Guest参加時のみ）
   * @param name Guest名（任意）
   */
  joinRoom(roomId: string, recordingId?: string, name?: string): void {
    if (!this.socket) {
      console.warn('⚠️ [WebSocketRoomClient] Not connected, cannot join room');
      return;
    }

    console.log(`📥 [WebSocketRoomClient] Joining room: ${roomId}${recordingId ? ` (recording: ${recordingId})` : ''}${name ? ` (name: ${name})` : ''}`);
    this.currentRoomId = roomId;
    this.currentRecordingId = recordingId ?? null;
    this.currentName = name ?? null;
    this.socket.emit('join_room', { roomId, recordingId, name });
  }

  /**
   * Roomから離脱
   */
  leaveRoom(roomId: string): void {
    if (!this.socket) {
      return;
    }

    console.log(`📤 [WebSocketRoomClient] Leaving room: ${roomId}`);
    this.socket.emit('leave_room', { roomId });

    if (this.currentRoomId === roomId) {
      this.currentRoomId = null;
      this.currentRecordingId = null;
      this.currentName = null;
    }
  }

  /**
   * Guest同期状態を更新
   */
  emitGuestSyncUpdate(
    roomId: string,
    recordingId: string,
    syncState: GuestSyncState,
    uploadedChunks: number,
    totalChunks: number
  ): void {
    if (!this.socket) {
      console.warn('⚠️ [WebSocketRoomClient] Not connected, cannot emit guest_sync_update');
      return;
    }

    console.log(`📤 [WebSocketRoomClient] guest_sync_update: state=${syncState}, ${uploadedChunks}/${totalChunks}`);
    this.socket.emit('guest_sync_update', {
      roomId,
      recordingId,
      syncState,
      uploadedChunks,
      totalChunks,
    });
  }

  /**
   * Guest同期完了を通知
   */
  emitGuestSyncComplete(roomId: string, recordingId: string, totalChunks: number): void {
    if (!this.socket) {
      console.warn('⚠️ [WebSocketRoomClient] Not connected, cannot emit guest_sync_complete');
      return;
    }

    console.log(`📤 [WebSocketRoomClient] guest_sync_complete: chunks=${totalChunks}`);
    this.socket.emit('guest_sync_complete', { roomId, recordingId, totalChunks });
  }

  /**
   * Guest同期エラーを通知
   */
  emitGuestSyncError(
    roomId: string,
    recordingId: string,
    errorMessage: string,
    failedChunks: number
  ): void {
    if (!this.socket) {
      console.warn('⚠️ [WebSocketRoomClient] Not connected, cannot emit guest_sync_error');
      return;
    }

    console.log(`📤 [WebSocketRoomClient] guest_sync_error: error=${errorMessage}, failed=${failedChunks}`);
    this.socket.emit('guest_sync_error', { roomId, recordingId, errorMessage, failedChunks });
  }

  /**
   * WebSocket接続を切断
   */
  disconnect(): void {
    if (this.socket) {
      console.log('🔌 [WebSocketRoomClient] Disconnecting');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.currentRoomId = null;
      this.currentRecordingId = null;
      this.currentName = null;
    }
  }

  /**
   * 接続状態を取得
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * 現在のRoom IDを取得
   */
  getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }

  /**
   * 現在のRecording IDを取得
   */
  getCurrentRecordingId(): string | null {
    return this.currentRecordingId;
  }

  /**
   * 現在のGuest名を取得
   */
  getCurrentName(): string | null {
    return this.currentName;
  }
}

// シングルトンインスタンス
let instance: WebSocketRoomClient | null = null;

export function getWebSocketRoomClient(serverUrl: string): WebSocketRoomClient {
  if (!instance) {
    instance = new WebSocketRoomClient(serverUrl);
  }
  return instance;
}

export function resetWebSocketRoomClient(): void {
  if (instance) {
    instance.disconnect();
    instance = null;
  }
}
