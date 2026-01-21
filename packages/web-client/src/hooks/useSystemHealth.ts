import { useState, useEffect } from 'react';
import type { SystemHealth } from '../components/organisms/SidebarFooter';

export const useSystemHealth = (): SystemHealth => {
  const [cpuLoad, setCpuLoad] = useState(0);
  const [opfsUsed, setOpfsUsed] = useState(0);
  const [opfsTotal, setOpfsTotal] = useState(0);
  const [networkStatus, setNetworkStatus] = useState<SystemHealth['networkStatus']>('online');

  // Monitor CPU Load (estimated using performance metrics)
  useEffect(() => {
    let lastTime = performance.now();
    let taskCount = 0;

    const measureCPU = () => {
      const currentTime = performance.now();
      const elapsed = currentTime - lastTime;

      // Simple estimation based on frame rate
      // In a busy CPU, this callback will be delayed
      const delay = elapsed - 2000; // Expected 2000ms interval
      const estimatedLoad = Math.min(100, Math.max(0, (delay / 2000) * 100));

      setCpuLoad(estimatedLoad);
      lastTime = currentTime;
      taskCount++;
    };

    // Check every 2 seconds
    const interval = setInterval(measureCPU, 2000);

    return () => clearInterval(interval);
  }, []);

  // Monitor OPFS Usage
  useEffect(() => {
    const updateStorage = async () => {
      try {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const estimate = await navigator.storage.estimate();
          setOpfsUsed(estimate.usage || 0);
          setOpfsTotal(estimate.quota || 0);
        }
      } catch (err) {
        console.error('Failed to get storage estimate:', err);
      }
    };

    // Update immediately and then every 5 seconds
    updateStorage();
    const interval = setInterval(updateStorage, 5000);

    return () => clearInterval(interval);
  }, []);

  // Monitor Network Status
  useEffect(() => {
    const updateNetworkStatus = () => {
      if (!navigator.onLine) {
        setNetworkStatus('offline');
        return;
      }

      // Check connection quality if available
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

      if (connection?.effectiveType) {
        const effectiveType = connection.effectiveType;
        if (effectiveType === 'slow-2g' || effectiveType === '2g') {
          setNetworkStatus('degraded');
        } else {
          setNetworkStatus('online');
        }
      } else {
        setNetworkStatus('online');
      }
    };

    updateNetworkStatus();

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    // Also listen to connection change events if available
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (connection) {
      connection.addEventListener('change', updateNetworkStatus);
    }

    return () => {
      window.removeEventListener('online', updateNetworkStatus);
      window.removeEventListener('offline', updateNetworkStatus);
      if (connection) {
        connection.removeEventListener('change', updateNetworkStatus);
      }
    };
  }, []);

  return {
    cpuLoad,
    opfsUsed,
    opfsTotal,
    networkStatus,
  };
};
