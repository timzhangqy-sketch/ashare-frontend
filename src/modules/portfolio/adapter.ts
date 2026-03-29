import { fetchPortfolio, fetchPortfolioSummary, fetchPortfolioTransactions, fetchWatchlist } from '../../api';
import type { PortfolioItem, PortfolioResponse, PortfolioSummaryApi, TransactionItem, WatchlistItem } from '../../api';
import { getStrategyDisplayName } from '../../utils/displayNames';
import { buildDataSourceMeta, deriveMixedMeta } from '../../utils/dataSource';
import type {
  PortfolioActionShellVm,
  PortfolioClosedRowVm,
  PortfolioContextVm,
  PortfolioFieldTruthMap,
  PortfolioFieldTruthMeta,
  PortfolioMetricVm,
  PortfolioOpenRowVm,
  PortfolioSummaryVm,
  PortfolioTransactionRowVm,
  PortfolioTruthFieldKey,
  PortfolioTruthKind,
  PortfolioWorkspaceVm,
} from './types';

const SIGNAL_LABEL_MAP: Record<string, string> = {
  TRAILING_STOP: '追踪止损',
  BREAKOUT: '突破信号',
  PULLBACK: '回调信号',
  STOP_LOSS: '止损出场',
  TAKE_PROFIT: '止盈出场',
  HOLD: '持续持有',
  EXIT: '主动退出',
};

const ACTION_COPY: Record<string, { label: string; suggestion: string }> = {
  HOLD: { label: '持续持有', suggestion: '等待后端接入' },
  REDUCE: { label: '减仓观察', suggestion: '信号提示应优先评估减仓，不应直接视作真实执行结果。' },
  CLOSE: { label: '准备退出', suggestion: '当前建议靠近退出动作，但仍需到 Execution 或研究承接页复核。' },
  STOP_LOSS: { label: '止损出场', suggestion: '当前建议带有止损语义，属于前端建议动作，不是后端成交结果。' },
};

const TRADE_TYPE_COPY: Record<string, string> = {
  BUY: '买入',
  SELL: '卖出',
  ADD: '加仓',
  REDUCE: '减仓',
  CLOSE: '平仓',
};

const formatMoney = (value: number | null | undefined): string =>
  value == null ? '--' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

const formatPlainMoney = (value: number | null | undefined): string =>
  value == null ? '--' : value.toFixed(2);

/** Format as integer with thousands comma, e.g. 1,101,906 */
function formatNav(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '--';
  return Math.round(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Natural days between two YYYY-MM-DD dates (inclusive of start, exclusive of end or vice versa; we use start to end inclusive). */
function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

const formatPercent = (value: number | null | undefined): string =>
  value == null ? '--' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;

function truthMeta(kind: PortfolioTruthKind, label: string, detail: string): PortfolioFieldTruthMeta {
  return { kind, label, detail };
}

function toStrategyLabel(strategy: string | null | undefined): string {
  if (!strategy) return '待补策略';
  return getStrategyDisplayName(strategy) || strategy;
}

function toActionCopy(signal: string | null | undefined): { label: string; suggestion: string } {
  if (!signal) return ACTION_COPY.HOLD;
  const label = SIGNAL_LABEL_MAP[signal] ?? ACTION_COPY[signal]?.label ?? signal;
  const base = ACTION_COPY[signal];
  return base ? { ...base, label } : { label, suggestion: '当前动作文案由前端兼容映射生成。' };
}

function toTradeTypeLabel(value: string): string {
  return TRADE_TYPE_COPY[value] ?? value;
}

function toTriggerSourceLabel(value: string | null | undefined): string {
  if (!value) return '手动或历史承接';
  return getStrategyDisplayName(value) || value;
}

function buildActionShells(isClosed: boolean): PortfolioActionShellVm[] {
  if (isClosed) {
    return [
      { key: 'add', label: '加仓', enabled: false, tone: 'neutral', note: '已平仓，不可操作' },
      { key: 'reduce', label: '减仓', enabled: false, tone: 'neutral', note: '已平仓，不可操作' },
      { key: 'close', label: '平仓', enabled: false, tone: 'warning', note: '已平仓，历史记录仅供查阅' },
    ];
  }
  return [
    { key: 'add', label: '加仓', enabled: false, tone: 'primary', note: '模拟盘暂不支持手动加仓' },
    { key: 'reduce', label: '减仓', enabled: false, tone: 'warning', note: '模拟盘暂不支持手动减仓' },
    { key: 'close', label: '平仓', enabled: false, tone: 'warning', note: '模拟盘暂不支持手动平仓' },
  ];
}

function buildRowSourceMeta(
  label: string,
  detail: string,
  truthMetaMap: PortfolioFieldTruthMap,
  fields: PortfolioTruthFieldKey[],
  options?: { forcePlaceholder?: boolean; degraded?: boolean; degradeReason?: string | null },
) {
  const metas = fields
    .map((field) => truthMetaMap[field])
    .filter((meta): meta is PortfolioFieldTruthMeta => Boolean(meta));
  const labels = Array.from(new Set(metas.map((meta) => meta.label)));
  const details = Array.from(new Set(metas.map((meta) => meta.detail)));
  const sourceDetail = [detail, labels.length ? `字段归属: ${labels.join(' / ')}` : null, details.join('；') || null]
    .filter(Boolean)
    .join('。');

  if (options?.forcePlaceholder) {
    return buildDataSourceMeta({
      data_source: options.degraded ? 'degraded' : 'placeholder',
      source_label: label,
      source_detail: sourceDetail,
      degraded: options.degraded ?? false,
      degrade_reason: options?.degradeReason ?? null,
    });
  }

  const kinds = new Set(metas.map((meta) => meta.kind));
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
    source_detail: sourceDetail,
    degraded: options?.degraded ?? false,
    degrade_reason: options?.degradeReason ?? null,
  });
}

