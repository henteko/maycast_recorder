import { RecordingIndicator } from '../molecules/RecordingIndicator'

interface VideoPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  isRecording: boolean
  elapsedTime: string
}

export const VideoPreview = ({ videoRef, isRecording, elapsedTime }: VideoPreviewProps) => {
  return (
    <div className="mb-10">
      <div className="relative bg-black rounded-3xl overflow-hidden shadow-2xl border border-maycast-border/50" style={{ aspectRatio: '16/9' }}>
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          muted
          playsInline
        />
        {isRecording && <RecordingIndicator elapsedTime={elapsedTime} />}
      </div>
    </div>
  )
}
