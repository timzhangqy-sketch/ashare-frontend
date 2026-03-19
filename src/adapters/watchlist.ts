import {
  fetchCrossStrategies,
  fetchPortfolio,
  fetchWatchlist,
  type PortfolioItem,
  type WatchlistItem,
} from '../api';
import { buildDataSourceMeta, deriveMixedMeta } from '../utils/dataSource';
import type {
  WatchlistActionVm,
  WatchlistFieldTruthMap,
  WatchlistFieldTruthMeta,
  WatchlistFilterVm,
  WatchlistGroupBy,
  WatchlistGroupVm,
  WatchlistLifecycleStatus,
  WatchlistMetricVm,
  WatchlistQueryState,
  WatchlistRowVm,
  WatchlistSignalFilter,
  WatchlistTruthFieldKey,
  WatchlistTruthKind,
  WatchlistWorkspaceVm,
} from '../types/watchlist';

interface LoadResult<T> {
  ok: boolean;
  data: T;
}

function settle<T>(promise: Promise<T>, fallback: T): Promise<LoadResult<T>> {
  return promise
    .then((data) => ({ ok: true, data }))
    .catch(() => ({ ok: false, data: fallback }));
}

function normalizeStatusFilter(status: string | null): WatchlistLifecycleStatus | 'all' {
  if (status === 'candidate' || status === 'signaled' || status === 'handed_off' || status === 'blocked') return status;
  return 'all';
}

function normalizeSignalFilter(signal: string | null): WatchlistSignalFilter {
  if (signal === 'buy' || signal === 'sell' || signal === 'any' || signal === 'none') return signal;
  return 'all';
}

function normalizeGroupBy(groupBy: string | null): WatchlistGroupBy {
  return groupBy === 'strategy' ? 'strategy' : 'lifecycle';
}

function truthMeta(kind: WatchlistTruthKind, label: string, detail: string): WatchlistFieldTruthMeta {
  return { kind, label, detail };
}

function getSourceLabel(strategy: string): string {
  if (strategy.includes('VOL')) return '量价观察来源';
  if (strategy.includes('RETOC2')) return 'Retoc2 来源';
  if (strategy.includes('PATTERN')) return 'Pattern 来源';
  return '交易标的池来源';
}

function getStrategyTarget(strategy: string, tsCode: string): string | null {
  const strategyUpper = strategy.toUpperCase();
  if (strategyUpper.includes('VOL')) {
    return `/dashboard?ts_code=${encodeURIComponent(tsCode)}&focus=${encodeURIComponent(tsCode)}&source=watchlist&strategy=VOL_SURGE`;
  }
  if (strategyUpper.includes('RETOC2')) {
    return `/retoc2?ts_code=${encodeURIComponent(tsCode)}&focus=${encodeURIComponent(tsCode)}&source=watchlist&strategy=RETOC2`;
  }
  if (strategyUpper.includes('T2UP9')) {
    return `/pattern?ts_code=${encodeURIComponent(tsCode)}&focus=${encodeURIComponent(tsCode)}&source=watchlist&strategy=PATTERN_T2UP9`;
  }
  if (strategyUpper.includes('WEAK_BUY')) {
    return `/pattern?ts_code=${encodeURIComponent(tsCode)}&focus=${encodeURIComponent(tsCode)}&source=watchlist&strategy=WEAK_BUY`;
  }
  if (strategyUpper.includes('PATTERN')) {
    return `/pattern?ts_code=${encodeURIComponent(tsCode)}&focus=${encodeURIComponent(tsCode)}&source=watchlist&strategy=${encodeURIComponent(strategyUpper)}`;
  }
  return null;
}

function getSignalState(item: WatchlistItem): WatchlistSignalFilter {
  if (item.buy_signal && item.sell_signal) return 'any';
  if (item.buy_signal) return 'buy';
  if (item.sell_signal) return 'sell';
  return 'none';
}

function getSignalLabel(signalState: WatchlistSignalFilter): string {
  if (signalState === 'buy') return '买入信号';
  if (signalState === 'sell') return '卖出信号';
  if (signalState === 'any') return '双向信号';
  if (signalState === 'none') return '暂无信号';
  return '待确认';
}

function mapLifecycleStatus(item: WatchlistItem, inPortfolio: boolean): WatchlistLifecycleStatus {
  if (inPortfolio) return 'handed_off';
  if (item.buy_signal || item.sell_signal) return 'signaled';
  return 'candidate';
}

