import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  addPortfolio,
  fetchAIAnalysis,
  fetchStockDetail,
  type AIAnalysisResp,
  type FinancialYear,
  type StockDetailResp,
} from '../../api'
import { useDate } from '../../context/useDate'
import { useStockContextViewModel } from '../../hooks/useStockContextViewModel'
import type { StockContextPanelPayload } from '../../types/contextPanel'
import type { DataSourceMeta } from '../../types/dataSource'
import type { StockDetail } from '../../types/stock'
import { buildDataSourceMeta } from '../../utils/dataSource'
import { displaySignalLabel } from '../../utils/labelMaps'
import { MultiStrategyBadge } from '../CrossTags'
import SourceNotice from '../data-source/SourceNotice'
import KlineChart from './KlineChart'

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const BULL_POOL = [
  '量价协同改善，资金回流加快。',
  '短期均线重新拐头，趋势动能修复。',
  '强势策略标签仍在，题材热度未完全衰减。',
  '换手维持活跃，市场关注度较高。',
  'K 线结构仍保留延续性。',
]

const BEAR_POOL = [
  '短期波动放大，追高性价比下降。',
  '若量能衰减，容易回落到均线附近。',
  '高位筹码松动时，回撤会放大。',
  '交易层面仍需结合风控约束执行。',
]

function seed(code: string, offset = 0): number {
  let hash = offset * 7919
  for (const char of code) hash = ((hash << 5) - hash + char.charCodeAt(0)) & 0x7fffffff
  return Math.abs(hash)
}

function getAIData(code: string): AIAnalysisResp {
  const value = seed(code)
  const bullCount = 2 + (value % 3)
  const bearCount = 1 + (value % 2)
  const adviceIndex = value % 5 === 0 ? 2 : value % 3 === 0 ? 0 : 1

  return {
    bull_factors: Array.from({ length: bullCount }, (_, index) => BULL_POOL[(value + index) % BULL_POOL.length]),
    bear_factors: Array.from({ length: bearCount }, (_, index) => BEAR_POOL[(value + index) % BEAR_POOL.length]),
    advice: ['买入', '持有', '卖出'][adviceIndex] as AIAnalysisResp['advice'],
    confidence: 58 + (value % 37),
    stop_loss: `${4 + (value % 8)}.${value % 10}`,
    target: `${8 + (value % 12)}.${(value + 3) % 10}`,
  }
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return '--'
  return value.toFixed(digits)
}

