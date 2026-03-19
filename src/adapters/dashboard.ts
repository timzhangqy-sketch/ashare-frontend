import type { DashboardRuntimeSnapshot } from '../context/useDashboardRuntime';
import type {
  DashboardFieldState,
  DashboardKpiVm,
  DashboardMetricVm,
  DashboardSectionVm,
  DashboardSummaryDto,
  DashboardViewModel,
  HealthStatus,
  OpportunityCardVm,
  OpportunitySectionVm,
  PortfolioSectionVm,
  RawDashboardSummaryPayload,
  RawDashboardSummaryResponse,
  RiskEventVm,
  RiskSectionVm,
  StatusTone,
  SystemHealthSectionVm,
  SystemIssueVm,
  TodaySummaryViewModel,
} from '../types/dashboard';
import type { DataSourceMeta } from '../types/dataSource';
import {
  formatCompactMoneySafe,
  formatCountSafe,
  formatFixedSafe,
  formatPercentSafe,
  formatSignedCompactMoneySafe,
  formatSignedPercentSafe,
  inspectNumber,
} from '../utils/formatters';
import { buildDataSourceMeta } from '../utils/dataSource';
import { getStrategyDisplayName } from '../utils/displayNames';

const EMPTY = '—';

export const dashboardKpiLinkMap = {
  buySignalsCount: '/signals?tab=buy&source=dashboard',
  resonanceCount: '/signals?tab=resonance&source=dashboard',
  watchlistCandidates: '/watchlist',
  gateBlockedCount: '/risk?source=dashboard',
  highRiskPositionsCount: '/risk?source=dashboard&scope=portfolio',
  positionsCount: '/portfolio',
  sellSignalsCount: '/portfolio',
  failedStepsCount: '/system?source=dashboard&tab=pipeline',
  versionLabel: '/system?source=dashboard&tab=runlog',
} as const;

function normalizeHealthStatus(value: string | null | undefined): HealthStatus {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'ok' || normalized === 'healthy') return 'healthy';
  if (normalized === 'warning' || normalized === 'warn') return 'warning';
  return 'danger';
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return EMPTY;
  return value.replace('T', ' ').replace(/\.\d+/, '').replace(/\+\d{2}:\d{2}$/, '');
}

function readText(value: string | null | undefined, fallback = EMPTY): string {
  return value && value.trim() ? value : fallback;
}

function formatVersionLabel(raw: string): string {
  return raw
    .replace('risk_model=', '风控模型 ')
    .replace('pipeline=', '· 数据日期 ')
    .replace('api=', '· 接口 ')
    .replace(/\s*\|\s*/g, ' ');
}

function readArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function toneFromHealth(status: HealthStatus): StatusTone {
  if (status === 'healthy') return 'positive';
  if (status === 'warning') return 'warning';
  return 'danger';
}

function toneFromDelta(value: number | null | undefined): StatusTone {
  if ((value ?? 0) > 0) return 'positive';
  if ((value ?? 0) < 0) return 'danger';
  return 'neutral';
}

function fieldState(value: unknown): DashboardFieldState {
  if (typeof value === 'string') return value.trim() ? 'real' : 'missing';
  const inspected = inspectNumber(value);
  if (inspected.kind === 'missing') return 'missing';
  if (inspected.kind === 'nan') return 'invalid';
  return 'real';
}

function formatSignedCount(value: number | null | undefined): string {
  const inspected = inspectNumber(value);
  if (inspected.kind === 'missing' || inspected.kind === 'nan' || inspected.value == null) return EMPTY;
  return `${inspected.value > 0 ? '+' : ''}${inspected.value}`;
}

function fieldDataSource(value: unknown, sourceDetail: string): DataSourceMeta {
  const state = fieldState(value);
  if (state === 'real') {
    return buildDataSourceMeta({
      data_source: 'real',
      source_label: 'Dashboard',
      source_detail: sourceDetail,
    });
  }

  return buildDataSourceMeta({
    data_source: 'degraded',
    source_label: 'Dashboard',
    source_detail: sourceDetail,
    degraded: true,
    degrade_reason: state === 'missing' ? '局部字段暂缺，已按安全占位展示。' : '局部字段格式不稳定，已按安全占位展示。',
    is_empty: state === 'missing',
    empty_reason: state === 'missing' ? '当前字段暂无返回。' : null,
  });
}

function isDegraded(meta: DataSourceMeta): boolean {
  return meta.data_source === 'degraded' || meta.degraded;
}

