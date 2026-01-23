import type { ReactNode } from 'react'

interface StatCardProps {
  icon: ReactNode
  label: string
  value: string | number
  colorClass: string
}

export const StatCard = ({ icon, label, value, colorClass }: StatCardProps) => {
  return (
    <div className={`${colorClass}/20 backdrop-blur-md p-6 rounded-2xl border border-${colorClass}/30 shadow-xl`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <p className={`text-${colorClass}/80 text-sm font-semibold`}>{label}</p>
      </div>
      <p className="text-4xl font-bold text-maycast-text">{value}</p>
    </div>
  )
}
