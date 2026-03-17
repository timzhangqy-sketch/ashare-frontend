import { buildResearchQuery, normalizeResearchSource, normalizeResearchTab } from './research';
import type {
  AttributionRow,
  BacktestDetailRow,
  BacktestSummaryRow,
  FactorBucketRow,
  FactorIcSummaryRow,
  ResearchQueryModel,
  ResearchTab,
  ResearchWorkspaceViewModel,
  ResonanceRow,
} from '../types/research';
import type {
  AttributionChartVm,
  AttributionDetailVm,
  BacktestChartVm,
  BacktestDetailVm,
  ChartDatum,
  FactorIcChartVm,
  FactorIcDetailVm,
  ResearchDetailRouteTab,
  ResearchDetailSummaryItem,
  ResearchDetailTableRow,
  ResearchDetailViewModel,
  ResonanceChartVm,
  ResonanceDetailVm,
} from '../types/researchDetail';
import { getStrategyDisplayName } from '../utils/displayNames';

const VALID_ROUTE_TABS: ResearchDetailRouteTab[] = ['backtest', 'factor-ic', 'attribution', 'resonance'];

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null) return '--';
  return value.toFixed(digits);
}

function toneFromNumber(value: number | null | undefined): ResearchDetailSummaryItem['tone'] {
  if (value == null) return 'muted';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'default';
}

function displayStrategyName(value: string | null | undefined): string {
  if (!value) return '--';
  return getStrategyDisplayName(value) ?? value;
}

function buildSourceLabel(source: ResearchQueryModel['source']): string {
  if (source === 'signals') return '来自 Signals';
  if (source === 'watchlist') return '来自交易标的池';
  if (source === 'portfolio') return '来自持仓中心';
  if (source === 'risk') return '来自风控中心';
  if (source === 'execution') return '来自模拟执行';
  if (source === 'dashboard') return '来自 Dashboard';
  return '直接进入';
}

function buildSourceBadges(query: ResearchQueryModel, detailKey: string) {
  return [
    { label: '来源', value: buildSourceLabel(query.source) },
    { label: '交易日', value: query.tradeDate ?? '未指定' },
    { label: '明细键', value: detailKey },
  ];
}

function buildInfoCards(workspace: ResearchWorkspaceViewModel): ResearchDetailSummaryItem[] {
  return workspace.filters.map(item => ({ label: item.label, value: item.value, tone: 'muted' }));
}

function chartCard(
  title: string,
  description: string,
  data: ChartDatum[],
  status: 'real' | 'fallback' | 'placeholder',
  emptyText: string,
  valueSuffix?: string,
) {
  return { title, description, data, status, emptyText, valueSuffix }
}

function buildBaseVm(
  workspace: ResearchWorkspaceViewModel,
  routeTab: ResearchDetailRouteTab,
  detailKey: string,
  query: ResearchQueryModel,
) {
  const workspaceTab = mapResearchDetailRouteToTab(routeTab);
  const state = workspace.tabStates[workspaceTab];

  return {
    routeTab,
    workspaceTab,
    detailKey,
    query,
    status: state.status,
    sourceLabel: buildSourceLabel(query.source),
    sourceNote: state.note,
    dataSource: state.dataSource ?? workspace.dataSources[workspaceTab],
    sourceBadges: buildSourceBadges(query, detailKey),
    infoCards: buildInfoCards(workspace),
    backHref: buildResearchBaseHref(query),
    selectedFocus: query.focus,
  };
}

function buildBacktestCharts(summary: BacktestSummaryRow | null, rows: BacktestDetailRow[], status: 'real' | 'fallback' | 'unavailable'): BacktestChartVm {
  const chartStatus = status === 'unavailable' ? 'placeholder' : status;
  const performance = summary
    ? [
        { label: 'T+1', value: summary.returns.T1 },
        { label: 'T+3', value: summary.returns.T3 },
        { label: 'T+5', value: summary.returns.T5 },
        { label: 'T+10', value: summary.returns.T10 },
        { label: 'T+20', value: summary.returns.T20 },
      ]
    : [];
  const distribution = [
    { label: '正收益', value: rows.filter(row => (row.horizonReturns.T5 ?? 0) > 0).length },
    { label: '持平', value: rows.filter(row => (row.horizonReturns.T5 ?? 0) === 0).length },
    { label: '负收益', value: rows.filter(row => (row.horizonReturns.T5 ?? 0) < 0).length },
  ].filter(item => item.value > 0);

  return {
    performanceSeries: chartCard('分周期收益', '按持有周期查看策略平均收益。', performance, performance.length ? chartStatus : 'placeholder', '暂无可展示的收益曲线。', '%'),
    horizonBars: chartCard('收益对比', '对比不同持有周期的收益表现。', performance, performance.length ? chartStatus : 'placeholder', '暂无可展示的收益对比。', '%'),
    returnDistribution: chartCard('T+5 分布', '统计样本在 T+5 的收益分布。', distribution, distribution.length ? chartStatus : 'placeholder', '暂无可展示的收益分布。'),
  };
}

