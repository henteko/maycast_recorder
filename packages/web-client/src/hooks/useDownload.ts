import { useState } from 'react'
import { ChunkStorage } from '../storage/chunk-storage'

interface DownloadProgress {
  isDownloading: boolean
  current: number
  total: number
}

export const useDownload = () => {
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    isDownloading: false,
    current: 0,
    total: 0,
  })

  const downloadSessionById = async (sessionId: string) => {
    try {
      const storage = new ChunkStorage(sessionId)

      const chunkMetadata = await storage.listChunks()
      const totalChunks = chunkMetadata.length + 1
      console.log(`📦 Preparing to load ${chunkMetadata.length} chunks from OPFS for session ${sessionId}`)

      setDownloadProgress({ isDownloading: true, current: 0, total: totalChunks })

      const blobs: Blob[] = []

      const initSegment = await storage.loadInitSegment()
      blobs.push(new Blob([initSegment as BlobPart]))
      setDownloadProgress({ isDownloading: true, current: 1, total: totalChunks })
      console.log(`📤 Loaded init segment: ${initSegment.length} bytes`)

      for (let i = 0; i < chunkMetadata.length; i++) {
        const meta = chunkMetadata[i]
        const chunk = await storage.loadChunk(meta.chunkId)
        blobs.push(new Blob([chunk as BlobPart]))

        const currentProgress = i + 2
        setDownloadProgress({ isDownloading: true, current: currentProgress, total: totalChunks })
        console.log(`📤 Loaded chunk #${meta.chunkId}: ${chunk.length} bytes (${currentProgress}/${totalChunks})`)
      }

      console.log('✅ All chunks loaded, combining blobs...')

      const blob = new Blob(blobs, { type: 'video/mp4' })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `recording-${sessionId}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      console.log('✅ Downloaded:', blob.size, 'bytes')

      setDownloadProgress({ isDownloading: false, current: 0, total: 0 })
    } catch (err) {
      console.error('❌ Download error:', err)
      setDownloadProgress({ isDownloading: false, current: 0, total: 0 })
      throw err
    }
  }

  return {
    downloadProgress,
    downloadSessionById,
  }
}
