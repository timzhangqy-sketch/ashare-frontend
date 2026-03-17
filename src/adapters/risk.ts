import {
  fetchPortfolio,
  fetchRiskDetail,
  fetchRiskGateBlocks,
  fetchRiskTopScores,
  fetchWatchlist,
  getDashboardSummary,
  type PortfolioItem,
  type RiskApiItem,
  type WatchlistItem,
} from '../api/index';
import { riskMockRaw } from '../mocks/risk';
import type {
  GateBlockRow,
  RiskBreakdownRow,
  RiskContextModel,
  RiskDataStatus,
  RiskDomainModel,
  RiskEventRow,
  RiskFilterModel,
  RiskOverviewMetric,
  RiskQueryModel,
  RiskRawDto,
  RiskScoreRow,
  RiskScope,
  RiskSource,
  RiskTab,
  RiskWorkspaceViewModel,
} from '../types/risk';
import { buildDataSourceMeta } from '../utils/dataSource';
import type { DataSourceMeta } from '../types/dataSource';
import { deriveMixedMeta } from '../utils/dataSource';

type RiskDomainSeed = {
  ts_code: string;
  name?: string | null;
  trade_date?: string | null;
  source_domain?: 'watchlist' | 'portfolio' | null;
  source_strategy?: string | null;
  in_watchlist?: boolean | null;
  in_portfolio?: boolean | null;
  trade_allowed?: boolean | null;
  block_reason?: string | null;
  block_source?: string | null;
  risk_score_total?: number | null;
  risk_score_financial?: number | null;
  risk_score_market?: number | null;
  risk_score_event?: number | null;
  risk_score_compliance?: number | null;
  cap_financial?: number | null;
  cap_market?: number | null;
  cap_event?: number | null;
  cap_compliance?: number | null;
  position_cap_multiplier_final?: number | null;
  risk_level?: string | null;
  notes?: string[];
  detail_json?: Record<string, unknown> | null;
};

interface LoadRiskSourcesResult {
  watchlist: WatchlistItem[];
  portfolio: PortfolioItem[];
  dashboardRisk: Awaited<ReturnType<typeof getDashboardSummary>>['risk'] | null;
  gateRows: RiskApiItem[];
  scoreRows: RiskApiItem[];
  detailRow: RiskApiItem | null;
  gateStatus: RiskDataStatus;
  scoreStatus: RiskDataStatus;
  detailStatus: RiskDataStatus;
}

function buildRiskDataSource(
  state: DataSourceMeta['data_source'],
  sourceLabel: string,
  sourceDetail: string,
  sampleSize: number | null,
  degradeReason?: string | null,
): DataSourceMeta {
  return buildDataSourceMeta({
    data_source: state,
    source_label: sourceLabel,
    source_detail: sourceDetail,
    sample_size: sampleSize,
    degraded: state === 'degraded' || state === 'mixed',
    degrade_reason: degradeReason ?? null,
    is_empty: state === 'real_empty',
    empty_reason: state === 'real_empty' ? '真实接口已接通，当前查询范围内没有返回行。' : null,
  });
}

function settle<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  return promise
    .then(value => ({ ok: true, value }) as const)
    .catch(error => ({ ok: false, error }) as const);
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toNullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function normalizeStrategyLabel(strategy: string | null): string {
  if (!strategy) return '未记录';
  if (strategy.includes('VOL')) return '能量蓄势';
  if (strategy.includes('RETOC2')) return '异动策略';
  if (strategy.includes('WEAK_BUY')) return '弱市吸筹';
  if (strategy.includes('GREEN10')) return '形态策略';
  if (strategy.includes('T2UP9')) return '形态策略';
  if (strategy.includes('PATTERN')) return '形态策略';
  return strategy;
}

function normalizeRiskLevel(total: number): RiskDomainModel['riskLevel'] {
  if (total >= 75) return 'high';
  if (total >= 55) return 'medium';
  return 'low';
}

const BLOCK_REASON_MAP: Record<string, string> = {
  limit_down: '跌停限制',
  event_block: '事件风控',
  financial_risk: '财务风险',
  market_risk: '市场风险',
  compliance_block: '合规阻断',
  volatility_block: '波动率超限',
  drawdown_block: '回撤超限',
  concentration_block: '集中度超限',
  liquidity_block: '流动性不足',
};

