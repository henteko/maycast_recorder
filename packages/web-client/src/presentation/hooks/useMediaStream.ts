import { useState, useCallback, useRef } from 'react'

export interface MediaStreamOptions {
  videoDeviceId?: string
  audioDeviceId?: string
  width?: number
  height?: number
  frameRate?: number
}

interface UseMediaStreamResult {
  stream: MediaStream | null
  error: string | null
  startCapture: (options?: MediaStreamOptions) => Promise<MediaStream | null>
  stopCapture: () => void
  isCapturing: boolean
}

export const useMediaStream = (): UseMediaStreamResult => {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  const startCapture = useCallback(async (options?: MediaStreamOptions) => {
    try {
      setError(null)

      // Stop existing stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop()
          console.log(`Stopped existing track: ${track.kind}`)
        })
        streamRef.current = null
        setStream(null)
      }

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: options?.width || 1280 },
        height: { ideal: options?.height || 720 },
        frameRate: { ideal: options?.frameRate || 30 },
      }

      if (options?.videoDeviceId) {
        videoConstraints.deviceId = { exact: options.videoDeviceId }
      }

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000,
      }

      if (options?.audioDeviceId) {
        audioConstraints.deviceId = { exact: options.audioDeviceId }
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints,
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
