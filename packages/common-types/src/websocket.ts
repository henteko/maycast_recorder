import type { RoomId } from './room.js';
import type { RecordingId, RecordingState } from './recording.js';
import type { ChunkId } from './chunk.js';
import type { RoomState } from './room.js';

/**
 * WebSocket message: Room created
 */
export interface RoomCreated {
  type: 'room_created';
  roomId: RoomId;
  createdAt: string;
}

/**
 * WebSocket message: Room state changed
 */
export interface RoomStateChanged {
  type: 'room_state_changed';
  roomId: RoomId;
  state: RoomState;
  timestamp: string;
}

/**
 * WebSocket message: Recording created
 */
export interface RecordingCreated {
  type: 'recording_created';
  roomId: RoomId;
  recordingId: RecordingId;
  createdAt: string;
}

/**
 * WebSocket message: Recording state changed
 */
export interface RecordingStateChanged {
  type: 'recording_state_changed';
  roomId: RoomId;
  recordingId: RecordingId;
  state: RecordingState;
  timestamp: string;
}

/**
 * WebSocket message: Chunk uploaded
 */
export interface ChunkUploaded {
  type: 'chunk_uploaded';
  roomId: RoomId;
  recordingId: RecordingId;
  chunkId: ChunkId;
  timestamp: string;
}

/**
 * WebSocket message: Upload progress
 */
export interface UploadProgress {
  type: 'upload_progress';
  roomId: RoomId;
  recordingId: RecordingId;
  uploaded: number;
  total: number;
}

/**
 * Director command type
 */
export type DirectorCommandType = 'start' | 'stop';

/**
 * WebSocket message: Director command
 */
export interface DirectorCommand {
  type: 'director_command';
  roomId: RoomId;
  command: DirectorCommandType;
}

/**
 * Union type of all WebSocket messages
 */
export type WebSocketMessage =
  | RoomCreated
  | RoomStateChanged
  | RecordingCreated
  | RecordingStateChanged
  | ChunkUploaded
  | UploadProgress
  | DirectorCommand;
