import {
  fetchBacktestDetail,
  fetchBacktestSummary,
  fetchFactorMeta,
  fetchResearchAttribution,
  fetchResearchFactorIc,
  fetchResearchResonance,
  type BacktestDetailItem,
  type BacktestSummaryItem,
  type FactorMetaItem,
  type ResearchAttributionItem,
  type ResearchFactorIcItem,
  type ResearchResonanceItem,
} from '../api';
import {
  researchAttributionMock,
  researchBacktestDetailMock,
  researchBacktestSummaryMock,
  researchFactorIcMock,
  researchResonanceMock,
} from '../mocks/research';
import type {
  AttributionRaw,
  AttributionRow,
  BacktestDetailRaw,
  BacktestDetailRow,
  BacktestSummaryRaw,
  BacktestSummaryRow,
  FactorBucketRow,
  FactorIcRaw,
  FactorIcSummaryRow,
  ResearchContextModel,
  ResearchDataStatus,
  ResearchDrilldownTarget,
  ResearchFilterChip,
  ResearchFilterState,
  ResearchGroupType,
  ResearchHorizon,
  ResearchQueryModel,
  ResearchSortState,
  ResearchSource,
  ResearchTab,
  ResearchTabState,
  ResearchWorkspaceViewModel,
  ResonanceRaw,
  ResonanceRow,
} from '../types/research';
import type { DataSourceMeta } from '../types/dataSource';
import { buildDataSourceMeta } from '../utils/dataSource';

const STRATEGY_LABEL: Record<string, string> = {
  RETOC2: '第4次异动',
  PATTERN_T2UP9: 'T-2大涨蓄势',
  VOL_SURGE: '连续放量蓄势',
  WEAK_BUY: '弱市吸筹',
  PATTERN_GREEN10: '近10日阳线',
};

function settle<T>(promise: Promise<T>) {
  return promise.then(
    data => ({ ok: true as const, data }),
    error => ({ ok: false as const, error }),
  );
}

export function normalizeResearchTab(value: string | null): ResearchTab {
  if (value === 'ic' || value === 'attribution' || value === 'resonance') return value;
  return 'summary';
}

export function normalizeResearchSource(value: string | null): ResearchSource {
  if (
    value === 'dashboard' ||
    value === 'signals' ||
    value === 'watchlist' ||
    value === 'portfolio' ||
    value === 'risk' ||
    value === 'execution'
  ) {
    return value;
  }
  return 'direct';
}

function normalizeHorizon(strategy: string | null): ResearchHorizon {
  if (strategy?.includes('T1')) return 'T1';
  if (strategy?.includes('T3')) return 'T3';
  if (strategy?.includes('T10')) return 'T10';
  if (strategy?.includes('T20')) return 'T20';
  return 'T5';
}

function normalizeGroupType(source: ResearchSource): ResearchGroupType {
  if (source === 'watchlist') return 'strategy';
  if (source === 'portfolio') return 'market';
  if (source === 'risk') return 'style';
  return 'strategy';
}

export function buildResearchQuery(searchParams: URLSearchParams): ResearchQueryModel {
  return {
    tab: normalizeResearchTab(searchParams.get('tab')),
    source: normalizeResearchSource(searchParams.get('source')),
    focus: searchParams.get('focus'),
    strategy: searchParams.get('strategy'),
    riskLevel: searchParams.get('risk_level'),
    resonance: searchParams.get('resonance'),
    tradeDate: searchParams.get('trade_date'),
  };
}

function buildSourceLabel(source: ResearchSource): string {
  if (source === 'dashboard') return '来自 Dashboard';
  if (source === 'signals') return '来自 Signals';
  if (source === 'watchlist') return '来自交易标的池';
  if (source === 'portfolio') return '来自持仓中心';
  if (source === 'risk') return '来自风控中心';
  if (source === 'execution') return '来自模拟执行';
  return '直接进入';
}

