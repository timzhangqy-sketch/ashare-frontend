export type RiskTab = 'gate' | 'scores' | 'breakdown' | 'events';
export type RiskSource = 'dashboard' | 'signals' | 'watchlist' | 'portfolio' | 'direct';
export type RiskScope = 'all' | 'watchlist' | 'portfolio';
export type RiskDataStatus = 'backend' | 'mixed' | 'fallback';

import type { DataSourceMeta } from './dataSource';

export interface RiskQueryModel {
  tab: RiskTab;
  source: RiskSource;
  scope: RiskScope;
  focus: string | null;
}

export interface RiskFilterModel {
  label: string;
  value: string;
}

export interface RiskOverviewMetric {
  label: string;
  value: string;
  helper: string;
  dataSource?: DataSourceMeta;
}

export interface RiskTabMeta {
  label: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyText: string;
}

export interface RiskRawDto {
  ts_code: string;
  name: string;
  trade_date: string;
  source_domain: 'watchlist' | 'portfolio';
  source_strategy: string | null;
  in_watchlist: boolean;
  in_portfolio: boolean;
  trade_allowed: boolean;
  block_reason: string | null;
  block_source: string | null;
  risk_score_total: number;
  risk_score_financial: number;
  risk_score_market: number;
  risk_score_event: number;
  risk_score_compliance: number;
  cap_financial: number;
  cap_market: number;
  cap_event: number;
  cap_compliance: number;
  position_cap_multiplier_final: number;
  risk_level: 'low' | 'medium' | 'high';
  notes: string[];
  detail_json?: Record<string, unknown> | null;
}

export interface RiskDomainModel {
  tsCode: string;
  name: string;
  tradeDate: string;
  sourceDomain: 'watchlist' | 'portfolio';
  sourceStrategy: string | null;
  inWatchlist: boolean;
  inPortfolio: boolean;
  tradeAllowed: boolean;
  blockReason: string | null;
  blockSource: string | null;
  riskScoreTotal: number;
  riskScoreFinancial: number;
  riskScoreMarket: number;
  riskScoreEvent: number;
  riskScoreCompliance: number;
  capFinancial: number;
  capMarket: number;
  capEvent: number;
  capCompliance: number;
  positionCapMultiplierFinal: number;
  dimCap: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendedPositionText: string;
  tradeAllowedLabel: string;
  riskLevelLabel: string;
  notes: string[];
  dataStatus: RiskDataStatus;
  dataSource?: DataSourceMeta;
}

export interface GateBlockRow {
  id: string;
  tsCode: string;
  name: string;
  sourceDomainLabel: string;
  tradeAllowed: boolean;
  tradeAllowedLabel: string;
  blockReason: string;
  blockSource: string;
  suggestion: string;
  sourceHref: string | null;
}

export interface RiskScoreRow {
  id: string;
  tsCode: string;
  name: string;
  riskScoreTotal: number;
  riskScoreFinancial: number;
  riskScoreMarket: number;
  riskScoreEvent: number;
  riskScoreCompliance: number;
  dimCap: number;
  positionCapMultiplierFinal: number;
  recommendedPositionText: string;
  riskLevelLabel: string;
  watchlistHref: string | null;
  portfolioHref: string | null;
}

export interface RiskBreakdownRow {
  id: string;
  tsCode: string;
  name: string;
  sourceStrategy: string | null;
  tradeAllowedLabel: string;
  blockReason: string;
  riskScoreTotal: number;
  riskScoreFinancial: number;
  riskScoreMarket: number;
  riskScoreEvent: number;
  riskScoreCompliance: number;
  capFinancial: number;
  capMarket: number;
  capEvent: number;
  capCompliance: number;
  dimCap: number;
  positionCapMultiplierFinal: number;
  recommendedPositionText: string;
  explanation: string;
}

export interface RiskEventRow {
  id: string;
  tsCode: string;
  name: string;
  eventTime: string;
  eventType: string;
  changeLabel: string;
  sourceDomainLabel: string;
  statusLabel: string;
  followUp: string;
}

export interface RiskContextModel {
  title: string;
  tsCode: string;
  sourceDomainLabel: string;
  sourceStrategyLabel: string;
  sourceLabel: string;
  tradeAllowedLabel: string;
  recommendedNextStep: string;
  gateConclusion: Array<{ label: string; value: string }>;
  scoreSummary: Array<{ label: string; value: string }>;
  positionSummary: Array<{ label: string; value: string }>;
}

export interface RiskWorkspaceViewModel {
  tradeDate: string;
  generatedAtText: string;
  tabs: Record<RiskTab, RiskTabMeta>;
  metrics: RiskOverviewMetric[];
  filters: RiskFilterModel[];
  domainRows: RiskDomainModel[];
  gateRows: GateBlockRow[];
  scoreRows: RiskScoreRow[];
  breakdownRows: RiskBreakdownRow[];
  eventRows: RiskEventRow[];
  dataStatus: Record<RiskTab, RiskDataStatus>;
  dataSources: Record<RiskTab, DataSourceMeta>;
  dataSource?: DataSourceMeta;
}
