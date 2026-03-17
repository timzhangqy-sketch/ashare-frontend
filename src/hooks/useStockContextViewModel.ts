import { loadStockContextViewModel } from '../adapters/contextPanel';
import { useApiData } from './useApiData';
import type {
  ContextPanelSourcePage,
  ContextPanelState,
  StockContextPanelPayload,
  StockContextViewModel,
} from '../types/contextPanel';

interface UseStockContextViewModelOptions {
  tsCode: string | null | undefined;
  tradeDate: string;
  sourcePage: ContextPanelSourcePage;
  activeTab?: string | null;
  focus?: string | null;
  payload?: StockContextPanelPayload | null;
  enabled?: boolean;
}

function buildPanelState({
  tsCode,
  tradeDate,
  sourcePage,
  activeTab,
  focus,
  payload,
}: Omit<UseStockContextViewModelOptions, 'enabled'> & { tsCode: string }): ContextPanelState {
  return {
    isOpen: true,
    key: tsCode,
    tsCode,
    source: sourcePage,
    tradeDate,
    tab: activeTab ?? null,
    status: 'ready',
    entityType: 'stock',
    entityKey: tsCode,
    sourcePage,
    focus: focus ?? tsCode,
    activeTab: activeTab ?? null,
    payloadVersion: 'v1',
    payload: payload ?? null,
  };
}

export function useStockContextViewModel({
  tsCode,
  tradeDate,
  sourcePage,
  activeTab = null,
  focus = null,
  payload = null,
  enabled = true,
}: UseStockContextViewModelOptions) {
  const requestKey = [
    enabled ? 'on' : 'off',
    tsCode ?? '',
    tradeDate,
    sourcePage,
    activeTab ?? '',
    focus ?? '',
    payload?.sourceStrategy ?? '',
    payload?.name ?? payload?.title ?? '',
  ].join('|');

  return useApiData<StockContextViewModel | null>(
    () => {
      if (!enabled || !tsCode) return Promise.resolve(null);
      return loadStockContextViewModel(
        buildPanelState({
          tsCode,
          tradeDate,
          sourcePage,
          activeTab,
          focus,
          payload,
        }),
        tradeDate,
      );
    },
    [requestKey],
  );
}
