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
  RoomState,
  RoomStateChanged,
  RecordingCreated,
} from '@maycast/common-types';

/**
 * クライアントからサーバーへのイベント
 */
interface ClientToServerEvents {
  join_room: (data: { roomId: string }) => void;
  leave_room: (data: { roomId: string }) => void;
}

/**
 * サーバーからクライアントへのイベント
 */
interface ServerToClientEvents {
  room_state_changed: (data: RoomStateChanged) => void;
  recording_created: (data: RecordingCreated) => void;
  guest_joined: (data: { roomId: string; guestCount: number }) => void;
  guest_left: (data: { roomId: string; guestCount: number }) => void;
  error: (data: { message: string }) => void;
}

/**
 * イベントリスナー
 */
export interface RoomEventListeners {
  onRoomStateChanged?: (data: RoomStateChanged) => void;
  onRecordingCreated?: (data: RecordingCreated) => void;
  onGuestJoined?: (data: { roomId: string; guestCount: number }) => void;
  onGuestLeft?: (data: { roomId: string; guestCount: number }) => void;
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
        this.joinRoom(this.currentRoomId);
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
  }

  /**
   * Roomに参加
   */
  joinRoom(roomId: string): void {
    if (!this.socket) {
      console.warn('⚠️ [WebSocketRoomClient] Not connected, cannot join room');
      return;
    }

    console.log(`📥 [WebSocketRoomClient] Joining room: ${roomId}`);
    this.currentRoomId = roomId;
    this.socket.emit('join_room', { roomId });
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
    }
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