function buildFactorCharts(rows: FactorIcSummaryRow[], buckets: FactorBucketRow[], status: 'real' | 'fallback' | 'unavailable'): FactorIcChartVm {
  const chartStatus = status === 'unavailable' ? 'placeholder' : status;
  return {
    icSeries: chartCard('IC / ICIR', '按周期查看因子 IC 与 ICIR。', rows.map(row => ({ label: row.horizon, value: row.ic, secondaryValue: row.icir })), rows.length ? chartStatus : 'placeholder', '暂无可展示的 IC 数据。'),
    bucketBars: chartCard('分桶表现', '查看当前因子的分桶收益与胜率。', buckets.map(row => ({ label: row.bucket, value: row.avgReturn, secondaryValue: row.winRate })), buckets.length ? chartStatus : 'placeholder', '暂无可展示的分桶数据。'),
    layerProfile: chartCard('层级画像', '按周期对比因子强弱。', rows.map(row => ({ label: row.horizon, value: row.icir, secondaryValue: row.ic })), rows.length ? chartStatus : 'placeholder', '暂无可展示的层级画像。'),
  };
}

function buildAttributionCharts(rows: AttributionRow[], status: 'real' | 'fallback' | 'unavailable'): AttributionChartVm {
  const chartStatus = status === 'unavailable' ? 'placeholder' : status;
  return {
    contributionBars: chartCard('收益贡献', '按分组查看平均收益贡献。', rows.map(row => ({ label: row.groupKey, value: row.avgReturn })), rows.length ? chartStatus : 'placeholder', '暂无可展示的贡献数据。'),
    groupCompare: chartCard('收益 / 胜率', '对比各分组的平均收益与胜率。', rows.map(row => ({ label: row.groupKey, value: row.winRate, secondaryValue: row.avgReturn })), rows.length ? chartStatus : 'placeholder', '暂无可展示的分组对比。'),
    drawdownCompare: chartCard('回撤对比', '查看各分组的回撤表现。', rows.map(row => ({ label: row.groupKey, value: row.drawdown })), rows.length ? chartStatus : 'placeholder', '暂无可展示的回撤对比。'),
  };
}

function buildResonanceCharts(rows: ResonanceRow[], status: 'real' | 'fallback' | 'unavailable'): ResonanceChartVm {
  const chartStatus = status === 'unavailable' ? 'placeholder' : status;
  return {
    intensityBars: chartCard('共振强度', '按策略组合查看共振强度。', rows.map(row => ({ label: row.name, value: row.strategyCount })), rows.length ? chartStatus : 'placeholder', '暂无可展示的共振强度。'),
    excessBars: chartCard('超额收益', '按策略组合查看超额收益。', rows.map(row => ({ label: row.name, value: row.avgScore })), rows.length ? chartStatus : 'placeholder', '暂无可展示的超额收益。'),
    hitPerformance: chartCard('平均分', '查看共振组合的平均分。', rows.map(row => ({ label: row.name, value: row.avgScore })), rows.length ? chartStatus : 'placeholder', '暂无可展示的命中表现。'),
  };
}

