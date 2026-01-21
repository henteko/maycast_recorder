import React from 'react';

interface SystemHealthItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  status?: 'normal' | 'warning' | 'error';
}

export const SystemHealthItem: React.FC<SystemHealthItemProps> = ({
  icon,
  label,
  value,
  status = 'normal',
}) => {
  const statusColor = {
    normal: 'text-maycast-subtext',
    warning: 'text-yellow-500',
    error: 'text-red-500',
  }[status];

  return (
    <div className="flex items-center justify-between px-6 py-2">
      <div className="flex items-center gap-2">
        <div className={`w-4 h-4 ${statusColor}`}>{icon}</div>
        <span className="text-xs text-maycast-subtext">{label}</span>
      </div>
      <span className={`text-xs font-medium ${statusColor}`}>{value}</span>
    </div>
  );
};
