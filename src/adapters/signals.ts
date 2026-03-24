import {
  fetchCrossStrategies,
  fetchPatternWeakBuy,
  fetchPatternT2up9,
  fetchPortfolio,
  fetchRetoc2,
  fetchVolSurge,
  fetchWatchlist,
  type PatternWeakBuyItem,
  type PatternT2up9Item,
  type PortfolioItem,
  type Retoc2Item,
  type VolSurgeItem,
  type WatchlistItem,
} from '../api';
import { buildDataSourceMeta, deriveMixedMeta } from '../utils/dataSource';
import { getStrategyDisplayName } from '../utils/displayNames';
import type {
  SignalsBuyRowVm,
  SignalsBuyTabVm,
  SignalsDataOrigin,
  SignalsFieldTruthMap,
  SignalsFieldTruthMeta,
  SignalsFilterVm,
  SignalsFlowRowVm,
  SignalsFlowTabVm,
  SignalsMetricVm,
  SignalsResonanceRowVm,
  SignalsResonanceTabVm,
  SignalsSellRowVm,
  SignalsSellTabVm,
  SignalsSourceNoteVm,
  SignalsTabBaseVm,
  SignalsTruthFieldKey,
  SignalsTruthKind,
  SignalsWorkspaceVm,
} from '../types/signals';

interface LoadResult<T> {
  data: T;
  failed: boolean;
  warning?: string;
}

interface SignalsWorkspaceSources {
  watchlist: WatchlistItem[];
  portfolio: PortfolioItem[];
  crossMap: Record<string, string[]>;
  volSurge: VolSurgeItem[];
  retoc2: Retoc2Item[];
  patternT2up9: PatternT2up9Item[];
  patternWeakBuy: PatternWeakBuyItem[];
  warnings: string[];
  failures: {
    watchlist: boolean;
    portfolio: boolean;
    cross: boolean;
    volSurge: boolean;
    retoc2: boolean;
    patternT2up9: boolean;
    patternWeakBuy: boolean;
  };
}

interface MarketSnapshot {
  name: string;
  close: number | null;
  pctChg: number | null;
  turnoverRate: number | null;
  pctChgTruth: SignalsFieldTruthMeta | null;
}

const FLOW_LIMIT = 8;

function truthMeta(kind: SignalsTruthKind, label: string, detail: string): SignalsFieldTruthMeta {
  return { kind, label, detail };
}

function metric(label: string, value: string, helper: string, origin: SignalsDataOrigin): SignalsMetricVm {
  return { label, value, helper, origin };
}

function filter(label: string, value: string, origin: SignalsDataOrigin): SignalsFilterVm {
  return { label, value, origin };
}

function note(label: string, detail: string, origin: SignalsDataOrigin): SignalsSourceNoteVm {
  return { label, detail, origin };
}

function context(
  title: string,
  text: string,
  sections: Array<{ label: string; value: string }>,
  nextSteps: string[],
) {
  return { title, text, sections, nextSteps };
}

function strategyName(strategy: string | null | undefined): string {
  return strategy ? getStrategyDisplayName(strategy) ?? strategy : '--';
}

function drawerDetailTruthMeta(): SignalsFieldTruthMeta {
  return truthMeta('placeholder', 'drawerDetail', 'Signals Drawer detail 仍由行摘要种子生成，不是完整真值详情链路。');
}

async function settle<T>(label: string, loader: () => Promise<T>, fallback: T): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), failed: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return {
      data: fallback,
      failed: true,
      warning: `${label} 加载失败，当前已回退到前端兼容结果：${message}`,
    };
  }
}

