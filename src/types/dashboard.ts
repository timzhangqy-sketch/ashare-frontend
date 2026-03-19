export type DashboardLoadState = 'normal' | 'warning' | 'loading' | 'empty' | 'error';

export type DashboardDataSource = 'mock' | 'real';
export type DashboardFieldState = 'real' | 'missing' | 'invalid';

import type { DataSourceMeta } from './dataSource';

export type StatusTone = 'neutral' | 'positive' | 'warning' | 'danger' | 'info';
export type HealthStatus = 'healthy' | 'warning' | 'danger';

export interface RawDashboardTopOpportunity {
  ts_code: string;
  name: string;
  strategy_label: string | null;
  sector_label: string | null;
  score: number | null;
  hint: string | null;
}

export interface RawDashboardTodayChanges {
  new_signals: number | null;
  removed_signals: number | null;
  watchlist_delta: number | null;
  portfolio_delta: number | null;
  risk_alerts_delta: number | null;
  system_alerts_delta: number | null;
  summary_text: string | null;
}

export interface RawDashboardOpportunity {
  buy_signals_count: number | null;
  resonance_count: number | null;
  watchlist_candidates: number | null;
  strongest_strategy_label: string | null;
  hottest_sector_label: string | null;
  actionable_count: number | null;
  top_opportunities: RawDashboardTopOpportunity[] | null;
}

export interface RawDashboardRisk {
  gate_blocked_count: number | null;
  high_risk_watchlist_count: number | null;
  high_risk_positions_count: number | null;
  new_risk_events_count: number | null;
  highest_risk_name: string | null;
  highest_risk_score: number | null;
  risk_hint: string | null;
}

export interface RawDashboardPortfolio {
  position_type: string | null;
  positions_count: number | null;
  total_market_value: number | null;
  cash_ratio: number | null;
  daily_pnl: number | null;
  daily_pnl_pct: number | null;
  cumulative_pnl_pct: number | null;
  concentration_top1: number | null;
  sell_signals_count: number | null;
  action_hint: string | null;
}

export interface RawDashboardSystemHealth {
  pipeline_status: string | null;
  latest_success_time: string | null;
  failed_steps_count: number | null;
  data_coverage_pct: number | null;
  dq_status: string | null;
  api_health_status: string | null;
  version_label: string | null;
  system_hint: string | null;
}

export interface RawDashboardMarketBreadth {
  market_regime: string | null;
}

export interface RawDashboardSummaryPayload {
  trade_date: string | null;
  generated_at: string | null;
  version_snapshot: string | null;
  today_changes: RawDashboardTodayChanges | null;
  opportunity: RawDashboardOpportunity | null;
  risk: RawDashboardRisk | null;
  portfolio: RawDashboardPortfolio | null;
  system_health: RawDashboardSystemHealth | null;
  market_breadth?: RawDashboardMarketBreadth | null;
  market_index?: {
    indexes?: { ts_code: string; name: string; close: number | null; pct_change: number | null; prev_close: number | null }[];
    turnover?: { sh_amount: number | null; sz_amount: number | null; total_amount: number | null; total_count: number | null };
  } | null;
  market_summary?: string | null;
}

export interface RawDashboardSummaryResponse extends RawDashboardSummaryPayload {
  data?: RawDashboardSummaryPayload | null;
}

export interface MarketBreadthDto {
  marketRegime: string | null;
}

export interface MarketIndexItemDto {
  tsCode: string;
  name: string;
  close: number | null;
  pctChange: number | null;
  prevClose: number | null;
}

export interface MarketTurnoverDto {
  shAmount: number | null;
  szAmount: number | null;
  totalAmount: number | null;
  totalCount: number | null;
}

export interface MarketIndexDto {
  indexes: MarketIndexItemDto[];
  turnover: MarketTurnoverDto;
}

export interface DashboardSummaryDto {
  tradeDate: string | null;
  generatedAt: string | null;
  versionSnapshot: string | null;
  todayChanges: TodayChangesDto;
  opportunity: OpportunitySummaryDto;
  risk: RiskSummaryDto;
  portfolio: PortfolioSummaryDto;
  systemHealth: SystemHealthSummaryDto;
  marketBreadth?: MarketBreadthDto | null;
  marketIndex?: MarketIndexDto | null;
  marketSummary?: string | null;
  hotConcepts?: any[];
  hotStocks?: any[];
}