function buildMetric(
  label: string,
  value: string,
  helper: string,
  truth: PortfolioFieldTruthMeta,
  tone?: PortfolioMetricVm['tone'],
): PortfolioMetricVm {
  return { label, value, helper, truthMeta: truth, tone };
}

function buildTransactionRow(item: TransactionItem, portfolioId = 0, rowIndex = 0): PortfolioTransactionRowVm {
  const truthMetaMap: PortfolioFieldTruthMap = {
    transactionDetail: item.trigger_source
      ? truthMeta('real', 'transactionDetail', '交易记录来自真实 transactions 接口，trigger_source 直接来自后端。')
      : truthMeta('fallback', 'transactionDetail', '交易记录存在，但 trigger_source 当前为空，前端使用兼容标签承接。'),
  };

  return {
    id: item.id ?? rowIndex,
    portfolioId,
    tsCode: item.ts_code,
    name: item.name ?? '',
    tradeDate: item.trade_date,
    tradeType: item.trade_type,
    tradeTypeLabel: toTradeTypeLabel(item.trade_type),
    price: item.price,
    shares: item.shares,
    amount: item.amount,
    triggerSource: item.trigger_source,
    triggerSourceLabel: toTriggerSourceLabel(item.trigger_source),
    signalType: item.signal_type ?? null,
    notes: item.notes ?? null,
    truthMeta: truthMetaMap,
  };
}

/** Returns the most frequent trigger_source label (Chinese) from rows, or '暂无'. */
function modeTriggerSourceLabel(rows: PortfolioTransactionRowVm[]): string {
  if (rows.length === 0) return '暂无';
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.triggerSource ?? '__none__';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let maxKey = '__none__';
  let maxCount = 0;
  counts.forEach((c, k) => {
    if (c > maxCount) {
      maxCount = c;
      maxKey = k;
    }
  });
  return maxKey === '__none__' ? '暂无' : toTriggerSourceLabel(maxKey);
}

function buildSourceHint(item: PortfolioItem, watchlistMap: Map<string, WatchlistItem>): string {
  return watchlistMap.has(item.ts_code) ? '来自交易标的池承接' : '直接进入持仓';
}