function deriveDashboardAggregateMeta(
  parts: DataSourceMeta[],
  sourceDetail: string,
  degradeThreshold = 2,
): DataSourceMeta {
  const degradedCount = parts.filter(isDegraded).length;
  const allEmpty = parts.length > 0 && parts.every((item) => item.is_empty);

  if (degradedCount >= degradeThreshold) {
    return buildDataSourceMeta({
      data_source: 'degraded',
      source_label: 'Dashboard',
      source_detail: sourceDetail,
      degraded: true,
      degrade_reason: '当前区块以真实数据为主，局部字段缺失时以安全占位展示。',
      is_empty: allEmpty,
      empty_reason: allEmpty ? '当前区块暂无有效结果。' : null,
    });
  }

  return buildDataSourceMeta({
    data_source: 'real',
    source_label: 'Dashboard',
    source_detail: sourceDetail,
    is_empty: allEmpty,
    empty_reason: allEmpty ? '当前区块暂无有效结果。' : null,
  });
}

function unwrapRawSummary(raw: RawDashboardSummaryResponse): RawDashboardSummaryPayload {
  return raw.data ?? raw;
}

export function buildSectionState(hasItems: boolean, hasSignal: boolean): DashboardSectionVm['state'] {
  return hasItems || hasSignal ? 'normal' : 'empty';
}

export function mapRawDashboardResponseToDto(raw: RawDashboardSummaryResponse): DashboardSummaryDto {
  const payload = unwrapRawSummary(raw);

  return {
    tradeDate: payload.trade_date ?? null,
    generatedAt: payload.generated_at ?? null,
    versionSnapshot: payload.version_snapshot ?? null,
    todayChanges: {
      newSignals: payload.today_changes?.new_signals ?? null,
      removedSignals: payload.today_changes?.removed_signals ?? null,
      watchlistDelta: payload.today_changes?.watchlist_delta ?? null,
      portfolioDelta: payload.today_changes?.portfolio_delta ?? null,
      riskAlertsDelta: payload.today_changes?.risk_alerts_delta ?? null,
      systemAlertsDelta: payload.today_changes?.system_alerts_delta ?? null,
      summaryText: payload.today_changes?.summary_text ?? null,
    },
    opportunity: {
      buySignalsCount: payload.opportunity?.buy_signals_count ?? null,
      resonanceCount: payload.opportunity?.resonance_count ?? null,
      watchlistCandidates: payload.opportunity?.watchlist_candidates ?? null,
      strongestStrategyLabel: payload.opportunity?.strongest_strategy_label ?? null,
      hottestSectorLabel: payload.opportunity?.hottest_sector_label ?? null,
      actionableCount: payload.opportunity?.actionable_count ?? null,
      topOpportunities: readArray(payload.opportunity?.top_opportunities).map((item) => ({
        tsCode: item.ts_code,
        name: item.name,
        strategyLabel: item.strategy_label,
        sectorLabel: item.sector_label,
        score: item.score,
        hint: item.hint,
      })),
    },
    risk: {
      gateBlockedCount: payload.risk?.gate_blocked_count ?? null,
      highRiskWatchlistCount: payload.risk?.high_risk_watchlist_count ?? null,
      highRiskPositionsCount: payload.risk?.high_risk_positions_count ?? null,
      newRiskEventsCount: payload.risk?.new_risk_events_count ?? null,
      highestRiskName: payload.risk?.highest_risk_name ?? null,
      highestRiskScore: payload.risk?.highest_risk_score ?? null,
      riskHint: payload.risk?.risk_hint ?? null,
    },
    portfolio: {
      positionType: payload.portfolio?.position_type ?? null,
      positionsCount: payload.portfolio?.positions_count ?? null,
      totalMarketValue: payload.portfolio?.total_market_value ?? null,
      cashRatio: payload.portfolio?.cash_ratio ?? null,
      dailyPnl: payload.portfolio?.daily_pnl ?? null,
      dailyPnlPct: payload.portfolio?.daily_pnl_pct ?? null,
      cumulativePnlPct: payload.portfolio?.cumulative_pnl_pct ?? null,
      concentrationTop1: payload.portfolio?.concentration_top1 ?? null,
      sellSignalsCount: payload.portfolio?.sell_signals_count ?? null,
      actionHint: payload.portfolio?.action_hint ?? null,
    },
    systemHealth: {
      pipelineStatus: normalizeHealthStatus(payload.system_health?.pipeline_status),
      latestSuccessTime: payload.system_health?.latest_success_time ?? null,
      failedStepsCount: payload.system_health?.failed_steps_count ?? null,
      dataCoveragePct: payload.system_health?.data_coverage_pct ?? null,
      dqStatus: normalizeHealthStatus(payload.system_health?.dq_status),
      apiHealthStatus: normalizeHealthStatus(payload.system_health?.api_health_status),
      versionLabel: payload.system_health?.version_label ?? null,
      systemHint: payload.system_health?.system_hint ?? null,
    },
    marketBreadth: payload.market_breadth
      ? { marketRegime: payload.market_breadth.market_regime ?? null }
      : null,
    marketIndex: payload.market_index
      ? {
          indexes: readArray(payload.market_index.indexes).map((item) => ({
            tsCode: item.ts_code,
            name: item.name,
            close: item.close ?? null,
            pctChange: item.pct_change ?? null,
            prevClose: item.prev_close ?? null,
          })),
          turnover: {
            shAmount: payload.market_index.turnover?.sh_amount ?? null,
            szAmount: payload.market_index.turnover?.sz_amount ?? null,
            totalAmount: payload.market_index.turnover?.total_amount ?? null,
            totalCount: payload.market_index.turnover?.total_count ?? null,
          },
          turnoverHistory: (payload.market_index as any).turnover_history ?? [],
        }
      : null,
    marketSummary: payload.market_summary ?? '',
    hotConcepts: (payload as any).hot_concepts ?? [],
    hotStocks: (payload as any).hot_stocks ?? [],
  };
}