async function loadSources(tradeDate: string): Promise<SignalsWorkspaceSources> {
  const [
    watchlistResult,
    portfolioResult,
    crossResult,
    volSurgeResult,
    retoc2Result,
    patternT2Result,
    patternWeakBuyResult,
  ] = await Promise.all([
    settle('Watchlist', () => fetchWatchlist(), [] as WatchlistItem[]),
    settle('Portfolio', async () => (await fetchPortfolio('open')).data, [] as PortfolioItem[]),
    settle('CrossStrategies', () => fetchCrossStrategies(), {} as Record<string, string[]>),
    settle('VolSurge', () => fetchVolSurge(tradeDate), [] as VolSurgeItem[]),
    settle('Retoc2', () => fetchRetoc2(tradeDate), [] as Retoc2Item[]),
    settle('PatternT2up9', () => fetchPatternT2up9(tradeDate), [] as PatternT2up9Item[]),
    settle('PatternWeakBuy', () => fetchPatternWeakBuy(tradeDate), [] as PatternWeakBuyItem[]),
  ]);

  const warnings = [
    watchlistResult.warning,
    portfolioResult.warning,
    crossResult.warning,
    volSurgeResult.warning,
    retoc2Result.warning,
    patternT2Result.warning,
    patternWeakBuyResult.warning,
  ].filter((item): item is string => Boolean(item));

  if (
    [
      watchlistResult.failed,
      portfolioResult.failed,
      crossResult.failed,
      volSurgeResult.failed,
      retoc2Result.failed,
      patternT2Result.failed,
      patternWeakBuyResult.failed,
    ].every(Boolean)
  ) {
    throw new Error('Signals 工作域所有核心来源都不可用，当前无法生成可信结果。');
  }

  return {
    watchlist: watchlistResult.data,
    portfolio: portfolioResult.data,
    crossMap: crossResult.data,
    volSurge: volSurgeResult.data,
    retoc2: retoc2Result.data,
    patternT2up9: patternT2Result.data,
    patternWeakBuy: patternWeakBuyResult.data,
    warnings,
    failures: {
      watchlist: watchlistResult.failed,
      portfolio: portfolioResult.failed,
      cross: crossResult.failed,
      volSurge: volSurgeResult.failed,
      retoc2: retoc2Result.failed,
      patternT2up9: patternT2Result.failed,
      patternWeakBuy: patternWeakBuyResult.failed,
    },
  };
}

function buildWatchlistMap(items: WatchlistItem[]): Map<string, WatchlistItem[]> {
  const map = new Map<string, WatchlistItem[]>();
  for (const item of items) {
    const rows = map.get(item.ts_code) ?? [];
    rows.push(item);
    map.set(item.ts_code, rows);
  }
  return map;
}

function buildPortfolioMap(items: PortfolioItem[]): Map<string, PortfolioItem> {
  return new Map(items.map((item) => [item.ts_code, item]));
}

function buildMarketSnapshotMap(sources: SignalsWorkspaceSources): Map<string, MarketSnapshot> {
  const map = new Map<string, MarketSnapshot>();

  for (const item of sources.volSurge) {
    map.set(item.ts_code, {
      name: item.name,
      close: item.close,
      pctChg: item.ret5 != null ? item.ret5 * 100 : null,
      turnoverRate: item.turnover_rate,
      pctChgTruth: truthMeta('compatible', 'pctChg', 'pctChg 来自 VolSurge.ret5，adapter 已统一换算为百分比。'),
    });
  }

  for (const item of sources.retoc2) {
    if (!map.has(item.ts_code)) {
      map.set(item.ts_code, {
        name: item.name,
        close: item.close,
        pctChg: item.pct_chg,
        turnoverRate: item.turnover_rate,
        pctChgTruth: truthMeta('real', 'pctChg', 'pctChg 直接来自 Retoc2.pct_chg。'),
      });
    }
  }

  for (const item of sources.patternT2up9) {
    if (!map.has(item.ts_code)) {
      map.set(item.ts_code, {
        name: item.name,
        close: null,
        pctChg: item.ret_t0 * 100,
        turnoverRate: null,
        pctChgTruth: truthMeta('compatible', 'pctChg', 'pctChg 来自 PatternT2up9.ret_t0，adapter 已统一换算为百分比。'),
      });
    }
  }

  for (const item of sources.patternWeakBuy) {
    if (!map.has(item.ts_code)) {
      const pct = item.ret60_pct != null ? (Math.abs(item.ret60_pct) <= 1 ? item.ret60_pct * 100 : item.ret60_pct) : null;
      map.set(item.ts_code, {
        name: item.name,
        close: item.close ?? null,
        pctChg: pct,
        turnoverRate: null,
        pctChgTruth: pct != null ? truthMeta('compatible', 'pctChg', 'pctChg 来自弱市吸筹 ret60_pct。') : null,
      });
    }
  }

  return map;
}

