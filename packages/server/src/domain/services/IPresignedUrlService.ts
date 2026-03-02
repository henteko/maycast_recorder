import type { RecordingId, RoomId } from '@maycast/common-types';

/**
 * Presigned URL Service Interface
 *
 * クラウドストレージのPresigned URL生成を抽象化
 * S3バックエンドの場合はPresigned URLを生成し、
 * ローカルバックエンドの場合はサポートしない
 */
export interface IPresignedUrlService {
  /**
   * Presigned URLの生成をサポートしているか
   */
  isSupported(): boolean;

  /**
   * Init SegmentのPresigned URLを生成
   */
  getInitSegmentUrl(recordingId: RecordingId, roomId?: RoomId, expiresIn?: number): Promise<string>;

  /**
   * ChunkのPresigned URLを生成
   */
  getChunkUrl(recordingId: RecordingId, chunkId: number, roomId?: RoomId, expiresIn?: number): Promise<string>;

  /**
   * アップロード用Presigned URLの生成をサポートしているか
   */
  isUploadSupported(): boolean;

  /**
   * Init Segmentアップロード用のPresigned URLを生成
   */
  getInitSegmentUploadUrl(recordingId: RecordingId, roomId?: RoomId, expiresIn?: number): Promise<string>;

  /**
   * Chunkアップロード用のPresigned URLを生成
   */
  getChunkUploadUrl(recordingId: RecordingId, chunkId: number, roomId?: RoomId, expiresIn?: number): Promise<string>;

}