function buildDashboardMetric(
  id: string,
  label: string,
  value: string,
  helperText: string,
  tone: StatusTone,
  rawValue: unknown,
  sourceDetail: string,
): DashboardMetricVm {
  return {
    id,
    label,
    value,
    helperText,
    tone,
    sourceState: fieldState(rawValue),
    dataSource: fieldDataSource(rawValue, sourceDetail),
  };
}

function buildTodaySummary(dto: DashboardSummaryDto): TodaySummaryViewModel {
  return {
    headline: '',
    summaryText: readText(dto.todayChanges.summaryText, '当前暂无摘要说明。'),
    metrics: [
      buildDashboardMetric('new-signals', '新增信号', formatCountSafe(dto.todayChanges.newSignals, EMPTY), '新增进入关注范围的信号数。', (dto.todayChanges.newSignals ?? 0) > 0 ? 'positive' : 'neutral', dto.todayChanges.newSignals, '今日摘要指标来自总览聚合结果。'),
      buildDashboardMetric('removed-signals', '移出信号', formatCountSafe(dto.todayChanges.removedSignals, EMPTY), '今日移出关注范围的信号数。', (dto.todayChanges.removedSignals ?? 0) > 0 ? 'warning' : 'neutral', dto.todayChanges.removedSignals, '今日摘要指标来自总览聚合结果。'),
      buildDashboardMetric('watchlist-delta', '交易标的池变化', formatSignedCount(dto.todayChanges.watchlistDelta), '交易标的池较上一交易日的变动。', toneFromDelta(dto.todayChanges.watchlistDelta), dto.todayChanges.watchlistDelta, '今日摘要指标来自总览聚合结果。'),
      buildDashboardMetric('portfolio-delta', '持仓变化', formatSignedCount(dto.todayChanges.portfolioDelta), '持仓名单较上一交易日的变动。', toneFromDelta(dto.todayChanges.portfolioDelta), dto.todayChanges.portfolioDelta, '今日摘要指标来自总览聚合结果。'),
      buildDashboardMetric('risk-delta', '风险变化', formatSignedCount(dto.todayChanges.riskAlertsDelta), '新增风险提示的变化数量。', (dto.todayChanges.riskAlertsDelta ?? 0) > 0 ? 'warning' : 'neutral', dto.todayChanges.riskAlertsDelta, '今日摘要指标来自总览聚合结果。'),
      buildDashboardMetric('system-delta', '系统变化', formatSignedCount(dto.todayChanges.systemAlertsDelta), '系统告警较上一交易日的变化。', (dto.todayChanges.systemAlertsDelta ?? 0) > 0 ? 'danger' : 'neutral', dto.todayChanges.systemAlertsDelta, '今日摘要指标来自总览聚合结果。'),
    ],
    sourceState: fieldState(dto.todayChanges.summaryText),
    dataSource: fieldDataSource(dto.todayChanges.summaryText, '今日摘要以真实总览结果为主；摘要缺失时保留指标区展示。'),
  };
}

