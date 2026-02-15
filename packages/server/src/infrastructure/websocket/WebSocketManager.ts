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
  GuestSyncState,
  GuestMediaStatus,
  RoomStateChanged,
  RecordingCreated,
  GuestSyncStateChanged,
  GuestSyncComplete,
  GuestSyncError,
} from '@maycast/common-types';

/**
 * Guest情報（サーバー側追跡用）
 */
interface GuestTrackingInfo {
  /** Guest ID（クライアント側で生成したUUID） */
  guestId: string;
  /** Socket ID */
  socketId: string;
  /** Recording ID（録画開始後に設定） */
  recordingId?: string;
  name?: string;
  syncState: GuestSyncState;
  uploadedChunks: number;
  totalChunks: number;
  lastUpdatedAt: Date;
  errorMessage?: string;
  /** メディアステータス */
  mediaStatus?: GuestMediaStatus;
}

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
  guest_waveform_update: (data: {
    roomId: string;
    waveformData: number[];
    isSilent: boolean;
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
  guest_waveform_changed: (data: { roomId: string; guestId: string; waveformData: number[]; isSilent: boolean }) => void;
  guest_sync_state_changed: (data: GuestSyncStateChanged) => void;
  guest_sync_complete: (data: GuestSyncComplete) => void;
  guest_sync_error: (data: GuestSyncError) => void;
  /** Room参加時に現在のゲスト一覧を送信 */
  room_guests: (data: { roomId: string; guests: Array<{
    guestId: string;
    recordingId?: string;
    name?: string;
    syncState: GuestSyncState;
    uploadedChunks: number;
    totalChunks: number;
    mediaStatus?: GuestMediaStatus;
  }> }) => void;
  error: (data: { message: string }) => void;
}

/**
 * Guest録画リンク時のコールバック（participantNameをRecordingに保存するため）
 */
export type OnGuestRecordingLinkedCallback = (recordingId: string, guestName: string) => Promise<void>;

/**
 * 全Guest同期完了時のコールバック
 */
export type OnAllGuestsSyncedCallback = (roomId: string) => Promise<void>;

/**
 * WebSocket Manager
 */
export class WebSocketManager {
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;
  private roomGuestCounts: Map<string, number> = new Map();
  // roomId -> guestId -> GuestTrackingInfo
  private roomGuests: Map<string, Map<string, GuestTrackingInfo>> = new Map();
  // socketId -> { roomId, guestId } のマッピング（切断時の検索用）
  private socketToGuest: Map<string, { roomId: string; guestId: string }> = new Map();
  private onAllGuestsSyncedCallback: OnAllGuestsSyncedCallback | null = null;
  private onGuestRecordingLinkedCallback: OnGuestRecordingLinkedCallback | null = null;

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
    socket.on('join_room', ({ roomId, name }) => {
      console.log(`📥 [WebSocket] Client ${socket.id} joining room: ${roomId}${name ? ` (name: ${name})` : ''}`);
      socket.join(`room:${roomId}`);

      // nameがない場合はDirector等なのでゲスト追跡しない
      // ただし現在のゲスト一覧を送信する
      if (!name) {
        // 現在のゲスト一覧を送信
        const guests = this.getRoomGuests(roomId).map((g) => ({
          guestId: g.guestId,
          recordingId: g.recordingId,
          name: g.name,
          syncState: g.syncState,
          uploadedChunks: g.uploadedChunks,
          totalChunks: g.totalChunks,
          mediaStatus: g.mediaStatus,
        }));
        socket.emit('room_guests', { roomId, guests });
        console.log(`📤 [WebSocket] Sent ${guests.length} guests to Director for room: ${roomId}`);
        return;
      }

      // サーバー側でguestIdを生成
      const guestId = crypto.randomUUID();

      // Room用のGuestマップを初期化
      if (!this.roomGuests.has(roomId)) {
        this.roomGuests.set(roomId, new Map());
      }
      const roomGuestMap = this.roomGuests.get(roomId)!;

      // Guest数をカウント
      const currentCount = this.roomGuestCounts.get(roomId) || 0;
      this.roomGuestCounts.set(roomId, currentCount + 1);

      // Guest情報を追跡（guestIdをキーにして追跡）
      roomGuestMap.set(guestId, {
        guestId,
        socketId: socket.id,
        name,
        syncState: 'idle',
        uploadedChunks: 0,
        totalChunks: 0,
        lastUpdatedAt: new Date(),
      });

      // socketId -> guestIdのマッピングを保存（切断時用）
      this.socketToGuest.set(socket.id, { roomId, guestId });

      // 他のクライアントに通知
      const guestCount = this.roomGuestCounts.get(roomId) || 1;
      this.io?.to(`room:${roomId}`).emit('guest_joined', {
        roomId,
        guestCount,
        guestId,
        name,
      });
    });

    // Room離脱
    socket.on('leave_room', ({ roomId }) => {
      console.log(`📤 [WebSocket] Client ${socket.id} leaving room: ${roomId}`);
      socket.leave(`room:${roomId}`);

      // socketIdからguestIdを取得
      const guestMapping = this.socketToGuest.get(socket.id);
      if (!guestMapping || guestMapping.roomId !== roomId) {
        return;
      }

      const { guestId } = guestMapping;

      // Guest情報を取得して削除
      const roomGuestMap = this.roomGuests.get(roomId);
      const leavingGuest = roomGuestMap?.get(guestId);
      if (roomGuestMap && leavingGuest) {
        roomGuestMap.delete(guestId);
        if (roomGuestMap.size === 0) {
          this.roomGuests.delete(roomId);
        }
      }

      // マッピングを削除
      this.socketToGuest.delete(socket.id);

      // Guest数を更新
      if (leavingGuest) {
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
          guestId,
          recordingId: leavingGuest?.recordingId,
          name: leavingGuest?.name,
        });
      }
    });

    // Recording IDを設定（録画開始後にguestIdとrecordingIdを紐付け）
    socket.on('set_recording_id', async ({ roomId, recordingId }) => {
      console.log(`🔗 [WebSocket] Set recording ID: room=${roomId}, recording=${recordingId}, socket=${socket.id}`);

      // socketIdからguestIdを取得
      const guestMapping = this.socketToGuest.get(socket.id);
      if (!guestMapping || guestMapping.roomId !== roomId) {
        console.warn(`⚠️ [WebSocket] Guest not found for socket ${socket.id}`);
        return;
      }

      const { guestId } = guestMapping;
      const roomGuestMap = this.roomGuests.get(roomId);
      const guestInfo = roomGuestMap?.get(guestId);

      if (guestInfo) {
        guestInfo.recordingId = recordingId;
        guestInfo.lastUpdatedAt = new Date();
        console.log(`✅ [WebSocket] Linked guestId=${guestId} with recordingId=${recordingId}`);

        // participantNameをRecordingメタデータに保存
        if (guestInfo.name && this.onGuestRecordingLinkedCallback) {
          try {
            await this.onGuestRecordingLinkedCallback(recordingId, guestInfo.name);
            console.log(`✅ [WebSocket] Saved participantName="${guestInfo.name}" to recording=${recordingId}`);
          } catch (err) {
            console.error(`❌ [WebSocket] Failed to save participantName:`, err);
          }
        }

        // Directorに通知
        this.io?.to(`room:${roomId}`).emit('guest_recording_linked', {
          roomId,
          guestId,
          recordingId,
          name: guestInfo.name,
        });
      }
    });

    // Guestメディアステータス更新
    socket.on('guest_media_status_update', ({ roomId, mediaStatus }) => {
      console.log(`🎥 [WebSocket] Guest media status update: room=${roomId}, camera=${mediaStatus.isCameraActive}, mic=${mediaStatus.isMicMuted ? 'muted' : 'active'}`);

      // socketIdからguestIdを取得してGuest情報を更新
      const guestMapping = this.socketToGuest.get(socket.id);
      if (!guestMapping || guestMapping.roomId !== roomId) {
        console.warn(`⚠️ [WebSocket] Guest not found for media status update: socket=${socket.id}`);
        return;
      }

      const { guestId } = guestMapping;
      const roomGuestMap = this.roomGuests.get(roomId);
      const guestInfo = roomGuestMap?.get(guestId);

      if (guestInfo) {
        guestInfo.mediaStatus = mediaStatus;
        guestInfo.lastUpdatedAt = new Date();

        // Directorに通知
        this.io?.to(`room:${roomId}`).emit('guest_media_status_changed', {
          roomId,
          guestId,
          mediaStatus,
        });
      }
    });

    // Guest波形データ更新（リアルタイム転送、保存なし）
    socket.on('guest_waveform_update', ({ roomId, waveformData, isSilent }) => {
      // socketIdからguestIdを取得
      const guestMapping = this.socketToGuest.get(socket.id);
      if (!guestMapping || guestMapping.roomId !== roomId) {
        return;
      }

      const { guestId } = guestMapping;

      // Directorに転送（ログは出力しない - 頻繁すぎるため）
      this.io?.to(`room:${roomId}`).emit('guest_waveform_changed', {
        roomId,
        guestId,
        waveformData,
        isSilent,
      });
    });

    // Guest同期状態更新
    socket.on('guest_sync_update', ({ roomId, recordingId, syncState, uploadedChunks, totalChunks }) => {
      console.log(`📊 [WebSocket] Guest sync update: room=${roomId}, recording=${recordingId}, state=${syncState}, ${uploadedChunks}/${totalChunks}`);

      // socketIdからguestIdを取得してGuest情報を更新
      const guestMapping = this.socketToGuest.get(socket.id);
      if (guestMapping) {
        const roomGuestMap = this.roomGuests.get(guestMapping.roomId);
        const guestInfo = roomGuestMap?.get(guestMapping.guestId);
        if (guestInfo) {
          guestInfo.recordingId = recordingId;
          guestInfo.syncState = syncState;
          guestInfo.uploadedChunks = uploadedChunks;
          guestInfo.totalChunks = totalChunks;
          guestInfo.lastUpdatedAt = new Date();
        }
      }

      // Roomに配信
      const message: GuestSyncStateChanged = {
        type: 'guest_sync_state_changed',
        roomId,
        recordingId,
        syncState,
        uploadedChunks,
        totalChunks,
        timestamp: new Date().toISOString(),
      };
      this.io?.to(`room:${roomId}`).emit('guest_sync_state_changed', message);
    });

    // Guest同期完了
    socket.on('guest_sync_complete', async ({ roomId, recordingId, totalChunks }) => {
      console.log(`✅ [WebSocket] Guest sync complete: room=${roomId}, recording=${recordingId}, chunks=${totalChunks}`);

      // socketIdからguestIdを取得してGuest情報を更新
      const guestMapping = this.socketToGuest.get(socket.id);
      if (guestMapping) {
        const roomGuestMap = this.roomGuests.get(guestMapping.roomId);
        const guestInfo = roomGuestMap?.get(guestMapping.guestId);
        if (guestInfo) {
          guestInfo.recordingId = recordingId;
          guestInfo.syncState = 'synced';
          guestInfo.uploadedChunks = totalChunks;
          guestInfo.totalChunks = totalChunks;
          guestInfo.lastUpdatedAt = new Date();
        }
      }

      // Roomに配信
      const message: GuestSyncComplete = {
        type: 'guest_sync_complete',
        roomId,
        recordingId,
        totalChunks,
        timestamp: new Date().toISOString(),
      };
      this.io?.to(`room:${roomId}`).emit('guest_sync_complete', message);

      // 全Guestが同期完了したかチェック
      if (this.areAllGuestsSynced(roomId) && this.onAllGuestsSyncedCallback) {
        console.log(`🎉 [WebSocket] All guests synced for room: ${roomId}, triggering callback`);
        try {
          await this.onAllGuestsSyncedCallback(roomId);
        } catch (err) {
          console.error(`❌ [WebSocket] Failed to execute onAllGuestsSynced callback:`, err);
        }
      }
    });

    // Guest同期エラー
    socket.on('guest_sync_error', ({ roomId, recordingId, errorMessage, failedChunks }) => {
      console.error(`❌ [WebSocket] Guest sync error: room=${roomId}, recording=${recordingId}, error=${errorMessage}`);

      // socketIdからguestIdを取得してGuest情報を更新
      const guestMapping = this.socketToGuest.get(socket.id);
      if (guestMapping) {
        const roomGuestMap = this.roomGuests.get(guestMapping.roomId);
        const guestInfo = roomGuestMap?.get(guestMapping.guestId);
        if (guestInfo) {
          guestInfo.recordingId = recordingId;
          guestInfo.syncState = 'error';
          guestInfo.errorMessage = errorMessage;
          guestInfo.lastUpdatedAt = new Date();
        }
      }

      // Roomに配信
      const message: GuestSyncError = {
        type: 'guest_sync_error',
        roomId,
        recordingId,
        errorMessage,
        failedChunks,
        timestamp: new Date().toISOString(),
      };
      this.io?.to(`room:${roomId}`).emit('guest_sync_error', message);
    });

    // 切断時
    socket.on('disconnect', () => {
      console.log(`🔌 [WebSocket] Client disconnected: ${socket.id}`);

      // socketIdからguestIdを取得
      const guestMapping = this.socketToGuest.get(socket.id);
      if (!guestMapping) {
        return;
      }

      const { roomId, guestId } = guestMapping;

      // Guest情報をクリーンアップ
      const roomGuestMap = this.roomGuests.get(roomId);
      const guestInfo = roomGuestMap?.get(guestId);
      if (roomGuestMap && guestInfo) {
        roomGuestMap.delete(guestId);
        // Guest数を更新
        const currentCount = this.roomGuestCounts.get(roomId) || 1;
        const newCount = Math.max(0, currentCount - 1);
        if (newCount === 0) {
          this.roomGuestCounts.delete(roomId);
        } else {
          this.roomGuestCounts.set(roomId, newCount);
        }
        // 切断を通知
        this.io?.to(`room:${roomId}`).emit('guest_left', {
          roomId,
          guestCount: newCount,
          guestId,
          recordingId: guestInfo.recordingId,
          name: guestInfo.name,
        });

        if (roomGuestMap.size === 0) {
          this.roomGuests.delete(roomId);
        }
      }

      // マッピングを削除
      this.socketToGuest.delete(socket.id);
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

  /**
   * Room内のGuest情報一覧を取得
   */
  getRoomGuests(roomId: string): GuestTrackingInfo[] {
    const roomGuestMap = this.roomGuests.get(roomId);
    if (!roomGuestMap) {
      return [];
    }
    return Array.from(roomGuestMap.values());
  }

  /**
   * 全Guestが同期完了したかチェック
   * Note: recordingIdがないゲスト（録画を開始していない）は除外
   */
  areAllGuestsSynced(roomId: string): boolean {
    const guests = this.getRoomGuests(roomId);
    // recordingIdがあるゲストのみを対象
    const recordingGuests = guests.filter((guest) => guest.recordingId);
    if (recordingGuests.length === 0) {
      return true;
    }
    return recordingGuests.every((guest) => guest.syncState === 'synced');
  }

  /**
   * Guest録画リンク時のコールバックを設定
   */
  setOnGuestRecordingLinkedCallback(callback: OnGuestRecordingLinkedCallback): void {
    this.onGuestRecordingLinkedCallback = callback;
  }

  /**
   * 全Guest同期完了時のコールバックを設定
   */
  setOnAllGuestsSyncedCallback(callback: OnAllGuestsSyncedCallback): void {
    this.onAllGuestsSyncedCallback = callback;
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
