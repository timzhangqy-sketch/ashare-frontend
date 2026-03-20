import type { KlineItem, RiskApiItem, StockDetailResp } from '../api'
import { getStrategyDisplayName } from '../utils/displayNames'
import {
  fetchStockContext,
  fetchStockContextKline,
  fetchStockContextLifecycle,
  fetchStockContextRisk,
  type StockContextLifecycleResp,
} from '../api/contextPanel'
import type {
  ContextPanelLoadStatus,
  ContextPanelState,
  ContextPanelTag,
  StockContextKlineData,
  StockContextLifecycleData,
  StockContextMainData,
  StockContextPanelPayload,
  StockContextRiskData,
  StockContextViewModel,
} from '../types/contextPanel'
import { buildDataSourceMeta, deriveMixedMeta } from '../utils/dataSource'

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
}
const BLOCK_SOURCE_MAP: Record<string, string> = {
  limit_down: '跌停检测',
  event_block: '事件风控模块',
  financial_risk: '财务风险模块',
  market_risk: '市场风险模块',
  compliance_block: '合规检测',
  gate: '风险闸门',
}
function translateBlock(raw: string | null | undefined, map: Record<string, string>): string | null {
  if (!raw) return null
  return raw.split(',').map((s) => map[s.trim()] ?? s.trim()).join('、')
}

function sourceLabel(sourcePage: ContextPanelState['sourcePage']) {
  if (sourcePage === 'signals') return '来自 Signals'
  if (sourcePage === 'watchlist') return '来自 Watchlist'
  if (sourcePage === 'portfolio') return '来自 Portfolio'
  if (sourcePage === 'risk') return '来自 Risk'
  if (sourcePage === 'research') return '来自 Research'
  if (sourcePage === 'execution') return '来自 Execution'
  if (sourcePage === 'dashboard') return '来自 Dashboard'
  return '来自当前页面'
}

