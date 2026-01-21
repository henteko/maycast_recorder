import React from 'react';
import { CpuChipIcon, CircleStackIcon, SignalIcon } from '@heroicons/react/24/solid';
import { SystemHealthItem } from '../molecules/SystemHealthItem';

export interface SystemHealth {
  cpuLoad: number;
  opfsUsed: number;
  opfsTotal: number;
  networkStatus: 'online' | 'offline' | 'degraded';
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

  const getNetworkStatusText = (status: SystemHealth['networkStatus']): string => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'offline':
        return 'Offline';
      case 'degraded':
        return 'Degraded';
    }
  };

  const getNetworkStatus = (
    status: SystemHealth['networkStatus']
  ): 'normal' | 'warning' | 'error' => {
    switch (status) {
      case 'online':
        return 'normal';
      case 'offline':
        return 'error';
      case 'degraded':
        return 'warning';
    }
  };

  return (
    <div className="border-t border-maycast-border py-3">
      <SystemHealthItem
        icon={<CpuChipIcon />}
        label="CPU Load"
        value={`${systemHealth.cpuLoad.toFixed(0)}%`}
        status={systemHealth.cpuLoad > 80 ? 'warning' : 'normal'}
      />
      <SystemHealthItem
        icon={<CircleStackIcon />}
        label="OPFS"
        value={`${formatBytes(systemHealth.opfsUsed)} / ${formatBytes(systemHealth.opfsTotal)}`}
      />
      <SystemHealthItem
        icon={<SignalIcon />}
        label="Network"
        value={getNetworkStatusText(systemHealth.networkStatus)}
        status={getNetworkStatus(systemHealth.networkStatus)}
      />
    </div>
  );
};
