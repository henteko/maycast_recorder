import { useContext } from 'react';
import { DIContext } from './DIContext';
import type { DIContainer } from './DIContainer';

/**
 * DIContainer を取得する Hook
 */
export function useDI(): DIContainer {
  const container = useContext(DIContext);
  if (!container) {
    throw new Error('useDI must be used within DIProvider');
  }
  return container;
}
