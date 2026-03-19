import type { DataSourceMeta } from '../../types/dataSource';

export type PortfolioTabKey = 'open' | 'closed' | 'transactions';
export type PortfolioTruthKind = 'real' | 'compatible' | 'derived' | 'fallback' | 'placeholder';
export type PortfolioTruthFieldKey =
  | 'latestClose'
  | 'positionStatus'
  | 'openDate'
  | 'openPrice'
  | 'shares'
  | 'marketValue'
  | 'costValue'
  | 'unrealizedPnl'
  | 'unrealizedPnlPct'
  | 'realizedPnl'
  | 'realizedPnlPct'
  | 'holdDays'
  | 'drawdownFromPeak'
  | 'actionSignal'
  | 'sellSignalType'
  | 'signalReason'
  | 'sourceStrategyPrimary'
  | 'sourceStrategies'
  | 'riskScoreTotal'
  | 'tradeAllowed'
  | 'blockReason'
  | 'positionCapMultiplierFinal'
  | 'nextAction'
  | 'executionHint'
  | 'summaryTotalPositions'
  | 'summaryCashRatio'
  | 'summaryExposureRatio'
  | 'summaryConcentration'
  | 'summaryTopHolding'
  | 'transactionDetail'
  | 'detail';

export interface PortfolioFieldTruthMeta {
  kind: PortfolioTruthKind;
  label: string;
  detail: string;
}

export type PortfolioFieldTruthMap = Partial<Record<PortfolioTruthFieldKey, PortfolioFieldTruthMeta>>;

export interface PortfolioMetricVm {
  label: string;
  value: string;
  helper: string;
  truthMeta?: PortfolioFieldTruthMeta;
  tone?: 'up' | 'down' | 'warn' | 'muted' | 'info';
}

export interface PortfolioSummaryVm {
  title: string;
  description: string;
  dataSource?: DataSourceMeta;
  metrics: PortfolioMetricVm[];
}

export interface PortfolioTabVm {
  label: string;
  title: string;
  description: string;
  dataSource?: DataSourceMeta;
  tableDataSource?: DataSourceMeta;
  emptyTitle: string;
  emptyText: string;
}

export interface PortfolioTransactionRowVm {
  id: number;
  portfolioId: number;
  tsCode: string;
  name: string;
  tradeDate: string;
  tradeType: string;
  tradeTypeLabel: string;
  price: number;
  shares: number;
  amount: number;
  triggerSource: string | null;
  triggerSourceLabel: string;
  signalType: string | null;
  notes: string | null;
  truthMeta: PortfolioFieldTruthMap;
}

export interface PortfolioActionShellVm {
  key: 'add' | 'reduce' | 'close';
  label: string;
  enabled: boolean;
  tone: 'primary' | 'neutral' | 'warning';
  note: string;
}

export interface PortfolioBaseRowVm {
  id: number;
  tsCode: string;
  name: string;
  status: 'open' | 'closed';
  statusLabel: string;
  sourceStrategy: string;
  sourceStrategyLabel: string;
  fromWatchlist: boolean;
  sourceHint: string;
  openDate: string;
  openPrice: number;
  shares: number;
  holdDays: number | null;
  latestClose: number | null;
  todayPnl: number | null;
  todayPnlPct: number | null;
  costAmount: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  actionSignal: string | null;
  actionLabel: string;
  exitSuggestion: string;
  signalReason: string | null;
  isFallbackSignalReason: boolean;
  riskHint: string;
  nextAction: string;
  relatedTransactions: PortfolioTransactionRowVm[];
  rawActionSignal: string | null;
  truthMeta: PortfolioFieldTruthMap;
  contextDataSource?: DataSourceMeta;
  detailDataSource?: DataSourceMeta;
  drawdownFromPeak?: number | null;
  positionCapMultiplierFinal?: number | null;
  primaryConcept?: string | null;
  isLeader?: boolean;
  leaderReason?: string | null;
}

export type PortfolioOpenRowVm = PortfolioBaseRowVm;

export interface PortfolioClosedRowVm extends PortfolioBaseRowVm {
  closeDate: string | null;
  closePrice: number | null;
  realizedPnl: number | null;
  realizedPnlPct: number | null;
  exitReason: string;
}

export interface PortfolioContextLinkVm {
  key: 'source' | 'watchlist' | 'transactions';
  label: string;
  enabled: boolean;
  note?: string;
}

export interface PortfolioContextVm {
  title: string;
  code: string;
  statusLabel: string;
  sourceStrategyLabel: string;
  sourceHint: string;
  sourceQueryLabel: string;
  sourceQueryValue: string;
  dataSource?: DataSourceMeta;
  detailDataSource?: DataSourceMeta;
  holdingFacts: Array<{ label: string; value: string }>;
  judgementFacts: Array<{ label: string; value: string }>;
  transactionSummary: string;
  relatedLinks: PortfolioContextLinkVm[];
  actionShells: PortfolioActionShellVm[];
}

export interface PortfolioTransactionPanelVm {
  title: string;
  description: string;
  relatedLabel: string;
  dataSource?: DataSourceMeta;
  rows: PortfolioTransactionRowVm[];
  total: number;
  emptyTitle: string;
  emptyText: string;
}

export interface PortfolioWorkspaceVm {
  tradeDate: string;
  generatedAtText: string;
  dataSource?: DataSourceMeta;
  tabs: Record<PortfolioTabKey, PortfolioTabVm>;
  summary: Record<PortfolioTabKey, PortfolioSummaryVm>;
  openRows: PortfolioOpenRowVm[];
  closedRows: PortfolioClosedRowVm[];
  transactions: PortfolioTransactionPanelVm;
}