function buildBaseTruthMap(item: PortfolioItem): PortfolioFieldTruthMap {
  return {
    latestClose: truthMeta('real', 'latestClose', 'latest_close 直接来自 Portfolio.latest_close。'),
    positionStatus: truthMeta('real', 'positionStatus', 'position_status 直接来自 Portfolio.status。'),
    openDate: truthMeta('real', 'openDate', 'open_date 直接来自 Portfolio.open_date。'),
    openPrice: truthMeta('real', 'openPrice', 'open_price 直接来自 Portfolio.open_price。'),
    shares: truthMeta('real', 'shares', 'shares 直接来自 Portfolio.shares。'),
    marketValue: truthMeta('real', 'marketValue', 'market_value 直接来自 Portfolio.market_value。'),
    costValue: truthMeta('real', 'costValue', 'cost_amount 直接来自 Portfolio.cost_amount。'),
    unrealizedPnl: truthMeta('real', 'unrealizedPnl', 'unrealized_pnl 直接来自 Portfolio.unrealized_pnl。'),
    unrealizedPnlPct: truthMeta('real', 'unrealizedPnlPct', 'unrealized_pnl_pct 直接来自 Portfolio.unrealized_pnl_pct。'),
    realizedPnl: truthMeta('real', 'realizedPnl', 'realized_pnl 直接来自 Portfolio.realized_pnl。'),
    realizedPnlPct: truthMeta('real', 'realizedPnlPct', 'realized_pnl_pct 直接来自 Portfolio.realized_pnl_pct。'),
    holdDays: truthMeta('real', 'holdDays', 'hold_days 直接来自 Portfolio.hold_days。'),
    drawdownFromPeak: truthMeta('placeholder', 'drawdownFromPeak', 'Portfolio 当前没有 drawdown_from_peak 字段。'),
    actionSignal: item.action_signal
      ? truthMeta('real', 'actionSignal', 'action_signal 直接来自 Portfolio.action_signal。')
      : truthMeta('fallback', 'actionSignal', 'action_signal 当前为空，前端回退为 HOLD 语义。'),
    sellSignalType: truthMeta('compatible', 'sellSignalType', 'sell_signal_type 当前没有单独字段，页面暂以 action_signal 兼容承接。'),
    signalReason: item.signal_reason
      ? truthMeta('real', 'signalReason', 'signal_reason 直接来自 Portfolio.signal_reason。')
      : truthMeta('fallback', 'signalReason', 'signal_reason 当前为空，页面会回退到前端建议文案。'),
    sourceStrategyPrimary: truthMeta('real', 'sourceStrategyPrimary', 'source_strategy 直接来自 Portfolio.source_strategy。'),
    sourceStrategies: truthMeta('placeholder', 'sourceStrategies', 'Portfolio 当前没有 source_strategies / cross tags 字段。'),
    riskScoreTotal: truthMeta('placeholder', 'riskScoreTotal', 'Portfolio 当前没有 risk_score_total 字段。'),
    tradeAllowed: truthMeta('placeholder', 'tradeAllowed', 'Portfolio 当前没有 trade_allowed 字段。'),
    blockReason: truthMeta('placeholder', 'blockReason', 'Portfolio 当前没有 block_reason 字段。'),
    positionCapMultiplierFinal: truthMeta('placeholder', 'positionCapMultiplierFinal', 'Portfolio 当前没有 position_cap_multiplier_final 字段。'),
    nextAction: truthMeta('derived', 'nextAction', 'next_action / execution_hint 当前由 action_signal 和状态映射生成。'),
    executionHint: truthMeta('derived', 'executionHint', 'execution_hint 当前是前端动作建议，不是后端真实执行结果。'),
    detail: truthMeta('placeholder', 'detail', 'Portfolio 当前没有独立 Drawer/detail 真接口链路。'),
    summaryTotalPositions: truthMeta('derived', 'summaryTotalPositions', 'summary.total_positions 当前由当前 tab 响应行数或 count 聚合得出。'),
    summaryCashRatio: truthMeta('placeholder', 'summaryCashRatio', 'Portfolio summary 当前没有 cash_ratio。'),
    summaryExposureRatio: truthMeta('placeholder', 'summaryExposureRatio', 'Portfolio summary 当前没有 exposure_ratio。'),
    summaryConcentration: truthMeta('placeholder', 'summaryConcentration', 'Portfolio summary 当前没有 concentration。'),
    summaryTopHolding: truthMeta('placeholder', 'summaryTopHolding', 'Portfolio summary 当前没有 top holding。'),
    transactionDetail: truthMeta('real', 'transactionDetail', 'relatedTransactions 来自真实 transactions 接口，可能只覆盖已拉取的持仓。'),
  };
}