const BLOCK_SOURCE_MAP: Record<string, string> = {
  limit_down: '跌停检测',
  event_block: '事件风控模块',
  financial_risk: '财务风险模块',
  market_risk: '市场风险模块',
  compliance_block: '合规检测',
  gate: '风险闸门',
};

function translateBlockField(raw: string | null | undefined, map: Record<string, string>): string | null {
  if (!raw) return null;
  return raw
    .split(',')
    .map((s) => map[s.trim()] ?? s.trim())
    .join('、');
}

function toRiskLevelLabel(level: RiskDomainModel['riskLevel']): string {
  if (level === 'high') return '高风险';
  if (level === 'medium') return '中风险';
  return '低风险';
}

function toTradeAllowedLabel(tradeAllowed: boolean): string {
  return tradeAllowed ? '允许交易' : '禁止交易';
}

function toSourceDomainLabel(domain: RiskDomainModel['sourceDomain']): string {
  return domain === 'portfolio' ? '持仓中心' : '交易标的池';
}

function buildSourceHref(row: RiskDomainModel): string | null {
  if (!row.sourceStrategy) return null;
  const strategy = row.sourceStrategy.toUpperCase();
  if (strategy.includes('VOL') || strategy.includes('IGNITE')) {
    return `/dashboard?source=risk&focus=${encodeURIComponent(row.tsCode)}&strategy=${encodeURIComponent(row.sourceStrategy)}`;
  }
  if (strategy.includes('RETOC2')) {
    return `/retoc2?source=risk&focus=${encodeURIComponent(row.tsCode)}&strategy=${encodeURIComponent(row.sourceStrategy)}`;
  }
  if (strategy.includes('PATTERN')) {
    return `/pattern?source=risk&focus=${encodeURIComponent(row.tsCode)}&strategy=${encodeURIComponent(row.sourceStrategy)}`;
  }
  return null;
}

function toRecommendedPositionText(positionCap: number, tradeAllowed: boolean): string {
  if (!tradeAllowed) return '建议先停止新增仓位，等待风险回落后再评估。';
  if (positionCap <= 0.1) return '建议仅保留试探仓位。';
  if (positionCap <= 0.3) return '建议小仓位参与。';
  if (positionCap <= 0.6) return '建议控制仓位分步参与。';
  return '当前允许按常规仓位参与。';
}

function inferBlockSource(seed: {
  capFinancial: number;
  capMarket: number;
  capEvent: number;
  capCompliance: number;
}): string {
  const pairs: Array<[string, number]> = [
    ['财务风险', seed.capFinancial],
    ['市场风险', seed.capMarket],
    ['事件风险', seed.capEvent],
    ['合规风险', seed.capCompliance],
  ];
  pairs.sort((a, b) => a[1] - b[1]);
  return pairs[0][0];
}

function toRawDto(
  seed: RiskDomainSeed,
  watchlistMap: Map<string, WatchlistItem>,
  portfolioMap: Map<string, PortfolioItem>,
  tradeDate: string,
): RiskRawDto {
  const tsCode = seed.ts_code;
  const watchlistItem = watchlistMap.get(tsCode);
  const portfolioItem = portfolioMap.get(tsCode);
  const inWatchlist = seed.in_watchlist ?? Boolean(watchlistItem);
  const inPortfolio = seed.in_portfolio ?? Boolean(portfolioItem);
  const sourceDomain = seed.source_domain ?? (inPortfolio ? 'portfolio' : 'watchlist');
  const sourceStrategy = seed.source_strategy ?? watchlistItem?.strategy ?? portfolioItem?.source_strategy ?? null;

  const riskScoreTotal = toNullableNumber(seed.risk_score_total) ?? 0;
  const riskScoreFinancial = toNullableNumber(seed.risk_score_financial) ?? 0;
  const riskScoreMarket = toNullableNumber(seed.risk_score_market) ?? 0;
  const riskScoreEvent = toNullableNumber(seed.risk_score_event) ?? 0;
  const riskScoreCompliance = toNullableNumber(seed.risk_score_compliance) ?? 0;

  const capFinancial = toNullableNumber(seed.cap_financial) ?? 1;
  const capMarket = toNullableNumber(seed.cap_market) ?? 1;
  const capEvent = toNullableNumber(seed.cap_event) ?? 1;
  const capCompliance = toNullableNumber(seed.cap_compliance) ?? 1;
  const tradeAllowed = toNullableBoolean(seed.trade_allowed) ?? !(seed.block_reason ?? '').trim();
  const positionCapMultiplierFinal =
    toNullableNumber(seed.position_cap_multiplier_final) ?? Math.min(capFinancial, capMarket, capEvent, capCompliance);
  const riskLevel = (seed.risk_level as RiskDomainModel['riskLevel'] | null) ?? normalizeRiskLevel(riskScoreTotal);

  return {
    ts_code: tsCode,
    name: seed.name ?? watchlistItem?.name ?? portfolioItem?.name ?? tsCode,
    trade_date: seed.trade_date ?? tradeDate,
    source_domain: sourceDomain,
    source_strategy: sourceStrategy,
    in_watchlist: inWatchlist,
    in_portfolio: inPortfolio,
    trade_allowed: tradeAllowed,
    block_reason: translateBlockField(seed.block_reason, BLOCK_REASON_MAP),
    block_source: translateBlockField(
      seed.block_source ??
      (tradeAllowed
        ? null
        : inferBlockSource({
            capFinancial,
            capMarket,
            capEvent,
            capCompliance,
          })),
      BLOCK_SOURCE_MAP,
    ),
    risk_score_total: riskScoreTotal,
    risk_score_financial: riskScoreFinancial,
    risk_score_market: riskScoreMarket,
    risk_score_event: riskScoreEvent,
    risk_score_compliance: riskScoreCompliance,
    cap_financial: capFinancial,
    cap_market: capMarket,
    cap_event: capEvent,
    cap_compliance: capCompliance,
    position_cap_multiplier_final: positionCapMultiplierFinal,
    risk_level: riskLevel,
    notes: seed.notes ?? [],
    detail_json: seed.detail_json ?? null,
  };
}

