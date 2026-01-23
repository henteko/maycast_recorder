interface ProgressBarProps {
  current: number
  total: number
}

export const ProgressBar = ({ current, total }: ProgressBarProps) => {
  const percentage = total > 0 ? (current / total) * 100 : 0

  return (
    <div className="w-full bg-maycast-panel/50 rounded-full h-4 overflow-hidden shadow-inner">
      <div
        className="bg-maycast-safe h-4 rounded-full transition-all duration-300 shadow-lg relative overflow-hidden"
        style={{ width: `${percentage}%` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
      </div>
    </div>
  )
}
