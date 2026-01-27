/**
 * resume-upload.ts
 * 未完了Recording検出ロジック
 */

import type { Recording } from '@maycast/common-types';
import type { IRecordingRepository } from '../../domain/repositories/IRecordingRepository';
import type { IChunkRepository } from '../../domain/repositories/IChunkRepository';
import type { ChunkUploadStatus } from './types';
import { getRemoteMapping, listRemoteMappings, type RemoteRecordingMapping } from './remote-recording-mapping';
import { listUploadStates } from './upload-state-storage';

/**
 * 未完了Recordingの情報
 */
export interface UnfinishedRecording {
  recording: Recording;
  remoteRecordingId: string | null;
  pendingChunks: ChunkUploadStatus[];
  /** upload_statesにチャンク情報がない場合のチャンクID一覧 */
  missingChunkIds: number[];
  initSegmentUploaded: boolean;
}

/**
 * 未完了のRecordingを検出する
 *
 * 検出条件:
 * - state !== 'synced' かつ chunkCount > 0
 * - リモートマッピングが存在する（Remote Modeで録画開始済み）
 * - 以下のいずれかに該当:
 *   - initSegmentUploadedがfalse
 *   - 未送信チャンクがある（pendingChunks > 0）
 *   - upload_statesの件数がRecordingのchunkCountより少ない（チャンク情報の欠落）
 */
export async function detectUnfinishedRecordings(
  recordingRepository: IRecordingRepository,
  chunkRepository?: IChunkRepository
): Promise<UnfinishedRecording[]> {
  console.log('🔍 [ResumeUpload] Detecting unfinished recordings...');

  // 1. 全RecordingEntityを取得してDTOに変換
  const allRecordingEntities = await recordingRepository.findAll();
  const allRecordings = allRecordingEntities.map(entity => entity.toDTO());
  console.log(`📋 [ResumeUpload] Total recordings: ${allRecordings.length}`);

  // 2. state !== 'synced' && chunkCount > 0 のRecordingをフィルタ
  const incompleteRecordings = allRecordings.filter(
    r => r.state !== 'synced' && r.chunkCount > 0
  );
  console.log(`📋 [ResumeUpload] Incomplete recordings (not synced, has chunks): ${incompleteRecordings.length}`);

  // 3. リモートマッピングが存在するものだけを抽出
  const remoteMappings = await listRemoteMappings();
  const mappingsByLocalId = new Map<string, RemoteRecordingMapping>(
    remoteMappings.map(m => [m.localRecordingId, m])
  );
  console.log(`📋 [ResumeUpload] Remote mappings found: ${remoteMappings.length}`);

  // 4. 各Recordingの詳細情報を収集
  const unfinishedRecordings: UnfinishedRecording[] = [];

  for (const recording of incompleteRecordings) {
    const mapping = mappingsByLocalId.get(recording.id);

    // リモートマッピングがない場合はスタンドアロンモードの録画なのでスキップ
    if (!mapping) {
      console.log(`⏭️ [ResumeUpload] Skipping ${recording.id} - no remote mapping (standalone mode)`);
      continue;
    }

    // アップロード状態を取得
    const uploadStates = await listUploadStates(recording.id);

    // アップロード済みチャンクのIDセット
    const uploadedChunkIds = new Set(
      uploadStates.filter(s => s.state === 'uploaded').map(s => s.chunkId)
    );

    // 未送信チャンクを抽出（uploaded以外）
    const pendingChunks = uploadStates.filter(s => s.state !== 'uploaded');

    // upload_statesに情報がないチャンクを検出
    // Recording.chunkCountとupload_statesの件数を比較
    const missingChunkIds: number[] = [];

    // upload_statesが空または不完全な場合、OPFSのメタデータから取得を試みる
    if (uploadStates.length < recording.chunkCount) {
      console.log(`⚠️ [ResumeUpload] Recording ${recording.id} has ${recording.chunkCount} chunks but only ${uploadStates.length} upload states`);

      // chunkRepositoryが利用可能な場合、実際のチャンク一覧を取得
      if (chunkRepository) {
        const chunkMetadataList = await chunkRepository.findAllByRecording(recording.id);
        for (const chunkMeta of chunkMetadataList) {
          // upload_statesに存在しない、かつアップロード済みでないチャンクを追加
          const existsInUploadStates = uploadStates.some(s => s.chunkId === chunkMeta.chunkId);
          if (!existsInUploadStates && !uploadedChunkIds.has(chunkMeta.chunkId)) {
            missingChunkIds.push(chunkMeta.chunkId);
          }
        }
      } else {
        // chunkRepositoryがない場合は、0からchunkCount-1までのチャンクIDを想定
        for (let i = 0; i < recording.chunkCount; i++) {
          const existsInUploadStates = uploadStates.some(s => s.chunkId === i);
          if (!existsInUploadStates && !uploadedChunkIds.has(i)) {
            missingChunkIds.push(i);
          }
        }
      }
    }

    console.log(`📦 [ResumeUpload] Recording ${recording.id}:`);
    console.log(`   - Remote ID: ${mapping.remoteRecordingId}`);
    console.log(`   - Init segment uploaded: ${mapping.initSegmentUploaded}`);
    console.log(`   - Recording chunkCount: ${recording.chunkCount}`);
    console.log(`   - Upload states count: ${uploadStates.length}`);
    console.log(`   - Pending chunks: ${pendingChunks.length}`);
    console.log(`   - Missing chunk IDs: ${missingChunkIds.length > 0 ? missingChunkIds.join(', ') : 'none'}`);

    // 未完了条件のチェック:
    // 1. init segmentが未送信
    // 2. pending chunksがある
    // 3. upload_statesに情報がないチャンクがある
    const hasUnfinishedWork =
      !mapping.initSegmentUploaded ||
      pendingChunks.length > 0 ||
      missingChunkIds.length > 0;

    if (hasUnfinishedWork) {
      unfinishedRecordings.push({
        recording,
        remoteRecordingId: mapping.remoteRecordingId,
        pendingChunks,
        missingChunkIds,
        initSegmentUploaded: mapping.initSegmentUploaded,
      });
    }
  }

  if (unfinishedRecordings.length > 0) {
    console.log(`🔍 [ResumeUpload] Found ${unfinishedRecordings.length} unfinished recording(s):`);
    unfinishedRecordings.forEach(u => {
      const totalPending = u.pendingChunks.length + u.missingChunkIds.length;
      console.log(`   - ${u.recording.id} (remote: ${u.remoteRecordingId}, pending: ${totalPending})`);
    });
  } else {
    console.log('✅ [ResumeUpload] No unfinished recordings found');
  }

  return unfinishedRecordings;
}