export interface TodayChangesDto {
  newSignals: number | null;
  removedSignals: number | null;
  watchlistDelta: number | null;
  portfolioDelta: number | null;
  riskAlertsDelta: number | null;
  systemAlertsDelta: number | null;
  summaryText: string | null;
}

export interface OpportunitySummaryDto {
  buySignalsCount: number | null;
  resonanceCount: number | null;
  watchlistCandidates: number | null;
  strongestStrategyLabel: string | null;
  hottestSectorLabel: string | null;
  actionableCount: number | null;
  topOpportunities: TopOpportunityDto[];
}

export interface TopOpportunityDto {
  tsCode: string;
  name: string;
  strategyLabel: string | null;
  sectorLabel: string | null;
  score: number | null;
  hint: string | null;
}

export interface RiskSummaryDto {
  gateBlockedCount: number | null;
  highRiskWatchlistCount: number | null;
  highRiskPositionsCount: number | null;
  newRiskEventsCount: number | null;
  highestRiskName: string | null;
  highestRiskScore: number | null;
  riskHint: string | null;
}

export interface PortfolioSummaryDto {
  positionType: string | null;
  positionsCount: number | null;
  totalMarketValue: number | null;
  cashRatio: number | null;
  dailyPnl: number | null;
  dailyPnlPct: number | null;
  cumulativePnlPct: number | null;
  concentrationTop1: number | null;
  sellSignalsCount: number | null;
  actionHint: string | null;
}

export interface SystemHealthSummaryDto {
  pipelineStatus: HealthStatus;
  latestSuccessTime: string | null;
  failedStepsCount: number | null;
  dataCoveragePct: number | null;
  dqStatus: HealthStatus;
  apiHealthStatus: HealthStatus;
  versionLabel: string | null;
  systemHint: string | null;
}

export interface DashboardKpiVm {
  id: string;
  label: string;
  value: string;
  helperText: string;
  tone: StatusTone;
  href: string;
  sourceState?: DashboardFieldState;
  dataSource?: DataSourceMeta;
}

export interface DashboardMetricVm {
  id: string;
  label: string;
  value: string;
  helperText: string;
  tone: StatusTone;
  sourceState?: DashboardFieldState;
  dataSource?: DataSourceMeta;
}

export interface TodaySummaryViewModel {
  headline: string;
  summaryText: string;
  metrics: DashboardMetricVm[];
  sourceState?: DashboardFieldState;
  dataSource?: DataSourceMeta;
}

export interface OpportunityCardVm {
  id: string;
  name: string;
  /** Raw strategy code from API (e.g. VOL_SURGE) for label mapping */
  strategy?: string;
  strategy_label?: string;
  strategyLabel: string;
  scoreLabel: string;
  helperText: string;
  tone: StatusTone;
  href: string;
  sourceState?: DashboardFieldState;
  dataSource?: DataSourceMeta;
}

export interface RiskEventVm {
  id: string;
  name: string;
  summary: string;
  scoreLabel: string;
  helperText: string;
  tone: StatusTone;
  href: string;
  sourceState?: DashboardFieldState;
  dataSource?: DataSourceMeta;
}

export interface DashboardSectionVm {
  title: string;
  summary: string;
  state: 'normal' | 'empty';
  metrics: DashboardMetricVm[];
  sourceState?: DashboardFieldState;
  dataSource?: DataSourceMeta;
}

export interface OpportunitySectionVm extends DashboardSectionVm {
  topOpportunities: OpportunityCardVm[];
}

export interface RiskSectionVm extends DashboardSectionVm {
  events: RiskEventVm[];
}

export interface PortfolioSectionVm extends DashboardSectionVm {
  actionHint: string;
}

export interface SystemIssueVm {
  id: string;
  name: string;
  summary: string;
  statusLabel: string;
  helperText: string;
  tone: StatusTone;
  href: string;
  sourceState?: DashboardFieldState;
  dataSource?: DataSourceMeta;
}

export interface SystemHealthSectionVm extends DashboardSectionVm {
  issues: SystemIssueVm[];
}

export interface DashboardViewModel {
  tradeDateText: string;
  generatedAtText: string;
  versionText: string;
  summaryText: string;
  kpis: DashboardKpiVm[];
  todaySummary: TodaySummaryViewModel;
  opportunity: OpportunitySectionVm;
  risk: RiskSectionVm;
  portfolio: PortfolioSectionVm;
  systemHealth: SystemHealthSectionVm;
  sourceState?: DashboardFieldState;
  dataSource?: DataSourceMeta;
  marketSummary: string;
  hotConcepts: any[];
  hotStocks: any[];
}