function formatPercent(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

function formatPercentFromRatio(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return '--'
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`
}

function formatYi(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return '--'
  return value.toFixed(digits)
}

function getSignalTone(label: string | null | undefined) {
  if (!label) return 'neutral'
  if (label === 'SELL') return 'warning'
  if (label === 'PULLBACK' || label === 'REHEAT') return 'info'
  return 'neutral'
}

function getAdviceTone(advice: AIAnalysisResp['advice']): 'neutral' | 'warning' | 'info' {
  void advice
  return 'neutral'
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="drawer-confidence">
      <div className="drawer-confidence-head">
        <span>AI 置信度</span>
        <strong className="numeric">{value} / 100</strong>
      </div>
      <div className="drawer-confidence-track">
        <div className="drawer-confidence-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function InfoItem({ label, value, numeric = false }: { label: string; value: ReactNode; numeric?: boolean }) {
  return (
    <div className="drawer-info-item">
      <div className="drawer-info-label">{label}</div>
      <div className={numeric ? 'drawer-info-value numeric' : 'drawer-info-value'}>{value}</div>
    </div>
  )
}

function ToneBadge({ label, tone }: { label: string; tone: 'info' | 'warning' | 'neutral' }) {
  return <span className={`status-badge tag-pill drawer-pill drawer-pill-${tone}`}>{label}</span>
}

function SignalBadge({ label }: { label: string | null | undefined }) {
  if (!label) return <span className="numeric-muted">--</span>
  const text = displaySignalLabel(label)
  return <span className={`status-badge tag-pill drawer-pill drawer-pill-${getSignalTone(label)}`}>{text}</span>
}

function buildDetailMeta(detail: StockDetailResp | null, loading: boolean, stock: StockDetail | null): DataSourceMeta | null {
  if (detail) {
    return buildDataSourceMeta({
      data_source: 'real',
      source_label: 'Signals drawer stock detail',
      source_detail: '财务与技术明细来自股票详情接口。',
    })
  }

  if (loading || !stock) return null

  return buildDataSourceMeta({
    data_source: 'degraded',
    source_label: 'Signals drawer stock detail',
    source_detail: '财务与技术明细当前未能从股票详情接口完整返回。',
    degraded: true,
    degrade_reason: '股票详情接口当前未返回可用明细。',
  })
}

function buildAiMeta(stock: StockDetail | null, loading: boolean, aiData: AIAnalysisResp | null, fallbackUsed: boolean): DataSourceMeta | null {
  if (!stock || loading) return null
  if (aiData) {
    return buildDataSourceMeta({
      data_source: 'real',
      source_label: 'Signals drawer AI analysis',
      source_detail: 'AI 分析来自 AI 分析接口。',
    })
  }

  return buildDataSourceMeta({
    data_source: 'degraded',
    source_label: 'Signals drawer AI analysis',
    source_detail: 'AI 分析当前使用兼容兜底摘要。',
    degraded: true,
    degrade_reason: fallbackUsed ? 'AI 分析接口未返回可用结果。' : 'AI 分析接口当前不可用。',
  })
}

function buildSeedMeta(stock: StockDetail | null, contextReady: boolean): DataSourceMeta | null {
  if (!stock || contextReady) return null
  return buildDataSourceMeta({
    data_source: 'placeholder',
    source_label: 'Signals 抽屉首屏承接',
    source_detail: '抽屉首屏先承接当前信号行摘要，详细上下文返回后会更新为真实结果。',
    empty_reason: '抽屉首屏先承接当前信号行摘要，详细上下文返回后会更新为真实结果。',
  })
}

function buildDrawerContextMeta(meta: DataSourceMeta | null | undefined): DataSourceMeta | null {
  if (!meta) return null
  if (meta.data_source === 'real_empty') {
    return {
      ...meta,
      source_label: 'Signals 股票上下文',
      source_detail: '真实股票上下文已接通，但当前标的暂无可补充的详情记录。',
      empty_reason: '真实股票上下文已接通，但当前标的暂无可补充的详情记录。',
    }
  }

  if (meta.data_source === 'degraded' || meta.data_source === 'mixed') {
    return {
      ...meta,
      source_label: 'Signals 股票上下文',
      source_detail: '抽屉详情以真实股票上下文为主，局部子块当前按兼容结果展示。',
      degrade_reason: '部分上下文接口未返回可用结果。',
    }
  }

  return {
    ...meta,
    source_label: 'Signals 股票上下文',
    source_detail: '抽屉详情优先承接真实股票上下文。',
  }
}

interface Props {
  stock: StockDetail | null
  sourceMeta?: DataSourceMeta | null
  onClose: () => void
  autoOpenBuyForm?: boolean
  /** 建仓均价，用于在 K 线图上叠加横线（如从持仓页打开） */
  avgCost?: number | null
}

export default function StockDrawer({ stock, sourceMeta, onClose, autoOpenBuyForm = false, avgCost = null }: Props) {
  const { selectedDate } = useDate()
  const open = !!stock

  const [detail, setDetail] = useState<StockDetailResp | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [aiData, setAiData] = useState<AIAnalysisResp | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiFallback, setAiFallback] = useState(false)

  const [showBuyForm, setShowBuyForm] = useState(false)
  const [buyPrice, setBuyPrice] = useState('')
  const [buyShares, setBuyShares] = useState('100')
  const [buyDate, setBuyDate] = useState(() => new Date().toISOString().split('T')[0])
  const [buying, setBuying] = useState(false)
  const [buySuccess, setBuySuccess] = useState(false)
  const [buyError, setBuyError] = useState('')

  const contextPayload = useMemo<StockContextPanelPayload | null>(
    () =>
      stock
        ? {
            title: stock.name,
            name: stock.name,
            tsCode: stock.code,
            sourceStrategy: stock.lists[0] ?? null,
          }
        : null,
    [stock],
  )

  const { data: contextView, loading: contextLoading } = useStockContextViewModel({
    tsCode: stock?.code ?? null,
    tradeDate: selectedDate,
    sourcePage: 'signals',
    activeTab: 'drawer',
    focus: stock?.code ?? null,
    payload: contextPayload,
    enabled: open,
  })

  useEffect(() => {
    if (!stock) {
      setDetail(null)
      return
    }

    let cancelled = false
    setDetailLoading(true)
    setDetail(null)

    fetchStockDetail(stock.code, selectedDate)
      .then((value) => {
        if (cancelled) return
        setDetail(value)
        setDetailLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setDetailLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedDate, stock])

  useEffect(() => {
    if (!stock) {
      setAiData(null)
      setAiFallback(false)
      return
    }

    let cancelled = false
    setAiLoading(true)
    setAiData(null)
    setAiFallback(false)

    fetchAIAnalysis(stock.code, selectedDate)
      .then((value) => {
        if (cancelled) return
        if (value.error) {
          setAiData(null)
          setAiFallback(true)
        } else {
          setAiData(value)
        }
        setAiLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setAiLoading(false)
        setAiFallback(true)
      })

    return () => {
      cancelled = true
    }
  }, [selectedDate, stock])

  useEffect(() => {
    setShowBuyForm(autoOpenBuyForm)
    setBuySuccess(false)
    setBuyError('')
    setBuyPrice(stock ? (stock.close ?? 0).toFixed(2) : '')
    setBuyShares('100')
    setBuyDate(new Date().toISOString().split('T')[0])
  }, [autoOpenBuyForm, stock])

  useEffect(() => {
    const resolvedClose = contextView?.main?.close ?? detail?.close ?? stock?.close
    if (resolvedClose == null) return
    setBuyPrice((prev) => {
      const fallbackClose = (stock?.close ?? 0).toFixed(2)
      return prev === fallbackClose || prev === '' ? resolvedClose.toFixed(2) : prev
    })
  }, [contextView?.main?.close, detail?.close, stock])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const main = contextView?.main ?? null
  const risk = contextView?.risk.data ?? null
  const lifecycle = contextView?.lifecycle.data ?? null
  const ai = aiData ?? (stock ? getAIData(stock.code) : null)
  const drawerSourceMeta = useMemo(() => buildDrawerContextMeta(contextView?.dataSource ?? sourceMeta ?? null), [contextView?.dataSource, sourceMeta])
  const seedMeta = useMemo(() => buildSeedMeta(stock, Boolean(contextView?.main)), [stock, contextView?.main])
  const detailMeta = useMemo(() => buildDetailMeta(detail, detailLoading, stock), [detail, detailLoading, stock])
  const aiMeta = useMemo(() => buildAiMeta(stock, aiLoading, aiData, aiFallback), [stock, aiLoading, aiData, aiFallback])

  const closeValue = main?.close ?? detail?.close ?? stock?.close ?? 0
  const changePct = main?.pctChg ?? detail?.pct_chg ?? stock?.changePct ?? 0
  const pctClass = changePct > 0 ? 'c-up' : changePct < 0 ? 'c-down' : 'c-muted'
  const realVr = detail?.vr ?? main?.vr ?? null
  const buyAmount = (parseFloat(buyPrice) || 0) * (parseInt(buyShares) || 0)
  const poolDay = lifecycle?.poolDay ?? detail?.watchlist_pool_day ?? null
  const watchlistGain = lifecycle?.gainSinceEntry ?? detail?.watchlist_gain_since_entry ?? null
  const watchlistMaxGain = detail?.watchlist_max_gain ?? null
  const financialRows = useMemo(() => detail?.financials ?? [], [detail?.financials])

  async function handleBuy() {
    if (!stock) return
    const price = parseFloat(buyPrice)
    const shares = parseInt(buyShares)

    if (Number.isNaN(price) || price <= 0 || Number.isNaN(shares) || shares <= 0) {
      setBuyError('买入价格和股数需要是有效数值。')
      return
    }

    setBuying(true)
    setBuyError('')
    try {
      await addPortfolio({
        ts_code: stock.code,
        name: stock.name,
        open_price: price,
        shares,
        open_date: buyDate,
        source_strategy: stock.lists[0] ?? 'SIGNALS',
      })
      setShowBuyForm(false)
      setBuySuccess(true)
      setTimeout(() => setBuySuccess(false), 3000)
    } catch (error: unknown) {
      setBuyError(error instanceof Error ? error.message : '加入持仓失败，请稍后重试。')
    } finally {
      setBuying(false)
    }
  }

  return (
    <>
      <div className={`drawer-overlay${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`drawer${open ? ' open' : ''}`} data-testid="signals-stock-drawer">
        {stock ? (
          <div className="drawer-body">
            {buySuccess ? <div className="source-summary-bar source-summary-bar-info drawer-toast">已加入持仓，后续可在 Portfolio 中继续跟踪。</div> : null}

            <div className="drawer-header">
              <div className="drawer-header-copy">
                <div className="drawer-stock-title" data-testid="signals-stock-drawer-title">
                  {stock.name}
                </div>
                <div className="drawer-header-tags">
                  <span className="numeric numeric-muted">{stock.code}</span>
                  {stock.lists.map((item) => (
                    <span key={item} className="page-badge badge-blue">
                      {item}
                    </span>
                  ))}
                  <MultiStrategyBadge tsCode={stock.code} />
                </div>
              </div>

              <div className="drawer-header-actions">
                <div className="drawer-quote-box">
                  <div className="drawer-quote-price numeric">{contextLoading && detailLoading ? '--' : formatNumber(closeValue)}</div>
                  <div className={`drawer-quote-change numeric ${pctClass}`}>{contextLoading && detailLoading ? '--' : formatPercent(changePct)}</div>
                </div>
                <button
                  type="button"
                  className={showBuyForm ? 'btn-secondary' : 'btn-primary'}
                  onClick={() => {
                    setShowBuyForm((value) => !value)
                    setBuySuccess(false)
                    setBuyError('')
                  }}
                >
                  {showBuyForm ? '收起买入表单' : '买入'}
                </button>
                <button
                  className="drawer-close-btn"
                  type="button"
                  onClick={onClose}
                  title="关闭抽屉 (Esc)"
                  data-testid="signals-stock-drawer-close"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            <SourceNotice meta={drawerSourceMeta} />
            <SourceNotice meta={seedMeta} />

            {showBuyForm ? (
              <section className="drawer-buy-form">
                <div className="drawer-section-title">买入表单</div>
                <div className="drawer-form-grid">
                  <div className="form-group">
                    <label className="form-label">买入价格</label>
                    <input className="form-input numeric" type="number" step="0.01" min="0" value={buyPrice} onChange={(event) => setBuyPrice(event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">买入股数</label>
                    <input className="form-input numeric" type="number" step="100" min="100" value={buyShares} onChange={(event) => setBuyShares(event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">预计金额</label>
                    <input
                      className="form-input numeric"
                      readOnly
                      value={buyAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">来源策略</label>
                    <input className="form-input" readOnly value={main?.sourceStrategy ?? stock.lists[0] ?? 'Signals'} />
                  </div>
                  <div className="form-group drawer-form-wide">
                    <label className="form-label">买入日期</label>
                    <input className="form-input numeric" type="date" value={buyDate} onChange={(event) => setBuyDate(event.target.value)} />
                  </div>
                </div>

                {buyError ? <div className="page-error-detail drawer-buy-error">{buyError}</div> : null}

                <div className="drawer-form-actions">
                  <button type="button" className="btn-ghost" onClick={() => setShowBuyForm(false)}>
                    取消
                  </button>
                  <button type="button" className="btn-primary" onClick={handleBuy} disabled={buying}>
                    {buying ? '提交中...' : '确认买入'}
                  </button>
                </div>
              </section>
            ) : null}

            <div className="drawer-scroll">
              <section className="drawer-section-block">
                <div className="drawer-section-head">
                  <div className="drawer-section-title">K 线承接</div>
                  <SourceNotice meta={contextView?.kline.dataSource} />
                </div>
                <KlineChart tsCode={stock.code} avgCost={avgCost ?? undefined} />
              </section>

              <section className="drawer-section-block">
                <div className="drawer-section-head">
                  <div className="drawer-section-title">交易标的池与生命周期</div>
                  <SourceNotice meta={contextView?.lifecycle.dataSource} />
                </div>
                <div className="drawer-card">
                  {contextLoading ? (
                    <div className="drawer-inline-loading">
                      <div className="spinner" />
                      <span>正在加载生命周期信息...</span>
                    </div>
                  ) : (
                    <>
                      <div className="drawer-info-grid drawer-info-grid-3">
                        <InfoItem label="来源策略" value={main?.sourceStrategy ?? stock.lists[0] ?? '--'} />
                        <InfoItem label="买点信号" value={<SignalBadge label={main?.buySignal ?? detail?.watchlist_buy_signal} />} />
                        <InfoItem label="卖点信号" value={<SignalBadge label={main?.sellSignal ?? detail?.watchlist_sell_signal} />} />
                        <InfoItem label="当前阶段" value={lifecycle?.lifecycleLabel ?? '--'} />
                        <InfoItem label="交易标的池状态" value={main?.inWatchlist ? '在交易标的池' : '未在交易标的池'} />
                        <InfoItem label="观察天数" value={poolDay == null ? '--' : `${poolDay}`} numeric={poolDay != null} />
                      </div>
                      <div className="drawer-inline-metrics">
                        <span>
                          入池收益 <strong className={`numeric ${watchlistGain != null && watchlistGain >= 0 ? 'c-up' : 'c-down'}`}>{formatPercentFromRatio(watchlistGain)}</strong>
                        </span>
                        <span>
                          最高收益 <strong className="numeric c-up">{watchlistMaxGain != null ? `+${(watchlistMaxGain * 100).toFixed(2)}%` : '--'}</strong>
                        </span>
                        <span>
                          持仓状态 <strong>{lifecycle?.positionStatus ?? '--'}</strong>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </section>

              <section className="drawer-section-block">
                <div className="drawer-section-head">
                  <div className="drawer-section-title">风险摘要</div>
                  <SourceNotice meta={contextView?.risk.dataSource} />
                </div>
                <div className="drawer-card">
                  {contextLoading ? (
                    <div className="drawer-inline-loading">
                      <div className="spinner" />
                      <span>正在加载风险信息...</span>
                    </div>
                  ) : risk ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div style={{ padding: '10px 12px', background: 'var(--bg-surface)', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>交易限制</div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{risk.tradeAllowed == null ? '--' : risk.tradeAllowed ? '允许执行' : '限制交易'}</div>
                      </div>
                      <div style={{ padding: '10px 12px', background: 'var(--bg-surface)', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>风险等级</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: risk.riskLevel === 'low' ? 'var(--up)' : risk.riskLevel === 'medium' ? 'var(--warning)' : risk.riskLevel === 'high' || risk.riskLevel === 'critical' ? 'var(--down)' : 'inherit' }}>
                          {risk.riskLevel === 'low' ? '低风险' : risk.riskLevel === 'medium' ? '中风险' : risk.riskLevel === 'high' ? '高风险' : risk.riskLevel === 'critical' ? '极高风险' : risk.riskLevel ?? '--'}
                        </div>
                      </div>
                      <div style={{ padding: '10px 12px', background: 'var(--bg-surface)', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>风险总分</div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }} className="numeric">{risk.riskScoreTotal != null ? risk.riskScoreTotal.toFixed(1) : '--'}</div>
                      </div>
                      <div style={{ padding: '10px 12px', background: 'var(--bg-surface)', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>仓位上限系数</div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }} className="numeric">{risk.capMultiplier != null ? `${risk.capMultiplier.toFixed(2)}x` : '--'}</div>
                      </div>
                      <div style={{ padding: '10px 12px', background: 'var(--bg-surface)', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>阻断原因</div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{risk.blockReason ?? '--'}</div>
                      </div>
                      <div style={{ padding: '10px 12px', background: 'var(--bg-surface)', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>阻断来源</div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{risk.blockSource ?? '--'}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="drawer-inline-note">当前没有可用的风险摘要。</div>
                  )}
                </div>
              </section>

              <section className="drawer-section-block">
                <div className="drawer-section-head">
                  <div className="drawer-section-title">AI 分析</div>
                  {aiLoading ? <div className="spinner drawer-inline-spinner" /> : null}
                </div>
                <SourceNotice meta={aiMeta} />
                {aiLoading ? (
                  <div className="drawer-inline-note">正在加载 AI 分析...</div>
                ) : ai ? (
                  <div className="drawer-card drawer-ai-card">
                    <div className="drawer-ai-columns">
                      <div className="drawer-ai-column">
                        <div className="drawer-ai-title positive">积极因素</div>
                        {ai.bull_factors.map((item) => (
                          <div key={item} className="drawer-ai-item">
                            <span className="drawer-ai-bullet positive">•</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                      <div className="drawer-ai-column">
                        <div className="drawer-ai-title negative">风险因素</div>
                        {ai.bear_factors.map((item) => (
                          <div key={item} className="drawer-ai-item">
                            <span className="drawer-ai-bullet negative">•</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="drawer-ai-footer">
                      <div className="drawer-ai-action-row">
                        <span className="drawer-flat-label">动作建议</span>
                        <ToneBadge label={ai.advice} tone={getAdviceTone(ai.advice)} />
                        <div className="drawer-ai-targets">
                          <span>止损 <strong className="numeric c-info">-{ai.stop_loss}%</strong></span>
                          <span>目标 <strong className="numeric c-up">+{ai.target}%</strong></span>
                        </div>
                      </div>
                      <ConfidenceBar value={ai.confidence} />
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="drawer-section-block">
                <div className="drawer-section-head">
                  <div className="drawer-section-title">财务概览</div>
                  <SourceNotice meta={detailMeta} />
                </div>
                <div className="drawer-card drawer-table-card">
                  {detailLoading ? (
                    <div className="drawer-inline-loading">
                      <div className="spinner" />
                      <span>正在加载财务信息...</span>
                    </div>
                  ) : financialRows.length === 0 ? (
                    <div className="table-empty">当前没有可展示的财务年度数据。</div>
                  ) : (
                    <div className="table-shell">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>年度</th>
                            <th className="right">营收(亿)</th>
                            <th className="right">利润总额(亿)</th>
                            <th className="right">净利润(亿)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {financialRows.map((item: FinancialYear) => (
                            <tr key={item.year}>
                              <td className="numeric">{item.year}</td>
                              <td className="right numeric">{formatYi(item.revenue_yi)}</td>
                              <td className="right numeric">{formatYi(item.total_profit_yi)}</td>
                              <td className="right numeric">{formatYi(item.net_income_yi)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>

              <section className="drawer-section-block">
                <div className="drawer-section-head">
                  <div className="drawer-section-title">技术概览</div>
                  <SourceNotice meta={detailMeta} />
                </div>
                <div className="drawer-card">
                  {detailLoading ? (
                    <div className="drawer-inline-loading">
                      <div className="spinner" />
                      <span>正在加载技术指标...</span>
                    </div>
                  ) : (
                    <>
                      <div className="drawer-info-grid drawer-info-grid-4">
                        <InfoItem label="MA5" value={formatNumber(detail?.ma5 ?? main?.ma5)} numeric />
                        <InfoItem label="MA10" value={formatNumber(detail?.ma10 ?? main?.ma10)} numeric />
                        <InfoItem label="MA20" value={formatNumber(detail?.ma20 ?? main?.ma20)} numeric />
                        <InfoItem label="VR" value={realVr != null ? `${formatNumber(realVr)}x` : '--'} numeric />
                        <InfoItem label="换手率" value={(detail?.turnover_rate ?? main?.turnoverRate) != null ? `${formatNumber(detail?.turnover_rate ?? main?.turnoverRate)}%` : '--'} numeric />
                        <InfoItem label="成交额(亿)" value={formatYi(detail?.amount_yi ?? main?.amountYi ?? null)} numeric />
                        <InfoItem label="涨跌幅" value={formatPercent(changePct)} numeric />
                        <InfoItem label="最新价" value={formatNumber(closeValue)} numeric />
                      </div>
                      {(detail || main) ? (
                        <div className="drawer-info-grid drawer-info-grid-4 drawer-subgrid">
                          <InfoItem label="开盘价" value={formatNumber(detail?.open ?? main?.open)} numeric />
                          <InfoItem label="最高价" value={formatNumber(detail?.high ?? main?.high)} numeric />
                          <InfoItem label="最低价" value={formatNumber(detail?.low ?? main?.low)} numeric />
                          <InfoItem label="总市值(亿)" value={formatYi(detail?.market_cap_yi ?? main?.totalMvYi ?? null, 1)} numeric />
                          <InfoItem label="PE(TTM)" value={(detail?.pe_ttm ?? main?.peTtm) != null ? formatNumber(detail?.pe_ttm ?? main?.peTtm, 1) : '--'} numeric={(detail?.pe_ttm ?? main?.peTtm) != null} />
                          <InfoItem label="PB" value={formatNumber(detail?.pb ?? main?.pb)} numeric />
                          <InfoItem label="行业" value={detail?.industry ?? main?.industry ?? '--'} />
                          <InfoItem label="上市日期" value={detail?.list_date ?? '--'} numeric />
                        </div>
                      ) : (
                        <div className="drawer-inline-note">当前没有可展示的技术扩展字段。</div>
                      )}
                    </>
                  )}
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