export function buildDashboardKpis(dto: DashboardSummaryDto): DashboardKpiVm[] {
  return [
    {
      id: 'buySignalsCount',
      label: '买点机会',
      value: formatCountSafe(dto.opportunity.buySignalsCount, EMPTY),
      helperText: '买入方向信号数',
      tone: (dto.opportunity.buySignalsCount ?? 0) > 0 ? 'positive' : 'neutral',
      href: dashboardKpiLinkMap.buySignalsCount,
      sourceState: fieldState(dto.opportunity.buySignalsCount),
      dataSource: fieldDataSource(dto.opportunity.buySignalsCount, 'KPI 来自机会区块的真实聚合结果。'),
    },
    {
      id: 'resonanceCount',
      label: '共振信号',
      value: formatCountSafe(dto.opportunity.resonanceCount, EMPTY),
      helperText: readText(getStrategyDisplayName(dto.opportunity.strongestStrategyLabel) || dto.opportunity.strongestStrategyLabel, '当前暂无主导策略'),
      tone: (dto.opportunity.resonanceCount ?? 0) > 0 ? 'info' : 'neutral',
      href: dashboardKpiLinkMap.resonanceCount,
      sourceState: fieldState(dto.opportunity.resonanceCount),
      dataSource: fieldDataSource(dto.opportunity.resonanceCount, 'KPI 来自机会区块的真实聚合结果。'),
    },
    {
      id: 'watchlistCandidates',
      label: '交易标的池候选',
      value: formatCountSafe(dto.opportunity.watchlistCandidates, EMPTY),
      helperText: readText(dto.opportunity.hottestSectorLabel, '当前暂无热点方向'),
      tone: (dto.opportunity.watchlistCandidates ?? 0) > 0 ? 'info' : 'neutral',
      href: dashboardKpiLinkMap.watchlistCandidates,
      sourceState: fieldState(dto.opportunity.watchlistCandidates),
      dataSource: fieldDataSource(dto.opportunity.watchlistCandidates, 'KPI 来自机会区块的真实聚合结果。'),
    },
    {
      id: 'gateBlockedCount',
      label: '风控拦截',
      value: formatCountSafe(dto.risk.gateBlockedCount, EMPTY),
      helperText: readText(dto.risk.riskHint, '当前暂无额外风控提示'),
      tone: (dto.risk.gateBlockedCount ?? 0) > 0 ? 'warning' : 'positive',
      href: dashboardKpiLinkMap.gateBlockedCount,
      sourceState: fieldState(dto.risk.gateBlockedCount),
      dataSource: fieldDataSource(dto.risk.gateBlockedCount, 'KPI 来自风控区块的真实聚合结果。'),
    },
    {
      id: 'highRiskPositionsCount',
      label: '高风险持仓',
      value: formatCountSafe(dto.risk.highRiskPositionsCount, EMPTY),
      helperText: readText(dto.risk.highestRiskName, '当前暂无高风险对象'),
      tone: (dto.risk.highRiskPositionsCount ?? 0) > 0 ? 'danger' : 'positive',
      href: dashboardKpiLinkMap.highRiskPositionsCount,
      sourceState: fieldState(dto.risk.highRiskPositionsCount),
      dataSource: fieldDataSource(dto.risk.highRiskPositionsCount, 'KPI 来自风控区块的真实聚合结果。'),
    },
    {
      id: 'positionsCount',
      label: '持仓数量',
      value: formatCountSafe(dto.portfolio.positionsCount, EMPTY),
      helperText: readText(dto.portfolio.positionType, '当前暂无持仓风格'),
      tone: (dto.portfolio.positionsCount ?? 0) > 0 ? 'info' : 'neutral',
      href: dashboardKpiLinkMap.positionsCount,
      sourceState: fieldState(dto.portfolio.positionsCount),
      dataSource: fieldDataSource(dto.portfolio.positionsCount, 'KPI 来自组合区块的真实聚合结果。'),
    },
    {
      id: 'sellSignalsCount',
      label: '卖出提示',
      value: formatCountSafe(dto.portfolio.sellSignalsCount, EMPTY),
      helperText: readText(dto.portfolio.actionHint, '当前暂无卖出提示'),
      tone: (dto.portfolio.sellSignalsCount ?? 0) > 0 ? 'warning' : 'neutral',
      href: dashboardKpiLinkMap.sellSignalsCount,
      sourceState: fieldState(dto.portfolio.sellSignalsCount),
      dataSource: fieldDataSource(dto.portfolio.sellSignalsCount, 'KPI 来自组合区块的真实聚合结果。'),
    },
    {
      id: 'failedStepsCount',
      label: '失败步骤',
      value: formatCountSafe(dto.systemHealth.failedStepsCount, EMPTY),
      helperText: `最近成功：${formatDateTime(dto.systemHealth.latestSuccessTime)}`,
      tone: (dto.systemHealth.failedStepsCount ?? 0) > 0 ? 'danger' : 'positive',
      href: dashboardKpiLinkMap.failedStepsCount,
      sourceState: fieldState(dto.systemHealth.failedStepsCount),
      dataSource: fieldDataSource(dto.systemHealth.failedStepsCount, 'KPI 来自系统健康区块的真实聚合结果。'),
    },
    {
      id: 'versionLabel',
      label: '版本快照',
      value: readText(dto.systemHealth.versionLabel),
      helperText: dto.systemHealth.versionLabel ? formatVersionLabel(dto.systemHealth.versionLabel) : '当前暂无版本补充说明',
      tone: 'neutral' as StatusTone,
      href: dashboardKpiLinkMap.versionLabel,
      sourceState: fieldState(dto.systemHealth.versionLabel),
      dataSource: fieldDataSource(dto.systemHealth.versionLabel, 'KPI 来自系统健康区块的真实聚合结果。'),
    },
  ];
}