function toDomainModel(raw: RiskRawDto, dataStatus: RiskDataStatus): RiskDomainModel {
  const dimCap = Math.min(raw.cap_financial, raw.cap_market, raw.cap_event, raw.cap_compliance);
  return {
    tsCode: raw.ts_code,
    name: raw.name,
    tradeDate: raw.trade_date,
    sourceDomain: raw.source_domain,
    sourceStrategy: raw.source_strategy,
    inWatchlist: raw.in_watchlist,
    inPortfolio: raw.in_portfolio,
    tradeAllowed: raw.trade_allowed,
    blockReason: raw.block_reason,
    blockSource: raw.block_source,
    riskScoreTotal: raw.risk_score_total,
    riskScoreFinancial: raw.risk_score_financial,
    riskScoreMarket: raw.risk_score_market,
    riskScoreEvent: raw.risk_score_event,
    riskScoreCompliance: raw.risk_score_compliance,
    capFinancial: raw.cap_financial,
    capMarket: raw.cap_market,
    capEvent: raw.cap_event,
    capCompliance: raw.cap_compliance,
    positionCapMultiplierFinal: raw.position_cap_multiplier_final,
    dimCap,
    riskLevel: raw.risk_level,
    recommendedPositionText: toRecommendedPositionText(raw.position_cap_multiplier_final, raw.trade_allowed),
    tradeAllowedLabel: toTradeAllowedLabel(raw.trade_allowed),
    riskLevelLabel: toRiskLevelLabel(raw.risk_level),
    notes: raw.notes,
    dataStatus,
  };
}

function buildCoverageText(statusMap: Record<RiskTab, RiskDataStatus>): string {
  if (statusMap.gate === 'backend' && statusMap.scores === 'backend' && statusMap.breakdown === 'backend') {
    return '真实接口优先接线，当前主要字段已由风险接口提供。';
  }
  if (statusMap.gate === 'fallback' && statusMap.scores === 'fallback') {
    return '当前使用兼容数据，风险接口不可用时已回退到兼容视图。';
  }
  return '真实接口优先接线，缺失字段已按兼容策略补齐。';
}

function buildMetrics(rows: RiskDomainModel[], dashboardRisk: LoadRiskSourcesResult['dashboardRisk']): RiskOverviewMetric[] {
  const blocked = rows.filter(row => !row.tradeAllowed).length;
  const highRisk = rows.filter(row => row.riskLevel === 'high').length;
  const watchlist = rows.filter(row => row.inWatchlist).length;
  const portfolio = rows.filter(row => row.inPortfolio).length;
  return [
    {
      label: '当前阻断数量',
      value: String(dashboardRisk?.gate_blocked_count ?? blocked),
      helper: '当前被风控闸门拦下的股票数。',
    },
    {
      label: '高风险股票',
      value: String(dashboardRisk?.high_risk_watchlist_count ?? highRisk),
      helper: '当前筛选范围内的高风险对象数。',
    },
    {
      label: '交易标的池关联',
      value: String(watchlist),
      helper: '当前范围内仍与交易标的池相关的股票数。',
    },
    {
      label: '持仓关联',
      value: String(portfolio),
      helper: '当前范围内已进入持仓中心的股票数。',
    },
  ];
}