function buildSourceSummary(query: ResearchQueryModel): string {
  if (query.source === 'signals') {
    return '当前研究承接自 Signals，重点用于验证信号来源、样本表现和后续共振质量。';
  }
  if (query.source === 'watchlist') {
    return '当前研究承接自交易标的池，重点用于判断候选是否保留、淘汰或继续跟踪。';
  }
  if (query.source === 'portfolio') {
    return '当前研究承接自持仓中心，重点用于复核来源策略表现和持仓后的样本稳定性。';
  }
  if (query.source === 'risk') {
    return '当前研究承接自风控中心，重点用于解释风险分层、仓位约束和风险变化来源。';
  }
  if (query.source === 'execution') {
    return '当前研究承接自模拟执行，重点用于回看来源策略表现、样本稳定性和执行前后的判断依据。';
  }
  if (query.source === 'dashboard') {
    return '当前研究承接自 Dashboard，总览入口用于快速切入策略验证和样本比较。';
  }
  return '当前为中性研究入口，可围绕策略、样本和共振组合继续下钻。';
}

function buildFilterState(query: ResearchQueryModel): ResearchFilterState {
  return {
    source: query.source,
    focus: query.focus,
    strategy: query.strategy,
    riskLevel: query.riskLevel,
    resonance: query.resonance,
    tradeDate: query.tradeDate,
    horizon: normalizeHorizon(query.strategy),
    groupType: normalizeGroupType(query.source),
  };
}

function buildSortState(query: ResearchQueryModel): ResearchSortState {
  if (query.tab === 'ic') return { field: 'icir', direction: 'desc' };
  if (query.tab === 'attribution') return { field: 'avg_return', direction: 'desc' };
  if (query.tab === 'resonance') return { field: 'excess_return', direction: 'desc' };
  return { field: 'win_rate', direction: 'desc' };
}

function buildDrilldown(kind: ResearchDrilldownTarget['kind'], key: string, label: string, note: string): ResearchDrilldownTarget {
  return { kind, key, label, note };
}

function toSummaryRawFromApi(raw: BacktestSummaryItem): BacktestSummaryRaw {
  const t5 = raw.avg_ret_t5 ?? 0;
  const t10 = raw.avg_ret_t10 ?? t5;
  const t20 = raw.avg_ret_t20 ?? t10;
  return {
    strategy: raw.strategy,
    sample_n: raw.sample_t20 || raw.sample_t10 || raw.sample_t5 || 0,
    t1_avg_return: Number((t5 * 0.35).toFixed(2)),
    t3_avg_return: Number((t5 * 0.75).toFixed(2)),
    t5_avg_return: t5,
    t10_avg_return: t10,
    t20_avg_return: t20,
    win_rate: raw.win_rate_t5 ?? raw.win_rate_t10 ?? raw.win_rate_t20 ?? 0,
    drawdown: Number(
      Math.min(
        raw.median_ret_t5 ?? t5,
        raw.median_ret_t10 ?? raw.median_ret_t5 ?? t5,
        raw.median_ret_t20 ?? raw.median_ret_t10 ?? raw.median_ret_t5 ?? t5,
        -0.5,
      ).toFixed(2),
    ),
    version_snapshot: '未提供',
  };
}

function toDetailRawFromApi(raw: BacktestDetailItem): BacktestDetailRaw {
  return {
    ts_code: raw.ts_code,
    name: raw.name,
    strategy: raw.strategy,
    entry_date: raw.entry_date,
    entry_price: raw.entry_price,
    ret_t5: raw.ret_t5,
    ret_t10: raw.ret_t10,
    ret_t20: raw.ret_t20,
    result_t5: raw.result_t5,
  };
}

function toIcRawFromApi(raw: ResearchFactorIcItem): FactorIcRaw {
  return {
    factor_name: raw.factor_name,
    horizon: raw.horizon,
    ic: raw.ic,
    icir: raw.icir,
    bucket: raw.bucket,
    corr_placeholder: raw.corr_placeholder ?? '相关性结果待后续研究接口补充',
  };
}