function buildBacktestVm(workspace: ResearchWorkspaceViewModel, detailKey: string, query: ResearchQueryModel): BacktestDetailVm {
  const strategy = detailKey || query.strategy || workspace.summaryRows[0]?.strategy || '--';
  const strategySummary = workspace.summaryRows.find(row => row.strategy === strategy) ?? workspace.summaryRows[0] ?? null;
  const filteredRows = workspace.detailRows.filter(row => row.strategy === strategy || row.tsCode === query.focus);
  const rows = filteredRows.length ? filteredRows : workspace.detailRows;
  const base = buildBaseVm(workspace, 'backtest', strategy, query);

  return {
    ...base,
    kind: 'backtest',
    title: `${displayStrategyName(strategy)}回测明细`,
    subtitle: `围绕 ${displayStrategyName(strategy)} 查看样本收益、分周期表现与个股样本。`,
    summaryCards: strategySummary
      ? [
          { label: '策略', value: displayStrategyName(strategySummary.strategy) },
          { label: '样本数', value: String(strategySummary.sampleN) },
          { label: 'T+5', value: formatPercent(strategySummary.returns.T5), tone: toneFromNumber(strategySummary.returns.T5) },
          { label: '胜率', value: formatPercent(strategySummary.winRate) },
          { label: '回撤', value: formatPercent(strategySummary.drawdown), tone: toneFromNumber(strategySummary.drawdown == null ? null : -Math.abs(strategySummary.drawdown)) },
        ]
      : [],
    notes: [
      '本页沿用 Research 工作域的兼容明细结构。',
      '策略名称仅统一展示口径，不修改内部 query 或路由参数。',
      '如来源为兼容入口，仍保留原始路由承接链路。',
    ],
    emptyTitle: '当前没有可展示的回测样本',
    emptyText: '请调整策略、来源或交易日后重试。',
    isEmpty: rows.length === 0,
    queryContext: {
      strategy,
      tradeDate: query.tradeDate,
      source: query.source,
      focus: query.focus,
    },
    strategySummary,
    focusSample: rows.find(row => row.tsCode === query.focus) ?? rows[0] ?? null,
    sampleColumns: [
      { key: 'entryDate', label: '入场日期' },
      { key: 'entryPrice', label: '入场价', align: 'right' },
      { key: 't5', label: 'T+5', align: 'right' },
      { key: 'status', label: '状态', align: 'center' },
    ],
    sampleRows: rows.map((row): ResearchDetailTableRow => ({
      id: row.id,
      title: row.name,
      subtitle: `${row.tsCode} · ${displayStrategyName(row.strategy)}`,
      stockFocus: { tsCode: row.tsCode, strategy: row.strategy, entryDate: row.entryDate },
      cells: {
        entryDate: { value: row.entryDate },
        entryPrice: { value: formatNumber(row.entryPrice) },
        t5: { value: formatPercent(row.horizonReturns.T5), tone: toneFromNumber(row.horizonReturns.T5) },
        status: { value: row.statusLabel },
      },
    })),
    sampleNote: '点击样本行可继续聚焦到对应股票样本。',
    charts: buildBacktestCharts(strategySummary, rows, base.status),
  };
}

function buildFactorVm(workspace: ResearchWorkspaceViewModel, detailKey: string, query: ResearchQueryModel): FactorIcDetailVm {
  const factor = detailKey || workspace.icSummaryRows[0]?.factorName || '--';
  const factorRows = workspace.icSummaryRows.filter(row => row.factorName === factor);
  const bucketRows = workspace.bucketRows.filter(row => row.factorName === factor);
  const base = buildBaseVm(workspace, 'factor-ic', factor, query);

  return {
    ...base,
    kind: 'factor-ic',
    title: `${factor} 因子明细`,
    subtitle: `围绕 ${factor} 查看 IC、ICIR 与分桶表现。`,
    summaryCards: factorRows[0]
      ? [
          { label: '因子', value: factorRows[0].factorName },
          { label: '窗口', value: factorRows[0].horizon },
          { label: 'IC', value: formatNumber(factorRows[0].ic, 3), tone: toneFromNumber(factorRows[0].ic) },
          { label: 'ICIR', value: formatNumber(factorRows[0].icir), tone: toneFromNumber(factorRows[0].icir) },
        ]
      : [],
    notes: [
      '因子明细优先显示当前因子在各周期的 IC 表现。',
      '分桶表现沿用 Research 工作域现有数据结构。',
    ],
    emptyTitle: '当前没有可展示的因子结果',
    emptyText: '请切换因子或等待研究数据补齐。',
    isEmpty: factorRows.length === 0,
    queryContext: {
      factor,
      detailKey: factor,
      tradeDate: query.tradeDate,
      source: query.source,
    },
    factorSummary: factorRows[0] ?? null,
    bucketColumns: [
      { key: 'horizon', label: '周期' },
      { key: 'bucket', label: '分桶' },
      { key: 'avgReturn', label: '平均收益', align: 'right' },
      { key: 'winRate', label: '胜率', align: 'right' },
    ],
    bucketRows: bucketRows.map(row => ({
      id: row.id,
      title: row.factorName,
      subtitle: `${row.bucket} · ${row.horizon}`,
      cells: {
        horizon: { value: row.horizon },
        bucket: { value: row.bucket },
        avgReturn: { value: formatPercent(row.avgReturn), tone: toneFromNumber(row.avgReturn) },
        winRate: { value: formatPercent(row.winRate) },
      },
    })),
    bucketNote: '因子分桶结果用于辅助观察不同区间的收益差异。',
    charts: buildFactorCharts(factorRows, bucketRows, base.status),
  };
}