function buildFilters(query: RiskQueryModel): RiskFilterModel[] {
  const sourceLabel =
    query.source === 'dashboard'
      ? '来自 Dashboard'
      : query.source === 'signals'
        ? '来自 Signals'
        : query.source === 'watchlist'
          ? '来自交易标的池'
          : query.source === 'portfolio'
            ? '来自持仓中心'
            : '直接进入';
  const scopeLabel =
    query.scope === 'watchlist' ? '交易标的池'
    : query.scope === 'portfolio' ? '持仓中心'
    : '全部范围';
  const tabLabel =
    query.tab === 'scores' ? '评分排序'
    : query.tab === 'breakdown' ? '单票拆解'
    : query.tab === 'events' ? '风险事件'
    : '闸门阻断';

  return [
    { label: '当前来源', value: sourceLabel },
    { label: '聚焦股票', value: query.focus ?? '未指定' },
    { label: '查看范围', value: scopeLabel },
    { label: '当前标签', value: tabLabel },
  ];
}

function buildGateRows(rows: RiskDomainModel[]): GateBlockRow[] {
  return rows.map(row => ({
    id: `gate-${row.tsCode}`,
    tsCode: row.tsCode,
    name: row.name,
    sourceDomainLabel: toSourceDomainLabel(row.sourceDomain),
    tradeAllowed: row.tradeAllowed,
    tradeAllowedLabel: row.tradeAllowedLabel,
    blockReason: row.blockReason ?? '当前未发现明确阻断原因。',
    blockSource: row.blockSource ?? '当前未记录阻断来源。',
    suggestion: row.tradeAllowed ? row.recommendedPositionText : row.notes[0] ?? '建议先暂停交易，等待风险回落后再评估。',
    sourceHref: buildSourceHref(row),
  }));
}

function buildScoreRows(rows: RiskDomainModel[]): RiskScoreRow[] {
  return [...rows]
    .sort((a, b) => b.riskScoreTotal - a.riskScoreTotal)
    .map(row => ({
      id: `score-${row.tsCode}`,
      tsCode: row.tsCode,
      name: row.name,
      riskScoreTotal: row.riskScoreTotal,
      riskScoreFinancial: row.riskScoreFinancial,
      riskScoreMarket: row.riskScoreMarket,
      riskScoreEvent: row.riskScoreEvent,
      riskScoreCompliance: row.riskScoreCompliance,
      dimCap: row.dimCap,
      positionCapMultiplierFinal: row.positionCapMultiplierFinal,
      recommendedPositionText: row.recommendedPositionText,
      riskLevelLabel: row.riskLevelLabel,
      watchlistHref: row.inWatchlist
        ? `/watchlist?source=risk&focus=${encodeURIComponent(row.tsCode)}&view=table`
        : null,
      portfolioHref: row.inPortfolio
        ? `/portfolio?source=risk&focus=${encodeURIComponent(row.tsCode)}`
        : null,
    }));
}

function buildBreakdownRows(rows: RiskDomainModel[]): RiskBreakdownRow[] {
  return rows.map(row => ({
    id: `breakdown-${row.tsCode}`,
    tsCode: row.tsCode,
    name: row.name,
    sourceStrategy: row.sourceStrategy,
    tradeAllowedLabel: row.tradeAllowedLabel,
    blockReason: row.blockReason ?? '当前未发现明确阻断原因。',
    riskScoreTotal: row.riskScoreTotal,
    riskScoreFinancial: row.riskScoreFinancial,
    riskScoreMarket: row.riskScoreMarket,
    riskScoreEvent: row.riskScoreEvent,
    riskScoreCompliance: row.riskScoreCompliance,
    capFinancial: row.capFinancial,
    capMarket: row.capMarket,
    capEvent: row.capEvent,
    capCompliance: row.capCompliance,
    dimCap: row.dimCap,
    positionCapMultiplierFinal: row.positionCapMultiplierFinal,
    recommendedPositionText: row.recommendedPositionText,
    explanation: row.tradeAllowed
      ? `当前最小上限为 ${row.dimCap.toFixed(2)}，结合最终仓位上限 ${row.positionCapMultiplierFinal.toFixed(2)}，${row.recommendedPositionText}`
      : `当前主要阻断来自 ${row.blockSource ?? '风险闸门'}，原因是“${row.blockReason ?? '暂无明确说明'}”。`,
  }));
}

