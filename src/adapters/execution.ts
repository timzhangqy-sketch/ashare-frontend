import {
  fetchExecutionChecks,
  fetchPortfolio,
  fetchRiskGateBlocks,
  fetchRiskTopScores,
  fetchSimFills,
  fetchSimOrders,
  fetchSimPositions,
  fetchTransactions,
  type PortfolioItem,
  type RiskApiItem,
  type SimFillApiItem,
  type SimOrderApiItem,
  type SimPositionApiItem,
  type TransactionItem,
} from '../api'
import { STRATEGY_LABEL_MAP } from '../utils/labelMaps'
import {
  executionConstraintsMock,
  executionMetricsMock,
} from '../mocks/execution'
import type {
  ExecutionConstraintRow,
  ExecutionContextModel,
  ExecutionDataStatus,
  ExecutionFilterChip,
  ExecutionNextStep,
  ExecutionQueryModel,
  ExecutionRow,
  ExecutionSource,
  ExecutionTab,
  ExecutionTabMeta,
  ExecutionTabState,
  ExecutionWorkspaceViewModel,
  SimFillRow,
  SimFillStatus,
  SimOrderRow,
  SimOrderStatus,
  SimPositionRow,
} from '../types/execution'
import type { DataSourceMeta } from '../types/dataSource'
import { buildDataSourceMeta, deriveMixedMeta } from '../utils/dataSource'

const VALID_TABS: ExecutionTab[] = ['orders', 'positions', 'fills', 'constraints']
const VALID_SOURCES: ExecutionSource[] = [
  'direct',
  'dashboard',
  'signals',
  'watchlist',
  'portfolio',
  'risk',
]

function normalizeTab(value: string | null): ExecutionTab {
  return VALID_TABS.includes(value as ExecutionTab) ? (value as ExecutionTab) : 'constraints'
}

function normalizeSource(value: string | null): ExecutionSource {
  return VALID_SOURCES.includes(value as ExecutionSource) ? (value as ExecutionSource) : 'direct'
}

function getSourceLabel(source: ExecutionSource): string {
  const map: Record<ExecutionSource, string> = {
    direct: '直接进入',
    dashboard: '来自仪表盘',
    signals: '来自信号中心',
    watchlist: '来自交易标的池',
    portfolio: '来自持仓中心',
    risk: '来自风控中心',
  }
  return map[source]
}

function getStrategyLabel(strategy: string | null): string {
  return strategy ? (STRATEGY_LABEL_MAP[strategy] ?? strategy) : '未指定策略'
}

function getTabLabel(tab: ExecutionTab): string {
  const map: Record<ExecutionTab, string> = {
    orders: '模拟订单',
    positions: '模拟持仓',
    fills: '模拟成交',
    constraints: '执行约束',
  }
  return map[tab]
}

function getTabDescription(tab: ExecutionTab): string {
  const map: Record<ExecutionTab, string> = {
    orders: '查看进入执行域的模拟订单、状态推进和来源链路。',
    positions: '查看模拟持仓状态、来源关系和仓位建议。',
    fills: '查看模拟成交结果及其与订单、持仓的关联。',
    constraints: '查看执行前是否允许下单、仓位上限和风险拦截原因。',
  }
  return map[tab]
}

function toRiskLevel(raw: string | null | undefined): 'low' | 'medium' | 'high' {
  if (raw === 'high') return 'high'
  if (raw === 'medium' || raw === 'mid') return 'medium'
  return 'low'
}

function toRiskLevelLabel(level: 'low' | 'medium' | 'high'): string {
  if (level === 'high') return '高风险'
  if (level === 'medium') return '中风险'
  return '低风险'
}

function toConstraintStatus(tradeAllowed: boolean, cap: number | null): 'allow' | 'warn' | 'block' {
  if (!tradeAllowed) return 'block'
  if (cap != null && cap < 1) return 'warn'
  return 'allow'
}

function toConstraintStatusLabel(status: 'allow' | 'warn' | 'block'): string {
  if (status === 'block') return '禁止执行'
  if (status === 'warn') return '警告执行'
  return '允许执行'
}

function toTradeAllowedLabel(tradeAllowed: boolean, status: 'allow' | 'warn' | 'block'): string {
  if (!tradeAllowed) return '禁止下单'
  if (status === 'warn') return '允许下单，需控制仓位'
  return '允许下单'
}

function toOrderStatus(raw: string | null | undefined): SimOrderStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'draft':
      return 'draft'
    case 'queued':
    case 'pending':
      return 'queued'
    case 'submitted':
      return 'submitted'
    case 'partial':
    case 'partial_fill':
    case 'partial_filled':
      return 'partial'
    case 'filled':
    case 'done':
      return 'filled'
    case 'rejected':
    case 'blocked':
      return 'rejected'
    case 'canceled':
    case 'cancelled':
      return 'canceled'
    default:
      return 'submitted'
  }
}

