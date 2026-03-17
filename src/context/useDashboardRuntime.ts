import { createContext, useContext } from 'react'
import type { StatusTone } from '../types/dashboard'

export interface DashboardRuntimeSnapshot {
  source: 'mock' | 'real'
  tradeDate: string
  generatedAt: string
  systemStatusLabel: string
  systemTone: StatusTone
  versionText: string
  marketRegime?: string | null
}

export interface DashboardRuntimeContextValue {
  snapshot: DashboardRuntimeSnapshot | null
  setSnapshot: (snapshot: DashboardRuntimeSnapshot | null) => void
}

export const DashboardRuntimeContext = createContext<DashboardRuntimeContextValue | null>(null)

export function useDashboardRuntime() {
  const context = useContext(DashboardRuntimeContext)
  if (!context) {
    throw new Error('useDashboardRuntime must be used within <DashboardRuntimeProvider>')
  }
  return context
}
