/**
 * OPFS (Origin Private File System) API ラッパー
 *
 * チャンクをブラウザのローカルストレージに保存・読み出しする
 */

/**
 * OPFSのルートディレクトリを取得
 */
async function getRoot(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory()
}

/**
 * セッションディレクトリを取得または作成
 */
async function getSessionDir(sessionId: string): Promise<FileSystemDirectoryHandle> {
  const root = await getRoot()
  return root.getDirectoryHandle(sessionId, { create: true })
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
  sessionId: string,
  chunkId: number,
  data: Uint8Array
): Promise<void> {
  const sessionDir = await getSessionDir(sessionId)
  const fileName = getChunkFileName(chunkId)

  const fileHandle = await sessionDir.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()

  try {
    await writable.write(data as FileSystemWriteChunkType)
    await writable.close()
  } catch (err) {
    await writable.abort()
    throw err
  }
}

/**
 * チャンクをOPFSから読み出す
 */
export async function readChunk(
  sessionId: string,
  chunkId: number
): Promise<Uint8Array> {
  const sessionDir = await getSessionDir(sessionId)
  const fileName = getChunkFileName(chunkId)

  const fileHandle = await sessionDir.getFileHandle(fileName)
  const file = await fileHandle.getFile()
  const arrayBuffer = await file.arrayBuffer()

  return new Uint8Array(arrayBuffer)
}

/**
 * セッションのチャンク一覧を取得
 */
export async function listChunks(sessionId: string): Promise<number[]> {
  try {
    const sessionDir = await getSessionDir(sessionId)
    const chunkIds: number[] = []

    // @ts-expect-error - FileSystemDirectoryHandle.values() is experimental
    for await (const entry of sessionDir.values()) {
      if (entry.kind === 'file' && entry.name.startsWith('chunk-')) {
        // ファイル名からチャンクIDを抽出 (chunk-00000001.fmp4 -> 1)
        const match = entry.name.match(/chunk-(\d+)\.fmp4/)
        if (match) {
          chunkIds.push(parseInt(match[1], 10))
        }
      }
    }

    return chunkIds.sort((a, b) => a - b)
  } catch (err) {
    // セッションディレクトリが存在しない場合は空配列を返す
    if ((err as DOMException).name === 'NotFoundError') {
      return []
    }
    throw err
  }
}

/**
 * セッション全体を削除
 */
export async function deleteSession(sessionId: string): Promise<void> {
  try {
    const root = await getRoot()
    await root.removeEntry(sessionId, { recursive: true })
  } catch (err) {
    // セッションディレクトリが存在しない場合は無視
    if ((err as DOMException).name === 'NotFoundError') {
      console.log(`⚠️ Session directory not found (already deleted): ${sessionId}`)
      return
    }
    throw err
  }
}

/**
 * すべてのセッション一覧を取得
 */
export async function listSessions(): Promise<string[]> {
  const root = await getRoot()
  const sessions: string[] = []

  // @ts-expect-error - FileSystemDirectoryHandle.values() is experimental
  for await (const entry of root.values()) {
    if (entry.kind === 'directory') {
      sessions.push(entry.name)
    }
  }

  return sessions
}

/**
 * init segmentを保存
 */
export async function writeInitSegment(
  sessionId: string,
  data: Uint8Array
): Promise<void> {
  const sessionDir = await getSessionDir(sessionId)
  const fileHandle = await sessionDir.getFileHandle('init.mp4', { create: true })
  const writable = await fileHandle.createWritable()

  try {
    await writable.write(data as FileSystemWriteChunkType)
    await writable.close()
  } catch (err) {
    await writable.abort()
    throw err
  }
}

/**
 * init segmentを読み出す
 */
export async function readInitSegment(sessionId: string): Promise<Uint8Array> {
  const sessionDir = await getSessionDir(sessionId)
  const fileHandle = await sessionDir.getFileHandle('init.mp4')
  const file = await fileHandle.getFile()
  const arrayBuffer = await file.arrayBuffer()

  return new Uint8Array(arrayBuffer)
}