function toOrderStatusLabel(status: SimOrderStatus): string {
  const map: Record<SimOrderStatus, string> = {
    draft: '待确认',
    queued: '排队中',
    submitted: '已提交',
    partial: '部分成交',
    filled: '全部成交',
    rejected: '已拒绝',
    canceled: '已取消',
  }
  return map[status]
}

function toFillStatus(raw: string | null | undefined): SimFillStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'partial':
    case 'partial_fill':
    case 'partial_filled':
      return 'partial'
    case 'filled':
    case 'done':
      return 'filled'
    default:
      return 'none'
  }
}

function toFillStatusLabel(status: SimFillStatus): string {
  const map: Record<SimFillStatus, string> = {
    none: '未成交',
    partial: '部分成交',
    filled: '全部成交',
  }
  return map[status]
}

function toPositionCapText(multiplier: number | null, tradeAllowed: boolean): string {
  if (!tradeAllowed) return '当前不建议建立执行仓位'
  if (multiplier == null) return '当前未给出明确仓位上限'
  return `建议按 ${multiplier.toFixed(1)}x 仓位系数执行`
}

function toStatusTone(constraintStatus: 'allow' | 'warn' | 'block'): 'success' | 'warning' | 'danger' {
  if (constraintStatus === 'block') return 'danger'
  if (constraintStatus === 'warn') return 'warning'
  return 'success'
}

function toObjectTypeLabel(row: ExecutionRow): string {
  if (row.objectType === 'order') return '订单'
  if (row.objectType === 'position') return '持仓'
  if (row.objectType === 'fill') return '成交'
  return '约束'
}

function buildSourceIntent(source: ExecutionSource): string {
  if (source === 'signals') return '当前执行对象来自信号中心，适合继续确认是否进入模拟下单。'
  if (source === 'watchlist') return '当前执行对象来自交易标的池，适合继续确认是否进入模拟执行。'
  if (source === 'portfolio') return '当前执行对象来自持仓中心，适合继续查看加减仓或退出的模拟执行结果。'
  if (source === 'risk') return '当前执行对象来自风控中心，适合继续查看执行约束和仓位建议。'
  if (source === 'dashboard') return '当前执行对象来自仪表盘，总览入口已带入执行域。'
  return '当前为直接进入模拟执行工作域。'
}

function buildFilterChips(query: ExecutionQueryModel): ExecutionFilterChip[] {
  return [
    { key: 'source', label: '来源', value: getSourceLabel(query.source) },
    { key: 'focus', label: '聚焦对象', value: query.focus ?? '未指定' },
    { key: 'strategy', label: '策略', value: getStrategyLabel(query.strategy) },
    { key: 'tab', label: '当前标签', value: getTabLabel(query.tab) },
  ]
}

function buildTabs(
  orders: SimOrderRow[],
  positions: SimPositionRow[],
  fills: SimFillRow[],
  constraints: ExecutionConstraintRow[],
): ExecutionTabMeta[] {
  return [
    {
      key: 'orders',
      label: '模拟订单',
      description: getTabDescription('orders'),
      count: orders.length,
    },
    {
      key: 'positions',
      label: '模拟持仓',
      description: getTabDescription('positions'),
      count: positions.length,
    },
    {
      key: 'fills',
      label: '模拟成交',
      description: getTabDescription('fills'),
      count: fills.length,
    },
    {
      key: 'constraints',
      label: '执行约束',
      description: getTabDescription('constraints'),
      count: constraints.length,
    },
  ]
}

function buildStatusNote(dataStatus: ExecutionDataStatus): string {
  if (dataStatus === 'real') return '当前标签使用真实数据。'
  if (dataStatus === 'fallback') return '当前标签展示为兼容数据视图，页面结构与来源链路保持可用。'
  return '当前标签暂无可用数据。'
}

function buildTabState(status: ExecutionDataStatus, note: string): ExecutionTabState {
  return { status, note }
}

function toExecutionUiStatus(meta: DataSourceMeta): ExecutionDataStatus {
  return meta.data_source === 'fallback' || meta.data_source === 'mock' ? 'fallback' : 'real'
}

function buildExecutionDataSource(
  state: DataSourceMeta['data_source'],
  sourceLabel: string,
  sourceDetail: string,
  sampleSize: number | null,
): DataSourceMeta {
  return buildDataSourceMeta({
    data_source: state,
    source_label: sourceLabel,
    source_detail: sourceDetail,
    sample_size: sampleSize,
    is_observing: state === 'real_observing',
    is_empty: state === 'real_empty',
  })
}

