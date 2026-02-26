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
    let persistRequested = false;

    const updateStorage = async () => {
      try {
        // 初回のみ永続ストレージをリクエスト（クォータ増加 + 自動削除防止）
        if (!persistRequested && 'storage' in navigator && 'persist' in navigator.storage) {
          await navigator.storage.persist();
          persistRequested = true;
        }

        // OPFS内の実際のファイルサイズを計算
        const used = await calculateTotalUsage();
        setOpfsUsed(used);

        // OPFSが利用可能な最大容量を計算
        // estimate.quota はオリジン全体のクォータ、estimate.usage はオリジン全体の使用量
        // OPFSが使える上限 = OPFS使用量 + 残り容量(quota - usage)
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const estimate = await navigator.storage.estimate();
          const quota = estimate.quota || 0;
          const totalUsage = estimate.usage || 0;
          const remaining = Math.max(0, quota - totalUsage);
          setOpfsTotal(used + remaining);
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