function buildBaseRow(
  item: PortfolioItem,
  status: 'open' | 'closed',
  watchlistMap: Map<string, WatchlistItem>,
  transactionMap: Map<number, PortfolioTransactionRowVm[]>,
) {
  const actionCopy = toActionCopy(item.action_signal);
  const fromWatchlist = watchlistMap.has(item.ts_code);
  const truthMeta = buildBaseTruthMap(item);

  return {
    id: item.id,
    tsCode: item.ts_code,
    name: item.name,
    status,
    statusLabel: status === 'open' ? '持有中' : '已平仓',
    sourceStrategy: item.source_strategy,
    sourceStrategyLabel: toStrategyLabel(item.source_strategy),
    fromWatchlist,
    sourceHint: buildSourceHint(item, watchlistMap),
    openDate: item.open_date,
    openPrice: item.open_price,
    shares: item.shares,
    holdDays: item.hold_days,
    latestClose: item.latest_close,
    todayPnl: item.today_pnl,
    todayPnlPct: item.today_pnl_pct,
    costAmount: item.cost_amount,
    marketValue: item.market_value,
    unrealizedPnl: item.unrealized_pnl,
    unrealizedPnlPct: item.unrealized_pnl_pct,
    actionSignal: item.action_signal,
    actionLabel: actionCopy.label,
    exitSuggestion: actionCopy.suggestion,
    signalReason: item.signal_reason,
    isFallbackSignalReason: !item.signal_reason,
    riskHint: '风险约束字段未接入 Portfolio 真接口，当前仅保留占位提示。',
    nextAction: status === 'closed' ? '查看历史承接' : actionCopy.suggestion,
    relatedTransactions: transactionMap.get(item.id) ?? [],
    rawActionSignal: item.action_signal,
    drawdownFromPeak: item.drawdown_from_peak ?? null,
    positionCapMultiplierFinal: item.position_cap_multiplier_final ?? null,
    primaryConcept: item.primary_concept ?? null,
    isLeader: item.is_leader ?? false,
    leaderReason: item.leader_reason ?? null,
    truthMeta,
    contextDataSource: buildRowSourceMeta(
      'Portfolio 右侧上下文',
      '右侧上下文混合展示持仓真实字段、承接来源和前端建议动作。',
      truthMeta,
      ['sourceStrategyPrimary', 'positionStatus', 'openDate', 'openPrice', 'shares', 'holdDays', 'latestClose', 'unrealizedPnl', 'unrealizedPnlPct', 'actionSignal', 'signalReason', 'nextAction'],
    ),
    detailDataSource: buildRowSourceMeta(
      'Portfolio 详情补充',
      '风险和仓位约束类字段当前仍未接入 Portfolio 真接口，详情补充只做诚实占位表达。',
      truthMeta,
      ['riskScoreTotal', 'tradeAllowed', 'blockReason', 'positionCapMultiplierFinal', 'sourceStrategies', 'drawdownFromPeak', 'detail'],
      { forcePlaceholder: true },
    ),
  };
}

function buildOpenRows(
  resp: PortfolioResponse,
  watchlistMap: Map<string, WatchlistItem>,
  transactionMap: Map<number, PortfolioTransactionRowVm[]>,
): PortfolioOpenRowVm[] {
  return resp.data.map((item) => buildBaseRow(item, 'open', watchlistMap, transactionMap));
}

function buildClosedRows(
  resp: PortfolioResponse,
  watchlistMap: Map<string, WatchlistItem>,
  transactionMap: Map<number, PortfolioTransactionRowVm[]>,
): PortfolioClosedRowVm[] {
  return resp.data.map((item) => ({
    ...buildBaseRow(item, 'closed', watchlistMap, transactionMap),
    closeDate: item.close_date,
    closePrice: item.close_price,
    realizedPnl: item.realized_pnl,
    realizedPnlPct: item.realized_pnl_pct,
    exitReason: item.signal_reason || toActionCopy(item.action_signal).suggestion,
  }));
}

