export type ResearchTab = 'summary' | 'ic' | 'attribution' | 'resonance';
export type ResearchSource = 'dashboard' | 'signals' | 'watchlist' | 'portfolio' | 'risk' | 'execution' | 'direct';
export type ResearchHorizon = 'T1' | 'T3' | 'T5' | 'T10' | 'T20';
export type ResearchGroupType = 'strategy' | 'market' | 'style';
export type ResearchSortField =
  | 'sample_n'
  | 'win_rate'
  | 'avg_return'
  | 'ic'
  | 'icir'
  | 'cross_strategy_count'
  | 'excess_return';
export type ResearchSortDirection = 'asc' | 'desc';
export type ResearchDataStatus = 'real' | 'fallback' | 'unavailable';

import type { DataSourceMeta } from './dataSource';

export interface ResearchQueryModel {
  tab: ResearchTab;
  source: ResearchSource;
  focus: string | null;
  strategy: string | null;
  riskLevel: string | null;
  resonance: string | null;
  tradeDate: string | null;
}

export interface ResearchFilterState {
  source: ResearchSource;
  focus: string | null;
  strategy: string | null;
  riskLevel: string | null;
  resonance: string | null;
  tradeDate: string | null;
  horizon: ResearchHorizon;
  groupType: ResearchGroupType;
}

export interface ResearchSortState {
  field: ResearchSortField;
  direction: ResearchSortDirection;
}

export interface ResearchDrilldownTarget {
  kind: 'strategy' | 'stock' | 'factor' | 'group' | 'combo';
  key: string;
  label: string;
  note: string;
}

export interface ResearchMetric {
  label: string;
  value: string;
  helper: string;
}

export interface ResearchFilterChip {
  label: string;
  value: string;
}

export interface ResearchTabMeta {
  label: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyText: string;
}

export interface ResearchTabState {
  status: ResearchDataStatus;
  label: string;
  note: string;
  dataSource?: DataSourceMeta;
}

export interface BacktestSummaryRaw {
  strategy: string;
  sample_n: number;
  t1_avg_return: number;
  t3_avg_return: number;
  t5_avg_return: number;
  t10_avg_return: number;
  t20_avg_return: number;
  win_rate: number;
  drawdown: number;
  version_snapshot: string;
}

export interface BacktestDetailRaw {
  ts_code: string;
  name: string;
  strategy: string;
  entry_date: string;
  entry_price: number;
  ret_t1?: number | null;
  ret_t3?: number | null;
  ret_t5?: number | null;
  ret_t10?: number | null;
  ret_t20?: number | null;
  result_t5?: 'win' | 'loss' | 'pending' | null;
}

export interface FactorIcRaw {
  factor_name: string;
  horizon: ResearchHorizon;
  ic: number;
  icir: number;
  bucket: string;
  corr_placeholder: string;
}

export interface AttributionRaw {
  group_type: ResearchGroupType;
  group_key: string;
  sample_n: number;
  avg_return: number;
  win_rate: number;
  drawdown: number;
}

export interface ResonanceRaw {
  ts_code: string;
  name: string;
  strategies: string[];
  strategy_count: number;
  avg_score: number;
}

export interface BacktestSummaryRow {
  id: string;
  strategy: string;
  sampleN: number;
  returns: Record<ResearchHorizon, number>;
  returnFieldState: Partial<Record<ResearchHorizon, 'real' | 'fallback'>>;
  winRate: number;
  drawdown: number;
  drawdownState: 'real' | 'fallback';
  versionSnapshot: string;
  versionState: 'real' | 'unavailable';
  highlightMetric: string;
  drilldown: ResearchDrilldownTarget;
}

export interface BacktestDetailRow {
  id: string;
  tsCode: string;
  name: string;
  strategy: string;
  entryDate: string;
  entryPrice: number;
  horizonReturns: Partial<Record<ResearchHorizon, number>>;
  statusLabel: string;
}

export interface FactorIcSummaryRow {
  id: string;
  factorName: string;
  horizon: ResearchHorizon;
  ic: number;
  icir: number;
  bucket: string;
  corrPlaceholder: string;
  signalLabel: string;
  drilldown: ResearchDrilldownTarget;
}

export interface FactorBucketRow {
  id: string;
  factorName: string;
  horizon: ResearchHorizon;
  bucket: string;
  avgReturn: number;
  winRate: number;
  sampleN: number;
}

export interface AttributionRow {
  id: string;
  groupType: ResearchGroupType;
  groupKey: string;
  sampleN: number;
  avgReturn: number;
  winRate: number;
  drawdown: number;
  contributionLabel: string;
  drilldown: ResearchDrilldownTarget;
}

export interface ResonanceRow {
  id: string;
  name: string;
  tsCode: string;
  strategyCount: number;
  strategiesDisplay: string;
  avgScore: number;
  drilldown: ResearchDrilldownTarget;
}

export interface ResearchContextModel {
  title: string;
  subtitle: string;
  sourceLabel: string;
  sourceSummary: string;
  summary: Array<{ label: string; value: string }>;
  detailRows: BacktestDetailRow[];
  nextSteps: string[];
}

export interface ResearchWorkspaceViewModel {
  tabs: Record<ResearchTab, ResearchTabMeta>;
  tabStates: Record<ResearchTab, ResearchTabState>;
  metrics: ResearchMetric[];
  filters: ResearchFilterChip[];
  handoffText: string;
  filterState: ResearchFilterState;
  sortState: ResearchSortState;
  activeTarget: ResearchDrilldownTarget | null;
  summaryRows: BacktestSummaryRow[];
  detailRows: BacktestDetailRow[];
  icSummaryRows: FactorIcSummaryRow[];
  bucketRows: FactorBucketRow[];
  attributionRows: AttributionRow[];
  resonanceRows: ResonanceRow[];
  context: ResearchContextModel | null;
  dataSources: Record<ResearchTab, DataSourceMeta>;
}