function uniqueStrategies(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value && value !== 'IGNITE')));
}

function buildSignalStrength(poolDay: number | null | undefined): string {
  if (poolDay == null) return '待确认';
  if (poolDay <= 1) return '强';
  if (poolDay <= 3) return '中';
  return '弱';
}

function collectTruthKinds(
  rows: Array<{ truthMeta: SignalsFieldTruthMap }>,
  fields: SignalsTruthFieldKey[],
): Set<SignalsTruthKind> {
  const kinds = new Set<SignalsTruthKind>();
  for (const row of rows) {
    for (const field of fields) {
      const meta = row.truthMeta[field];
      if (meta) kinds.add(meta.kind);
    }
  }
  return kinds;
}

function buildSignalsTabDataSource(
  rows: Array<{ origin: SignalsDataOrigin; truthMeta: SignalsFieldTruthMap }>,
  fields: SignalsTruthFieldKey[],
  sourceLabel: string,
  sourceDetail: string,
  options?: { degraded?: boolean; degradeReason?: string | null },
) {
  if (rows.length === 0) {
    return buildDataSourceMeta({
      data_source: options?.degraded ? 'degraded' : 'real_empty',
      source_label: sourceLabel,
      source_detail: sourceDetail,
      degraded: options?.degraded ?? false,
      degrade_reason: options?.degradeReason ?? null,
      empty_reason: '当前真实链路已接通，但这一分区当前没有可展示数据。',
    });
  }

  const kinds = collectTruthKinds(rows, fields);
  const hasReal = kinds.has('real');
  const hasCompatible = kinds.has('compatible');
  const hasDerived = kinds.has('derived');
  const hasFallback = kinds.has('fallback') || rows.some((row) => row.origin === 'fallback');
  const hasPlaceholder = kinds.has('placeholder');

  let state: 'real' | 'fallback' | 'mixed' | 'placeholder' | 'degraded' = 'real';
  if (hasPlaceholder && !hasReal && !hasCompatible && !hasDerived && !hasFallback) state = 'placeholder';
  else if (hasFallback && !hasReal && !hasCompatible && !hasDerived && !hasPlaceholder) state = 'fallback';
  else if (hasCompatible || hasDerived || hasFallback || hasPlaceholder) state = 'mixed';
  if (options?.degraded) state = 'degraded';

  return buildDataSourceMeta({
    data_source: state,
    source_label: sourceLabel,
    source_detail: sourceDetail,
    degraded: options?.degraded ?? false,
    degrade_reason: options?.degradeReason ?? null,
  });
}

function buildTabVm<T extends SignalsTabBaseVm>(
  base: Omit<T, 'dataSource' | 'tableDataSource'>,
  dataSource: SignalsTabBaseVm['dataSource'],
  tableDataSource: SignalsTabBaseVm['tableDataSource'],
): T {
  return {
    ...base,
    dataSource,
    tableDataSource,
  } as T;
}

