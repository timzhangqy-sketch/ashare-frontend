import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchCrossStrategies } from '../api';
import { CrossStrategyContext } from './useCrossStrategy';

export function CrossStrategyProvider({ children }: { children: ReactNode }) {
  const [crossMap, setCrossMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetchCrossStrategies()
      .then(setCrossMap)
      .catch(() => {});
  }, []);

  return (
    <CrossStrategyContext.Provider value={{ crossMap }}>
      {children}
    </CrossStrategyContext.Provider>
  );
}
