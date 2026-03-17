export type ContextPanelEntityType =
  | 'stock'
  | 'signal'
  | 'watchlist-item'
  | 'portfolio-item'
  | 'risk-item'
  | 'research-item'
  | 'system-item'
  | 'custom';

export type ContextPanelSourcePage =
  | 'dashboard'
  | 'signals'
  | 'watchlist'
  | 'portfolio'
  | 'risk'
  | 'research'
  | 'system'
  | 'execution'
  | 'direct';

export type ContextPanelTagTone = 'neutral' | 'source' | 'strategy' | 'state' | 'risk';

export type ContextPanelLoadStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'partial'
  | 'empty'
  | 'error';

import type { DataSourceMeta } from './dataSource';

export interface ContextPanelTag {
  label: string;
  tone?: ContextPanelTagTone;
}

export interface ContextPanelAction {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  note?: string;
}

export interface ContextPanelPayloadBase {
  title?: string;
  subtitle?: string;
  summary?: string;
}

export interface StockContextPanelPayload extends ContextPanelPayloadBase {
  name?: string;
  tsCode?: string;
  sourceStrategy?: string | null;
  tags?: ContextPanelTag[];
  summaryItems?: Array<{
    label: string;
    value: string;
  }>;
  actions?: ContextPanelAction[];
}

export interface ContextPanelState {
  isOpen: boolean;
  key: string | null;
  tsCode: string | null;
  source: ContextPanelSourcePage;
  tradeDate: string | null;
  tab: string | null;
  status: ContextPanelLoadStatus;
  entityType: ContextPanelEntityType | null;
  entityKey: string | null;
  sourcePage: ContextPanelSourcePage;
  focus: string | null;
  activeTab: string | null;
  payloadVersion: string;
  payload: ContextPanelPayloadBase | StockContextPanelPayload | Record<string, unknown> | null;
}

export interface ContextPanelOpenRequest {
  entityType: ContextPanelEntityType;
  entityKey: string;
  sourcePage: ContextPanelSourcePage;
  tradeDate?: string | null;
  focus?: string | null;
  activeTab?: string | null;
  status?: ContextPanelLoadStatus;
  payloadVersion?: string;
  payload?: ContextPanelPayloadBase | StockContextPanelPayload | Record<string, unknown> | null;
}

export interface StockContextMainData {
  tsCode: string;
  name: string;
  industry: string | null;
  close: number | null;
  pctChg: number | null;
  turnoverRate: number | null;
  amountYi: number | null;
  inWatchlist: boolean;
  sourceStrategy: string | null;
  buySignal: string | null;
  sellSignal: string | null;
}

export interface StockContextKlineData {
  latestDate: string | null;
  latestClose: number | null;
  latestOpen: number | null;
  latestHigh: number | null;
  latestLow: number | null;
  lastFiveCloses: number[];
}

export interface StockContextRiskData {
  tradeAllowed: boolean | null;
  riskLevel: string | null;
  riskScoreTotal: number | null;
  blockReason: string | null;
  blockSource: string | null;
  capMultiplier: number | null;
}

export interface StockContextLifecycleData {
  lifecycleLabel: string;
  entryDate: string | null;
  poolDay: number | null;
  gainSinceEntry: number | null;
  positionStatus: string | null;
}

export interface StockContextViewModel {
  status: ContextPanelLoadStatus;
  statusText: string;
  title: string;
  tsCode: string;
  sourceLabel: string;
  sourceStrategy: string | null;
  tags: ContextPanelTag[];
  summaryItems: Array<{
    label: string;
    value: string;
  }>;
  actions: ContextPanelAction[];
  main: StockContextMainData | null;
  dataSource?: DataSourceMeta;
  kline: {
    status: ContextPanelLoadStatus;
    data: StockContextKlineData | null;
    note: string;
    dataSource?: DataSourceMeta;
  };
  risk: {
    status: ContextPanelLoadStatus;
    data: StockContextRiskData | null;
    note: string;
    dataSource?: DataSourceMeta;
  };
  lifecycle: {
    status: ContextPanelLoadStatus;
    data: StockContextLifecycleData | null;
    note: string;
    dataSource?: DataSourceMeta;
  };
}