function toSignedPercent(value: number | null | undefined) {
  if (value == null) return '--'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function normalizeMain(
  detail: StockDetailResp | null,
  payload: StockContextPanelPayload,
  tsCode: string,
  quote: any = null,
): StockContextMainData | null {
  if (!detail && !payload.tsCode) return null
  return {
    tsCode,
    name: detail?.name ?? payload.name ?? payload.title ?? tsCode,
    industry: detail?.industry ?? null,
    close: detail?.close ?? null,
    pctChg: detail?.pct_chg ?? null,
    turnoverRate: detail?.turnover_rate ?? null,
    amountYi: detail?.amount_yi ?? null,
    inWatchlist: detail?.in_watchlist ?? false,
    sourceStrategy: payload.sourceStrategy ?? detail?.watchlist_strategy ?? null,
    buySignal: detail?.watchlist_buy_signal ?? null,
    sellSignal: detail?.watchlist_sell_signal ?? null,
    open: quote?.open ?? null,
    high: quote?.high ?? null,
    low: quote?.low ?? null,
    ma5: quote?.ma5 ?? null,
    ma10: quote?.ma10 ?? null,
    ma20: quote?.ma20 ?? null,
    vr: quote?.vr ?? null,
    peTtm: quote?.pe_ttm ?? null,
    pb: quote?.pb ?? null,
    totalMvYi: quote?.total_mv_yi ?? null,
  }
}

function normalizeKline(items: KlineItem[] | null): StockContextKlineData | null {
  if (!items || !items.length) return null
  const latest = items[items.length - 1]
  return {
    latestDate: latest.date,
    latestClose: latest.close,
    latestOpen: latest.open,
    latestHigh: latest.high,
    latestLow: latest.low,
    lastFiveCloses: items.slice(-5).map((item) => item.close),
  }
}

function normalizeRisk(risk: RiskApiItem | null): StockContextRiskData | null {
  if (!risk) return null
  return {
    tradeAllowed: risk.trade_allowed ?? null,
    riskLevel: risk.risk_level ?? null,
    riskScoreTotal: risk.risk_score_total ?? null,
    blockReason: translateBlock(risk.block_reason, BLOCK_REASON_MAP),
    blockSource: translateBlock(risk.block_source, BLOCK_SOURCE_MAP),
    capMultiplier: risk.position_cap_multiplier_final ?? null,
    riskScoreFinancial: (risk as any).dimension_scores?.financial ?? (risk as any).risk_score_financial ?? null,
    riskScoreMarket: (risk as any).dimension_scores?.market ?? (risk as any).risk_score_market ?? null,
    riskScoreEvent: (risk as any).dimension_scores?.event ?? (risk as any).risk_score_event ?? null,
    riskScoreCompliance: (risk as any).dimension_scores?.compliance ?? (risk as any).risk_score_compliance ?? null,
  }
}

function normalizeLifecycle(
  lifecycle: StockContextLifecycleResp | null,
  detail: StockDetailResp | null,
): StockContextLifecycleData | null {
  const entryDate = lifecycle?.entry_date ?? detail?.watchlist_entry_date ?? null
  const poolDay = lifecycle?.pool_day ?? detail?.watchlist_pool_day ?? null
  const gainSinceEntry = lifecycle?.gain_since_entry ?? detail?.watchlist_gain_since_entry ?? null
  const positionStatus = lifecycle?.position_status ?? (detail?.in_watchlist ? 'in_watchlist' : null)
  const lifecycleLabel = lifecycle?.lifecycle_label ?? (detail?.in_watchlist ? '交易标的池跟踪中' : null)

  if (!entryDate && poolDay == null && gainSinceEntry == null && !positionStatus && !lifecycleLabel) {
    return null
  }

  return {
    lifecycleLabel: lifecycleLabel ?? '暂无生命周期记录',
    entryDate,
    poolDay,
    gainSinceEntry,
    positionStatus,
  }
}

function mergeTags(payload: StockContextPanelPayload, main: StockContextMainData | null, risk: StockContextRiskData | null): ContextPanelTag[] {
  const tags: ContextPanelTag[] = []
  if (payload.sourceStrategy) tags.push({ label: getStrategyDisplayName(payload.sourceStrategy) || payload.sourceStrategy, tone: 'strategy' })
  if (main?.buySignal) tags.push({ label: `买入信号 ${main.buySignal}`, tone: 'state' })
  if (main?.sellSignal) tags.push({ label: `卖出信号 ${main.sellSignal}`, tone: 'risk' })
  if (main?.inWatchlist) tags.push({ label: '交易标的池', tone: 'source' })
  if (risk?.tradeAllowed != null) tags.push({ label: risk.tradeAllowed ? '允许交易' : '限制交易', tone: risk.tradeAllowed ? 'state' : 'risk' })
  return [...tags, ...(payload.tags ?? [])]
}

function buildSummaryItems(
  payload: StockContextPanelPayload,
  main: StockContextMainData | null,
  risk: StockContextRiskData | null,
  lifecycle: StockContextLifecycleData | null,
) {
  if (payload.summaryItems?.length) return payload.summaryItems
  return [
    { label: '来源策略', value: main?.sourceStrategy ?? '--' },
    { label: '涨跌幅', value: toSignedPercent(main?.pctChg) },
    { label: '交易状态', value: risk?.tradeAllowed == null ? '--' : risk.tradeAllowed ? '允许交易' : '限制交易' },
    { label: '生命周期', value: lifecycle?.lifecycleLabel ?? '--' },
  ]
}

function sectionState<T>(data: T | null, error: unknown): { status: ContextPanelLoadStatus; note: string } {
  if (data) return { status: 'ready', note: '真实上下文已承接。' }
  if (error) return { status: 'partial', note: '当前子块未返回可用结果，已保留其他可用上下文。' }
  return { status: 'empty', note: '真实接口已接通，但当前标的暂无这类记录。' }
}

function sectionDataSource<T>(data: T | null, error: unknown, label: string, detail: string) {
  if (data) {
    return buildDataSourceMeta({
      data_source: 'real',
      source_label: label,
      source_detail: detail,
    })
  }

  if (error) {
    return buildDataSourceMeta({
      data_source: 'degraded',
      source_label: label,
      source_detail: detail,
      degraded: true,
      degrade_reason: '当前子块接口未返回可用结果，已保留其他可用上下文。',
    })
  }

  return buildDataSourceMeta({
    data_source: 'real_empty',
    source_label: label,
    source_detail: detail,
    is_empty: true,
    empty_reason: '真实接口已接通，但当前标的暂无这类记录。',
  })
}

export async function loadStockContextViewModel(
  panel: ContextPanelState,
  tradeDate: string,
): Promise<StockContextViewModel> {
  const payload = ((panel.payload ?? {}) as StockContextPanelPayload) || {}
  const tsCode = payload.tsCode ?? panel.tsCode ?? panel.focus ?? panel.entityKey ?? ''

  const [mainResult, klineResult, riskResult, lifecycleResult] = await Promise.allSettled([
    fetchStockContext(tsCode, tradeDate),
    fetchStockContextKline(tsCode),
    fetchStockContextRisk(tsCode, tradeDate),
    fetchStockContextLifecycle(tsCode, tradeDate),
  ])

  const detail = mainResult.status === 'fulfilled' ? mainResult.value : null
  const kline = klineResult.status === 'fulfilled' ? normalizeKline(klineResult.value) : null
  const risk = riskResult.status === 'fulfilled' ? normalizeRisk(riskResult.value) : null
  const lifecycle = lifecycleResult.status === 'fulfilled' ? normalizeLifecycle(lifecycleResult.value, detail) : null
  const main = normalizeMain(detail, payload, tsCode, detail as any)

  const hasAnyData = Boolean(main || kline || risk || lifecycle)
  const hasAllData = Boolean(main && kline && risk && lifecycle)
  const status: ContextPanelLoadStatus = hasAllData ? 'ready' : hasAnyData ? 'partial' : 'error'
  const mainDataSource = sectionDataSource(
    main,
    mainResult.status === 'rejected' ? mainResult.reason : null,
    '股票上下文基础信息',
    '基础信息与行情优先来自股票上下文接口。',
  )
  const klineDataSource = sectionDataSource(
    kline,
    klineResult.status === 'rejected' ? klineResult.reason : null,
    '股票上下文 K 线',
    'K 线承接优先来自股票上下文 K 线接口。',
  )
  const riskDataSource = sectionDataSource(
    risk,
    riskResult.status === 'rejected' ? riskResult.reason : null,
    '股票上下文风险摘要',
    '风险摘要优先来自股票上下文风险接口。',
  )
  const lifecycleDataSource = sectionDataSource(
    lifecycle,
    lifecycleResult.status === 'rejected' ? lifecycleResult.reason : null,
    '股票上下文生命周期',
    '生命周期与交易标的池承接优先来自股票上下文生命周期接口。',
  )

  return {
    status,
    statusText: status === 'ready' ? '上下文已就绪' : status === 'partial' ? '上下文部分就绪' : '上下文暂不可用',
    title: main?.name ?? payload.name ?? payload.title ?? tsCode,
    tsCode,
    sourceLabel: sourceLabel(panel.sourcePage),
    sourceStrategy: main?.sourceStrategy ?? payload.sourceStrategy ?? null,
    tags: mergeTags(payload, main, risk),
    summaryItems: buildSummaryItems(payload, main, risk, lifecycle),
    actions: payload.actions ?? [],
    main,
    dataSource: deriveMixedMeta(
      [mainDataSource, klineDataSource, riskDataSource, lifecycleDataSource],
      '股票上下文汇总',
      '已汇总基础信息、K 线、风险摘要和生命周期上下文。',
    ),
    kline: {
      ...sectionState(kline, klineResult.status === 'rejected' ? klineResult.reason : null),
      data: kline,
      dataSource: klineDataSource,
    },
    risk: {
      ...sectionState(risk, riskResult.status === 'rejected' ? riskResult.reason : null),
      data: risk,
      dataSource: riskDataSource,
    },
    lifecycle: {
      ...sectionState(lifecycle, lifecycleResult.status === 'rejected' ? lifecycleResult.reason : null),
      data: lifecycle,
      dataSource: lifecycleDataSource,
    },
  }
}