function buildBuyRows(sources: SignalsWorkspaceSources): SignalsBuyRowVm[] {
  const marketMap = buildMarketSnapshotMap(sources);
  const portfolioMap = buildPortfolioMap(sources.portfolio);

  return sources.watchlist.map((item) => {
    const snapshot = marketMap.get(item.ts_code);
    const crossStrategies = uniqueStrategies((sources.crossMap[item.ts_code] ?? []).filter((value) => value !== item.strategy));
    const pctChg = item.latest_pct_chg ?? snapshot?.pctChg ?? null;
    const pctChgTruth =
      item.latest_pct_chg != null
        ? truthMeta('real', 'pctChg', 'pctChg 直接来自 Watchlist.latest_pct_chg。')
        : snapshot?.pctChgTruth ?? truthMeta('placeholder', 'pctChg', '当前没有可用涨跌幅字段。');

    return {
      id: `${item.strategy}-${item.ts_code}`,
      tsCode: item.ts_code,
      name: item.name,
      strategySource: item.strategy,
      signalType: item.buy_signal ?? '观察中',
      signalStrength: buildSignalStrength(item.pool_day),
      close: snapshot?.close ?? item.latest_close ?? null,
      pctChg,
      turnoverRate: snapshot?.turnoverRate ?? item.turnover_rate ?? null,
      inWatchlist: true,
      inPortfolio: portfolioMap.has(item.ts_code),
      crossStrategyCount: crossStrategies.length,
      primaryConcept: item.primary_concept ?? null,
      isLeader: item.is_leader ?? false,
      leaderReason: item.leader_reason ?? null,
      origin: 'primary',
      sourceLabel: strategyName(item.strategy),
      truthMeta: {
        pctChg: pctChgTruth,
        signalStrength: truthMeta('derived', 'signalStrength', 'signalStrength 为前端分档字段，当前基于 pool_day 启发式映射。'),
        drawerDetail: drawerDetailTruthMeta(),
      },
    };
  });
}

function buildSellRows(sources: SignalsWorkspaceSources): SignalsSellRowVm[] {
  const actionable = sources.portfolio.filter((item) => item.action_signal && item.action_signal !== 'HOLD');

  if (actionable.length > 0) {
    return actionable.map((item) => ({
      id: `portfolio-${item.id}`,
      portfolioId: item.id,
      tsCode: item.ts_code,
      name: item.name,
      sourceStrategy: item.source_strategy,
      holdDays: item.hold_days,
      latestClose: item.latest_close,
      todayPnl: item.today_pnl,
      unrealizedPnl: item.unrealized_pnl,
      actionSignal: item.action_signal ?? 'HOLD',
      signalReason: item.signal_reason ?? '当前缺少正式卖点原因，先回退为持仓复核说明。',
      isFallbackReason: !item.signal_reason,
      primaryConcept: item.primary_concept ?? null,
      isLeader: item.is_leader ?? false,
      leaderReason: item.leader_reason ?? null,
      origin: 'primary',
      sourceLabel: 'Portfolio 持仓',
      truthMeta: {
        signalReason: item.signal_reason
          ? truthMeta('real', 'signalReason', 'signalReason 直接来自 Portfolio.signal_reason。')
          : truthMeta('fallback', 'signalReason', 'signalReason 当前没有接口值，前端先用 fallback 文案承接。'),
        drawerDetail: drawerDetailTruthMeta(),
      },
    }));
  }

  return sources.portfolio.slice(0, 8).map((item) => ({
    id: `portfolio-fallback-${item.id}`,
    portfolioId: item.id,
    tsCode: item.ts_code,
    name: item.name,
    sourceStrategy: item.source_strategy,
    holdDays: item.hold_days,
    latestClose: item.latest_close,
    todayPnl: item.today_pnl,
    unrealizedPnl: item.unrealized_pnl,
    actionSignal: item.action_signal ?? 'HOLD',
    signalReason: item.signal_reason ?? '当前没有正式卖点原因，前端退化为持仓复核说明文案。',
    isFallbackReason: true,
    primaryConcept: item.primary_concept ?? null,
    isLeader: item.is_leader ?? false,
    leaderReason: item.leader_reason ?? null,
    origin: 'fallback',
    sourceLabel: '兼容：Portfolio 持仓复核',
    truthMeta: {
      signalReason: truthMeta('fallback', 'signalReason', '当前没有正式卖点原因，前端退化为持仓复核说明文案。'),
      drawerDetail: drawerDetailTruthMeta(),
    },
  }));
}

