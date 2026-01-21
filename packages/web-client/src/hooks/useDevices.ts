import { useState, useEffect } from 'react'

export const useDevices = () => {
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter(d => d.kind === 'videoinput')
        const audioInputs = devices.filter(d => d.kind === 'audioinput')

        setVideoDevices(videoInputs)
        setAudioDevices(audioInputs)

        console.log('📹 Video devices:', videoInputs.length)
        console.log('🎤 Audio devices:', audioInputs.length)
      } catch (err) {
        console.error('❌ Failed to enumerate devices:', err)
      }
    }
    enumerateDevices()
  }, [])

  return {
    videoDevices,
    audioDevices,
  }
}