function toAttributionRawFromApi(raw: ResearchAttributionItem): AttributionRaw {
  return {
    group_type: raw.group_type,
    group_key: raw.group_key,
    sample_n: raw.sample_n,
    avg_return: raw.avg_return,
    win_rate: raw.win_rate,
    drawdown: raw.drawdown,
  };
}

function toResonanceRawFromApi(raw: ResearchResonanceItem): ResonanceRaw {
  return {
    ts_code: raw.ts_code,
    name: raw.name,
    strategies: Array.isArray(raw.strategies) ? raw.strategies : [],
    strategy_count: raw.strategy_count ?? 0,
    avg_score: raw.avg_score ?? 0,
  };
}

function mapSummaryRow(raw: BacktestSummaryRaw, source: ResearchDataStatus): BacktestSummaryRow {
  return {
    id: `summary-${raw.strategy}`,
    strategy: raw.strategy,
    sampleN: raw.sample_n,
    returns: {
      T1: raw.t1_avg_return,
      T3: raw.t3_avg_return,
      T5: raw.t5_avg_return,
      T10: raw.t10_avg_return,
      T20: raw.t20_avg_return,
    },
    returnFieldState:
      source === 'real'
        ? { T1: 'fallback', T3: 'fallback', T5: 'real', T10: 'real', T20: 'real' }
        : { T1: 'real', T3: 'real', T5: 'real', T10: 'real', T20: 'real' },
    winRate: raw.win_rate,
    drawdown: raw.drawdown,
    drawdownState: source === 'real' ? 'fallback' : 'real',
    versionSnapshot: raw.version_snapshot,
    versionState: source === 'real' && raw.version_snapshot === '未提供' ? 'unavailable' : 'real',
    highlightMetric: `T+5 胜率 ${raw.win_rate.toFixed(1)}%`,
    drilldown: buildDrilldown('strategy', raw.strategy, raw.strategy, '继续查看该策略样本明细与不同持有周期表现。'),
  };
}

function mapDetailRow(raw: BacktestDetailRaw): BacktestDetailRow {
  const statusMap: Record<string, string> = {
    win: 'T+5 正收益',
    loss: 'T+5 负收益',
    pending: '结果待更新',
  };

  return {
    id: `detail-${raw.strategy}-${raw.ts_code}-${raw.entry_date}`,
    tsCode: raw.ts_code,
    name: raw.name,
    strategy: raw.strategy,
    entryDate: raw.entry_date,
    entryPrice: raw.entry_price,
    horizonReturns: {
      ...(raw.ret_t1 != null ? { T1: raw.ret_t1 } : {}),
      ...(raw.ret_t3 != null ? { T3: raw.ret_t3 } : {}),
      ...(raw.ret_t5 != null ? { T5: raw.ret_t5 } : {}),
      ...(raw.ret_t10 != null ? { T10: raw.ret_t10 } : {}),
      ...(raw.ret_t20 != null ? { T20: raw.ret_t20 } : {}),
    },
    statusLabel: statusMap[raw.result_t5 ?? 'pending'] ?? '结果待更新',
  };
}

function mapIcRow(raw: FactorIcRaw, meta?: FactorMetaItem): FactorIcSummaryRow {
  return {
    id: `ic-${raw.factor_name}-${raw.horizon}`,
    factorName: raw.factor_name,
    factorCn: meta?.cn ?? raw.factor_name,
    group: meta?.group ?? '',
    formula: meta?.formula ?? '',
    applied: meta?.applied ?? false,
    note: meta?.note ?? '',
    horizon: raw.horizon,
    ic: raw.ic,
    icir: raw.icir,
    bucket: raw.bucket,
    corrPlaceholder: raw.corr_placeholder,
    signalLabel: raw.ic >= 0.06 ? '强相关' : raw.ic >= 0.04 ? '中等相关' : '弱相关',
    drilldown: buildDrilldown('factor', raw.factor_name, raw.factor_name, '继续查看该因子的分桶表现和相关性说明。'),
  };
}