function buildAttributionVm(workspace: ResearchWorkspaceViewModel, detailKey: string, query: ResearchQueryModel): AttributionDetailVm {
  const groupKey = detailKey || workspace.attributionRows[0]?.groupKey || '--';
  const rows = workspace.attributionRows.filter(row => row.groupKey === groupKey);
  const resolvedRows = rows.length ? rows : workspace.attributionRows;
  const base = buildBaseVm(workspace, 'attribution', groupKey, query);

  return {
    ...base,
    kind: 'attribution',
    title: `${groupKey} 归因明细`,
    subtitle: `围绕 ${groupKey} 查看收益、胜率与回撤差异。`,
    summaryCards: resolvedRows[0]
      ? [
          { label: '分组', value: resolvedRows[0].groupKey },
          { label: '样本数', value: String(resolvedRows[0].sampleN) },
          { label: '平均收益', value: formatPercent(resolvedRows[0].avgReturn), tone: toneFromNumber(resolvedRows[0].avgReturn) },
          { label: '胜率', value: formatPercent(resolvedRows[0].winRate) },
        ]
      : [],
    notes: [
      '归因明细保留 Research 工作域的对比语义。',
      '分组名称仍沿用后端返回字段，仅统一前端展示层标题。',
    ],
    emptyTitle: '当前没有可展示的归因结果',
    emptyText: '请切换分组或等待归因结果补齐。',
    isEmpty: resolvedRows.length === 0,
    queryContext: {
      group: groupKey,
      strategy: query.strategy,
      riskLevel: query.riskLevel,
      tradeDate: query.tradeDate,
      source: query.source,
    },
    attributionSummary: resolvedRows[0] ?? null,
    contributionColumns: [
      { key: 'sampleN', label: '样本数', align: 'right' },
      { key: 'avgReturn', label: '平均收益', align: 'right' },
      { key: 'winRate', label: '胜率', align: 'right' },
      { key: 'drawdown', label: '回撤', align: 'right' },
    ],
    contributionRows: resolvedRows.map(row => ({
      id: row.id,
      title: row.groupKey,
      subtitle: row.contributionLabel,
      cells: {
        sampleN: { value: String(row.sampleN) },
        avgReturn: { value: formatPercent(row.avgReturn), tone: toneFromNumber(row.avgReturn) },
        winRate: { value: formatPercent(row.winRate) },
        drawdown: { value: formatPercent(row.drawdown), tone: toneFromNumber(row.drawdown == null ? null : -Math.abs(row.drawdown)) },
      },
    })),
    contributionNote: '归因表用于快速比较不同分组的收益质量。',
    charts: buildAttributionCharts(resolvedRows, base.status),
  };
}

