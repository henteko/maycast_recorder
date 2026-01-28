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
  GuestMediaStatus,
  GuestSyncStateChanged,
  GuestSyncComplete,
  GuestSyncError,
} from '@maycast/common-types';

/**
 * クライアントからサーバーへのイベント
 */
interface ClientToServerEvents {
  join_room: (data: { roomId: string; name?: string }) => void;
  leave_room: (data: { roomId: string }) => void;
  set_recording_id: (data: { roomId: string; recordingId: string }) => void;
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
  guest_media_status_update: (data: {
    roomId: string;
    mediaStatus: GuestMediaStatus;
  }) => void;
}

/**
 * サーバーからクライアントへのイベント
 */
interface ServerToClientEvents {
  room_state_changed: (data: RoomStateChanged) => void;
  recording_created: (data: RecordingCreated) => void;
  guest_joined: (data: { roomId: string; guestCount: number; guestId: string; recordingId?: string; name?: string }) => void;
  guest_left: (data: { roomId: string; guestCount: number; guestId: string; recordingId?: string; name?: string }) => void;
  guest_recording_linked: (data: { roomId: string; guestId: string; recordingId: string; name?: string }) => void;
  guest_media_status_changed: (data: { roomId: string; guestId: string; mediaStatus: GuestMediaStatus }) => void;
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
  onGuestJoined?: (data: { roomId: string; guestCount: number; guestId: string; recordingId?: string; name?: string }) => void;
  onGuestLeft?: (data: { roomId: string; guestCount: number; guestId: string; recordingId?: string; name?: string }) => void;
  onGuestRecordingLinked?: (data: { roomId: string; guestId: string; recordingId: string; name?: string }) => void;
  onGuestMediaStatusChanged?: (data: { roomId: string; guestId: string; mediaStatus: GuestMediaStatus }) => void;
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
    // 常にリスナーを更新（既に接続済みでも新しいリスナーを適用）
    this.listeners = listeners;

    if (this.socket) {
      console.log('⚠️ [WebSocketRoomClient] Already connected, updating listeners');
      return;
    }

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
        this.joinRoom(this.currentRoomId, this.currentName ?? undefined);
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

    this.socket.on('guest_recording_linked', (data) => {
      console.log('📡 [WebSocketRoomClient] guest_recording_linked:', data);
      this.listeners.onGuestRecordingLinked?.(data);
    });

    this.socket.on('guest_media_status_changed', (data) => {
      console.log('📡 [WebSocketRoomClient] guest_media_status_changed:', data);
      this.listeners.onGuestMediaStatusChanged?.(data);
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
   * @param name Guest名（任意、指定するとゲストとして追跡される）
   */
  joinRoom(roomId: string, name?: string): void {
    if (!this.socket) {
      console.warn('⚠️ [WebSocketRoomClient] Not connected, cannot join room');
      return;
    }

    console.log(`📥 [WebSocketRoomClient] Joining room: ${roomId}${name ? ` (name: ${name})` : ''}`);
    this.currentRoomId = roomId;
    this.currentName = name ?? null;
    this.socket.emit('join_room', { roomId, name });
  }

  /**
   * Recording IDを設定（録画開始後にguestIdとrecordingIdを紐付け）
   * @param roomId Room ID
   * @param recordingId Recording ID
   */
  setRecordingId(roomId: string, recordingId: string): void {
    if (!this.socket) {
      console.warn('⚠️ [WebSocketRoomClient] Not connected, cannot set recording ID');
      return;
    }

    console.log(`🔗 [WebSocketRoomClient] Setting recording ID: ${recordingId} for room: ${roomId}`);
    this.socket.emit('set_recording_id', { roomId, recordingId });
  }

  /**
   * メディアステータスを更新
   * @param roomId Room ID
   * @param mediaStatus メディアステータス
   */
  emitMediaStatusUpdate(roomId: string, mediaStatus: GuestMediaStatus): void {
    if (!this.socket) {
      console.warn('⚠️ [WebSocketRoomClient] Not connected, cannot emit media status update');
      return;
    }

    this.socket.emit('guest_media_status_update', { roomId, mediaStatus });
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