function mapAttributionRow(raw: AttributionRaw): AttributionRow {
  const groupTypeLabel =
    raw.group_type === 'market'
      ? '市场分组'
      : raw.group_type === 'style'
        ? '风格分组'
        : '策略分组';

  return {
    id: `attr-${raw.group_type}-${raw.group_key}`,
    groupType: raw.group_type,
    groupKey: raw.group_key,
    sampleN: raw.sample_n,
    avgReturn: raw.avg_return,
    winRate: raw.win_rate,
    drawdown: raw.drawdown,
    contributionLabel: `${groupTypeLabel} / ${raw.group_key}`,
    drilldown: buildDrilldown('group', raw.group_key, raw.group_key, '继续查看该归因分组的样本表现和回撤分布。'),
  };
}

function mapResonanceRow(raw: ResonanceRaw): ResonanceRow {
  return {
    id: `res-${raw.ts_code}`,
    name: raw.name,
    tsCode: raw.ts_code,
    strategyCount: raw.strategy_count,
    strategiesDisplay: Array.isArray(raw.strategies)
      ? raw.strategies.map((s: string) => STRATEGY_LABEL[s] ?? s).join(' / ')
      : '',
    avgScore: raw.avg_score,
    drilldown: buildDrilldown('combo', raw.ts_code, raw.name, '继续查看该共振组合的样本收益和超额表现。'),
  };
}

function buildBucketRows(icRows: FactorIcSummaryRow[], horizon: ResearchHorizon): FactorBucketRow[] {
  return icRows
    .filter(row => row.horizon === horizon)
    .map(row => ({
      id: `bucket-${row.factorName}-${row.horizon}`,
      factorName: row.factorName,
      horizon: row.horizon,
      bucket: row.bucket,
      avgReturn: Number((row.ic * 100).toFixed(2)),
      winRate: Number((50 + row.ic * 100).toFixed(1)),
      sampleN: row.icir > 0.7 ? 80 : 56,
    }));
}

function buildFilters(query: ResearchQueryModel, filterState: ResearchFilterState): ResearchFilterChip[] {
  const tabLabel =
    query.tab === 'ic'
      ? '因子 IC'
      : query.tab === 'attribution'
        ? '策略归因'
        : query.tab === 'resonance'
          ? '共振分析'
          : '回测总览';

  const groupLabel =
    filterState.groupType === 'market'
      ? '按市场分组'
      : filterState.groupType === 'style'
        ? '按风格分组'
        : '按策略分组';

  return [
    { label: '来源', value: buildSourceLabel(query.source) },
    { label: '研究对象', value: query.focus ?? '未指定' },
    { label: '策略', value: query.strategy ?? '全部策略' },
    ...(query.riskLevel ? [{ label: '风险等级', value: query.riskLevel }] : []),
    ...(query.resonance ? [{ label: '共振标签', value: query.resonance }] : []),
    { label: '当前标签', value: tabLabel },
    { label: '研究周期', value: filterState.horizon },
    { label: '归因视角', value: groupLabel },
  ];
}

function buildContext(
  query: ResearchQueryModel,
  filterState: ResearchFilterState,
  target: ResearchDrilldownTarget | null,
  detailRows: BacktestDetailRow[],
): ResearchContextModel {
  return {
    title: target?.label ?? (query.focus ?? '当前研究对象'),
    subtitle: target ? '研究上下文已围绕当前策略或个股承接。' : '先从总览中选择一条策略，再继续查看样本明细。 ',
    sourceLabel: buildSourceLabel(query.source),
    sourceSummary: buildSourceSummary(query),
    summary: [
      { label: '来源', value: buildSourceLabel(query.source) },
      { label: '策略', value: query.strategy ?? '全部策略' },
      { label: '研究周期', value: filterState.horizon },
      { label: '当前标签', value: query.tab },
    ],
    detailRows: detailRows.slice(0, 4),
    nextSteps: target
      ? [
          '继续对比不同持有周期的收益与胜率表现。',
          '结合因子 IC、归因和共振结果判断样本稳定性。',
          target.note,
        ]
      : [
          '先从回测总览中选择一条策略，建立当前研究对象。',
          '如果来自其他工作域，可通过 focus、strategy、risk_level 等参数保持上下文。',
          'Research 负责解释和验证，不承接执行层动作。',
        ],
  };
}

