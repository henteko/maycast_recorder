// Entities
export { RecordingEntity } from './entities/Recording.entity.js';
export { ChunkEntity } from './entities/Chunk.entity.js';
export { RoomEntity } from './entities/Room.entity.js';

// Domain Errors
export {
  DomainError,
  RecordingNotFoundError,
  InvalidStateTransitionError,
  InvalidOperationError,
  InvalidChunkError,
  ChunkNotFoundError,
  NetworkError,
  UploadError,
  StorageFullError,
  StorageAccessError,
  RoomNotFoundError,
  InvalidRoomStateTransitionError,
} from './errors/DomainErrors.js';

// Chunk types
export type { ChunkId, ChunkMetadata } from './chunk.js';

// Recording types
export type {
  RecordingId,
  RecordingState,
  RecordingMetadata,
  Recording,
} from './recording.js';

// API types
export type {
  CreateRecordingResponse,
  UpdateStateRequest,
} from './api-types.js';

// Room types
export type { RoomId, RoomState, Room, GuestSyncState, GuestInfo } from './room.js';

// WebSocket message types
export type {
  RoomCreated,
  RoomStateChanged,
  RecordingCreated,
  RecordingStateChanged,
  ChunkUploaded,
  UploadProgress,
  DirectorCommand,
  DirectorCommandType,
  GuestSyncStateChanged,
  GuestSyncComplete,
  GuestSyncError,
  WebSocketMessage,
} from './websocket.js';
