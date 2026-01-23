/**
 * OPFS (Origin Private File System) API ラッパー
 *
 * チャンクをブラウザのローカルストレージに保存・読み出しする
 */

import type { RecordingId } from '@maycast/common-types';

/**
 * OPFSのルートディレクトリを取得
 */
async function getRoot(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

/**
 * 録画ディレクトリを取得または作成
 */
async function getRecordingDir(recordingId: RecordingId): Promise<FileSystemDirectoryHandle> {
  const root = await getRoot();
  return root.getDirectoryHandle(recordingId, { create: true });
}

/**
 * チャンクファイルのパスを生成
 */
function getChunkFileName(chunkId: number): string {
  // ゼロパディングで8桁にする (例: chunk-00000001.fmp4)
  return `chunk-${chunkId.toString().padStart(8, '0')}.fmp4`
}

/**
 * チャンクをOPFSに書き込む
 */
export async function writeChunk(
  recordingId: RecordingId,
  chunkId: number,
  data: Uint8Array
): Promise<void> {
  const recordingDir = await getRecordingDir(recordingId);
  const fileName = getChunkFileName(chunkId);

  const fileHandle = await recordingDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();

  try {
    await writable.write(data as FileSystemWriteChunkType);
    await writable.close();
  } catch (err) {
    await writable.abort();
    throw err;
  }
}

/**
 * チャンクをOPFSから読み出す
 */
export async function readChunk(
  recordingId: RecordingId,
  chunkId: number
): Promise<Uint8Array> {
  const recordingDir = await getRecordingDir(recordingId);
  const fileName = getChunkFileName(chunkId);

  const fileHandle = await recordingDir.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  const arrayBuffer = await file.arrayBuffer();

  return new Uint8Array(arrayBuffer);
}

/**
 * 録画のチャンク一覧を取得
 */
export async function listChunks(recordingId: RecordingId): Promise<number[]> {
  try {
    const recordingDir = await getRecordingDir(recordingId);
    const chunkIds: number[] = [];

    // @ts-expect-error - FileSystemDirectoryHandle.values() is experimental
    for await (const entry of recordingDir.values()) {
      if (entry.kind === 'file' && entry.name.startsWith('chunk-')) {
        // ファイル名からチャンクIDを抽出 (chunk-00000001.fmp4 -> 1)
        const match = entry.name.match(/chunk-(\d+)\.fmp4/);
        if (match) {
          chunkIds.push(parseInt(match[1], 10));
        }
      }
    }

    return chunkIds.sort((a, b) => a - b);
  } catch (err) {
    // 録画ディレクトリが存在しない場合は空配列を返す
    if ((err as DOMException).name === 'NotFoundError') {
      return [];
    }
    throw err;
  }
}

/**
 * 録画全体を削除
 */
export async function deleteSession(recordingId: RecordingId): Promise<void> {
  try {
    const root = await getRoot();
    await root.removeEntry(recordingId, { recursive: true });
  } catch (err) {
    // 録画ディレクトリが存在しない場合は無視
    if ((err as DOMException).name === 'NotFoundError') {
      console.log(`⚠️ Recording directory not found (already deleted): ${recordingId}`);
      return;
    }
    throw err;
  }
}

/**
 * すべての録画一覧を取得
 */
export async function listRecordings(): Promise<RecordingId[]> {
  const root = await getRoot();
  const recordings: RecordingId[] = [];

  // @ts-expect-error - FileSystemDirectoryHandle.values() is experimental
  for await (const entry of root.values()) {
    if (entry.kind === 'directory') {
      recordings.push(entry.name);
    }
  }

  return recordings;
}

/**
 * init segmentを保存
 */
export async function writeInitSegment(
  recordingId: RecordingId,
  data: Uint8Array
): Promise<void> {
  const recordingDir = await getRecordingDir(recordingId);
  const fileHandle = await recordingDir.getFileHandle('init.mp4', { create: true });
  const writable = await fileHandle.createWritable();

  try {
    await writable.write(data as FileSystemWriteChunkType);
    await writable.close();
  } catch (err) {
    await writable.abort();
    throw err;
  }
}

/**
 * init segmentを読み出す
 */
export async function readInitSegment(recordingId: RecordingId): Promise<Uint8Array> {
  const recordingDir = await getRecordingDir(recordingId);
  const fileHandle = await recordingDir.getFileHandle('init.mp4');
  const file = await fileHandle.getFile();
  const arrayBuffer = await file.arrayBuffer();

  return new Uint8Array(arrayBuffer);
}