function buildOpportunityCards(dto: DashboardSummaryDto): OpportunityCardVm[] {
  return dto.opportunity.topOpportunities.map((item) => ({
    id: item.tsCode,
    name: item.name,
    strategy: readText(item.strategyLabel) || undefined,
    strategyLabel: `${readText(item.strategyLabel)} / ${readText(item.sectorLabel)}`,
    scoreLabel: `${formatFixedSafe(item.score, 2, EMPTY)} 分`,
    helperText: readText(item.hint, '当前暂无补充说明'),
    tone: (item.score ?? 0) >= 85 ? 'positive' : (item.score ?? 0) >= 75 ? 'info' : 'warning',
    href: `/signals?tab=buy&source=dashboard&focus=${encodeURIComponent(item.tsCode)}`,
    sourceState: fieldState(item.score),
    dataSource: fieldDataSource(item.score, '机会卡片来自真实总览结果。'),
  }));
}

function buildRiskEvents(dto: DashboardSummaryDto): RiskEventVm[] {
  if ((dto.risk.gateBlockedCount ?? 0) === 0 && (dto.risk.newRiskEventsCount ?? 0) === 0) return [];

  return [
    {
      id: 'risk-event',
      name: '风险事件',
      summary: readText(dto.risk.riskHint, '当前暂无额外风险说明'),
      scoreLabel: formatCountSafe(dto.risk.gateBlockedCount, EMPTY),
      helperText: dto.risk.highestRiskName
        ? `${dto.risk.highestRiskName} ${formatFixedSafe(dto.risk.highestRiskScore, 2, EMPTY)}`
        : '当前暂无高风险对象',
      tone: (dto.risk.gateBlockedCount ?? 0) > 0 ? 'warning' : 'neutral',
      href: '/risk?source=dashboard',
      sourceState: fieldState(dto.risk.highestRiskScore),
      dataSource: fieldDataSource(dto.risk.highestRiskScore, '风险事件来自真实总览结果。'),
    },
  ];
}

function buildSystemIssues(dto: DashboardSummaryDto): SystemIssueVm[] {
  if ((dto.systemHealth.failedStepsCount ?? 0) === 0) return [];

  return [
    {
      id: 'failed-steps',
      name: '系统异常',
      summary: readText(dto.systemHealth.systemHint, '当前暂无额外系统说明'),
      statusLabel: dto.systemHealth.pipelineStatus === 'healthy' ? '正常' : dto.systemHealth.pipelineStatus === 'warning' ? '告警' : '异常',
      helperText: `失败步骤 ${formatCountSafe(dto.systemHealth.failedStepsCount, EMPTY)}`,
      tone: (dto.systemHealth.failedStepsCount ?? 0) > 0 ? 'danger' : 'positive',
      href: '/system?source=dashboard&tab=pipeline',
      sourceState: fieldState(dto.systemHealth.failedStepsCount),
      dataSource: fieldDataSource(dto.systemHealth.failedStepsCount, '系统问题来自真实总览结果。'),
    },
  ];
}

