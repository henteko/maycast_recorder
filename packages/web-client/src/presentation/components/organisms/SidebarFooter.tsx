import React from 'react';
import { CircleStackIcon } from '@heroicons/react/24/solid';
import { SystemHealthItem } from '../molecules/SystemHealthItem';

export interface SystemHealth {
  opfsUsed: number;
  opfsTotal: number;
}

interface SidebarFooterProps {
  systemHealth: SystemHealth;
}

export const SidebarFooter: React.FC<SidebarFooterProps> = ({ systemHealth }) => {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getStorageStatus = (): 'normal' | 'warning' | 'error' => {
    if (systemHealth.opfsTotal === 0) return 'normal';
    const usageRatio = systemHealth.opfsUsed / systemHealth.opfsTotal;
    if (usageRatio > 0.9) return 'error';
    if (usageRatio > 0.7) return 'warning';
    return 'normal';
  };

  return (
    <div className="border-t border-maycast-border py-3">
      <SystemHealthItem
        icon={<CircleStackIcon />}
        label="OPFS"
        value={`${formatBytes(systemHealth.opfsUsed)} / ${formatBytes(systemHealth.opfsTotal)}`}
        status={getStorageStatus()}
      />
    </div>
  );
};