function parseDateLike(value: string | null | undefined): Date | null {
  if (!value) return null
  const normalized = value.includes('T') ? value : `${value}T00:00:00`
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function diffCalendarDays(start: Date, end: Date): number | null {
  const utcStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const utcEnd = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  const diff = Math.floor((utcEnd - utcStart) / 86400000)
  if (diff < 0) return null
  return diff + 1
}

function buildObservingDay(day: number | null): { observingDay: number | null; observingDayLabel: string | null } {
  if (day == null || !Number.isFinite(day) || day < 1) {
    return { observingDay: null, observingDayLabel: null }
  }

  return {
    observingDay: day,
    observingDayLabel: `观察第 ${day} 天`,
  }
}

function deriveObservingDay(tradeDate: string | null | undefined, anchorDate: string | null | undefined) {
  const trade = parseDateLike(tradeDate)
  const anchor = parseDateLike(anchorDate)
  if (!trade || !anchor) return buildObservingDay(null)
  return buildObservingDay(diffCalendarDays(anchor, trade))
}

function buildTabStates(
  ordersState: ExecutionTabState,
  positionsState: ExecutionTabState,
  fillsState: ExecutionTabState,
  constraintsState: ExecutionTabState,
): Record<ExecutionTab, ExecutionTabState> {
  return {
    orders: ordersState,
    positions: positionsState,
    fills: fillsState,
    constraints: constraintsState,
  }
}

function applyFilters<T extends ExecutionRow>(rows: T[], query: ExecutionQueryModel): T[] {
  return rows.filter((row) => {
    const focusMatch = query.focus
      ? row.tsCode === query.focus || row.id === query.focus || row.focusKey === query.focus
      : true
    const strategyMatch = query.strategy ? row.sourceStrategy === query.strategy : true
    const sourceMatch = query.source === 'direct' ? true : row.sourceDomain === query.source
    return focusMatch && strategyMatch && sourceMatch
  })
}

function getRowsByTab(
  query: ExecutionQueryModel,
  orders: SimOrderRow[],
  positions: SimPositionRow[],
  fills: SimFillRow[],
  constraints: ExecutionConstraintRow[],
): ExecutionRow[] {
  switch (query.tab) {
    case 'orders':
      return applyFilters(orders, query)
    case 'positions':
      return applyFilters(positions, query)
    case 'fills':
      return applyFilters(fills, query)
    case 'constraints':
    default:
      return applyFilters(constraints, query)
  }
}

function buildNextSteps(row: ExecutionRow): ExecutionNextStep[] {
  const steps: ExecutionNextStep[] = [
    {
      label: '返回来源工作域',
      kind: 'route',
      note: `当前对象${row.sourceLabel}，可回到原工作域继续处理。`,
    },
    {
      label: '查看风险结论',
      kind: 'insight',
      note: `当前结论为“${row.tradeAllowedLabel}”，风险等级为“${row.riskLevelLabel}”。`,
    },
  ]

  if (row.related.positionId || row.related.fillIds.length > 0 || row.related.orderId) {
    steps.push({
      label: '查看关联关系',
      kind: 'route',
      note: '可继续核对关联订单、持仓和成交记录。',
    })
  } else {
    steps.push({
      label: '等待执行推进',
      kind: 'placeholder',
      note: '当前对象尚未形成完整的订单、持仓或成交关系。',
    })
  }

  return steps
}

function buildContext(row: ExecutionRow | null): ExecutionContextModel | null {
  if (!row) return null

  return {
    title: row.name,
    subtitle: `${toObjectTypeLabel(row)} / ${row.tsCode}`,
    sourceSummary: `${row.sourceLabel} / ${row.strategyLabel}`,
    observingDayLabel: row.observingDayLabel,
    sections: [
      {
        title: '当前对象',
        items: [
          { label: '对象类型', value: toObjectTypeLabel(row) },
          { label: '当前状态', value: row.statusLabel },
          { label: '来源', value: row.sourceLabel },
        ],
      },
      {
        title: '风险结论',
        items: [
          { label: '执行判断', value: row.tradeAllowedLabel },
          { label: '约束状态', value: row.constraintStatusLabel },
          { label: '风险等级', value: row.riskLevelLabel },
          { label: '限制原因', value: row.blockReason ?? '无' },
        ],
      },
      {
        title: '仓位建议',
        items: [
          { label: '仓位建议', value: row.positionCapText },
          { label: '约束来源', value: row.blockSource ?? '无' },
          { label: '执行摘要', value: row.summary },
        ],
      },
      {
        title: '关联关系',
        items: [
          { label: '关联订单', value: row.related.orderId ?? '无' },
          { label: '关联持仓', value: row.related.positionId ?? '无' },
          { label: '关联成交', value: row.related.fillIds.length > 0 ? row.related.fillIds.join(' / ') : '无' },
        ],
      },
    ],
    nextSteps: buildNextSteps(row),
  }
}

function asId(value: string | number | null | undefined, fallback: string): string {
  if (value == null || value === '') return fallback
  return String(value)
}

function toSourceDomain(raw: string | null | undefined, fallback: ExecutionSource): ExecutionSource {
  if (raw === 'signals' || raw === 'watchlist' || raw === 'portfolio' || raw === 'risk' || raw === 'dashboard') {
    return raw
  }
  return fallback
}

function mapSimOrder(raw: SimOrderApiItem): SimOrderRow | null {
  if (!raw.ts_code) return null
  const tradeAllowed = raw.trade_allowed ?? true
  const cap = raw.position_cap_multiplier_final ?? null
  const constraintStatus = toConstraintStatus(tradeAllowed, cap)
  const orderStatus = toOrderStatus(raw.status)
  const fillStatus = toFillStatus(raw.fill_status)
  const sourceDomain = toSourceDomain(raw.source_domain, 'direct')
  const observing = deriveObservingDay(raw.trade_date, raw.submit_time ?? raw.trade_date)
  return {
    id: asId(raw.id ?? raw.order_id, `order-${raw.ts_code}`),
    objectType: 'order',
    tsCode: raw.ts_code,
    name: raw.name ?? raw.ts_code,
    tradeDate: raw.trade_date ?? new Date().toISOString().slice(0, 10),
    observingDay: observing.observingDay,
    observingDayLabel: observing.observingDayLabel,
    sourceDomain,
    sourceLabel: getSourceLabel(sourceDomain),
    sourceStrategy: raw.source_strategy ?? null,
    strategyLabel: getStrategyLabel(raw.source_strategy ?? null),
    focusKey: raw.ts_code,
    statusLabel: toOrderStatusLabel(orderStatus),
    statusTone: toStatusTone(constraintStatus),
    summary: tradeAllowed
      ? '订单已进入模拟执行流程。'
      : `订单因“${raw.block_reason ?? '未提供原因'}”被限制。`,
    riskLevel: toRiskLevel(raw.risk_level),
    riskLevelLabel: toRiskLevelLabel(toRiskLevel(raw.risk_level)),
    tradeAllowed,
    tradeAllowedLabel: toTradeAllowedLabel(tradeAllowed, constraintStatus),
    constraintStatus,
    constraintStatusLabel: toConstraintStatusLabel(constraintStatus),
    blockReason: raw.block_reason ?? null,
    blockSource: raw.block_source ?? null,
    positionCapMultiplier: cap,
    positionCapText: toPositionCapText(cap, tradeAllowed),
    related: {
      orderId: asId(raw.id ?? raw.order_id, `order-${raw.ts_code}`),
      positionId: raw.related_position_id != null ? String(raw.related_position_id) : null,
      fillIds: (raw.related_fill_ids ?? []).map(String),
    },
    side: raw.side === 'sell' ? 'sell' : 'buy',
    qty: raw.qty ?? raw.shares ?? 0,
    price: raw.price ?? 0,
    orderStatus,
    orderStatusLabel: toOrderStatusLabel(orderStatus),
    submitTime: raw.submit_time ?? '--',
    fillStatus,
    fillStatusLabel: toFillStatusLabel(fillStatus),
    orderType: raw.order_type === 'market' ? 'market' : 'limit',
  }
}

function mapSimPosition(raw: SimPositionApiItem): SimPositionRow | null {
  if (!raw.ts_code) return null
  const tradeAllowed = raw.trade_allowed ?? true
  const cap = raw.position_cap_multiplier_final ?? null
  const constraintStatus = toConstraintStatus(tradeAllowed, cap)
  const sourceDomain = toSourceDomain(raw.source_domain, 'portfolio')
  const observing = deriveObservingDay(raw.trade_date, raw.entry_time ?? raw.trade_date)
  return {
    id: asId(raw.id ?? raw.position_id, `position-${raw.ts_code}`),
    objectType: 'position',
    tsCode: raw.ts_code,
    name: raw.name ?? raw.ts_code,
    tradeDate: raw.trade_date ?? new Date().toISOString().slice(0, 10),
    observingDay: observing.observingDay,
    observingDayLabel: observing.observingDayLabel,
    sourceDomain,
    sourceLabel: getSourceLabel(sourceDomain),
    sourceStrategy: raw.source_strategy ?? null,
    strategyLabel: getStrategyLabel(raw.source_strategy ?? null),
    focusKey: raw.ts_code,
    statusLabel: raw.status ?? '持有中',
    statusTone: toStatusTone(constraintStatus),
    summary: '当前对象已形成模拟持仓，可继续查看风险与仓位建议。',
    riskLevel: toRiskLevel(raw.risk_level),
    riskLevelLabel: toRiskLevelLabel(toRiskLevel(raw.risk_level)),
    tradeAllowed,
    tradeAllowedLabel: toTradeAllowedLabel(tradeAllowed, constraintStatus),
    constraintStatus,
    constraintStatusLabel: toConstraintStatusLabel(constraintStatus),
    blockReason: raw.block_reason ?? null,
    blockSource: raw.block_source ?? null,
    positionCapMultiplier: cap,
    positionCapText: toPositionCapText(cap, tradeAllowed),
    related: {
      orderId: raw.related_order_id != null ? String(raw.related_order_id) : null,
      positionId: asId(raw.id ?? raw.position_id, `position-${raw.ts_code}`),
      fillIds: (raw.related_fill_ids ?? []).map(String),
    },
    entryTime: raw.entry_time ?? '--',
    entryPrice: raw.entry_price ?? 0,
    shares: raw.shares ?? 0,
    marketValue: raw.market_value ?? 0,
    unrealizedPnl: raw.unrealized_pnl ?? 0,
    unrealizedPnlPct: raw.unrealized_pnl_pct ?? 0,
    fromOrderStatus: null,
    positionStatusLabel: raw.status ?? '持有中',
  }
}

function mapSimFill(raw: SimFillApiItem): SimFillRow | null {
  if (!raw.ts_code) return null
  const tradeAllowed = raw.trade_allowed ?? true
  const cap = raw.position_cap_multiplier_final ?? null
  const constraintStatus = toConstraintStatus(tradeAllowed, cap)
  const fillStatus = toFillStatus(raw.fill_status)
  const orderStatus = toOrderStatus(raw.order_status)
  const sourceDomain = toSourceDomain(raw.source_domain, 'direct')
  const observing = deriveObservingDay(raw.trade_date, raw.fill_time ?? raw.trade_date)
  return {
    id: asId(raw.id ?? raw.fill_id, `fill-${raw.ts_code}`),
    objectType: 'fill',
    tsCode: raw.ts_code,
    name: raw.name ?? raw.ts_code,
    tradeDate: raw.trade_date ?? new Date().toISOString().slice(0, 10),
    observingDay: observing.observingDay,
    observingDayLabel: observing.observingDayLabel,
    sourceDomain,
    sourceLabel: getSourceLabel(sourceDomain),
    sourceStrategy: raw.source_strategy ?? null,
    strategyLabel: getStrategyLabel(raw.source_strategy ?? null),
    focusKey: raw.ts_code,
    statusLabel: toFillStatusLabel(fillStatus),
    statusTone: toStatusTone(constraintStatus),
    summary: '当前成交已进入执行记录，可继续核对订单和持仓关系。',
    riskLevel: toRiskLevel(raw.risk_level),
    riskLevelLabel: toRiskLevelLabel(toRiskLevel(raw.risk_level)),
    tradeAllowed,
    tradeAllowedLabel: toTradeAllowedLabel(tradeAllowed, constraintStatus),
    constraintStatus,
    constraintStatusLabel: toConstraintStatusLabel(constraintStatus),
    blockReason: raw.block_reason ?? null,
    blockSource: raw.block_source ?? null,
    positionCapMultiplier: cap,
    positionCapText: toPositionCapText(cap, tradeAllowed),
    related: {
      orderId: raw.order_id != null ? String(raw.order_id) : null,
      positionId: raw.position_id != null ? String(raw.position_id) : null,
      fillIds: [asId(raw.id ?? raw.fill_id, `fill-${raw.ts_code}`)],
    },
    side: raw.side === 'sell' ? 'sell' : 'buy',
    fillTime: raw.fill_time ?? '--',
    fillPrice: raw.fill_price ?? 0,
    fillQty: raw.fill_qty ?? 0,
    fillStatus,
    fillStatusLabel: toFillStatusLabel(fillStatus),
    orderStatus,
    orderStatusLabel: toOrderStatusLabel(orderStatus),
  }
}

function mapPortfolioPosition(item: PortfolioItem): SimPositionRow {
  const actionSignal = (item.action_signal ?? '').toUpperCase()
  const cap = actionSignal === 'REDUCE' ? 0.8 : actionSignal === 'CLOSE' || actionSignal === 'STOP_LOSS' ? 0 : 1
  const tradeAllowed = actionSignal !== 'CLOSE' && actionSignal !== 'STOP_LOSS'
  const constraintStatus = toConstraintStatus(tradeAllowed, cap)
  const riskLevel =
    actionSignal === 'STOP_LOSS' || actionSignal === 'CLOSE' ? 'high' : actionSignal === 'REDUCE' ? 'medium' : 'low'
  const observing = deriveObservingDay(item.open_date, item.open_date)
  return {
    id: `portfolio-open-${item.id}`,
    objectType: 'position',
    tsCode: item.ts_code,
    name: item.name,
    tradeDate: item.open_date,
    observingDay: observing.observingDay,
    observingDayLabel: observing.observingDayLabel,
    sourceDomain: 'portfolio',
    sourceLabel: getSourceLabel('portfolio'),
    sourceStrategy: item.source_strategy,
    strategyLabel: getStrategyLabel(item.source_strategy),
    focusKey: item.ts_code,
    statusLabel: item.status === 'closed' ? '已平仓' : '持有中',
    statusTone: toStatusTone(constraintStatus),
    summary: '当前展示为从持仓中心兼容承接的执行视图。',
    riskLevel,
    riskLevelLabel: toRiskLevelLabel(riskLevel),
    tradeAllowed,
    tradeAllowedLabel: toTradeAllowedLabel(tradeAllowed, constraintStatus),
    constraintStatus,
    constraintStatusLabel: toConstraintStatusLabel(constraintStatus),
    blockReason: !tradeAllowed ? item.signal_reason ?? '当前建议退出，不再继续执行。' : null,
    blockSource: !tradeAllowed ? '持仓动作建议' : null,
    positionCapMultiplier: cap,
    positionCapText: toPositionCapText(cap, tradeAllowed),
    related: {
      orderId: null,
      positionId: `portfolio-open-${item.id}`,
      fillIds: [],
    },
    entryTime: item.open_date,
    entryPrice: item.open_price,
    shares: item.shares,
    marketValue: item.market_value ?? 0,
    unrealizedPnl: item.unrealized_pnl ?? 0,
    unrealizedPnlPct: item.unrealized_pnl_pct ?? 0,
    fromOrderStatus: null,
    positionStatusLabel: item.status === 'closed' ? '已平仓' : '持有中',
  }
}

function mapPortfolioFill(portfolioId: number, item: TransactionItem): SimFillRow {
  const orderStatus: SimOrderStatus = item.trade_type === 'SELL' ? 'filled' : 'submitted'
  const fillStatus: SimFillStatus = 'filled'
  const observing = deriveObservingDay(item.trade_date, item.trade_date)
  return {
    id: `portfolio-tx-${portfolioId}-${item.id}`,
    objectType: 'fill',
    tsCode: item.ts_code,
    name: item.ts_code,
    tradeDate: item.trade_date,
    observingDay: observing.observingDay,
    observingDayLabel: observing.observingDayLabel,
    sourceDomain: 'portfolio',
    sourceLabel: getSourceLabel('portfolio'),
    sourceStrategy: item.trigger_source ?? 'PORTFOLIO',
    strategyLabel: getStrategyLabel(item.trigger_source ?? 'PORTFOLIO'),
    focusKey: item.ts_code,
    statusLabel: toFillStatusLabel(fillStatus),
    statusTone: 'success',
    summary: '当前展示为从交易流水兼容承接的模拟成交视图。',
    riskLevel: 'medium',
    riskLevelLabel: '中风险',
    tradeAllowed: true,
    tradeAllowedLabel: '允许下单',
    constraintStatus: 'allow',
    constraintStatusLabel: '允许执行',
    blockReason: null,
    blockSource: null,
    positionCapMultiplier: null,
    positionCapText: '当前成交记录未提供单独的仓位约束。',
    related: {
      orderId: `portfolio-tx-order-${portfolioId}`,
      positionId: `portfolio-open-${portfolioId}`,
      fillIds: [`portfolio-tx-${portfolioId}-${item.id}`],
    },
    side: item.trade_type === 'SELL' ? 'sell' : 'buy',
    fillTime: item.trade_date,
    fillPrice: item.price,
    fillQty: item.shares,
    fillStatus,
    fillStatusLabel: toFillStatusLabel(fillStatus),
    orderStatus,
    orderStatusLabel: toOrderStatusLabel(orderStatus),
  }
}

function mapRiskConstraint(raw: RiskApiItem): ExecutionConstraintRow | null {
  if (!raw.ts_code) return null
  const tradeAllowed = raw.trade_allowed ?? true
  const cap = raw.position_cap_multiplier_final ?? null
  const constraintStatus = toConstraintStatus(tradeAllowed, cap)
  const sourceDomain = toSourceDomain(raw.source_domain, 'risk')
  const observing = deriveObservingDay(raw.trade_date, raw.trade_date)
  return {
    id: `risk-${raw.ts_code}`,
    objectType: 'constraint',
    tsCode: raw.ts_code,
    name: raw.name ?? raw.ts_code,
    tradeDate: raw.trade_date ?? new Date().toISOString().slice(0, 10),
    observingDay: observing.observingDay,
    observingDayLabel: observing.observingDayLabel,
    sourceDomain,
    sourceLabel: getSourceLabel(sourceDomain),
    sourceStrategy: raw.source_strategy ?? null,
    strategyLabel: getStrategyLabel(raw.source_strategy ?? null),
    focusKey: raw.ts_code,
    statusLabel: toConstraintStatusLabel(constraintStatus),
    statusTone: toStatusTone(constraintStatus),
    summary: tradeAllowed
      ? '当前风险约束允许进入执行。'
      : `当前对象因“${raw.block_reason ?? '未提供原因'}”被风险约束拦截。`,
    riskLevel: toRiskLevel(raw.risk_level),
    riskLevelLabel: toRiskLevelLabel(toRiskLevel(raw.risk_level)),
    tradeAllowed,
    tradeAllowedLabel: toTradeAllowedLabel(tradeAllowed, constraintStatus),
    constraintStatus,
    constraintStatusLabel: toConstraintStatusLabel(constraintStatus),
    blockReason: raw.block_reason ?? null,
    blockSource: raw.block_source ?? null,
    positionCapMultiplier: cap,
    positionCapText: toPositionCapText(cap, tradeAllowed),
    related: {
      orderId: null,
      positionId: raw.in_portfolio ? `portfolio-${raw.ts_code}` : null,
      fillIds: [],
    },
    recommendedPositionText: tradeAllowed ? toPositionCapText(cap, true) : '当前不建议建立执行仓位',
    actionHint: tradeAllowed ? '可继续查看来源对象并评估是否进入模拟执行。' : '建议先回到风险或来源工作域复核当前限制。', 
    constraintScope:
      sourceDomain === 'portfolio' ? 'portfolio' : sourceDomain === 'watchlist' ? 'watchlist' : 'cross-domain',
  }
}

function normalizeMockConstraint(row: ExecutionConstraintRow): ExecutionConstraintRow {
  return {
    ...row,
    sourceLabel: getSourceLabel(row.sourceDomain),
    strategyLabel: getStrategyLabel(row.sourceStrategy),
    riskLevelLabel: toRiskLevelLabel(row.riskLevel),
    tradeAllowedLabel: toTradeAllowedLabel(row.tradeAllowed, row.constraintStatus),
    constraintStatusLabel: toConstraintStatusLabel(row.constraintStatus),
    positionCapText: toPositionCapText(row.positionCapMultiplier, row.tradeAllowed),
  }
}

function normalizeMetrics() {
  const metricMap: Record<string, { label: string }> = {
    orders: { label: '模拟订单' },
    positions: { label: '模拟持仓' },
    fills: { label: '模拟成交' },
    constraints: { label: '执行约束' },
  }

  return executionMetricsMock.map((metric) => ({
    ...metric,
    label: metricMap[metric.key]?.label ?? metric.label,
    note: '',
  }))
}

async function settle<T>(promise: Promise<T>) {
  try {
    return { ok: true as const, data: await promise }
  } catch (error) {
    return { ok: false as const, error }
  }
}

function toTransactionTargets(items: PortfolioItem[]) {
  return items.slice(0, 8)
}

export async function loadExecutionWorkspace(searchParams: URLSearchParams): Promise<ExecutionWorkspaceViewModel> {
  const query: ExecutionQueryModel = {
    tab: normalizeTab(searchParams.get('tab')),
    source: normalizeSource(searchParams.get('source')),
    focus: searchParams.get('focus'),
    strategy: searchParams.get('strategy'),
  }

  const [
    simOrdersResp,
    simPositionsResp,
    simFillsResp,
    checksResp,
    portfolioOpenResp,
    riskGateResp,
    riskScoreResp,
  ] = await Promise.all([
    settle(fetchSimOrders(undefined, query.strategy ?? undefined)),
    settle(fetchSimPositions(undefined, query.strategy ?? undefined)),
    settle(fetchSimFills(undefined, query.strategy ?? undefined)),
    settle(fetchExecutionChecks(undefined, query.strategy ?? undefined)),
    settle(fetchPortfolio('open')),
    settle(fetchRiskGateBlocks(
      undefined,
      query.source === 'portfolio' ? 'portfolio' : query.source === 'watchlist' ? 'watchlist' : 'all',
    )),
    settle(fetchRiskTopScores(
      undefined,
      query.source === 'portfolio' ? 'portfolio' : query.source === 'watchlist' ? 'watchlist' : 'all',
    )),
  ])

  let orders: SimOrderRow[] = []
  let ordersDataSource = buildExecutionDataSource('real_observing', 'Execution orders', '委托单数据。', 0)
  let ordersState = buildTabState('real', '当前标签使用真实订单数据。')

  if (simOrdersResp.ok && simOrdersResp.data.length > 0) {
    const mapped = simOrdersResp.data.map(mapSimOrder).filter(Boolean) as SimOrderRow[]
    if (mapped.length > 0) {
      orders = mapped
      ordersDataSource = buildExecutionDataSource('real_observing', 'Execution orders', '委托单真实数据。', mapped.length)
    }
  }

  let positions: SimPositionRow[] = []
  let positionsDataSource = buildExecutionDataSource('real_observing', 'Execution positions', '持仓数据。', 0)
  let positionsState = buildTabState('real', '当前标签使用真实持仓数据。')

  if (simPositionsResp.ok && simPositionsResp.data.length > 0) {
    const mapped = simPositionsResp.data.map(mapSimPosition).filter(Boolean) as SimPositionRow[]
    if (mapped.length > 0) {
      positions = mapped
      positionsDataSource = buildExecutionDataSource('real_observing', 'Execution positions', '持仓真实数据。', mapped.length)
    }
  } else if (portfolioOpenResp.ok && portfolioOpenResp.data.data.length > 0) {
    positions = portfolioOpenResp.data.data.map(mapPortfolioPosition)
    positionsDataSource = buildExecutionDataSource('real_observing', 'Execution positions', '持仓数据（来自持仓中心）。', positions.length)
  }

  let fills: SimFillRow[] = []
  let fillsDataSource = buildExecutionDataSource('real_observing', 'Execution fills', '成交数据。', 0)
  let fillsState = buildTabState('real', '当前标签使用真实成交数据。')

  if (simFillsResp.ok && simFillsResp.data.length > 0) {
    const mapped = simFillsResp.data.map(mapSimFill).filter(Boolean) as SimFillRow[]
    if (mapped.length > 0) {
      fills = mapped
      fillsDataSource = buildExecutionDataSource('real_observing', 'Execution fills', '成交真实数据。', mapped.length)
    }
  } else if (portfolioOpenResp.ok && portfolioOpenResp.data.data.length > 0) {
    const txTargets = toTransactionTargets(portfolioOpenResp.data.data)
    const txEntries = await Promise.all(
      txTargets.map(async (item) => {
        try {
          const items = await fetchTransactions(item.id)
          return items.map((tx) => mapPortfolioFill(item.id, tx))
        } catch {
          return []
        }
      }),
    )
    const transactionRows = txEntries.flat()
    if (transactionRows.length > 0) {
      fills = transactionRows
      fillsDataSource = buildExecutionDataSource('real_observing', 'Execution fills', '成交数据（来自交易流水）。', fills.length)
    }
  }

  let constraints = executionConstraintsMock.map(normalizeMockConstraint)
  let constraintsDataSource = buildExecutionDataSource('fallback', 'Execution checks', '执行约束真实接口未返回结果，先使用兼容约束行维持工作流。', constraints.length)
  let constraintsState = buildTabState('fallback', '当前未接到执行约束接口，先展示兼容约束视图。')

  if (checksResp.ok && checksResp.data.length > 0) {
    const mapped = checksResp.data.map(mapRiskConstraint).filter(Boolean) as ExecutionConstraintRow[]
    if (mapped.length > 0) {
      constraints = mapped
      constraintsDataSource = buildExecutionDataSource('real_observing', 'Execution checks', '执行约束真实接口已接通，但当前样本仍偏少，先按观察期展示。', mapped.length)
      constraintsState = buildTabState('real', '当前标签使用真实执行约束数据。')
    }
  } else {
    const riskRows = [
      ...(riskGateResp.ok ? riskGateResp.data : []),
      ...(riskScoreResp.ok ? riskScoreResp.data : []),
    ]
      .map(mapRiskConstraint)
      .filter(Boolean) as ExecutionConstraintRow[]

    if (riskRows.length > 0) {
      const deduped = new Map(riskRows.map((item) => [item.tsCode, item]))
      constraints = [...deduped.values()]
      constraintsDataSource = buildExecutionDataSource('fallback', 'Execution checks', '执行约束真实接口当前空表，已回退到风控派生的兼容约束结果。', constraints.length)
      constraintsState = buildTabState('fallback', '当前标签由风控字段兼容承接。')
    }
  }

  const tabStates = buildTabStates(ordersState, positionsState, fillsState, constraintsState)
  const dataSources = {
    orders: ordersDataSource,
    positions: positionsDataSource,
    fills: fillsDataSource,
    constraints: constraintsDataSource,
  }
  const statuses = Object.values(dataSources).map((item) => toExecutionUiStatus(item))
  const overallStatus: ExecutionDataStatus = statuses.every((status) => status === 'real')
    ? 'real'
    : statuses.some((status) => status === 'fallback')
      ? 'fallback'
      : 'unavailable'

  const activeRows = getRowsByTab(query, orders, positions, fills, constraints)
  const selectedRow =
    activeRows.find((row) => row.id === query.focus || row.tsCode === query.focus || row.focusKey === query.focus) ?? null

  const focusMissNote =
    query.focus && !selectedRow
      ? `未找到 ${query.focus} 对应的执行对象，已保留当前标签并等待重新选择。`
      : null

  return {
    title: '模拟执行',
    subtitle: '围绕模拟订单、模拟持仓、模拟成交和执行约束，统一承接执行意图与来源链路。',
    query,
    metrics: normalizeMetrics().map((metric) => ({
      ...metric,
      dataSource: dataSources[metric.key as keyof typeof dataSources] ?? deriveMixedMeta(Object.values(dataSources), 'Execution workspace', 'Execution workspace aggregates multiple source states.'),
    })),
    filterChips: buildFilterChips(query),
    tabs: buildTabs(orders, positions, fills, constraints),
    dataStatus: overallStatus,
    statusNote: buildStatusNote(tabStates[query.tab].status),
    tabStates: {
      orders: { ...tabStates.orders, dataSource: ordersDataSource },
      positions: { ...tabStates.positions, dataSource: positionsDataSource },
      fills: { ...tabStates.fills, dataSource: fillsDataSource },
      constraints: { ...tabStates.constraints, dataSource: constraintsDataSource },
    },
    dataSources,
    focusMissNote,
    orders,
    positions,
    fills,
    constraints,
    selectedId: selectedRow?.id ?? null,
    context: (() => {
      const context = selectedRow ? buildContext(selectedRow) : null
      return context ? { ...context, dataSource: dataSources[query.tab] } : null
    })(),
    noFocus: {
      title: '请选择一个执行对象',
      description: `${buildSourceIntent(query.source)} 你可以先在当前标签中选择一条记录，再查看来源链路、风险结论、仓位建议和关联关系。`,
    },
    dataSource: deriveMixedMeta(Object.values(dataSources), 'Execution workspace', 'Execution 页面同时包含观察期真实区块和兼容承接区块。'),
  }
}