function buildResonanceRows(sources: SignalsWorkspaceSources): SignalsResonanceRowVm[] {
  const watchlistMap = buildWatchlistMap(sources.watchlist);
  const portfolioMap = buildPortfolioMap(sources.portfolio);
  const marketMap = buildMarketSnapshotMap(sources);
  const rows: SignalsResonanceRowVm[] = [];

  for (const [tsCode, strategies] of Object.entries(sources.crossMap)) {
    const deduped = uniqueStrategies(strategies);
    if (deduped.length === 0) continue;

    const snapshot = marketMap.get(tsCode);
    const watchlistRow = watchlistMap.get(tsCode)?.[0] ?? null;
    const portfolioRow = portfolioMap.get(tsCode) ?? null;

    rows.push({
      id: `cross-${tsCode}`,
      tsCode,
      name: watchlistRow?.name ?? portfolioRow?.name ?? snapshot?.name ?? tsCode,
      strategies: deduped,
      strategyCount: deduped.length,
      latestSignal: strategyName(deduped[0] ?? null),
      close: snapshot?.close ?? portfolioRow?.latest_close ?? null,
      pctChg: snapshot?.pctChg ?? null,
      inWatchlist: Boolean(watchlistRow),
      inPortfolio: Boolean(portfolioRow),
      primaryConcept: watchlistRow?.primary_concept ?? portfolioRow?.primary_concept ?? null,
      isLeader: watchlistRow?.is_leader ?? portfolioRow?.is_leader ?? false,
      leaderReason: watchlistRow?.leader_reason ?? portfolioRow?.leader_reason ?? null,
      origin: 'aggregate',
      sourceLabel: '共振聚合',
      truthMeta: {
        pctChg: snapshot?.pctChgTruth ?? truthMeta('compatible', 'pctChg', '共振列表自身不产出涨跌幅，当前由市场快照或持仓补齐。'),
        strategyCount: truthMeta('derived', 'strategyCount', 'strategyCount 为前端对 CrossStrategies 去除 IGNITE 后的数量统计。'),
        drawerDetail: drawerDetailTruthMeta(),
      },
    });
  }

  return rows;
}