function buildOpportunitySection(dto: DashboardSummaryDto): OpportunitySectionVm {
  const topOpportunities = buildOpportunityCards(dto);
  const parts = [
    fieldDataSource(dto.opportunity.buySignalsCount, '机会区块主指标来自真实总览结果。'),
    fieldDataSource(dto.opportunity.resonanceCount, '机会区块主指标来自真实总览结果。'),
    fieldDataSource(dto.opportunity.watchlistCandidates, '机会区块主指标来自真实总览结果。'),
    fieldDataSource(dto.opportunity.actionableCount, '机会区块主指标来自真实总览结果。'),
  ];

  return {
    title: '机会',
    summary: `可执行机会 ${formatCountSafe(dto.opportunity.actionableCount, EMPTY)}，当前主导策略 ${readText(getStrategyDisplayName(dto.opportunity.strongestStrategyLabel) || dto.opportunity.strongestStrategyLabel, '待确认')}`,
    state: buildSectionState(topOpportunities.length > 0, (dto.opportunity.buySignalsCount ?? 0) > 0),
    metrics: [
      buildDashboardMetric('opp-buy', '买点信号', formatCountSafe(dto.opportunity.buySignalsCount, EMPTY), '可直接跟踪的买点数量。', (dto.opportunity.buySignalsCount ?? 0) > 0 ? 'positive' : 'neutral', dto.opportunity.buySignalsCount, '机会区块主指标来自真实总览结果。'),
      buildDashboardMetric('opp-resonance', '共振信号', formatCountSafe(dto.opportunity.resonanceCount, EMPTY), '多条件共振的信号数量。', (dto.opportunity.resonanceCount ?? 0) > 0 ? 'info' : 'neutral', dto.opportunity.resonanceCount, '机会区块主指标来自真实总览结果。'),
      buildDashboardMetric('opp-watchlist', '交易标的池候选', formatCountSafe(dto.opportunity.watchlistCandidates, EMPTY), '可进入交易标的池的候选数。', (dto.opportunity.watchlistCandidates ?? 0) > 0 ? 'info' : 'neutral', dto.opportunity.watchlistCandidates, '机会区块主指标来自真实总览结果。'),
      buildDashboardMetric('opp-actionable', '可执行机会', formatCountSafe(dto.opportunity.actionableCount, EMPTY), `热点方向 ${readText(dto.opportunity.hottestSectorLabel, '待确认')}`, (dto.opportunity.actionableCount ?? 0) > 0 ? 'positive' : 'neutral', dto.opportunity.actionableCount, '机会区块主指标来自真实总览结果。'),
    ],
    topOpportunities,
    sourceState: fieldState(dto.opportunity.actionableCount),
    dataSource: deriveDashboardAggregateMeta(parts, '机会区块以真实数据为主；仅在多项主指标同时缺失时提示降级。'),
  };
}

function buildRiskSection(dto: DashboardSummaryDto): RiskSectionVm {
  const events = buildRiskEvents(dto);
  const parts = [
    fieldDataSource(dto.risk.gateBlockedCount, '风控区块主指标来自真实总览结果。'),
    fieldDataSource(dto.risk.highRiskWatchlistCount, '风控区块主指标来自真实总览结果。'),
    fieldDataSource(dto.risk.highRiskPositionsCount, '风控区块主指标来自真实总览结果。'),
    fieldDataSource(dto.risk.highestRiskScore, '风控区块主指标来自真实总览结果。'),
  ];

  return {
    title: '风控',
    summary: readText(dto.risk.riskHint, '当前暂无额外风控说明'),
    state: buildSectionState(events.length > 0, (dto.risk.gateBlockedCount ?? 0) > 0 || (dto.risk.highRiskPositionsCount ?? 0) > 0),
    metrics: [
      buildDashboardMetric('risk-gate', '拦截数量', formatCountSafe(dto.risk.gateBlockedCount, EMPTY), '被风控门禁拦截的数量。', (dto.risk.gateBlockedCount ?? 0) > 0 ? 'warning' : 'positive', dto.risk.gateBlockedCount, '风控区块主指标来自真实总览结果。'),
      buildDashboardMetric('risk-watchlist', '高风险交易标的池', formatCountSafe(dto.risk.highRiskWatchlistCount, EMPTY), '交易标的池内需重点关注的风险对象。', (dto.risk.highRiskWatchlistCount ?? 0) > 0 ? 'warning' : 'neutral', dto.risk.highRiskWatchlistCount, '风控区块主指标来自真实总览结果。'),
      buildDashboardMetric('risk-positions', '高风险持仓', formatCountSafe(dto.risk.highRiskPositionsCount, EMPTY), '持仓侧需优先处理的风险对象。', (dto.risk.highRiskPositionsCount ?? 0) > 0 ? 'danger' : 'positive', dto.risk.highRiskPositionsCount, '风控区块主指标来自真实总览结果.'),
      buildDashboardMetric('risk-highest', '最高风险分', formatFixedSafe(dto.risk.highestRiskScore, 2, EMPTY), readText(dto.risk.highestRiskName, '当前暂无对象'), (dto.risk.highestRiskScore ?? 0) >= 85 ? 'danger' : (dto.risk.highestRiskScore ?? 0) > 0 ? 'warning' : 'neutral', dto.risk.highestRiskScore, '风控区块主指标来自真实总览结果。'),
    ],
    events,
    sourceState: fieldState(dto.risk.gateBlockedCount),
    dataSource: deriveDashboardAggregateMeta(parts, '风控区块以真实数据为主；仅在多项主指标同时缺失时提示降级。'),
  };
}