/**
 * 特定のRecordingの未完了情報を取得
 */
export async function getUnfinishedRecordingInfo(
  recording: Recording,
  chunkRepository?: IChunkRepository
): Promise<UnfinishedRecording | null> {
  const mapping = await getRemoteMapping(recording.id);

  if (!mapping) {
    return null;
  }

  const uploadStates = await listUploadStates(recording.id);
  const uploadedChunkIds = new Set(
    uploadStates.filter(s => s.state === 'uploaded').map(s => s.chunkId)
  );
  const pendingChunks = uploadStates.filter(s => s.state !== 'uploaded');

  // 欠落チャンクの検出
  const missingChunkIds: number[] = [];
  if (uploadStates.length < recording.chunkCount) {
    if (chunkRepository) {
      const chunkMetadataList = await chunkRepository.findAllByRecording(recording.id);
      for (const chunkMeta of chunkMetadataList) {
        const existsInUploadStates = uploadStates.some(s => s.chunkId === chunkMeta.chunkId);
        if (!existsInUploadStates && !uploadedChunkIds.has(chunkMeta.chunkId)) {
          missingChunkIds.push(chunkMeta.chunkId);
        }
      }
    } else {
      for (let i = 0; i < recording.chunkCount; i++) {
        const existsInUploadStates = uploadStates.some(s => s.chunkId === i);
        if (!existsInUploadStates && !uploadedChunkIds.has(i)) {
          missingChunkIds.push(i);
        }
      }
    }
  }

  const hasUnfinishedWork =
    !mapping.initSegmentUploaded ||
    pendingChunks.length > 0 ||
    missingChunkIds.length > 0;

  if (hasUnfinishedWork) {
    return {
      recording,
      remoteRecordingId: mapping.remoteRecordingId,
      pendingChunks,
      missingChunkIds,
      initSegmentUploaded: mapping.initSegmentUploaded,
    };
  }

  return null;
}
