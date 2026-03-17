import { createContext, useContext } from 'react'
import type { ContextPanelOpenRequest, ContextPanelState } from '../types/contextPanel'

export interface ContextPanelContextValue {
  panel: ContextPanelState
  openContext: (request: ContextPanelOpenRequest) => void
  updateContext: (patch: Partial<Omit<ContextPanelState, 'isOpen'>>) => void
  openPanel: (request: ContextPanelOpenRequest) => void
  closePanel: () => void
  patchPanel: (patch: Partial<Omit<ContextPanelState, 'isOpen'>>) => void
  clearContext: () => void
}

export const ContextPanelContext = createContext<ContextPanelContextValue | null>(null)

export function useContextPanel() {
  const context = useContext(ContextPanelContext)
  if (!context) {
    throw new Error('useContextPanel must be used within ContextPanelProvider')
  }
  return context
}