function buildResonanceVm(workspace: ResearchWorkspaceViewModel, detailKey: string, query: ResearchQueryModel): ResonanceDetailVm {
  const comboKey = detailKey || workspace.resonanceRows[0]?.tsCode || '--';
  const rows = workspace.resonanceRows.filter(row => row.tsCode === comboKey || row.name === comboKey);
  const resolvedRows = rows.length ? rows : workspace.resonanceRows;
  const base = buildBaseVm(workspace, 'resonance', comboKey, query);
  const hitRows = workspace.detailRows
    .filter(row => !query.focus || row.tsCode === query.focus)
    .slice(0, 12)
    .map((row): ResearchDetailTableRow => ({
      id: `${comboKey}-${row.id}`,
      title: row.name,
      subtitle: `${row.tsCode} · ${displayStrategyName(row.strategy)}`,
      stockFocus: { tsCode: row.tsCode, strategy: row.strategy },
      cells: {
        combo: { value: comboKey },
        t5: { value: formatPercent(row.horizonReturns.T5), tone: toneFromNumber(row.horizonReturns.T5) },
        status: { value: row.statusLabel },
      },
    }));

  const first = resolvedRows[0];
  return {
    ...base,
    kind: 'resonance',
    title: first ? `${first.name} 共振明细` : '共振明细',
    subtitle: first ? `围绕 ${first.name} 查看共振强度、超额收益与样本命中。` : '查看共振强度与超额收益。',
    summaryCards: first
      ? [
          { label: '组合', value: first.name },
          { label: '策略数', value: String(first.strategyCount) },
          { label: '策略组合', value: first.strategiesDisplay },
          { label: '超额收益', value: formatNumber(first.avgScore, 2), tone: toneFromNumber(first.avgScore) },
        ]
      : [],
    notes: [
      '共振明细用于查看策略组合层面的收益质量。',
      '个股样本区保留继续聚焦到股票的能力。',
    ],
    emptyTitle: '当前没有可展示的共振结果',
    emptyText: '请切换共振组合或等待共振结果补齐。',
    isEmpty: resolvedRows.length === 0,
    queryContext: {
      resonance: query.resonance ?? comboKey,
      comboKey,
      tradeDate: query.tradeDate,
      source: query.source,
      focus: query.focus,
    },
    resonanceSummary: resolvedRows[0] ?? null,
    hitColumns: [
      { key: 'combo', label: '组合' },
      { key: 't5', label: 'T+5', align: 'right' },
      { key: 'status', label: '状态', align: 'center' },
    ],
    hitRows,
    hitNote: '点击样本行可继续聚焦到对应股票样本。',
    charts: buildResonanceCharts(resolvedRows, base.status),
  };
}

export function normalizeResearchDetailRouteTab(value: string | undefined): ResearchDetailRouteTab | null {
  return VALID_ROUTE_TABS.includes(value as ResearchDetailRouteTab) ? (value as ResearchDetailRouteTab) : null;
}

export function mapResearchDetailRouteToTab(routeTab: ResearchDetailRouteTab): ResearchTab {
  if (routeTab === 'backtest') return 'summary';
  if (routeTab === 'factor-ic') return 'ic';
  return routeTab;
}

function buildResearchQueryString(query: Partial<ResearchQueryModel>): string {
  const params = new URLSearchParams();
  const tab = query.tab ? normalizeResearchTab(query.tab) : undefined;
  const source = query.source ? normalizeResearchSource(query.source) : undefined;

  if (tab && tab !== 'summary') params.set('tab', tab);
  if (source && source !== 'direct') params.set('source', source);
  if (query.focus) params.set('focus', query.focus);
  if (query.strategy) params.set('strategy', query.strategy);
  if (query.riskLevel) params.set('risk_level', query.riskLevel);
  if (query.resonance) params.set('resonance', query.resonance);
  if (query.tradeDate) params.set('trade_date', query.tradeDate);

  return params.toString();
}

export function buildResearchBaseHref(query: Partial<ResearchQueryModel>): string {
  const search = buildResearchQueryString(query);
  return search ? `/research?${search}` : '/research';
}

export function buildResearchDetailHref(routeTab: ResearchDetailRouteTab, detailKey: string, query: Partial<ResearchQueryModel>): string {
  const nextQuery: Partial<ResearchQueryModel> = { ...query, tab: mapResearchDetailRouteToTab(routeTab) };
  const search = buildResearchQueryString(nextQuery);
  return search ? `/research/${routeTab}/${encodeURIComponent(detailKey)}?${search}` : `/research/${routeTab}/${encodeURIComponent(detailKey)}`;
}

export function buildResearchDetailQuery(routeTab: ResearchDetailRouteTab, searchParams: URLSearchParams, detailKey: string): ResearchQueryModel {
  const base = buildResearchQuery(searchParams);
  const detailKeyValue = decodeURIComponent(detailKey);
  return {
    ...base,
    tab: mapResearchDetailRouteToTab(routeTab),
    strategy: routeTab === 'backtest' ? detailKeyValue : base.strategy,
    resonance: routeTab === 'resonance' ? detailKeyValue : base.resonance,
  };
}

export function resolveResearchDetailViewModel(
  workspace: ResearchWorkspaceViewModel,
  routeTab: ResearchDetailRouteTab,
  detailKey: string | undefined,
  query: ResearchQueryModel,
): ResearchDetailViewModel {
  const key = decodeURIComponent(detailKey ?? '');
  if (routeTab === 'backtest') return buildBacktestVm(workspace, key, query);
  if (routeTab === 'factor-ic') return buildFactorVm(workspace, key, query);
  if (routeTab === 'attribution') return buildAttributionVm(workspace, key, query);
  return buildResonanceVm(workspace, key, query);
}
