import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { ContextPanelOpenRequest, ContextPanelState } from '../types/contextPanel';
import { ContextPanelContext, type ContextPanelContextValue } from './useContextPanel';

const DEFAULT_PANEL_STATE: ContextPanelState = {
  isOpen: false,
  key: null,
  tsCode: null,
  source: 'direct',
  tradeDate: null,
  tab: null,
  status: 'idle',
  entityType: null,
  entityKey: null,
  sourcePage: 'direct',
  focus: null,
  activeTab: null,
  payloadVersion: 'v1',
  payload: null,
};

export function ContextPanelProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<ContextPanelState>(DEFAULT_PANEL_STATE);

  const openPanel = useCallback((request: ContextPanelOpenRequest) => {
    setPanel(current => {
      const next: ContextPanelState = {
        isOpen: true,
        key: request.entityKey,
        tsCode: request.entityType === 'stock' ? request.entityKey : null,
        source: request.sourcePage,
        tradeDate: request.tradeDate ?? null,
        tab: request.activeTab ?? null,
        status: request.status ?? 'ready',
        entityType: request.entityType,
        entityKey: request.entityKey,
        sourcePage: request.sourcePage,
        focus: request.focus ?? request.entityKey,
        activeTab: request.activeTab ?? null,
        payloadVersion: request.payloadVersion ?? 'v1',
        payload: request.payload ?? null,
      };

      if (
        current.isOpen === next.isOpen
        && current.key === next.key
        && current.tsCode === next.tsCode
        && current.source === next.source
        && current.tradeDate === next.tradeDate
        && current.tab === next.tab
        && current.status === next.status
        && current.entityType === next.entityType
        && current.entityKey === next.entityKey
        && current.sourcePage === next.sourcePage
        && current.focus === next.focus
        && current.activeTab === next.activeTab
        && current.payloadVersion === next.payloadVersion
        && current.payload === next.payload
      ) {
        return current;
      }

      return next;
    });
  }, []);

  const closePanel = useCallback(() => {
    setPanel(current => (current.isOpen ? DEFAULT_PANEL_STATE : current));
  }, []);

  const patchPanel = useCallback((patch: Partial<Omit<ContextPanelState, 'isOpen'>>) => {
    setPanel(current => {
      const next = {
        ...current,
        ...patch,
      };

      if (
        current.key === next.key
        && current.tsCode === next.tsCode
        && current.source === next.source
        && current.tradeDate === next.tradeDate
        && current.tab === next.tab
        && current.status === next.status
        && current.isOpen === next.isOpen
        && current.entityType === next.entityType
        && current.entityKey === next.entityKey
        && current.sourcePage === next.sourcePage
        && current.focus === next.focus
        && current.activeTab === next.activeTab
        && current.payloadVersion === next.payloadVersion
        && current.payload === next.payload
      ) {
        return current;
      }

      return next;
    });
  }, []);

  const value = useMemo<ContextPanelContextValue>(
    () => ({
      panel,
      openContext: openPanel,
      updateContext: patchPanel,
      openPanel,
      closePanel,
      patchPanel,
      clearContext: closePanel,
    }),
    [panel, openPanel, closePanel, patchPanel],
  );

  return <ContextPanelContext.Provider value={value}>{children}</ContextPanelContext.Provider>;
}