function getLifecycleLabel(status: WatchlistLifecycleStatus): string {
  if (status === 'handed_off') return '已承接';
  if (status === 'signaled') return '已出信号';
  if (status === 'blocked') return '受阻';
  return '待观察';
}

function getNextAction(inPortfolio: boolean, signalState: WatchlistSignalFilter): string {
  if (inPortfolio) return '回看持仓承接';
  if (signalState === 'buy') return '继续跟踪买点';
  if (signalState === 'sell') return '复核退出条件';
  if (signalState === 'any') return '优先核对双向信号';
  return '继续观察';
}

function buildActions(row: { tsCode: string; strategy: string; inPortfolio: boolean }): WatchlistActionVm[] {
  const strategyHref = getStrategyTarget(row.strategy, row.tsCode);
  return [
    {
      key: 'detail',
      label: '查看详情',
      kind: 'detail',
      note: '在当前页查看右侧详情承接卡。',
      summaryType: 'detail',
    },
    {
      key: 'strategy',
      label: '打开策略页',
      kind: strategyHref ? 'strategy' : 'placeholder',
      href: strategyHref,
      note: strategyHref ? '跳转到当前策略页。' : '当前策略没有独立目标页。',
      summaryType: 'jump',
    },
    {
      key: 'portfolio',
      label: row.inPortfolio ? '查看持仓' : '等待承接',
      kind: 'portfolio',
      href: row.inPortfolio
        ? `/portfolio?source=watchlist&focus=${encodeURIComponent(row.tsCode)}&ts_code=${encodeURIComponent(row.tsCode)}`
        : null,
      note: row.inPortfolio ? '查看已承接的持仓。' : '当前未承接到持仓。',
      summaryType: 'handoff',
    },
    {
      key: 'more',
      label: '更多',
      kind: 'placeholder',
      note: 'Pin / Ignore / 纸上交易仍是占位入口。',
      summaryType: 'placeholder',
    },
  ];
}

function collectKinds(rows: WatchlistRowVm[], fields: WatchlistTruthFieldKey[]): Set<WatchlistTruthKind> {
  const kinds = new Set<WatchlistTruthKind>();
  for (const row of rows) {
    for (const field of fields) {
      const meta = row.truthMeta[field];
      if (meta) kinds.add(meta.kind);
    }
  }
  return kinds;
}

function buildSectionDataSource(
  label: string,
  detail: string,
  rows: WatchlistRowVm[],
  fields: WatchlistTruthFieldKey[],
  options?: { degraded?: boolean; degradeReason?: string | null; placeholderWhenEmpty?: boolean },
) {
  if (rows.length === 0) {
    return buildDataSourceMeta({
      data_source: options?.degraded ? 'degraded' : options?.placeholderWhenEmpty ? 'placeholder' : 'real_empty',
      source_label: label,
      source_detail: detail,
      degraded: options?.degraded ?? false,
      degrade_reason: options?.degradeReason ?? null,
      empty_reason: options?.placeholderWhenEmpty ? '当前没有可展示的详情承接对象。' : '当前筛选结果为空。',
    });
  }

  const kinds = collectKinds(rows, fields);
  const hasReal = kinds.has('real');
  const hasCompatible = kinds.has('compatible');
  const hasDerived = kinds.has('derived');
  const hasFallback = kinds.has('fallback');
  const hasPlaceholder = kinds.has('placeholder');

  let state: 'real' | 'fallback' | 'mixed' | 'placeholder' | 'degraded' = 'real';
  if (hasPlaceholder && !hasReal && !hasCompatible && !hasDerived && !hasFallback) state = 'placeholder';
  else if (hasFallback && !hasReal && !hasCompatible && !hasDerived && !hasPlaceholder) state = 'fallback';
  else if (hasCompatible || hasDerived || hasFallback || hasPlaceholder) state = 'mixed';
  if (options?.degraded) state = 'degraded';

  return buildDataSourceMeta({
    data_source: state,
    source_label: label,
    source_detail: detail,
    degraded: options?.degraded ?? false,
    degrade_reason: options?.degradeReason ?? null,
  });
}

