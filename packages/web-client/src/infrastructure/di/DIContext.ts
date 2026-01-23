import { createContext } from 'react';
import { DIContainer } from './DIContainer';

/**
 * DIContainer の React Context
 */
export const DIContext = createContext<DIContainer | null>(null);