function buildOpenSummary(
  resp: PortfolioResponse,
  _rows: PortfolioOpenRowVm[],
  summaryApi: PortfolioSummaryApi,
  tradeDate: string,
): PortfolioSummaryVm {
  const startDate = summaryApi.start_date ?? '';
  const daysFromApiOrCalc = summaryApi.running_days ?? daysBetween(startDate, tradeDate);
  const runningDays = daysFromApiOrCalc > 0 ? daysFromApiOrCalc : 9;
  const cumPct = summaryApi.cumulative_pnl_pct ?? 0;
  const annualized =
    runningDays > 0
      ? Math.pow(1 + cumPct, 365 / runningDays) - 1
      : 0;
  const initialCap = summaryApi.initial_capital ?? 10_000_000;
  const floatPnl = summaryApi.total_unrealized_pnl ?? 0;
  const maxDdRaw = summaryApi.max_drawdown_pct;
  const maxDdDisplay = maxDdRaw == null ? '--' : `-${Math.abs(Number(maxDdRaw)).toFixed(2)}%`;

  const fmtCumPct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
  const fmtCashRatio = (v: number | null | undefined) => (v == null ? '--' : `${(v * 100).toFixed(1)}%`);
  const fmtFloatPnl = (v: number) => `${v >= 0 ? '+' : ''}${formatNav(v)}`;
  const benchmarkPct = summaryApi.benchmark_pct;
  const fmtBenchmark = (v: number | null | undefined) => (v == null ? '--' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`);

  const noHelper = '';
  const benchmarkHelper = '';
  return {
    title: '',
    description: '账户总览、资产结构与风控指标来自 /api/portfolio/summary。',
    dataSource: buildRowSourceMeta(
      'Portfolio 当前持仓 summary',
      'summary 以 /api/portfolio/summary 为主。',
      {
        summaryTotalPositions: truthMeta('real', 'summaryTotalPositions', 'position_count 来自 summary API。'),
        marketValue: truthMeta('real', 'marketValue', 'total_market_value / snapshot 来自 summary API。'),
        summaryCashRatio: truthMeta('real', 'summaryCashRatio', 'cash_ratio 来自 summary API。'),
      },
      ['summaryTotalPositions', 'marketValue', 'summaryCashRatio'],
    ),
    metrics: [
      buildMetric('总资产(NAV)', formatNav(summaryApi.total_nav), noHelper, truthMeta('real', 'marketValue', 'total_nav'), undefined),
      buildMetric('初始本金', formatNav(initialCap), noHelper, truthMeta('real', 'marketValue', 'initial_capital'), undefined),
      buildMetric('累计收益', fmtCumPct(cumPct), noHelper, truthMeta('real', 'unrealizedPnl', 'cumulative_pnl_pct'), cumPct >= 0 ? 'up' : 'down'),
      buildMetric('年化收益', `${annualized >= 0 ? '+' : ''}${(annualized * 100).toFixed(1)}%`, noHelper, truthMeta('derived', 'nextAction', '年化由前端计算'), annualized >= 0 ? 'up' : 'down'),
      buildMetric('股票市值', formatNav(summaryApi.total_market_value), noHelper, truthMeta('real', 'marketValue', 'total_market_value'), undefined),
      buildMetric('现金', formatNav(summaryApi.cash), noHelper, truthMeta('real', 'marketValue', 'cash'), undefined),
      buildMetric('持仓浮盈', fmtFloatPnl(floatPnl), noHelper, truthMeta('real', 'unrealizedPnl', 'total_unrealized_pnl'), floatPnl >= 0 ? 'up' : 'down'),
      buildMetric('开始日期', startDate || '--', noHelper, truthMeta('real', 'openDate', 'start_date'), undefined),
      buildMetric('当前持仓', `${summaryApi.position_count ?? resp.count}只`, noHelper, truthMeta('real', 'summaryTotalPositions', 'position_count'), undefined),
      buildMetric('现金比例', fmtCashRatio(summaryApi.cash_ratio), noHelper, truthMeta('real', 'summaryCashRatio', 'cash_ratio'), undefined),
      buildMetric('最大回撤', maxDdDisplay, noHelper, truthMeta('placeholder', 'summaryConcentration', 'max_drawdown_pct'), 'down'),
      buildMetric('同期基准', fmtBenchmark(benchmarkPct), benchmarkHelper, truthMeta('derived', 'nextAction', 'benchmark_pct'), benchmarkPct == null ? undefined : benchmarkPct >= 0 ? 'up' : 'down'),
    ],
  };
}

function buildClosedSummary(resp: PortfolioResponse, rows: PortfolioClosedRowVm[]): PortfolioSummaryVm {
  const realized = rows.reduce((sum, row) => sum + (row.realizedPnl ?? 0), 0);
  const winCount = rows.filter((row) => (row.realizedPnl ?? 0) > 0).length;
  const avgPct = rows.length ? rows.reduce((sum, row) => sum + ((row.realizedPnlPct ?? 0) * 100), 0) / rows.length : 0;
  return {
    title: '已平仓概览',
    description: '已平仓 summary 既包含真实 count，也包含前端再聚合的收益统计。',
    dataSource: buildRowSourceMeta(
      'Portfolio 已平仓 summary',
      '已平仓 summary 含真实 closed 行结果和前端聚合统计。',
      {
        summaryTotalPositions: truthMeta('real', 'summaryTotalPositions', '总笔数使用 closed Portfolio.count。'),
        realizedPnl: truthMeta('derived', 'realizedPnl', '总实现盈亏由 closed rows 前端汇总。'),
        realizedPnlPct: truthMeta('derived', 'realizedPnlPct', '平均收益率由 closed rows 前端汇总。'),
      },
      ['summaryTotalPositions', 'realizedPnl', 'realizedPnlPct'],
    ),
    metrics: [
      buildMetric('已平仓笔数', String(resp.count), '直接来自 closed Portfolio.count', truthMeta('real', 'summaryTotalPositions', '直接来自 closed Portfolio.count。')),
      buildMetric('累计实现盈亏', formatMoney(realized), '由 closed rows 前端汇总', truthMeta('derived', 'realizedPnl', '由 closed rows 前端汇总。')),
      buildMetric('盈利笔数', String(winCount), '由 closed rows 前端统计', truthMeta('derived', 'realizedPnl', '由 closed rows 前端统计。')),
      buildMetric('平均收益率', `${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(2)}%`, '由 closed rows 前端统计', truthMeta('derived', 'realizedPnlPct', '由 closed rows 前端统计。')),
    ],
  };
}

function buildTransactionSummary(rows: PortfolioTransactionRowVm[], total: number, degraded: boolean): PortfolioSummaryVm {
  const buyCount = rows.filter((row) => row.tradeType === 'BUY').length;
  const sellCount = rows.filter((row) => row.tradeType === 'SELL').length;
  const mainTriggerLabel = modeTriggerSourceLabel(rows);
  return {
    title: '交易流水概览',
    description: '交易流水 summary 含真实交易记录和前端统计。',
    dataSource: buildRowSourceMeta(
      'Portfolio 交易流水 summary',
      '交易流水 summary 基于 data.total / data.data 计算。',
      {
        transactionDetail: truthMeta(
          degraded ? 'compatible' : 'real',
          'transactionDetail',
          degraded ? '当前只覆盖已拉取的部分持仓 transactions。' : '当前基于真实 transactions 接口。',
        ),
      },
      ['transactionDetail'],
      { degraded, degradeReason: degraded ? '只对前 12 个持仓预取 transactions，整页交易流水仍是部分覆盖。' : null },
    ),
    metrics: [
      buildMetric('流水记录数', String(total), 'data.total', truthMeta('derived', 'transactionDetail', '来自 data.total。')),
      buildMetric('买入记录', String(buyCount), 'data.data 按 trade_type === BUY 统计', truthMeta('derived', 'transactionDetail', '前端按 trade_type 聚合。')),
      buildMetric('卖出记录', String(sellCount), 'data.data 按 trade_type === SELL 统计', truthMeta('derived', 'transactionDetail', '前端按 trade_type 聚合。')),
      buildMetric('主要触发来源', mainTriggerLabel, '出现次数最多的 trigger_source，中文映射展示', truthMeta('derived', 'transactionDetail', '出现次数最多的 trigger_source 中文映射。')),
    ],
  };
}

export function buildPortfolioContext(
  row: PortfolioOpenRowVm | PortfolioClosedRowVm | null,
  sourceQuery: string | null,
): PortfolioContextVm | null {
  if (!row) return null;

  const sourceLinkLabel = (() => {
    const s = row.sourceStrategy ?? '';
    if (s.includes('VOL') || s.includes('IGNITE')) return '查看工作台';
    if (s.includes('RETOC2')) return '查看异动策略页';
    if (s.includes('PATTERN')) return '查看形态策略页';
    return '查看来源策略页';
  })();

  const sourceQueryValue =
    sourceQuery === 'dashboard'
      ? '来自 Dashboard'
      : sourceQuery === 'signals'
        ? '来自 Signals'
        : sourceQuery === 'watchlist'
          ? '来自 Watchlist'
          : '直接进入';

  return {
    title: row.name,
    code: row.tsCode,
    statusLabel: row.statusLabel,
    sourceStrategyLabel: row.sourceStrategyLabel,
    sourceHint: row.fromWatchlist ? '来自 Watchlist 承接' : '直接进入组合',
    sourceQueryLabel: '来源入口',
    sourceQueryValue,
    dataSource: row.contextDataSource,
    detailDataSource: row.detailDataSource,
    holdingFacts: [
      { label: 'open_date', value: row.openDate },
      { label: 'open_price', value: formatPlainMoney(row.openPrice) },
      { label: 'shares', value: String(row.shares) },
      { label: 'hold_days', value: row.holdDays == null ? '--' : String(row.holdDays) },
      { label: row.status === 'open' ? 'unrealized_pnl' : 'realized_pnl', value: row.status === 'open' ? formatMoney(row.unrealizedPnl) : formatMoney(('realizedPnl' in row ? row.realizedPnl : null)) },
      { label: row.status === 'open' ? 'unrealized_pnl_pct' : 'realized_pnl_pct', value: row.status === 'open' ? formatPercent(row.unrealizedPnlPct) : formatPercent(('realizedPnlPct' in row ? row.realizedPnlPct : null)) },
    ],
    judgementFacts: [
      { label: 'action_signal', value: row.actionSignal ?? 'HOLD' },
      { label: row.status === 'open' ? 'signal_reason' : 'exit_reason', value: row.status === 'open' ? (row.signalReason ?? '前端 fallback') : ('exitReason' in row ? row.exitReason : '--') },
      { label: 'execution_hint', value: row.exitSuggestion },
      { label: 'source_hint', value: row.sourceHint },
    ],
    transactionSummary: row.relatedTransactions.length > 0 ? `已关联 ${row.relatedTransactions.length} 条成交记录` : '当前没有关联成交记录',
    relatedLinks: [
      { key: 'source', label: sourceLinkLabel, enabled: true, note: `来源：${row.sourceStrategyLabel}` },
      { key: 'watchlist', label: '查看交易标的池承接', enabled: row.fromWatchlist, note: row.fromWatchlist ? '点击跳转交易标的池并定位该股票' : '该持仓未经交易标的池承接' },
      { key: 'transactions', label: '查看交易流水', enabled: true, note: row.relatedTransactions.length > 0 ? `共 ${row.relatedTransactions.length} 条成交记录` : '暂无关联成交记录' },
    ],
    actionShells: buildActionShells(row.status === 'closed'),
  };
}

export async function loadPortfolioWorkspace(tradeDate: string): Promise<PortfolioWorkspaceVm> {
  const [openResp, closedResp, watchlist, summaryApi] = await Promise.all([
    fetchPortfolio('open', tradeDate),
    fetchPortfolio('closed', tradeDate),
    fetchWatchlist({ include_exited: true }),
    fetchPortfolioSummary(),
  ]);

  const [watchlistMap, transactionsResp] = await Promise.all([
    Promise.resolve(new Map(watchlist.map((item) => [item.ts_code, item]))),
    fetchPortfolioTransactions().catch(() => ({ total: 0, data: [] as TransactionItem[] })),
  ]);

  // Table data source: response.data.data (full array), no client-side limit or date filter
  const transactionRows: PortfolioTransactionRowVm[] = transactionsResp.data
    .map((item, i) => buildTransactionRow(item, 0, i))
    .sort((a, b) => `${b.tradeDate}-${b.id}`.localeCompare(`${a.tradeDate}-${a.id}`));

  const transactionsByTsCode = new Map<string, PortfolioTransactionRowVm[]>();
  for (const row of transactionRows) {
    const list = transactionsByTsCode.get(row.tsCode) ?? [];
    list.push(row);
    transactionsByTsCode.set(row.tsCode, list);
  }
  const transactionMap = new Map<number, PortfolioTransactionRowVm[]>();
  for (const item of [...openResp.data, ...closedResp.data]) {
    const list = transactionsByTsCode.get(item.ts_code) ?? [];
    transactionMap.set(item.id, list);
  }

  const openRows = buildOpenRows(openResp, watchlistMap, transactionMap);
  const closedRows = buildClosedRows(closedResp, watchlistMap, transactionMap);
  const transactionDegraded = false;

  const openTableDataSource = buildRowSourceMeta(
    'Portfolio 当前持仓主表',
    '当前持仓主表混合展示真实持仓字段、交易标的池承接提示和前端动作文案。',
    {
      latestClose: truthMeta('real', 'latestClose', '主表使用 Portfolio.latest_close。'),
      holdDays: truthMeta('real', 'holdDays', '主表使用 Portfolio.hold_days。'),
      unrealizedPnl: truthMeta('real', 'unrealizedPnl', '主表使用 Portfolio.unrealized_pnl。'),
      unrealizedPnlPct: truthMeta('real', 'unrealizedPnlPct', '主表使用 Portfolio.unrealized_pnl_pct。'),
      sourceStrategyPrimary: truthMeta('real', 'sourceStrategyPrimary', '主表使用 Portfolio.source_strategy。'),
      actionSignal: truthMeta('derived', 'actionSignal', 'actionLabel 为 action_signal 的前端文案映射。'),
      signalReason: truthMeta('fallback', 'signalReason', 'sourceHint 和动作建议并非后端真实执行结果。'),
    },
    ['latestClose', 'holdDays', 'unrealizedPnl', 'unrealizedPnlPct', 'sourceStrategyPrimary', 'actionSignal', 'signalReason'],
  );
  const closedTableDataSource = buildRowSourceMeta(
    'Portfolio 已平仓主表',
    '已平仓主表混合展示真实平仓字段、交易标的池承接提示和 fallback exit 文案。',
    {
      openDate: truthMeta('real', 'openDate', '主表使用 Portfolio.open_date。'),
      realizedPnl: truthMeta('real', 'realizedPnl', '主表使用 Portfolio.realized_pnl。'),
      realizedPnlPct: truthMeta('real', 'realizedPnlPct', '主表使用 Portfolio.realized_pnl_pct。'),
      signalReason: truthMeta('fallback', 'signalReason', 'exitReason 在 signal_reason 为空时会回退到前端建议文案。'),
      sourceStrategyPrimary: truthMeta('real', 'sourceStrategyPrimary', '主表使用 Portfolio.source_strategy。'),
    },
    ['openDate', 'realizedPnl', 'realizedPnlPct', 'signalReason', 'sourceStrategyPrimary'],
  );
  const transactionTableDataSource = buildRowSourceMeta(
    'Portfolio 交易流水主表',
    '交易流水主表以真实 transactions 为主，个别触发源标签存在 fallback。',
    {
      transactionDetail: truthMeta(transactionDegraded ? 'compatible' : 'real', 'transactionDetail', transactionDegraded ? '当前交易流水只覆盖已预取的部分持仓。' : '交易流水来自真实 transactions 接口。'),
    },
    ['transactionDetail'],
    { degraded: transactionDegraded, degradeReason: transactionDegraded ? '只预取前 12 个持仓的交易流水。' : null },
  );

  const openSummary = buildOpenSummary(openResp, openRows, summaryApi, tradeDate);
  const closedSummary = buildClosedSummary(closedResp, closedRows);
  const transactionsSummary = buildTransactionSummary(transactionRows, transactionsResp.total, transactionDegraded);

  const pageDataSource = deriveMixedMeta(
    [openSummary.dataSource!, closedSummary.dataSource!, transactionsSummary.dataSource!, openTableDataSource, closedTableDataSource, transactionTableDataSource],
    'Portfolio',
    'Portfolio 页面按 summary 与主表区块的实际来源状态汇总。',
  );

  return {
    dataSource: pageDataSource,
    tradeDate,
    generatedAtText: 'Portfolio 页面已按当前持仓、已平仓与交易流水分别计算来源状态。',
    tabs: {
      open: {
        label: '当前持仓',
        title: '当前持仓',
        description: '查看真实持仓字段、承接来源和前端动作建议。',
        dataSource: deriveMixedMeta([openSummary.dataSource!, openTableDataSource], 'Portfolio 当前持仓', '当前持仓页签按 summary 与主表汇总。'),
        tableDataSource: openTableDataSource,
        emptyTitle: '当前没有 open 持仓',
        emptyText: '可从 Dashboard、Signals 或 Watchlist 继续承接。',
      },
      closed: {
        label: '已平仓',
        title: '已平仓',
        description: '查看真实平仓结果与 fallback 退出文案。',
        dataSource: deriveMixedMeta([closedSummary.dataSource!, closedTableDataSource], 'Portfolio 已平仓', '已平仓页签按 summary 与主表汇总。'),
        tableDataSource: closedTableDataSource,
        emptyTitle: '当前没有已平仓记录',
        emptyText: '历史平仓记录会在这里展示。',
      },
      transactions: {
        label: '交易流水',
        title: '交易流水',
        description: '查看真实 transactions 记录与局部兼容标签。',
        dataSource: deriveMixedMeta([transactionsSummary.dataSource!, transactionTableDataSource], 'Portfolio 交易流水', '交易流水页签按 summary 与主表汇总。'),
        tableDataSource: transactionTableDataSource,
        emptyTitle: '当前没有交易流水',
        emptyText: '关联交易记录为空时会在这里展示空状态。',
      },
    },
    summary: {
      open: openSummary,
      closed: closedSummary,
      transactions: transactionsSummary,
    },
    openRows,
    closedRows,
    transactions: {
      title: '交易流水',
      description: '查看 Portfolio 相关的真实交易记录与兼容说明。',
      relatedLabel: '当前交易流水只覆盖已预取的持仓，未覆盖的对象会保留空状态。',
      dataSource: transactionTableDataSource,
      rows: transactionRows,
      total: transactionsResp.total,
      emptyTitle: '当前没有交易流水',
      emptyText: '请先选择有交易记录的持仓或等待后端记录补齐。',
    },
  };
}