function buildFlowRows(
  buyRows: SignalsBuyRowVm[],
  sellRows: SignalsSellRowVm[],
  resonanceRows: SignalsResonanceRowVm[],
): SignalsFlowRowVm[] {
  const rows: SignalsFlowRowVm[] = [];

  buyRows.slice(0, 3).forEach((row, index) => {
    rows.push({
      id: `flow-buy-${row.id}`,
      timeLabel: `T+0 ${index + 1}`,
      eventType: '买点进入观察',
      strategySource: row.strategySource,
      tsCode: row.tsCode,
      name: row.name,
      signalLabel: row.signalType,
      followAction: row.inPortfolio ? '已进入持仓，关注执行承接。' : '继续观察并准备承接。',
      origin: 'derived',
      sourceLabel: '前端工作流',
      truthMeta: {
        timeLabel: truthMeta('derived', 'timeLabel', 'timeLabel 由前端按当前工作流语义生成，并非后端事件时间字段。'),
        followAction: truthMeta('derived', 'followAction', 'followAction 为前端工作流建议，不是正式执行结果。'),
        drawerDetail: drawerDetailTruthMeta(),
      },
    });
  });

  sellRows.slice(0, 3).forEach((row, index) => {
    rows.push({
      id: `flow-sell-${row.id}`,
      timeLabel: `T+1 ${index + 1}`,
      eventType: '卖点进入复核',
      strategySource: row.sourceStrategy,
      tsCode: row.tsCode,
      name: row.name,
      signalLabel: row.actionSignal,
      followAction: row.isFallbackReason ? '当前是兼容复核文案，优先回看持仓与研究。' : '按卖点原因复核执行。',
      origin: row.isFallbackReason ? 'fallback' : 'derived',
      sourceLabel: row.isFallbackReason ? '兼容复核' : '前端工作流',
      truthMeta: {
        timeLabel: truthMeta('derived', 'timeLabel', 'timeLabel 由前端按当前工作流语义生成，并非后端事件时间字段。'),
        followAction: truthMeta('derived', 'followAction', 'followAction 为前端工作流建议，不是正式执行结果。'),
        drawerDetail: drawerDetailTruthMeta(),
      },
    });
  });

  resonanceRows.slice(0, 2).forEach((row, index) => {
    rows.push({
      id: `flow-cross-${row.id}`,
      timeLabel: `T+2 ${index + 1}`,
      eventType: '共振进入研究',
      strategySource: row.strategies[0] ?? 'CROSS',
      tsCode: row.tsCode,
      name: row.name,
      signalLabel: `${row.strategyCount} 策略共振`,
      followAction: '优先进入研究中心确认共振链路。',
      origin: 'derived',
      sourceLabel: '前端工作流',
      truthMeta: {
        timeLabel: truthMeta('derived', 'timeLabel', 'timeLabel 由前端按当前工作流语义生成，并非后端事件时间字段。'),
        followAction: truthMeta('derived', 'followAction', 'followAction 为前端工作流建议，不是正式执行结果。'),
        drawerDetail: drawerDetailTruthMeta(),
      },
    });
  });

  return rows.slice(0, FLOW_LIMIT);
}

function buildBuyTab(rows: SignalsBuyRowVm[], degraded: boolean): SignalsBuyTabVm {
  const tableDataSource = buildSignalsTabDataSource(
    rows,
    ['pctChg', 'signalStrength'],
    'Signals 买点主表',
    '买点主表混合展示 Watchlist 真值字段、市场快照兼容字段和前端分档字段。',
    { degraded, degradeReason: degraded ? '买点依赖的 Watchlist / 市场快照存在部分加载失败。' : null },
  );

  return buildTabVm<SignalsBuyTabVm>(
    {
      key: 'buy',
      label: '买点',
      title: '买点工作台',
      description: '查看 Watchlist 承接来的买点候选、信号强度和市场快照。',
      rows,
      metrics: [
        metric('候选数量', String(rows.length), '当前买点候选总数', 'primary'),
        metric('已入持仓', String(rows.filter((row) => row.inPortfolio).length), '由 Portfolio join 派生', 'derived'),
        metric('共振标的', String(rows.filter((row) => row.crossStrategyCount > 0).length), '按 cross strategies 统计', 'aggregate'),
      ],
      filters: [
        filter('主来源', 'Watchlist', 'primary'),
        filter('补齐来源', 'Market Snapshot', 'aggregate'),
      ],
      sourceNotes: [
        note('真实字段', 'pctChg 优先使用 Watchlist.latest_pct_chg。', 'primary'),
        note('派生字段', 'signalStrength 为前端分档字段。', 'derived'),
      ],
      context: context(
        '买点上下文',
        '买点主表以 Watchlist 为主，并用市场快照和共振信息补齐。',
        [
          { label: '主要真值', value: 'strategy / pool_day / latest_pct_chg' },
          { label: '派生字段', value: 'signalStrength / crossStrategyCount' },
        ],
        ['先看信号强度，再决定是否进入研究或执行承接。'],
      ),
      emptyTitle: '当前没有买点候选',
      emptyText: 'Watchlist 当前没有可承接的买点标的。',
    },
    tableDataSource,
    tableDataSource,
  );
}