function buildPortfolioSection(dto: DashboardSummaryDto): PortfolioSectionVm {
  const parts = [
    fieldDataSource(dto.portfolio.positionsCount, '组合区块主指标来自真实总览结果。'),
    fieldDataSource(dto.portfolio.totalMarketValue, '组合区块主指标来自真实总览结果。'),
    fieldDataSource(dto.portfolio.dailyPnl, '组合区块主指标来自真实总览结果。'),
    fieldDataSource(dto.portfolio.cashRatio, '组合区块主指标来自真实总览结果。'),
  ];

  return {
    title: '组合',
    summary: readText(dto.portfolio.actionHint, '当前暂无组合行动提示'),
    state: buildSectionState((dto.portfolio.positionsCount ?? 0) > 0, (dto.portfolio.totalMarketValue ?? 0) > 0),
    metrics: [
      buildDashboardMetric('portfolio-positions', '持仓数量', formatCountSafe(dto.portfolio.positionsCount, EMPTY), readText(dto.portfolio.positionType, '当前暂无风格口径'), (dto.portfolio.positionsCount ?? 0) > 0 ? 'info' : 'neutral', dto.portfolio.positionsCount, '组合区块主指标来自真实总览结果。'),
      buildDashboardMetric('portfolio-value', '总市值', formatCompactMoneySafe(dto.portfolio.totalMarketValue, EMPTY), '当前组合市值规模。', 'info', dto.portfolio.totalMarketValue, '组合区块主指标来自真实总览结果。'),
      buildDashboardMetric('portfolio-pnl', '日内盈亏', `${formatSignedCompactMoneySafe(dto.portfolio.dailyPnl, EMPTY)} / ${formatSignedPercentSafe(dto.portfolio.dailyPnlPct, 2, 100, EMPTY)}`, `累计收益 ${formatSignedPercentSafe(dto.portfolio.cumulativePnlPct, 2, 100, EMPTY)}`, (dto.portfolio.dailyPnl ?? 0) > 0 ? 'positive' : (dto.portfolio.dailyPnl ?? 0) < 0 ? 'danger' : 'neutral', dto.portfolio.dailyPnl, '组合区块主指标来自真实总览结果。'),
      buildDashboardMetric('portfolio-cash', '现金占比', formatPercentSafe(dto.portfolio.cashRatio, 1, 100, EMPTY), `Top1 集中度 ${formatPercentSafe(dto.portfolio.concentrationTop1, 1, 100, EMPTY)}`, (dto.portfolio.cashRatio ?? 0) >= 0.3 ? 'positive' : 'warning', dto.portfolio.cashRatio, '组合区块主指标来自真实总览结果。'),
    ],
    actionHint: readText(dto.portfolio.actionHint, '当前暂无组合行动提示'),
    sourceState: fieldState(dto.portfolio.positionsCount),
    dataSource: deriveDashboardAggregateMeta(parts, '组合区块以真实数据为主；仅在多项主指标同时缺失时提示降级。'),
  };
}

function buildSystemHealthSection(dto: DashboardSummaryDto): SystemHealthSectionVm {
  const issues = buildSystemIssues(dto);
  const parts = [
    fieldDataSource(dto.systemHealth.latestSuccessTime, '系统健康区块主指标来自真实总览结果。'),
    fieldDataSource(dto.systemHealth.failedStepsCount, '系统健康区块主指标来自真实总览结果。'),
    fieldDataSource(dto.systemHealth.dataCoveragePct, '系统健康区块主指标来自真实总览结果。'),
    fieldDataSource(dto.systemHealth.versionLabel, '系统健康区块主指标来自真实总览结果。'),
  ];

  return {
    title: '系统健康',
    summary: readText(dto.systemHealth.systemHint, '当前暂无额外系统说明'),
    state: buildSectionState(issues.length > 0, (dto.systemHealth.failedStepsCount ?? 0) > 0),
    metrics: [
      {
        id: 'system-pipeline',
        label: '运行状态',
        value: dto.systemHealth.pipelineStatus === 'healthy' ? '正常' : dto.systemHealth.pipelineStatus === 'warning' ? '告警' : '异常',
        helperText: `最近成功 ${formatDateTime(dto.systemHealth.latestSuccessTime)}`,
        tone: toneFromHealth(dto.systemHealth.pipelineStatus),
        sourceState: fieldState(dto.systemHealth.latestSuccessTime),
        dataSource: fieldDataSource(dto.systemHealth.latestSuccessTime, '系统健康区块主指标来自真实总览结果。'),
      },
      buildDashboardMetric('system-failed', '失败步骤', formatCountSafe(dto.systemHealth.failedStepsCount, EMPTY), '当前失败步骤数量。', (dto.systemHealth.failedStepsCount ?? 0) > 0 ? 'danger' : 'positive', dto.systemHealth.failedStepsCount, '系统健康区块主指标来自真实总览结果。'),
      buildDashboardMetric('system-coverage', '数据覆盖率', formatPercentSafe(dto.systemHealth.dataCoveragePct, 1, 100, EMPTY), `DQ ${dto.systemHealth.dqStatus === 'healthy' ? '正常' : dto.systemHealth.dqStatus === 'warning' ? '告警' : '异常'}`, toneFromHealth(dto.systemHealth.dqStatus), dto.systemHealth.dataCoveragePct, '系统健康区块主指标来自真实总览结果。'),
      {
        id: 'system-api',
        label: 'API 状态',
        value: dto.systemHealth.apiHealthStatus === 'healthy' ? '正常' : dto.systemHealth.apiHealthStatus === 'warning' ? '告警' : '异常',
        helperText: `版本 ${readText(dto.systemHealth.versionLabel)}`,
        tone: toneFromHealth(dto.systemHealth.apiHealthStatus),
        sourceState: fieldState(dto.systemHealth.versionLabel),
        dataSource: fieldDataSource(dto.systemHealth.versionLabel, '系统健康区块主指标来自真实总览结果。'),
      },
    ],
    issues,
    sourceState: fieldState(dto.systemHealth.failedStepsCount),
    dataSource: deriveDashboardAggregateMeta(parts, '系统健康区块以真实数据为主；仅在多项主指标同时缺失时提示降级。'),
  };
}

