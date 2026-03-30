import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import type { StockDetail } from '../../types/stock'
import { displaySignalLabel } from '../../utils/labelMaps'
import { MultiStrategyBadge } from '../CrossTags'
import KlineChart from './KlineChart'

/* ═══ Strategy CN mapping ═══ */
const STRATEGY_CN: Record<string, string> = {
  'VOL_SURGE': '连续放量蓄势',
  'RETOC2': '异动反抽(RETOC2)',
  'PATTERN_T2UP9': '形态策略(T2UP9)',
  'WEAK_BUY': '弱市吸筹',
  'SIGNALS': '信号中心',
}
function displayStrategy(raw: string | null | undefined): string {
  if (!raw) return '--'
  return STRATEGY_CN[raw] ?? raw
}

/* ═══ Icons ═══ */
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

/* ═══ AI seed data ═══ */
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
    bull_factors: Array.from({ length: bullCount }, (_, i) => BULL_POOL[(value + i) % BULL_POOL.length]),
    bear_factors: Array.from({ length: bearCount }, (_, i) => BEAR_POOL[(value + i) % BEAR_POOL.length]),
    advice: ['买入', '持有', '卖出'][adviceIndex] as AIAnalysisResp['advice'],
    confidence: 58 + (value % 37),
    stop_loss: `${4 + (value % 8)}.${value % 10}`,
    target: `${8 + (value % 12)}.${(value + 3) % 10}`,
  }
}

/* ═══ Formatters ═══ */
function fmt(v: number | null | undefined, d = 2) { return v == null || Number.isNaN(v) ? '--' : v.toFixed(d) }
function fmtPct(v: number | null | undefined, d = 2) { return v == null || Number.isNaN(v) ? '--' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%` }
function fmtRatio(v: number | null | undefined, d = 2) { return v == null || Number.isNaN(v) ? '--' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%` }
function fmtYi(v: number | null | undefined, d = 2) { return v == null || Number.isNaN(v) ? '--' : v.toFixed(d) }
function pctCls(v: number | null | undefined) { return (v ?? 0) > 0 ? 'c-up' : (v ?? 0) < 0 ? 'c-down' : 'c-muted' }

function getSignalTone(label: string | null | undefined) {
  if (!label) return 'neutral'
  if (label === 'SELL') return 'warning'
  if (label === 'PULLBACK' || label === 'REHEAT') return 'info'
  return 'neutral'
}

/* ═══ Small components ═══ */
function GCell({ label, value, cls }: { label: string; value: ReactNode; cls?: string }) {
  return (
    <div className="g-cell">
      <div className="g-label">{label}</div>
      <div className={`g-value numeric ${cls ?? ''}`}>{value}</div>
    </div>
  )
}

