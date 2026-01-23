import type { ReactNode } from 'react';
import { DIContext } from './DIContext';
import type { DIContainer } from './DIContainer';

/**
 * DIContainer Provider
 */
export interface DIProviderProps {
  container: DIContainer;
  children: ReactNode;
}

export function DIProvider({ container, children }: DIProviderProps) {
  return <DIContext.Provider value={container}>{children}</DIContext.Provider>;
}