export { fetchActionList } from '../api';
export type { ActionListResponse } from '../api';

export function isDashboardSummaryEmpty(dto: DashboardSummaryDto): boolean {
  return (
    (dto.opportunity.buySignalsCount ?? 0) === 0 &&
    (dto.opportunity.resonanceCount ?? 0) === 0 &&
    (dto.opportunity.watchlistCandidates ?? 0) === 0 &&
    (dto.risk.gateBlockedCount ?? 0) === 0 &&
    (dto.risk.highRiskWatchlistCount ?? 0) === 0 &&
    (dto.risk.highRiskPositionsCount ?? 0) === 0 &&
    (dto.portfolio.positionsCount ?? 0) === 0 &&
    (dto.systemHealth.failedStepsCount ?? 0) === 0
  );
}

export function buildDashboardRuntimeSnapshot(dto: DashboardSummaryDto): DashboardRuntimeSnapshot {
  return {
    source: 'real',
    tradeDate: dto.tradeDate ?? EMPTY,
    generatedAt: formatDateTime(dto.generatedAt),
    systemStatusLabel:
      dto.systemHealth.pipelineStatus === 'healthy'
        ? '正常'
        : dto.systemHealth.pipelineStatus === 'warning'
          ? '告警'
          : '异常',
    systemTone: toneFromHealth(dto.systemHealth.pipelineStatus),
    versionText: readText(dto.systemHealth.versionLabel),
    marketRegime: dto.marketBreadth?.marketRegime ?? null,
    marketIndex: dto.marketIndex ?? null,
  };
}

export function mapDashboardSummaryToViewModel(dto: DashboardSummaryDto): DashboardViewModel {
  const todaySummary = buildTodaySummary(dto);
  const opportunity = buildOpportunitySection(dto);
  const risk = buildRiskSection(dto);
  const portfolio = buildPortfolioSection(dto);
  const systemHealth = buildSystemHealthSection(dto);
  const dashboardMeta = deriveDashboardAggregateMeta(
    [
      todaySummary.dataSource ?? buildDataSourceMeta({ data_source: 'real', source_label: 'Dashboard', source_detail: '今日摘要正常。' }),
      opportunity.dataSource ?? buildDataSourceMeta({ data_source: 'real', source_label: 'Dashboard', source_detail: '机会区块正常。' }),
      risk.dataSource ?? buildDataSourceMeta({ data_source: 'real', source_label: 'Dashboard', source_detail: '风控区块正常。' }),
      portfolio.dataSource ?? buildDataSourceMeta({ data_source: 'real', source_label: 'Dashboard', source_detail: '组合区块正常。' }),
      systemHealth.dataSource ?? buildDataSourceMeta({ data_source: 'real', source_label: 'Dashboard', source_detail: '系统健康区块正常。' }),
    ],
    '总览页以真实数据为主；只有多个关键区块同时受影响时，才会在页面顶部提示。',
  );

  return {
    tradeDateText: dto.tradeDate ?? EMPTY,
    generatedAtText: formatDateTime(dto.generatedAt),
    versionText: readText(dto.systemHealth.versionLabel),
    summaryText: readText(dto.todayChanges.summaryText, '当前暂无总览摘要。'),
    kpis: buildDashboardKpis(dto),
    todaySummary,
    opportunity,
    risk,
    portfolio,
    systemHealth,
    sourceState: fieldState(dto.generatedAt),
    dataSource: dashboardMeta,
    marketSummary: dto.marketSummary ?? '',
    hotConcepts: (dto as any).hotConcepts ?? [],
    hotStocks: (dto as any).hotStocks ?? [],
    marketIndex: (dto as any).marketIndex ?? null,
  };
}