function buildSellTab(rows: SignalsSellRowVm[], degraded: boolean): SignalsSellTabVm {
  const tableDataSource = buildSignalsTabDataSource(
    rows,
    ['signalReason'],
    'Signals 卖点主表',
    '卖点主表以 Portfolio 持仓为主，signalReason 缺值时会退化为 fallback 文案。',
    { degraded, degradeReason: degraded ? '卖点依赖的 Portfolio 来源存在加载失败。' : null },
  );

  return buildTabVm<SignalsSellTabVm>(
    {
      key: 'sell',
      label: '卖点',
      title: '卖点工作台',
      description: '查看持仓中的主动卖点与兼容复核结果。',
      rows,
      metrics: [
        metric('主动卖点', String(rows.filter((row) => !row.isFallbackReason).length), 'signalReason 为真实值', 'primary'),
        metric('兼容复核', String(rows.filter((row) => row.isFallbackReason).length), 'signalReason 为 fallback 文案', 'fallback'),
      ],
      filters: [
        filter('主来源', 'Portfolio', 'primary'),
        filter('当前规则', rows.some((row) => !row.isFallbackReason) ? '优先展示主动卖点' : '退化为持仓复核', rows.some((row) => !row.isFallbackReason) ? 'primary' : 'fallback'),
      ],
      sourceNotes: [
        note('真实字段', 'signalReason 有值时直接来自 Portfolio.signal_reason。', 'primary'),
        note('fallback 字段', 'signalReason 为空时会回退为兼容复核文案。', 'fallback'),
      ],
      context: context(
        '卖点上下文',
        '卖点主表主要承接 Portfolio 真值字段；缺值时仅做兼容复核提示。',
        [
          { label: '主要真值', value: 'holdDays / latestClose / unrealizedPnl / signalReason' },
          { label: '兼容结果', value: 'signalReason fallback 文案' },
        ],
        ['优先确认 signalReason 是否为真实值，再决定是否进入执行中心。'],
      ),
      emptyTitle: '当前没有卖点结果',
      emptyText: 'Portfolio 当前没有主动卖点，也没有可展示的兼容复核结果。',
    },
    tableDataSource,
    tableDataSource,
  );
}

function buildResonanceTab(rows: SignalsResonanceRowVm[], degraded: boolean): SignalsResonanceTabVm {
  const tableDataSource = buildSignalsTabDataSource(
    rows,
    ['pctChg', 'strategyCount'],
    'Signals 共振主表',
    '共振主表展示 CrossStrategies 聚合结果，并由市场快照补齐涨跌幅。',
    { degraded, degradeReason: degraded ? '共振依赖的 CrossStrategies 或市场快照存在加载失败。' : null },
  );

  return buildTabVm<SignalsResonanceTabVm>(
    {
      key: 'resonance',
      label: '共振',
      title: '共振工作台',
      description: '查看多策略共振标的及其承接状态。',
      rows,
      metrics: [
        metric('共振标的', String(rows.length), '当前 cross strategies 命中的标的数量', 'aggregate'),
        metric('已在持仓', String(rows.filter((row) => row.inPortfolio).length), '由 Portfolio join 派生', 'derived'),
      ],
      filters: [
        filter('主来源', 'CrossStrategies', 'aggregate'),
        filter('补齐来源', 'Market Snapshot / Portfolio', 'derived'),
      ],
      sourceNotes: [
        note('派生字段', 'strategyCount 为前端去重计数结果。', 'derived'),
        note('兼容字段', 'pctChg 可能来自市场快照补齐。', 'aggregate'),
      ],
      context: context(
        '共振上下文',
        '共振页签以策略组合为主，不直接等同于单一来源的真值主表。',
        [
          { label: '主要来源', value: 'CrossStrategies / Watchlist / Portfolio' },
          { label: '派生字段', value: 'strategyCount / 状态补齐' },
        ],
        ['优先进入研究中心确认共振链路，再决定执行承接。'],
      ),
      emptyTitle: '当前没有共振结果',
      emptyText: 'CrossStrategies 当前没有产出可展示的共振组合。',
    },
    tableDataSource,
    tableDataSource,
  );
}