function buildEventRows(rows: RiskDomainModel[], eventStatus: RiskDataStatus): RiskEventRow[] {
  const prefix = eventStatus === 'backend' ? '真实状态' : '兼容状态';
  return rows.flatMap((row, index) => {
    const base: RiskEventRow[] = [
      {
        id: `event-score-${row.tsCode}`,
        tsCode: row.tsCode,
        name: row.name,
        eventTime: `${9 + index}:15`,
        eventType: `${prefix}：分数变化`,
        changeLabel: `总分 ${row.riskScoreTotal}，风险等级为${row.riskLevelLabel}`,
        sourceDomainLabel: toSourceDomainLabel(row.sourceDomain),
        statusLabel: row.tradeAllowedLabel,
        followUp: row.recommendedPositionText,
      },
      {
        id: `event-cap-${row.tsCode}`,
        tsCode: row.tsCode,
        name: row.name,
        eventTime: `${10 + index}:30`,
        eventType: `${prefix}：仓位上限变化`,
        changeLabel: `最小上限 ${row.dimCap.toFixed(2)}，最终仓位上限 ${row.positionCapMultiplierFinal.toFixed(2)}`,
        sourceDomainLabel: toSourceDomainLabel(row.sourceDomain),
        statusLabel: row.riskLevelLabel,
        followUp: row.recommendedPositionText,
      },
    ];

    if (!row.tradeAllowed) {
      base.unshift({
        id: `event-gate-${row.tsCode}`,
        tsCode: row.tsCode,
        name: row.name,
        eventTime: `${9 + index}:05`,
        eventType: `${prefix}：闸门阻断`,
        changeLabel: row.blockReason ?? '当前被风控闸门阻断。',
        sourceDomainLabel: row.blockSource ?? '风险闸门',
        statusLabel: '禁止交易',
        followUp: '建议先回看拆解，再决定是否继续跟踪。',
      });
    }

    return base;
  });
}

async function loadRiskSources(query: RiskQueryModel, tradeDate: string): Promise<LoadRiskSourcesResult> {
  const [watchlistResult, portfolioResult, dashboardResult, gateResult, scoreResult, detailResult] = await Promise.all([
    settle(fetchWatchlist()),
    settle(fetchPortfolio('open')),
    settle(getDashboardSummary(tradeDate)),
    settle(fetchRiskGateBlocks(tradeDate, query.scope)),
    settle(fetchRiskTopScores(tradeDate, query.scope)),
    query.focus ? settle(fetchRiskDetail(query.focus, tradeDate)) : Promise.resolve({ ok: true as const, value: null }),
  ]);

  return {
    watchlist: watchlistResult.ok ? watchlistResult.value : [],
    portfolio: portfolioResult.ok ? portfolioResult.value.data : [],
    dashboardRisk: dashboardResult.ok ? (dashboardResult.value.data?.risk ?? dashboardResult.value.risk ?? null) : null,
    gateRows: gateResult.ok ? gateResult.value : [],
    scoreRows: scoreResult.ok ? scoreResult.value : [],
    detailRow: detailResult.ok ? detailResult.value : null,
    gateStatus: gateResult.ok && gateResult.value.length > 0 ? 'backend' : 'fallback',
    scoreStatus: scoreResult.ok && scoreResult.value.length > 0 ? 'backend' : 'fallback',
    detailStatus: detailResult.ok && detailResult.value ? 'backend' : 'fallback',
  };
}