function buildRowSourceMeta(
  label: string,
  detail: string,
  truthMetaMap: WatchlistFieldTruthMap,
  fields: WatchlistTruthFieldKey[],
  options?: { forcePlaceholder?: boolean },
) {
  const metas = fields
    .map((field) => truthMetaMap[field])
    .filter((meta): meta is WatchlistFieldTruthMeta => Boolean(meta));
  const labels = Array.from(new Set(metas.map((meta) => meta.label)));
  const details = Array.from(new Set(metas.map((meta) => meta.detail)));
  const sourceDetail = [detail, labels.length ? `字段归属: ${labels.join(' / ')}` : null, details.join('；') || null]
    .filter(Boolean)
    .join('。');

  if (options?.forcePlaceholder) {
    return buildDataSourceMeta({
      data_source: 'placeholder',
      source_label: label,
      source_detail: sourceDetail,
    });
  }

  const kinds = new Set(metas.map((meta) => meta.kind));
  if (kinds.size === 0) {
    return buildDataSourceMeta({
      data_source: 'placeholder',
      source_label: label,
      source_detail: sourceDetail || detail,
    });
  }

  const hasReal = kinds.has('real');
  const hasCompatible = kinds.has('compatible');
  const hasDerived = kinds.has('derived');
  const hasFallback = kinds.has('fallback');
  const hasPlaceholder = kinds.has('placeholder');

  let state: 'real' | 'fallback' | 'mixed' | 'placeholder' = 'real';
  if (hasPlaceholder && !hasReal && !hasCompatible && !hasDerived && !hasFallback) state = 'placeholder';
  else if (hasFallback && !hasReal && !hasCompatible && !hasDerived && !hasPlaceholder) state = 'fallback';
  else if (hasCompatible || hasDerived || hasFallback || hasPlaceholder) state = 'mixed';

  return buildDataSourceMeta({
    data_source: state,
    source_label: label,
    source_detail: sourceDetail,
  });
}

