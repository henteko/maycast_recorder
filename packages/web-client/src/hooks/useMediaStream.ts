import { useState, useCallback, useRef } from 'react'

interface UseMediaStreamResult {
  stream: MediaStream | null
  error: string | null
  startCapture: () => Promise<MediaStream | null>
  stopCapture: () => void
  isCapturing: boolean
}

export const useMediaStream = (): UseMediaStreamResult => {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  const startCapture = useCallback(async () => {
    try {
      setError(null)

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000,
        },
      })

      streamRef.current = mediaStream
      setStream(mediaStream)
      setIsCapturing(true)

      console.log('✅ Media stream acquired:', {
        videoTracks: mediaStream.getVideoTracks().length,
        audioTracks: mediaStream.getAudioTracks().length,
      })

      return mediaStream
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      console.error('❌ Failed to get media stream:', err)
      return null
    }
  }, [])

  const stopCapture = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop()
        console.log(`Stopped track: ${track.kind}`)
      })
      streamRef.current = null
      setStream(null)
      setIsCapturing(false)
    }
  }, [])

  return {
    stream,
    error,
    startCapture,
    stopCapture,
    isCapturing,
  }
}
