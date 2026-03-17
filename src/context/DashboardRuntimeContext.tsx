import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  DashboardRuntimeContext,
  type DashboardRuntimeSnapshot,
} from './useDashboardRuntime';

export function DashboardRuntimeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<DashboardRuntimeSnapshot | null>(null);

  const value = useMemo(
    () => ({ snapshot, setSnapshot }),
    [snapshot],
  );

  return (
    <DashboardRuntimeContext.Provider value={value}>
      {children}
    </DashboardRuntimeContext.Provider>
  );
}