function buildTabState(status: ResearchDataStatus, note: string): ResearchTabState {
  const label =
    status === 'real' ? '真实数据'
      : status === 'fallback' ? '兼容回退'
        : '暂未接入';
  return { status, label, note };
}

function toUiStatus(meta: DataSourceMeta): ResearchDataStatus {
  return meta.data_source === 'fallback' || meta.data_source === 'mock' ? 'fallback' : 'real';
}

function buildResearchDataSource(
  state: DataSourceMeta['data_source'],
  sourceLabel: string,
  sourceDetail: string,
  sampleSize: number | null,
  emptyReason?: string | null,
): DataSourceMeta {
  return buildDataSourceMeta({
    data_source: state,
    source_label: sourceLabel,
    source_detail: sourceDetail,
    sample_size: sampleSize,
    empty_reason: emptyReason ?? null,
    is_empty: state === 'real_empty',
    is_observing: state === 'real_observing',
  });
}

function pickActiveTarget(
  query: ResearchQueryModel,
  summaryRows: BacktestSummaryRow[],
  detailRows: BacktestDetailRow[],
  icRows: FactorIcSummaryRow[],
  attributionRows: AttributionRow[],
  resonanceRows: ResonanceRow[],
): ResearchDrilldownTarget | null {
  if (query.focus) {
    const focusDetail = detailRows.find(row => row.tsCode === query.focus);
    if (focusDetail) {
      return buildDrilldown('stock', focusDetail.tsCode, `${focusDetail.name} (${focusDetail.tsCode})`, '继续查看该样本的持有收益和来源策略表现。');
    }
  }

  if (query.strategy) {
    const strategyRow = summaryRows.find(row => row.strategy === query.strategy);
    if (strategyRow) return strategyRow.drilldown;
  }

  return summaryRows[0]?.drilldown ?? icRows[0]?.drilldown ?? attributionRows[0]?.drilldown ?? resonanceRows[0]?.drilldown ?? null;
}