function mergeSourceRows(
  sources: LoadRiskSourcesResult,
  query: RiskQueryModel,
  tradeDate: string,
): {
  rows: RiskDomainModel[];
  gateStatus: RiskDataStatus;
  scoreStatus: RiskDataStatus;
  breakdownStatus: RiskDataStatus;
  eventStatus: RiskDataStatus;
} {
  const watchlistMap = new Map(sources.watchlist.map(item => [item.ts_code, item]));
  const portfolioMap = new Map(sources.portfolio.map(item => [item.ts_code, item]));
  const merged = new Map<string, RiskDomainModel>();

  const register = (seed: RiskDomainSeed, status: RiskDataStatus) => {
    const next = toDomainModel(toRawDto(seed, watchlistMap, portfolioMap, tradeDate), status);
    const current = merged.get(next.tsCode);
    if (!current || (current.dataStatus !== 'backend' && status === 'backend')) {
      merged.set(next.tsCode, next);
      return;
    }
    if (current && status !== current.dataStatus) {
      merged.set(next.tsCode, { ...current, ...next, dataStatus: 'mixed' });
    }
  };

  if (sources.gateRows.length > 0) {
    sources.gateRows.forEach(row => register(row, 'backend'));
  }
  if (sources.scoreRows.length > 0) {
    sources.scoreRows.forEach(row => register(row, 'backend'));
  }
  if (sources.detailRow) {
    register(sources.detailRow, 'backend');
  }

  if (merged.size === 0) {
    riskMockRaw.forEach(row => register(row, 'fallback'));
  }

  const scopedRows = [...merged.values()].filter(row => {
    if (query.scope === 'watchlist') return row.inWatchlist;
    if (query.scope === 'portfolio') return row.inPortfolio;
    return true;
  });

  return {
    rows: scopedRows,
    gateStatus: sources.gateStatus,
    scoreStatus: sources.scoreStatus,
    breakdownStatus: sources.detailStatus === 'backend' || sources.scoreStatus === 'backend' ? 'mixed' : 'fallback',
    eventStatus: 'fallback',
  };
}

export function normalizeRiskTab(value: string | null): RiskTab {
  if (value === 'scores' || value === 'breakdown' || value === 'events') return value;
  return 'gate';
}

export function normalizeRiskSource(value: string | null): RiskSource {
  if (value === 'dashboard' || value === 'signals' || value === 'watchlist' || value === 'portfolio') return value;
  return 'direct';
}

export function normalizeRiskScope(value: string | null): RiskScope {
  if (value === 'watchlist' || value === 'portfolio') return value;
  return 'all';
}

export function buildRiskQueryState(searchParams: URLSearchParams): RiskQueryModel {
  return {
    tab: normalizeRiskTab(searchParams.get('tab')),
    source: normalizeRiskSource(searchParams.get('source')),
    scope: normalizeRiskScope(searchParams.get('scope')),
    focus: searchParams.get('focus'),
  };
}

