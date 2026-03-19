import type { DataSourceMeta } from './dataSource';

export type WatchlistViewKey = 'table' | 'group' | 'heat';
export type WatchlistLifecycleStatus = 'candidate' | 'signaled' | 'handed_off' | 'blocked';
export type WatchlistSignalFilter = 'all' | 'buy' | 'sell' | 'any' | 'none';
export type WatchlistGroupBy = 'lifecycle' | 'strategy';
export type WatchlistActionKind = 'detail' | 'strategy' | 'portfolio' | 'risk' | 'placeholder';
export type WatchlistTruthKind = 'real' | 'compatible' | 'derived' | 'fallback' | 'placeholder';
export type WatchlistTruthFieldKey =
  | 'latestClose'
  | 'pctChg'
  | 'gainSinceEntry'
  | 'poolDay'
  | 'watchStatus'
  | 'riskScoreTotal'
  | 'tradeAllowed'
  | 'blockReason'
  | 'sourceStrategyPrimary'
  | 'crossTags'
  | 'crossStrategyCount'
  | 'buySignal'
  | 'sellSignal'
  | 'watchReason'
  | 'pinned'
  | 'ignored'
  | 'handoffStatus'
  | 'followAction'
  | 'detail';

export interface WatchlistFieldTruthMeta {
  kind: WatchlistTruthKind;
  label: string;
  detail: string;
}

export type WatchlistFieldTruthMap = Partial<Record<WatchlistTruthFieldKey, WatchlistFieldTruthMeta>>;

export interface WatchlistMetricVm {
  label: string;
  value: string;
  helper: string;
}

export interface WatchlistFilterVm {
  label: string;
  value: string;
}

export interface WatchlistFilterOptionVm {
  label: string;
  value: string;
}

export interface WatchlistActionVm {
  key: string;
  label: string;
  kind: WatchlistActionKind;
  disabled?: boolean;
  href?: string | null;
  note?: string;
  summaryType?: 'detail' | 'jump' | 'handoff' | 'placeholder';
}

export interface WatchlistRowVm {
  id: string;
  tsCode: string;
  name: string;
  strategy: string;
  sourceStrategyPrimary: string;
  entryDate: string | null;
  poolDay: number;
  latestClose: number | null;
  latestPctChg: number | null;
  gainSinceEntry: number | null;
  maxGain: number | null;
  drawdownFromPeak: number | null;
  entryPrice: number | null;
  entryScore?: number | null;
  buySignal: string | null;
  sellSignal: string | null;
  vrToday: number | null;
  turnoverRate: number | null;
  aboveMa20Days: number | null;
  lifecycleStatus: WatchlistLifecycleStatus;
  lifecycleStatusLabel: string;
  watchStatus: WatchlistLifecycleStatus;
  lifecycleStatusOrigin: 'derived';
  inPortfolio: boolean;
  transferredToPortfolio: boolean;
  portfolioStatus: string | null;
  portfolioId: number | null;
  riskScoreTotal: number | null;
  tradeAllowed: boolean | null;
  blockReason: string | null;
  crossTags: string[];
  crossStrategyCount: number;
  signalState: WatchlistSignalFilter;
  signalLabel: string;
  watchReason: string | null;
  pinned: boolean | null;
  ignored: boolean | null;
  nextAction: string;
  sourceLabel: string;
  sourceOrigin: 'primary' | 'derived';
  truthMeta: WatchlistFieldTruthMap;
  contextDataSource?: DataSourceMeta;
  detailDataSource?: DataSourceMeta;
  availableActions: WatchlistActionVm[];
  primaryConcept?: string | null;
  isLeader?: boolean;
  leaderReason?: string | null;
}

export interface WatchlistGroupVm {
  key: string;
  label: string;
  helper: string;
  count: number;
  rows: WatchlistRowVm[];
}

export interface WatchlistFiltersVm {
  statusOptions: WatchlistFilterOptionVm[];
  strategyOptions: WatchlistFilterOptionVm[];
  signalOptions: WatchlistFilterOptionVm[];
}

export interface WatchlistWorkspaceVm {
  tradeDate: string;
  totalCount: number;
  dataSource?: DataSourceMeta;
  listDataSource?: DataSourceMeta;
  groupDataSource?: DataSourceMeta;
  heatDataSource?: DataSourceMeta;
  rows: WatchlistRowVm[];
  metrics: WatchlistMetricVm[];
  filters: WatchlistFilterVm[];
  filterOptions: WatchlistFiltersVm;
  viewOptions: Array<{
    key: WatchlistViewKey;
    label: string;
    helper: string;
    enabled: boolean;
  }>;
  groupByOptions: WatchlistFilterOptionVm[];
  groups: WatchlistGroupVm[];
  emptyTitle: string;
  emptyText: string;
  sourceNotes: string[];
}

export interface WatchlistQueryState {
  source: string | null;
  focus: string | null;
  strategy: string | null;
  status: string | null;
  signal: string | null;
  query: string | null;
  view: WatchlistViewKey;
  groupBy: WatchlistGroupBy;
}