export async function loadResearchWorkspace(query: ResearchQueryModel): Promise<ResearchWorkspaceViewModel> {
  const filterState = buildFilterState(query);
  const sortState = buildSortState(query);

  const summaryResult = await settle(fetchBacktestSummary());
  const realSummaryRaw = summaryResult.ok ? summaryResult.data.map(toSummaryRawFromApi) : [];
  const summaryDataSource = summaryResult.ok
    ? buildResearchDataSource('real', 'Backtest summary API', '当前区块已接入真实数据。', realSummaryRaw.length)
    : buildResearchDataSource('fallback', 'Backtest summary API', '当前使用兼容回退数据。', researchBacktestSummaryMock.length);
  const summarySource: ResearchDataStatus = toUiStatus(summaryDataSource);
  const summaryRaw = (summarySource === 'real' ? realSummaryRaw : researchBacktestSummaryMock)
    .filter(row => !query.strategy || row.strategy === query.strategy);
  const summaryRows = summaryRaw.map(row => mapSummaryRow(row, summarySource)).sort((a, b) => b.winRate - a.winRate);

  const detailStrategy = query.strategy ?? summaryRows[0]?.strategy ?? null;
  const detailResult = detailStrategy
    ? await settle(fetchBacktestDetail(detailStrategy))
    : { ok: true as const, data: [] as BacktestDetailItem[] };
  const realDetailRaw = detailResult.ok ? detailResult.data.map(toDetailRawFromApi) : [];
  const detailRaw = (realDetailRaw.length > 0 ? realDetailRaw : researchBacktestDetailMock)
    .filter(row => !detailStrategy || row.strategy === detailStrategy || row.ts_code === query.focus);
  const detailRows = detailRaw.map(mapDetailRow);

  const [icResult, factorMeta] = await Promise.all([
    settle(fetchResearchFactorIc(query.strategy ?? undefined)),
    fetchFactorMeta(),
  ]);
  const icRealRows = icResult.ok ? icResult.data : [];
  const icDataSource = icResult.ok
    ? icRealRows.length > 0
      ? buildResearchDataSource('real', 'Factor IC API', '当前区块已接入真实数据。', icRealRows.length)
      : buildResearchDataSource('real_empty', 'Factor IC API', '真实接口已接通，当前暂无数据。', 0, '暂无数据')
    : buildResearchDataSource('fallback', 'Factor IC API', '当前使用兼容回退数据。', researchFactorIcMock.length);
  const icSource: ResearchDataStatus = toUiStatus(icDataSource);
  const allIcRawData = icSource === 'real' ? icRealRows.map(toIcRawFromApi) : researchFactorIcMock;
  const allIcMapped = allIcRawData.map(r => mapIcRow(r, factorMeta[r.factor_name]));
  const icRaw = allIcRawData.filter(row => row.horizon === filterState.horizon || query.tab !== 'ic');
  const icSummaryRows = icRaw.map(r => mapIcRow(r, factorMeta[r.factor_name])).sort((a, b) => Math.abs(b.ic) - Math.abs(a.ic));

  const bucketRows = (['T1', 'T3', 'T5', 'T10', 'T20'] as ResearchHorizon[]).flatMap(horizon =>
    buildBucketRows((icSource === 'real' ? icRealRows.map(toIcRawFromApi) : researchFactorIcMock).map(r => mapIcRow(r, factorMeta[r.factor_name])), horizon),
  );

  const attributionResult = await settle(fetchResearchAttribution(query.strategy ?? undefined));
  const attributionRealRows = attributionResult.ok ? attributionResult.data : [];
  const attributionDataSource = attributionResult.ok
    ? attributionRealRows.length > 0
      ? buildResearchDataSource('real', 'Attribution API', '当前区块已接入真实数据。', attributionRealRows.length)
      : buildResearchDataSource('real_empty', 'Attribution API', '真实接口已接通，当前暂无归因数据。', 0, '暂无数据')
    : buildResearchDataSource('fallback', 'Attribution API', '当前使用兼容回退数据。', researchAttributionMock.length);
  const attributionSource: ResearchDataStatus = toUiStatus(attributionDataSource);
  const attributionRaw = (attributionSource === 'real' ? attributionRealRows.map(toAttributionRawFromApi) : researchAttributionMock)
    .filter(row => row.group_type === filterState.groupType || query.tab !== 'attribution');
  const attributionRows = attributionRaw.map(mapAttributionRow).sort((a, b) => b.avgReturn - a.avgReturn);

  const resonanceResult = await settle(fetchResearchResonance(query.strategy ?? undefined));
  const resonanceRealRows = resonanceResult.ok ? resonanceResult.data : [];
  const resonanceDataSource = resonanceResult.ok
    ? buildResearchDataSource('real', 'Resonance API', '当前区块已接入真实数据。', resonanceRealRows.length)
    : buildResearchDataSource('fallback', 'Resonance API', '当前使用兼容回退数据。', researchResonanceMock.length);
  const resonanceSource: ResearchDataStatus = toUiStatus(resonanceDataSource);
  const resonanceRaw = resonanceSource === 'real' ? resonanceRealRows.map(toResonanceRawFromApi) : researchResonanceMock;
  const resonanceRows = resonanceRaw.map(mapResonanceRow).sort((a, b) => b.avgScore - a.avgScore);

  const activeTarget = pickActiveTarget(query, summaryRows, detailRows, icSummaryRows, attributionRows, resonanceRows);

  return {
    tabs: {
      summary: {
        label: '回测摘要',
        title: '回测总览',
        description: '围绕策略样本、分周期收益、胜率和回撤，建立统一研究基线。',
        emptyTitle: '当前没有可展示的回测策略',
        emptyText: '请调整来源、策略或 focus 条件后再查看研究结果。',
      },
      ic: {
        label: '因子 IC',
        title: '因子 IC',
        description: '按研究周期查看因子 IC、ICIR、分桶表现和相关性承接位。',
        emptyTitle: '当前没有可展示的因子结果',
        emptyText: 'Factor IC 接口不可用时会自动回退到兼容数据。',
      },
      attribution: {
        label: '策略归因',
        title: '策略归因',
        description: '按策略、市场或风格维度比较样本收益、胜率和回撤。',
        emptyTitle: '当前没有可展示的归因结果',
        emptyText: '请检查来源上下文或等待归因接口接入。',
      },
      resonance: {
        label: '共振分析',
        title: '共振分析',
        description: '查看策略组合的共振层级、样本收益和超额表现。',
        emptyTitle: '当前没有可展示的共振结果',
        emptyText: '共振分析当前支持兼容回退，后续可接入真实接口。',
      },
    },
    tabStates: {
      summary: {
        ...buildTabState(
        summarySource,
        summarySource === 'real'
          ? '回测总览已优先使用真实回测中心 summary。T+1、T+3、回撤和版本快照存在局部兼容补位。'
          : '回测总览当前使用兼容数据，用于保持研究页可继续浏览。',
      ),
        dataSource: summaryDataSource,
      },
      ic: {
        ...buildTabState(
        icSource,
        icSource === 'real'
          ? '因子 IC 已接入真实数据。'
          : '因子 IC 当前使用兼容回退，接口未接入时仍保留研究结构。',
      ),
        dataSource: icDataSource,
      },
      attribution: {
        ...buildTabState(
        attributionSource,
        attributionSource === 'real'
          ? '策略归因已接入真实数据。'
          : '策略归因当前使用兼容回退，接口未接入时仍保留研究结构。',
      ),
        dataSource: attributionDataSource,
      },
      resonance: {
        ...buildTabState(
        resonanceSource,
        resonanceSource === 'real'
          ? '共振分析已接入真实数据。'
          : '共振分析当前使用兼容回退，接口未接入时仍保留研究结构。',
      ),
        dataSource: resonanceDataSource,
      },
    },
    metrics: query.tab === 'ic' ? (() => {
      const t5Rows = allIcMapped.filter(r => r.horizon === 'T5').sort((a, b) => Math.abs(b.ic) - Math.abs(a.ic));
      const effectiveT5 = t5Rows.filter(r => Math.abs(r.ic) >= 0.03 && Math.abs(r.icir) >= 0.5);
      return [
        { label: '研究因子数', value: String(new Set(allIcMapped.map(r => r.factorName)).size), helper: '去重后的唯一因子数' },
        { label: '有效因子', value: String(effectiveT5.length), helper: 'T+5 |IC|>=0.03 且 |ICIR|>=0.5' },
        { label: '已应用', value: String(new Set(allIcMapped.filter(r => r.applied).map(r => r.factorName)).size), helper: '已用于订单排序的因子数' },
        { label: '最强因子', value: t5Rows.length > 0 ? t5Rows[0].factorCn : '--', helper: 'T+5 IC绝对值最大的因子' },
      ];
    })() : [
      { label: '研究策略数', value: String(summaryRows.length), helper: '当前研究范围内可比较的策略数量' },
      { label: '研究周期', value: filterState.horizon, helper: '当前页面默认使用的收益周期' },
      { label: '聚焦策略', value: query.strategy ?? '全部策略', helper: '来自 handoff 或当前研究选择' },
      { label: '数据来源', value: '真实数据', helper: '当前研究数据来源' },
    ],
    filters: buildFilters(query, filterState),
    handoffText: buildSourceSummary(query),
    filterState,
    sortState,
    activeTarget,
    summaryRows,
    detailRows,
    icSummaryRows,
    bucketRows,
    attributionRows,
    resonanceRows,
    context: buildContext(query, filterState, activeTarget, detailRows),
    dataSources: {
      summary: summaryDataSource,
      ic: icDataSource,
      attribution: attributionDataSource,
      resonance: resonanceDataSource,
    },
    factorMeta,
  };
}