function SignalBadge({ label }: { label: string | null | undefined }) {
  if (!label) return <span className="numeric c-muted">--</span>
  const text = displaySignalLabel(label)
  return <span className={`status-badge tag-pill drawer-pill drawer-pill-${getSignalTone(label)}`}>{text}</span>
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

function RiskDimBar({ label, score }: { label: string; score: number | null }) {
  const s = score ?? 0
  const fillCls = s >= 80 ? 'dim-fill-green' : s >= 60 ? 'dim-fill-yellow' : 'dim-fill-red'
  return (
    <div className="risk-dim-row">
      <span className="dim-label">{label}</span>
      <div className="dim-bar"><div className={`dim-fill ${fillCls}`} style={{ width: `${Math.min(s, 100)}%` }} /></div>
      <span className="dim-score numeric">{score != null ? score.toFixed(0) : '--'}</span>
    </div>
  )
}

// InfoItem removed - replaced by GCell

/* ═══ Main Component ═══ */
interface Props {
  stock: StockDetail | null
  sourceMeta?: unknown
  onClose: () => void
  autoOpenBuyForm?: boolean
  avgCost?: number | null
  sourcePage?: string
}

export default function StockDrawer({ stock, onClose, autoOpenBuyForm = false, avgCost = null, sourcePage = 'signals' }: Props) {
  const { selectedDate } = useDate()
  const open = !!stock

  const [detail, setDetail] = useState<StockDetailResp | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [aiData, setAiData] = useState<AIAnalysisResp | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [, setAiFallback] = useState(false)
  const [showBuyForm, setShowBuyForm] = useState(false)
  const [buyPrice, setBuyPrice] = useState('')
  const [buyShares, setBuyShares] = useState('100')
  const [buyDate, setBuyDate] = useState(() => new Date().toISOString().split('T')[0])
  const [buying, setBuying] = useState(false)
  const [buySuccess, setBuySuccess] = useState(false)
  const [buyError, setBuyError] = useState('')
  const [finOpen, setFinOpen] = useState(false)
  const buyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { return () => { if (buyTimerRef.current) clearTimeout(buyTimerRef.current) } }, [])

  const contextPayload = useMemo<StockContextPanelPayload | null>(
    () => stock ? { title: stock.name, name: stock.name, tsCode: stock.code, sourceStrategy: stock.lists[0] ?? null } : null,
    [stock],
  )
  const { data: contextView, loading: contextLoading } = useStockContextViewModel({
    tsCode: stock?.code ?? null, tradeDate: selectedDate, sourcePage,
    activeTab: 'drawer', focus: stock?.code ?? null, payload: contextPayload, enabled: open,
  })

  // Fetch stock detail
  useEffect(() => {
    if (!stock) { setDetail(null); return }
    let cancelled = false
    setDetailLoading(true); setDetail(null)
    fetchStockDetail(stock.code, selectedDate)
      .then(v => { if (!cancelled) { setDetail(v); setDetailLoading(false) } })
      .catch(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selectedDate, stock])

  // Fetch AI
  useEffect(() => {
    if (!stock) { setAiData(null); setAiFallback(false); return }
    let cancelled = false
    setAiLoading(true); setAiData(null); setAiFallback(false)
    fetchAIAnalysis(stock.code, selectedDate)
      .then(v => { if (!cancelled) { v.error ? (setAiData(null), setAiFallback(true)) : setAiData(v); setAiLoading(false) } })
      .catch(() => { if (!cancelled) { setAiLoading(false); setAiFallback(true) } })
    return () => { cancelled = true }
  }, [selectedDate, stock])

  // Buy form reset
  useEffect(() => {
    setShowBuyForm(autoOpenBuyForm); setBuySuccess(false); setBuyError('')
    setBuyPrice(stock ? (stock.close ?? 0).toFixed(2) : ''); setBuyShares('100')
    setBuyDate(new Date().toISOString().split('T')[0])
  }, [autoOpenBuyForm, stock])

  useEffect(() => {
    const c = contextView?.main?.close ?? detail?.close ?? stock?.close
    if (c == null) return
    setBuyPrice(prev => { const fb = (stock?.close ?? 0).toFixed(2); return prev === fb || prev === '' ? c.toFixed(2) : prev })
  }, [contextView?.main?.close, detail?.close, stock])

  // Escape key
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  // Derived values
  const main = contextView?.main ?? null
  const risk = contextView?.risk.data ?? null
  const lifecycle = contextView?.lifecycle.data ?? null
  const ai = aiData ?? (stock ? getAIData(stock.code) : null)
  const closeValue = main?.close ?? detail?.close ?? stock?.close ?? 0
  const changePct = main?.pctChg ?? detail?.pct_chg ?? stock?.changePct ?? 0
  const pctClass = pctCls(changePct)
  const buyAmount = (parseFloat(buyPrice) || 0) * (parseInt(buyShares) || 0)
  const poolDay = lifecycle?.poolDay ?? detail?.watchlist_pool_day ?? null
  const watchlistGain = lifecycle?.gainSinceEntry ?? detail?.watchlist_gain_since_entry ?? null
  const watchlistMaxGain = detail?.watchlist_max_gain ?? null
  const financialRows = useMemo(() => detail?.financials ?? [], [detail?.financials])

  const riskFinancial = risk?.riskScoreFinancial ?? null
  const riskMarket = risk?.riskScoreMarket ?? null
  const riskEvent = risk?.riskScoreEvent ?? null
  const riskCompliance = risk?.riskScoreCompliance ?? null

  async function handleBuy() {
    if (!stock) return
    const price = parseFloat(buyPrice); const shares = parseInt(buyShares)
    if (Number.isNaN(price) || price <= 0 || Number.isNaN(shares) || shares <= 0) { setBuyError('买入价格和股数需要是有效数值。'); return }
    setBuying(true); setBuyError('')
    try {
      await addPortfolio({ ts_code: stock.code, name: stock.name, open_price: price, shares, open_date: buyDate, source_strategy: stock.lists[0] ?? 'SIGNALS' })
      setShowBuyForm(false); setBuySuccess(true); if (buyTimerRef.current) clearTimeout(buyTimerRef.current); buyTimerRef.current = setTimeout(() => setBuySuccess(false), 3000)
    } catch (error: unknown) { setBuyError(error instanceof Error ? error.message : '加入持仓失败，请稍后重试。') }
    finally { setBuying(false) }
  }

  return (
    <>
      <div className={`drawer-overlay${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`drawer${open ? ' open' : ''}`} data-testid="signals-stock-drawer">
        {stock ? (
          <div className="drawer-body">
            {buySuccess && <div className="source-summary-bar source-summary-bar-info drawer-toast">已加入持仓。</div>}

            {/* ═══ ① Header ═══ */}
            <div className="drawer-header">
              <div className="drawer-header-row1">
                <div className="drawer-header-left">
                  <span className="drawer-stock-title" data-testid="signals-stock-drawer-title">{stock.name}</span>
                  <span className="numeric s-text-sm s-text-muted">{stock.code}</span>
                  {detail?.primary_concept && <span className="page-badge badge-blue">{detail.primary_concept}{detail.is_leader ? ' 👑' : ''}</span>}
                  {stock.lists.map(l => <span key={l} className="page-badge badge-gold">{displayStrategy(l)}</span>)}
                  <MultiStrategyBadge tsCode={stock.code} />
                </div>
                <button className="drawer-close-btn" type="button" onClick={onClose} title="关闭 (Esc)" data-testid="signals-stock-drawer-close"><CloseIcon /></button>
              </div>
              <div className="drawer-header-row2">
                <div className="drawer-quote-inline">
                  <span className={`price numeric ${pctClass}`}>{contextLoading && detailLoading ? '--' : fmt(closeValue)}</span>
                  <span className={`change numeric ${pctClass}`}>{contextLoading && detailLoading ? '--' : fmtPct(changePct)}</span>
                </div>
                <div className="drawer-actions-group">
                  <button type="button" className={`btn-sm ${showBuyForm ? 'btn-secondary' : 'btn-primary'}`} onClick={() => { setShowBuyForm(v => !v); setBuySuccess(false); setBuyError('') }}>
                    {showBuyForm ? '收起' : '买入'}
                  </button>
                </div>
              </div>
            </div>

            {/* ═══ ② Buy Form (conditional) ═══ */}
            {showBuyForm && (
              <section className="drawer-buy-form" style={{ padding: '0 16px 8px' }}>
                <div className="drawer-form-grid">
                  <div className="form-group"><label className="form-label">价格</label><input className="form-input numeric" type="number" step="0.01" min="0" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">股数</label><input className="form-input numeric" type="number" step="100" min="100" value={buyShares} onChange={e => setBuyShares(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">金额</label><input className="form-input numeric" readOnly value={buyAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /></div>
                  <div className="form-group"><label className="form-label">日期</label><input className="form-input numeric" type="date" value={buyDate} onChange={e => setBuyDate(e.target.value)} /></div>
                </div>
                {buyError && <div className="page-error-detail drawer-buy-error">{buyError}</div>}
                <div className="drawer-form-actions">
                  <button type="button" className="btn-ghost" onClick={() => setShowBuyForm(false)}>取消</button>
                  <button type="button" className="btn-primary" onClick={handleBuy} disabled={buying}>{buying ? '提交中...' : '确认买入'}</button>
                </div>
              </section>
            )}

            <div className="drawer-scroll">
              {/* ═══ ③ K-line ═══ */}
              <section className="drawer-section-compact" style={{ padding: '0 16px' }}>
                <KlineChart tsCode={stock.code} avgCost={avgCost ?? undefined} />
              </section>

              {/* ═══ ④ Core Quote Grid ═══ */}
              <section className="drawer-section-compact" style={{ padding: '0 16px' }}>
                <div className="drawer-section-title" style={{ fontSize: '11px', textTransform: 'uppercase' as const, color: '#8c909f', letterSpacing: '0.05em', marginBottom: '4px' }}>核心行情</div>
                <div className="drawer-grid-6">
                  <GCell label="开盘" value={fmt(detail?.open ?? main?.open)} />
                  <GCell label="最高" value={fmt(detail?.high ?? main?.high)} />
                  <GCell label="最低" value={fmt(detail?.low ?? main?.low)} />
                  <GCell label="收盘" value={fmt(closeValue)} cls={pctClass} />
                  <GCell label="成交额(亿)" value={fmtYi(detail?.amount_yi ?? main?.amountYi)} />
                  <GCell label="换手率%" value={fmt(detail?.turnover_rate ?? main?.turnoverRate)} />
                  <GCell label="MA5" value={fmt(detail?.ma5 ?? main?.ma5)} />
                  <GCell label="MA10" value={fmt(detail?.ma10 ?? main?.ma10)} />
                  <GCell label="MA20" value={fmt(detail?.ma20 ?? main?.ma20)} />
                  <GCell label="VR量比" value={detail?.vr != null ? `${fmt(detail.vr)}x` : '--'} />
                  <GCell label="PE(TTM)" value={fmt(detail?.pe_ttm ?? main?.peTtm, 1)} />
                  <GCell label="PB" value={fmt(detail?.pb ?? main?.pb)} />
                  <GCell label="市值(亿)" value={fmtYi(detail?.market_cap_yi ?? main?.totalMvYi, 1)} />
                  <GCell label="行业" value={<span style={{ fontWeight: 400 }}>{detail?.industry ?? main?.industry ?? '--'}</span>} />
                  <GCell label="5日涨幅" value={fmtRatio(detail?.pct_chg_5d)} cls={pctCls(detail?.pct_chg_5d)} />
                  <GCell label="10日涨幅" value={fmtRatio(detail?.pct_chg_10d)} cls={pctCls(detail?.pct_chg_10d)} />
                  <GCell label="20日涨幅" value={fmtRatio(detail?.pct_chg_20d)} cls={pctCls(detail?.pct_chg_20d)} />
                  <GCell label="距MA20" value={fmtRatio(detail?.close_vs_ma20_pct)} cls={pctCls(detail?.close_vs_ma20_pct)} />
                </div>
                {detail?.high_60d != null && (
                  <div className="drawer-range-bar">60日区间 <span className="numeric">{fmt(detail.low_60d)}</span> ~ <span className="numeric">{fmt(detail.high_60d)}</span></div>
                )}
              </section>

              {/* ═══ ⑤ System Status (lifecycle + risk) ═══ */}
              <section className="drawer-section-compact" style={{ padding: '0 16px' }}>
                <div className="drawer-section-title" style={{ fontSize: '11px', textTransform: 'uppercase' as const, color: '#8c909f', letterSpacing: '0.05em', marginBottom: '4px' }}>系统状态</div>
                {contextLoading ? (
                  <div className="drawer-inline-loading"><div className="spinner" /><span>加载中...</span></div>
                ) : (
                  <div className="drawer-two-col">
                    {/* Left: Trade Status */}
                    <div className="drawer-col-card">
                      <div className="col-title">交易状态</div>
                      <div className="drawer-mini-grid">
                        <div className="drawer-mini-cell"><div className="mc-label">来源策略</div><div className="mc-value">{displayStrategy(main?.sourceStrategy ?? stock.lists[0])}</div></div>
                        <div className="drawer-mini-cell"><div className="mc-label">生命周期</div><div className="mc-value">{lifecycle?.lifecycleLabel ?? '--'}</div></div>
                        <div className="drawer-mini-cell"><div className="mc-label">买点信号</div><div className="mc-value"><SignalBadge label={main?.buySignal ?? detail?.watchlist_buy_signal} /></div></div>
                        <div className="drawer-mini-cell"><div className="mc-label">卖点信号</div><div className="mc-value"><SignalBadge label={main?.sellSignal ?? detail?.watchlist_sell_signal} /></div></div>
                        <div className="drawer-mini-cell"><div className="mc-label">观察天数</div><div className="mc-value numeric">{poolDay ?? '--'}</div></div>
                        <div className="drawer-mini-cell"><div className="mc-label">观察池</div><div className="mc-value">{main?.inWatchlist ? '在池中' : '未入池'}</div></div>
                        <div className="drawer-mini-cell"><div className="mc-label">入池收益</div><div className={`mc-value numeric ${pctCls(watchlistGain)}`}>{fmtRatio(watchlistGain)}</div></div>
                        <div className="drawer-mini-cell"><div className="mc-label">最高收益</div><div className="mc-value numeric c-up">{watchlistMaxGain != null ? `+${(watchlistMaxGain * 100).toFixed(2)}%` : '--'}</div></div>
                      </div>
                    </div>
                    {/* Right: Risk */}
                    <div className="drawer-col-card">
                      <div className="col-title">风控概况</div>
                      {risk ? (
                        <>
                          <div className="drawer-risk-header">
                            <span className="risk-total numeric" style={{ color: risk.riskScoreTotal != null ? (risk.riskScoreTotal >= 90 ? '#DC2626' : risk.riskScoreTotal >= 70 ? '#F59E0B' : '#8c909f') : undefined }}>
                              {risk.riskScoreTotal != null ? risk.riskScoreTotal.toFixed(1) : '--'}
                            </span>
                            <span className={`risk-badge risk-badge-${risk.riskLevel === 'low' ? 'low' : risk.riskLevel === 'medium' ? 'medium' : 'high'}`}>
                              {risk.riskLevel === 'low' ? '低风险' : risk.riskLevel === 'medium' ? '中风险' : risk.riskLevel === 'high' ? '高风险' : risk.riskLevel ?? '--'}
                            </span>
                            <span style={{ fontSize: '10px', color: '#8c909f' }}>
                              {risk.tradeAllowed ? '✅ 允许交易' : `🚫 ${risk.blockReason ?? '限制交易'}`}
                            </span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#8c909f', marginBottom: '4px' }}>
                            仓位系数 <span className="numeric">{risk.capMultiplier != null ? `${risk.capMultiplier.toFixed(2)}x` : '--'}</span>
                          </div>
                          <RiskDimBar label="财务" score={riskFinancial} />
                          <RiskDimBar label="市场" score={riskMarket} />
                          <RiskDimBar label="事件" score={riskEvent} />
                          <RiskDimBar label="合规" score={riskCompliance} />
                        </>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#8c909f', padding: '8px 0' }}>暂无风控数据</div>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* ═══ ⑥ AI Analysis ═══ */}
              <section className="drawer-section-compact" style={{ padding: '0 16px' }}>
                <div className="drawer-section-title" style={{ fontSize: '11px', textTransform: 'uppercase' as const, color: '#8c909f', letterSpacing: '0.05em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  AI 分析
                  {aiLoading ? <div className="spinner drawer-inline-spinner" /> : <span className="page-badge badge-yellow" style={{ fontSize: '9px' }}>演示数据</span>}
                </div>
                {aiLoading ? (
                  <div style={{ fontSize: '12px', color: '#8c909f', padding: '8px 0' }}>正在加载...</div>
                ) : ai ? (
                  <div className="drawer-card drawer-ai-card">
                    <div className="drawer-ai-columns">
                      <div className="drawer-ai-column">
                        <div className="drawer-ai-title positive">积极因素</div>
                        {ai.bull_factors.map(f => <div key={f} className="drawer-ai-item"><span className="drawer-ai-bullet positive">•</span><span>{f}</span></div>)}
                      </div>
                      <div className="drawer-ai-column">
                        <div className="drawer-ai-title negative">风险因素</div>
                        {ai.bear_factors.map(f => <div key={f} className="drawer-ai-item"><span className="drawer-ai-bullet negative">•</span><span>{f}</span></div>)}
                      </div>
                    </div>
                    <div className="drawer-ai-footer">
                      <div className="drawer-ai-action-row">
                        <span className="drawer-flat-label">建议</span>
                        <span className="status-badge tag-pill drawer-pill drawer-pill-neutral">{ai.advice}</span>
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

              {/* ═══ ⑦ Financials (collapsible) ═══ */}
              <section className="drawer-section-compact" style={{ padding: '0 16px' }}>
                <div
                  className="drawer-section-title drawer-section-toggle"
                  style={{ fontSize: '11px', textTransform: 'uppercase' as const, color: '#8c909f', letterSpacing: '0.05em', marginBottom: '4px', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setFinOpen(v => !v)}
                >
                  财务概览 <span className={`toggle-arrow${finOpen ? ' open' : ''}`}>▶</span>
                </div>
                {finOpen && (
                  <div className="drawer-card drawer-table-card">
                    {detailLoading ? (
                      <div className="drawer-inline-loading"><div className="spinner" /><span>加载中...</span></div>
                    ) : financialRows.length === 0 ? (
                      <div className="table-empty">暂无财务数据</div>
                    ) : (
                      <div className="table-shell">
                        <table className="data-table">
                          <thead><tr><th>年度</th><th className="right">营收(亿)</th><th className="right">利润(亿)</th><th className="right">净利润(亿)</th></tr></thead>
                          <tbody>
                            {financialRows.map((r: FinancialYear) => (
                              <tr key={r.year}>
                                <td className="numeric">{r.year}</td>
                                <td className="right numeric">{fmtYi(r.revenue_yi)}</td>
                                <td className="right numeric">{fmtYi(r.total_profit_yi)}</td>
                                <td className="right numeric">{fmtYi(r.net_income_yi)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>

            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