function buildFlowTab(rows: SignalsFlowRowVm[], degraded: boolean): SignalsFlowTabVm {
  const tableDataSource = buildSignalsTabDataSource(
    rows,
    ['timeLabel', 'followAction'],
    'Signals 触发流主表',
    '触发流当前是前端 workflow 说明，不是后端 event feed。',
    { degraded, degradeReason: degraded ? '触发流由上游分区派生，当前存在部分来源加载失败。' : null },
  );

  return buildTabVm<SignalsFlowTabVm>(
    {
      key: 'flow',
      label: '触发流',
      title: '触发流工作台',
      description: '查看工作流承接顺序与后续动作建议。',
      rows,
      metrics: [
        metric('触发节点', String(rows.length), '当前工作流节点数量', 'derived'),
      ],
      filters: [
        filter('当前形态', 'workflow 描述', 'derived'),
      ],
      sourceNotes: [
        note('派生字段', 'timeLabel / followAction 都是前端工作流说明。', 'derived'),
        note('后续方向', '正式 event feed 到位后应优先替换当前 adapter 输入。', 'derived'),
      ],
      context: context(
        '触发流上下文',
        '触发流当前用于说明承接顺序，不代表真实事件流结果。',
        [
          { label: '当前性质', value: 'derived workflow' },
          { label: '替换方向', value: '后续接入正式 lifecycle / event feed' },
        ],
        ['把它视为工作台导航提示，而不是最终真值记录。'],
      ),
      emptyTitle: '当前没有触发流结果',
      emptyText: '上游分区当前没有可生成的 workflow 节点。',
    },
    tableDataSource,
    tableDataSource,
  );
}

export async function loadSignalsWorkspace(tradeDate: string): Promise<SignalsWorkspaceVm> {
  const sources = await loadSources(tradeDate);
  const buyRows = buildBuyRows(sources);
  const sellRows = buildSellRows(sources);
  const resonanceRows = buildResonanceRows(sources);
  const flowRows = buildFlowRows(buyRows, sellRows, resonanceRows);

  const buy = buildBuyTab(buyRows, sources.failures.watchlist || sources.failures.volSurge || sources.failures.retoc2 || sources.failures.patternT2up9 || sources.failures.patternWeakBuy);
  const sell = buildSellTab(sellRows, sources.failures.portfolio);
  const resonance = buildResonanceTab(resonanceRows, sources.failures.cross || sources.failures.watchlist || sources.failures.portfolio);
  const flow = buildFlowTab(flowRows, sources.failures.watchlist || sources.failures.portfolio || sources.failures.cross);

  const workspaceDataSource = deriveMixedMeta(
    [buy.dataSource!, sell.dataSource!, resonance.dataSource!, flow.dataSource!],
    'Signals 页面级来源状态',
    'Signals 页面级状态按四个 tab 的实际来源状态汇总，不再固定为 mixed。',
  );

  return {
    tradeDate,
    generatedAtText: 'Signals 工作域已按当前交易日刷新。',
    handoffText: 'Signals 工作域承接 Watchlist、Portfolio、CrossStrategies 和市场快照的工作流信号。',
    dataSource: workspaceDataSource,
    workspaceNotes: [
      note('多源汇总', 'Signals 页面级状态按四个 tab 实算汇总，不再使用壳层固定 mixed。', 'aggregate'),
      note('派生与占位', 'signalStrength、flow 文案和 Drawer detail 都已显式标记。', 'derived'),
    ],
    warnings: sources.warnings,
    tabs: {
      buy,
      sell,
      resonance,
      flow,
    },
  };
}