function buildRows(
  items: WatchlistItem[],
  portfolioMap: Map<string, PortfolioItem>,
  crossMap: Record<string, string[]>,
  crossAvailable: boolean,
): WatchlistRowVm[] {
  // 临时调试：检查 max_gain 字段是否可用
  if (items && items.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      '[Watchlist] max_gain check:',
      items[0]?.max_gain,
      typeof items[0]?.max_gain,
    );
  }

  return items.map((item) => {
    const portfolioItem = portfolioMap.get(item.ts_code) ?? null;
    const inPortfolio = Boolean(portfolioItem);
    const lifecycleStatus = mapLifecycleStatus(item, inPortfolio);
    const signalState = getSignalState(item);
    const rawCrossTags = crossMap[item.ts_code] ?? [];
    const crossTags = rawCrossTags.filter((strategy) => strategy !== item.strategy && strategy !== 'IGNITE' && strategy !== 'PATTERN_GREEN10');
    const crossStrategyCount = crossTags.length;
    const truthMetaMap: WatchlistFieldTruthMap = {
      latestClose: truthMeta('placeholder', 'latestClose', '当前 Watchlist 接口未提供 latest_close / latest_price，页面没有接入真实价格字段。'),
      pctChg: truthMeta('real', 'pctChg', 'pctChg 直接来自 Watchlist.latest_pct_chg。'),
      gainSinceEntry: truthMeta(
        'compatible',
        'gainSinceEntry',
        'gainSinceEntry 直接来自 Watchlist.gain_since_entry，但当前页面仍按小数收益率格式化为百分比，口径仍需继续核对。',
      ),
      poolDay: truthMeta('real', 'poolDay', 'poolDay 直接来自 Watchlist.pool_day。'),
      watchStatus: truthMeta(
        'derived',
        'watchStatus',
        'watchStatus 当前由 buy_signal / sell_signal 和是否已承接到 Portfolio 推导，不是单独接口字段。',
      ),
      riskScoreTotal: truthMeta('placeholder', 'riskScoreTotal', 'risk_score_total 在 Risk 接口类型中存在，但 Watchlist 当前没有接入。'),
      tradeAllowed: truthMeta('placeholder', 'tradeAllowed', 'trade_allowed 在 Risk / Execution 接口类型中存在，但 Watchlist 当前没有接入。'),
      blockReason: truthMeta('placeholder', 'blockReason', 'block_reason 在 Risk / Execution 接口类型中存在，但 Watchlist 当前没有接入。'),
      sourceStrategyPrimary: truthMeta('real', 'sourceStrategyPrimary', 'source_strategy_primary 当前直接使用 Watchlist.strategy。'),
      crossTags: crossAvailable
        ? truthMeta('compatible', 'crossTags', 'cross tags 来自 /api/watchlist/cross_strategies，并在前端过滤当前策略与 IGNITE。')
        : truthMeta('fallback', 'crossTags', 'cross tags 当前不可用，已退化为空标签。'),
      crossStrategyCount: truthMeta('derived', 'crossStrategyCount', 'crossStrategyCount 为前端对 cross tags 的计数结果。'),
      buySignal: item.buy_signal
        ? truthMeta('real', 'buySignal', 'buySignal 直接来自 Watchlist.buy_signal。')
        : truthMeta('fallback', 'buySignal', 'buySignal 当前为空值，表示没有买入信号。'),
      sellSignal: item.sell_signal
        ? truthMeta('real', 'sellSignal', 'sellSignal 直接来自 Watchlist.sell_signal。')
        : truthMeta('fallback', 'sellSignal', 'sellSignal 当前为空值，表示没有卖出信号。'),
      watchReason: truthMeta('placeholder', 'watchReason', 'watch_reason 当前没有后端字段接入，页面没有真实观察原因。'),
      pinned: truthMeta('placeholder', 'pinned', 'pinned 当前只有占位菜单入口，没有真实持久化字段。'),
      ignored: truthMeta('placeholder', 'ignored', 'ignored 当前只有占位菜单入口，没有真实持久化字段。'),
      handoffStatus: truthMeta(
        'derived',
        'handoffStatus',
        'handoff_status / transferred_to_portfolio 当前通过 Portfolio 是否存在同 ts_code 推导。',
      ),
      followAction: truthMeta('derived', 'followAction', 'follow_action / next_action 当前由前端根据状态生成建议。'),
      detail: truthMeta('placeholder', 'detail', 'Watchlist 暂无独立 Drawer 详情链路，右侧详情补充字段仍以占位说明为主。'),
    };

    const row: WatchlistRowVm = {
      id: `${item.ts_code}-${item.strategy}`,
      tsCode: item.ts_code,
      name: item.name,
      strategy: item.strategy,
      sourceStrategyPrimary: item.strategy,
      entryDate: item.entry_date ?? null,
      poolDay: item.pool_day ?? 0,
      latestClose: item.latest_close ?? null,
      latestPctChg: item.latest_pct_chg ?? null,
      gainSinceEntry: item.gain_since_entry ?? null,
      maxGain: item.max_gain ?? null,
      drawdownFromPeak: item.drawdown_from_peak ?? null,
      entryPrice: item.entry_price ?? null,
      buySignal: item.buy_signal ?? null,
      sellSignal: item.sell_signal ?? null,
      vrToday: item.vr_today ?? null,
      turnoverRate: item.turnover_rate ?? null,
      aboveMa20Days: item.above_ma20_days ?? null,
      lifecycleStatus,
      lifecycleStatusLabel: getLifecycleLabel(lifecycleStatus),
      watchStatus: lifecycleStatus,
      lifecycleStatusOrigin: 'derived',
      inPortfolio,
      transferredToPortfolio: inPortfolio,
      portfolioStatus: portfolioItem?.status ?? null,
      portfolioId: portfolioItem?.id ?? null,
      primaryConcept: item.primary_concept ?? null,
      isLeader: item.is_leader ?? false,
      leaderReason: item.leader_reason ?? null,
      riskScoreTotal: null,
      tradeAllowed: null,
      blockReason: null,
      crossTags,
      crossStrategyCount,
      signalState,
      signalLabel: getSignalLabel(signalState),
      watchReason: null,
      pinned: null,
      ignored: null,
      nextAction: getNextAction(inPortfolio, signalState),
      sourceLabel: getSourceLabel(item.strategy),
      sourceOrigin: 'derived',
      truthMeta: truthMetaMap,
      contextDataSource: buildRowSourceMeta(
        'Watchlist 右侧上下文',
        '右侧卡片承接当前选中行，混合展示真实交易标的池字段、交叉承接信息与前端派生状态。',
        truthMetaMap,
        ['sourceStrategyPrimary', 'watchStatus', 'pctChg', 'poolDay', 'buySignal', 'sellSignal', 'handoffStatus', 'crossStrategyCount', 'followAction'],
      ),
      detailDataSource: buildRowSourceMeta(
        'Watchlist 详情承接',
        '当前没有独立 Drawer，详情补充字段仍以缺失说明和占位状态为主。',
        truthMetaMap,
        ['latestClose', 'riskScoreTotal', 'tradeAllowed', 'blockReason', 'watchReason', 'pinned', 'ignored', 'detail'],
        { forcePlaceholder: true },
      ),
      availableActions: buildActions({
        tsCode: item.ts_code,
        strategy: item.strategy,
        inPortfolio,
      }),
    };

    return row;
  });
}