export async function loadRiskWorkspace(query: RiskQueryModel, tradeDate: string): Promise<RiskWorkspaceViewModel> {
  const sources = await loadRiskSources(query, tradeDate);
  const merged = mergeSourceRows(sources, query, tradeDate);
  const dataSources = {
    gate: buildRiskDataSource('real', 'Risk gate API', 'Gate 区块直接使用真实风控接口结果。', merged.rows.length),
    scores: buildRiskDataSource('real', 'Risk score API', 'Scores 区块直接使用真实风控接口结果。', merged.rows.length),
    breakdown: buildRiskDataSource(
      'mixed',
      'Risk detail + score APIs',
      'Breakdown 同时读取真实 detail/score 结果，并补入兼容解释字段。',
      merged.rows.length,
      '当前拆解区块的分数与限额来自真实接口，但解释文案仍有一部分来自兼容拼装。',
    ),
    events: buildRiskDataSource('fallback', 'Risk derived events', 'Events 区块当前仍由现有风控行数据合成事件流。', merged.rows.length, '真实事件流接口尚未接入，因此当前事件时间线仍为兼容结果。'),
  };

  return {
    tradeDate,
    generatedAtText: buildCoverageText({
      gate: merged.gateStatus,
      scores: merged.scoreStatus,
      breakdown: merged.breakdownStatus,
      events: merged.eventStatus,
    }),
    tabs: {
      gate: {
        label: '门闸阻断',
        title: '闸门阻断',
        description: '优先回答“为什么不能买”，并给出当前处理建议。',
        emptyTitle: '当前范围内没有阻断结果',
        emptyText: '可以调整范围或来源继续查看当前的风控结论。',
      },
      scores: {
        label: '风险评分',
        title: '风险评分',
        description: '按风险总分和仓位上限排序，帮助判断谁更危险、还能买多少。',
        emptyTitle: '当前范围内没有评分结果',
        emptyText: '可以切换到其他范围，或等待风险数据补齐后再查看。',
      },
      breakdown: {
        label: '维度拆解',
        title: '单票拆解',
        description: '围绕当前聚焦股票解释为什么能买、为什么被阻断，以及最终仓位上限。',
        emptyTitle: '请选择一只票查看拆解',
        emptyText: '先从闸门阻断或风险评分中选中一只股票，这里会展示对应解释。',
      },
      events: {
        label: '事件流',
        title: '风险事件',
        description: '按时间展示风险变化、闸门阻断和仓位上限变化。当前为兼容事件流。',
        emptyTitle: '当前没有可展示的风险事件',
        emptyText: '当风险状态发生变化后，这里会展示对应的兼容事件流。',
      },
    },
    metrics: buildMetrics(merged.rows, sources.dashboardRisk).map((metric) => ({
      ...metric,
      dataSource: dataSources[query.tab],
    })),
    filters: buildFilters(query),
    domainRows: merged.rows.map((row) => ({
      ...row,
      dataSource:
        row.dataStatus === 'backend'
          ? buildRiskDataSource('real', 'Risk APIs', '当前行直接使用真实风控接口字段。', 1)
          : row.dataStatus === 'mixed'
            ? buildRiskDataSource('mixed', 'Risk APIs + compatibility fields', '当前行同时包含真实风控字段和兼容补位字段。', 1, '当前行的核心分数来自真实接口，但部分解释字段仍是兼容结果。')
            : buildRiskDataSource('fallback', 'Risk compatibility data', '当前行由兼容风控数据构建。', 1, '真实风控行未返回，已回退到兼容结果。'),
    })),
    gateRows: buildGateRows(merged.rows),
    scoreRows: buildScoreRows(merged.rows),
    breakdownRows: buildBreakdownRows(merged.rows),
    eventRows: buildEventRows(merged.rows, merged.eventStatus),
    dataStatus: {
      gate: merged.gateStatus,
      scores: merged.scoreStatus,
      breakdown: merged.breakdownStatus,
      events: merged.eventStatus,
    },
    dataSources,
    dataSource: deriveMixedMeta(
      [dataSources.gate, dataSources.scores, dataSources.breakdown, dataSources.events],
      'Risk workspace',
      'Risk 页面同时包含真实区块、混合区块和兼容事件区块。',
    ),
  };
}

export function getRiskFocusRows(workspace: RiskWorkspaceViewModel, tab: RiskTab) {
  if (tab === 'scores') return workspace.scoreRows;
  if (tab === 'breakdown') return workspace.breakdownRows;
  if (tab === 'events') return workspace.eventRows;
  return workspace.gateRows;
}

export function buildRiskContext(row: RiskDomainModel | null): RiskContextModel | null {
  if (!row) return null;
  return {
    title: row.name,
    tsCode: row.tsCode,
    sourceDomainLabel: toSourceDomainLabel(row.sourceDomain),
    sourceStrategyLabel: normalizeStrategyLabel(row.sourceStrategy),
    sourceLabel: row.sourceDomain === 'portfolio' ? '来自持仓中心' : '来自交易标的池',
    tradeAllowedLabel: row.tradeAllowedLabel,
    recommendedNextStep: row.tradeAllowed ? row.recommendedPositionText : '建议先停止交易，回看阻断原因后再决定是否继续跟踪。',
    gateConclusion: [
      { label: '交易结论', value: row.tradeAllowedLabel },
      { label: '阻断原因', value: row.blockReason ?? '当前未记录阻断原因' },
      { label: '阻断来源', value: row.blockSource ?? '当前未记录阻断来源' },
    ],
    scoreSummary: [
      { label: '风险总分', value: String(row.riskScoreTotal) },
      { label: '财务', value: String(row.riskScoreFinancial) },
      { label: '市场', value: String(row.riskScoreMarket) },
      { label: '事件', value: String(row.riskScoreEvent) },
      { label: '合规', value: String(row.riskScoreCompliance) },
    ],
    positionSummary: [
      { label: '最小上限', value: row.dimCap.toFixed(2) },
      { label: '最终仓位上限', value: row.positionCapMultiplierFinal.toFixed(2) },
      { label: '推荐仓位', value: row.recommendedPositionText },
    ],
  };
}

export function findRiskDomainByFocus(rows: RiskDomainModel[], focus: string | null): RiskDomainModel | null {
  if (!focus) return null;
  return rows.find(row => row.tsCode === focus) ?? null;
}
