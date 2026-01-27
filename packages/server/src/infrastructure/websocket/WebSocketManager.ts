/**
 * WebSocketManager - Socket.IO サーバー管理
 *
 * Room単位のリアルタイム通信を管理
 * - Room状態変更の配信
 * - Guest参加/離脱の通知
 * - Recording作成の通知
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type {
  RoomId,
  RoomState,
  RecordingId,
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
 * WebSocket Manager
 */
export class WebSocketManager {
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;
  private roomGuestCounts: Map<string, number> = new Map();

  /**
   * Socket.IOサーバーを初期化
   */
  initialize(httpServer: HTTPServer, corsOrigin: string): void {
    this.io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
      cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.io.on('connection', (socket) => {
      console.log(`🔌 [WebSocket] Client connected: ${socket.id}`);

      this.handleConnection(socket);
    });

    console.log('✅ [WebSocket] WebSocketManager initialized');
  }

  /**
   * 新しいクライアント接続を処理
   */
  private handleConnection(socket: Socket<ClientToServerEvents, ServerToClientEvents>): void {
    // Room参加
    socket.on('join_room', ({ roomId }) => {
      console.log(`📥 [WebSocket] Client ${socket.id} joining room: ${roomId}`);
      socket.join(`room:${roomId}`);

      // Guest数をカウント
      const currentCount = this.roomGuestCounts.get(roomId) || 0;
      this.roomGuestCounts.set(roomId, currentCount + 1);

      // 他のクライアントに通知
      this.io?.to(`room:${roomId}`).emit('guest_joined', {
        roomId,
        guestCount: currentCount + 1,
      });
    });

    // Room離脱
    socket.on('leave_room', ({ roomId }) => {
      console.log(`📤 [WebSocket] Client ${socket.id} leaving room: ${roomId}`);
      socket.leave(`room:${roomId}`);

      // Guest数を更新
      const currentCount = this.roomGuestCounts.get(roomId) || 1;
      const newCount = Math.max(0, currentCount - 1);
      if (newCount === 0) {
        this.roomGuestCounts.delete(roomId);
      } else {
        this.roomGuestCounts.set(roomId, newCount);
      }

      // 他のクライアントに通知
      this.io?.to(`room:${roomId}`).emit('guest_left', {
        roomId,
        guestCount: newCount,
      });
    });

    // 切断時
    socket.on('disconnect', () => {
      console.log(`🔌 [WebSocket] Client disconnected: ${socket.id}`);
      // Note: Socket.IOは自動的にroomから削除するが、
      // Guest数の追跡のため、どのroomに参加していたか追跡する必要がある場合は別途実装
    });
  }

  /**
   * Room状態変更を配信
   */
  emitRoomStateChanged(roomId: RoomId, state: RoomState): void {
    if (!this.io) {
      console.warn('⚠️ [WebSocket] Not initialized, cannot emit room_state_changed');
      return;
    }

    const message: RoomStateChanged = {
      type: 'room_state_changed',
      roomId,
      state,
      timestamp: new Date().toISOString(),
    };

    console.log(`📡 [WebSocket] Emitting room_state_changed to room:${roomId}`, message);
    this.io.to(`room:${roomId}`).emit('room_state_changed', message);
  }

  /**
   * Recording作成を配信
   */
  emitRecordingCreated(roomId: RoomId, recordingId: RecordingId): void {
    if (!this.io) {
      console.warn('⚠️ [WebSocket] Not initialized, cannot emit recording_created');
      return;
    }

    const message: RecordingCreated = {
      type: 'recording_created',
      roomId,
      recordingId,
      createdAt: new Date().toISOString(),
    };

    console.log(`📡 [WebSocket] Emitting recording_created to room:${roomId}`, message);
    this.io.to(`room:${roomId}`).emit('recording_created', message);
  }

  /**
   * 特定のRoomのGuest数を取得
   */
  getRoomGuestCount(roomId: string): number {
    return this.roomGuestCounts.get(roomId) || 0;
  }

  /**
   * WebSocketサーバーを取得
   */
  getIO(): SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null {
    return this.io;
  }
}

// シングルトンインスタンス
let instance: WebSocketManager | null = null;

export function getWebSocketManager(): WebSocketManager {
  if (!instance) {
    instance = new WebSocketManager();
  }
  return instance;
}