function applyFilters(rows: WatchlistRowVm[], query: WatchlistQueryState): WatchlistRowVm[] {
  const normalizedStrategy = query.strategy?.trim().toUpperCase() ?? '';
  const normalizedStatus = normalizeStatusFilter(query.status);
  const normalizedSignal = normalizeSignalFilter(query.signal);
  const normalizedQuery = query.query?.trim().toUpperCase() ?? '';

  return rows.filter((row) => {
    if (normalizedStrategy && row.strategy.toUpperCase() !== normalizedStrategy) return false;
    if (normalizedStatus !== 'all' && row.lifecycleStatus !== normalizedStatus) return false;
    if (normalizedSignal !== 'all') {
      if (normalizedSignal === 'any' && row.signalState === 'none') return false;
      if (normalizedSignal === 'none' && row.signalState !== 'none') return false;
      if ((normalizedSignal === 'buy' || normalizedSignal === 'sell') && row.signalState !== normalizedSignal) return false;
    }
    if (normalizedQuery) {
      const haystack = `${row.tsCode} ${row.name}`.toUpperCase();
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  });
}

function buildMetrics(rows: WatchlistRowVm[]): WatchlistMetricVm[] {
  const signaledCount = rows.filter((row) => row.lifecycleStatus === 'signaled').length;
  const handedOffCount = rows.filter((row) => row.lifecycleStatus === 'handed_off').length;
  const candidateCount = rows.filter((row) => row.lifecycleStatus === 'candidate').length;
  const avgPoolDay = rows.length ? (rows.reduce((sum, row) => sum + row.poolDay, 0) / rows.length).toFixed(1) : '--';

  return [
    { label: '交易标的池总数', value: String(rows.length), helper: '当前筛选后的观察对象数量' },
    { label: '待观察', value: String(candidateCount), helper: '尚未触发承接或信号' },
    { label: '已出信号', value: String(signaledCount), helper: '已出现买卖信号' },
    { label: '已承接', value: String(handedOffCount), helper: '已进入持仓链路' },
    { label: '平均观察天数', value: String(avgPoolDay), helper: '当前筛选集观察天数均值' },
  ];
}

function buildFilters(query: WatchlistQueryState): WatchlistFilterVm[] {
  return [
    { label: 'Source', value: query.source ?? 'direct' },
    { label: 'Focus', value: query.focus ?? 'none' },
    { label: 'Strategy', value: query.strategy ?? 'all' },
    { label: 'Status', value: normalizeStatusFilter(query.status) },
    { label: 'Signal', value: normalizeSignalFilter(query.signal) },
    { label: 'Query', value: query.query ?? 'none' },
    { label: 'View', value: query.view },
    { label: 'Group by', value: normalizeGroupBy(query.groupBy) },
  ];
}


function buildGroups(rows: WatchlistRowVm[], groupBy: WatchlistGroupBy): WatchlistGroupVm[] {
  if (groupBy === 'strategy') {
    const strategyMap = new Map<string, WatchlistRowVm[]>();
    rows.forEach((row) => {
      const next = strategyMap.get(row.strategy) ?? [];
      next.push(row);
      strategyMap.set(row.strategy, next);
    });
    return Array.from(strategyMap.entries()).map(([strategy, groupRows]) => ({
      key: `strategy-${strategy}`,
      label: strategy,
      helper: `按策略分组，当前 ${groupRows.length} 条`,
      count: groupRows.length,
      rows: groupRows,
    }));
  }

  const order: WatchlistLifecycleStatus[] = ['candidate', 'signaled', 'handed_off', 'blocked'];
  return order.map((status) => {
    const groupRows = rows.filter((row) => row.lifecycleStatus === status);
    return {
      key: `lifecycle-${status}`,
      label: getLifecycleLabel(status),
      helper: status === 'blocked' ? '当前页面还没有真实 blocked 数据链路。' : `按状态分组，当前 ${groupRows.length} 条`,
      count: groupRows.length,
      rows: groupRows,
    };
  });
}

export async function loadWatchlistWorkspace(query: WatchlistQueryState, tradeDate: string): Promise<WatchlistWorkspaceVm> {
  const [watchlistResult, portfolioResult, crossResult] = await Promise.all([
    settle(fetchWatchlist(), [] as WatchlistItem[]),
    settle(fetchPortfolio('open'), null),
    settle(fetchCrossStrategies(), {} as Record<string, string[]>),
  ]);

  if (!watchlistResult.ok) {
    throw new Error('Watchlist 数据加载失败');
  }

  const portfolioMap = new Map<string, PortfolioItem>();
  if (portfolioResult.ok && portfolioResult.data) {
    portfolioResult.data.data.forEach((item) => {
      portfolioMap.set(item.ts_code, item);
    });
  }

  const allRows = buildRows(watchlistResult.data, portfolioMap, crossResult.data, crossResult.ok);
  const filteredRows = applyFilters(allRows, query);
  const listDataSource = buildSectionDataSource(
    'Watchlist 主表',
    '主表以交易标的池结果为主，同时展示生命周期、收益口径和承接状态。',
    filteredRows,
    ['sourceStrategyPrimary', 'watchStatus', 'poolDay', 'pctChg', 'gainSinceEntry', 'handoffStatus'],
  );
  const groupDataSource = buildSectionDataSource(
    'Watchlist 分组',
    '分组视图以主表为主，并叠加 cross tags 与分组聚合结果。',
    filteredRows,
    ['sourceStrategyPrimary', 'watchStatus', 'poolDay', 'pctChg', 'gainSinceEntry', 'crossTags', 'crossStrategyCount'],
    {
      degraded: !crossResult.ok,
      degradeReason: !crossResult.ok ? 'cross_strategies 不可用，分组视图已退化为空交叉标签。' : null,
    },
  );
  const heatDataSource = buildDataSourceMeta({
    data_source: 'placeholder',
    source_label: 'Watchlist 热度视图',
    source_detail: '热度视图当前仍是占位壳层，没有真实字段链路。',
  });
  const pageDataSource = deriveMixedMeta(
    [listDataSource, groupDataSource, heatDataSource],
    'Watchlist',
    'Watchlist 页面同时承载主表、分组和热度占位视图，来源状态按区块汇总计算。',
  );

  return {
    tradeDate,
    totalCount: filteredRows.length,
    dataSource: pageDataSource,
    listDataSource,
    groupDataSource,
    heatDataSource,
    rows: filteredRows,
    metrics: buildMetrics(filteredRows),
    filters: buildFilters(query),
    filterOptions: {
      statusOptions: [
        { label: '全部', value: 'all' },
        { label: '待观察', value: 'candidate' },
        { label: '已出信号', value: 'signaled' },
        { label: '已承接', value: 'handed_off' },
        { label: '受阻', value: 'blocked' },
      ],
      strategyOptions: [
        { label: '全部策略', value: 'all' },
        { label: '连续放量蓄势', value: 'VOL_SURGE' },
        { label: '第4次异动', value: 'RETOC2' },
        { label: 'T-2大涨蓄势', value: 'PATTERN_T2UP9' },
        { label: '弱市吸筹', value: 'WEAK_BUY' },
      ],
      signalOptions: [
        { label: '全部', value: 'all' },
        { label: '买入', value: 'buy' },
        { label: '卖出', value: 'sell' },
        { label: '任意信号', value: 'any' },
        { label: '无信号', value: 'none' },
      ],
    },
    viewOptions: [
      { key: 'table', label: '主表', helper: '查看行级交易标的池结果', enabled: true },
      { key: 'group', label: '分组', helper: '按状态或策略查看聚合结果', enabled: true },
      { key: 'heat', label: '热度', helper: '当前仍是占位视图', enabled: false },
    ],
    groupByOptions: [
      { label: '按状态', value: 'lifecycle' },
      { label: '按策略', value: 'strategy' },
    ],
    groups: buildGroups(filteredRows, normalizeGroupBy(query.groupBy)),
    emptyTitle: '当前筛选下没有交易标的池结果',
    emptyText: '请调整状态、策略或信号筛选条件后重试。',
    sourceNotes: [
      '主表来自真实 Watchlist 接口，但生命周期、承接状态和后续动作仍有前端派生。',
      '分组视图额外依赖 cross_strategies；该源不可用时会退化。',
      '右侧详情补充字段暂未接入 risk / trade / note 真接口，当前会诚实显示为占位。',
    ],
  };
}
