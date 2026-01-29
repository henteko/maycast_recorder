/**
 * useSystemHealth Hook
 *
 * システムヘルス情報（OPFSストレージ使用量）を監視
 *
 * ブラウザAPIを直接使用してリアルタイムのシステム情報を提供
 * Use Caseを介する必要がない純粋なUI情報
 */

import { useState, useEffect } from 'react';
import type { SystemHealth } from '../components/organisms/SidebarFooter';
import { calculateTotalUsage } from '../../infrastructure/storage/opfs';

export const useSystemHealth = (): SystemHealth => {
  const [opfsUsed, setOpfsUsed] = useState(0);
  const [opfsTotal, setOpfsTotal] = useState(0);

  // OPFS使用量を正確に計算
  useEffect(() => {
    const updateStorage = async () => {
      try {
        // OPFS内の実際のファイルサイズを計算
        const used = await calculateTotalUsage();
        setOpfsUsed(used);

        // ブラウザのストレージクォータ（上限）を取得
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const estimate = await navigator.storage.estimate();
          setOpfsTotal(estimate.quota || 0);
        }
      } catch (err) {
        console.error('Failed to get storage estimate:', err);
      }
    };

    // 初回実行と5秒ごとに更新
    updateStorage();
    const interval = setInterval(updateStorage, 5000);

    return () => clearInterval(interval);
  }, []);

  return {
    opfsUsed,
    opfsTotal,
  };
};
