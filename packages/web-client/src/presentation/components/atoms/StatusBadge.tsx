import { CheckIcon } from '@heroicons/react/24/solid'

type ScreenState = 'standby' | 'recording' | 'completed'

interface StatusBadgeProps {
  state: ScreenState
}

export const StatusBadge = ({ state }: StatusBadgeProps) => {
  if (state === 'standby') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-maycast-primary/20 backdrop-blur-sm rounded-full border border-maycast-primary/30">
        <div className="w-2 h-2 bg-maycast-primary rounded-full" />
        <span className="text-maycast-primary/80 font-semibold">Standby</span>
      </div>
    )
  }

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-maycast-rec/20 backdrop-blur-sm rounded-full border border-maycast-rec/30">
        <div className="relative">
          <div className="w-2 h-2 bg-maycast-rec rounded-full animate-pulse" />
          <div className="absolute inset-0 w-2 h-2 bg-maycast-rec rounded-full animate-ping opacity-75" />
        </div>
        <span className="text-maycast-rec/80 font-semibold">録画中</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-maycast-safe/20 backdrop-blur-sm rounded-full border border-maycast-safe/30">
      <CheckIcon className="w-4 h-4 text-maycast-safe" />
      <span className="text-maycast-safe/80 font-semibold">Recording Complete</span>
    </div>
  )
}
