import { useCallback, useEffect, useState } from 'react'
import { fetchRiskOverview } from '../../api'

// ─── Types ───────────────────────────────────────────────────────────────────

interface OverviewData {
  regime: {
    market_regime: string
    position_limit: number
    current_market_value: number
    current_position_pct: number
    regime_available: number
    status: string
    adr: number | null
    up_stocks: number
    down_stocks: number
    limit_up: number
    limit_down: number
    adr_score: number | null
    tdr_score: number | null
    up5_score: number | null
  } | null
  risk_guard: {
    buy_blocked: boolean
    buy_block_reasons?: string[]
    drawdown?: { triggered: boolean; drawdown: number; threshold: number; peak_nav: number; current_nav: number }
    consecutive_losses?: { triggered: boolean; consecutive_losses: number; threshold: number }
    daily_limits?: { remaining_count: number; remaining_amount: number; today_count: number; today_amount: number; max_count: number; max_amount: number }
  }
  pre_trade: { rejected_count: number; rejected_details: string[] }
  approval: { auto_approved: number; pending_manual: number; rejected_risk: number; filled: number; total: number }
  gate: { blocked_count: number; block_reasons: string[] }
  nav_history: Array<{ date: string; nav: number; daily_pnl_pct: number; cum_pnl_pct: number }>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const REGIME_CN: Record<string, string> = {
  strong: '强势', bullish: '偏多', neutral: '震荡', bearish: '偏弱', weak: '极弱',
}

const GREEN = '#4ecf7a'
const YELLOW = '#f0b840'
const RED = '#e74c3c'
const BLUE = '#3498db'

function regimeColor(regime: string) {
  if (regime === 'strong' || regime === 'bullish') return GREEN
  if (regime === 'neutral') return YELLOW
  return RED
}

function pctBar(pct: number, limit: number) {
  const ratio = limit > 0 ? pct / limit : 0
  const color = ratio < 0.5 ? GREEN : ratio < 0.8 ? YELLOW : RED
  const width = Math.min(ratio * 100, 100)
  return (
    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 8, width: '100%', marginTop: 6 }}>
      <div style={{ background: color, borderRadius: 4, height: 8, width: `${width}%`, transition: 'width 0.3s' }} />
    </div>
  )
}

// ─── Status Cards ────────────────────────────────────────────────────────────

function StatusCard({ title, mainValue, subValue, color }: {
  title: string; mainValue: string; subValue: string; color: string
}) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 8, padding: '14px 16px',
      border: color === RED ? `1px solid ${RED}33` : '1px solid var(--border-default)',
    }}>
      <div style={{ fontSize: 11, color: '#7a8a9a', fontWeight: 600, letterSpacing: '1px', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color, lineHeight: 1.3 }}>{mainValue}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{subValue}</div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function RiskDefenseOverview() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetchRiskOverview()
      setData(resp as unknown as OverviewData)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="page-banner">加载风控总览...</div>
  if (!data) return <div className="page-banner warning">风控总览数据加载失败</div>

  const r = data.regime
  const rg = data.risk_guard
  const dd = rg?.drawdown
  const cl = rg?.consecutive_losses
  const dl = rg?.daily_limits
  const pt = data.pre_trade
  const ap = data.approval

  // Status card values
  const regimeLabel = r ? REGIME_CN[r.market_regime] || r.market_regime : '未知'
  const regimeClr = r ? regimeColor(r.market_regime) : YELLOW
  const guardClr = rg?.buy_blocked ? RED : GREEN
  const preTradeClr = pt.rejected_count > 0 ? YELLOW : GREEN
  const approvalClr = (ap?.pending_manual ?? 0) > 0 ? YELLOW : GREEN

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 4px' }}>
      {/* ── Top: 4 status cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <StatusCard
          title="市场环境"
          mainValue={regimeLabel}
          subValue={r ? `仓位上限 ${(r.position_limit * 100).toFixed(0)}%` : '--'}
          color={regimeClr}
        />
        <StatusCard
          title="组合风控"
          mainValue={rg?.buy_blocked ? '买入已拦截' : '正常'}
          subValue={dd ? `回撤 ${(dd.drawdown != null && !isNaN(dd.drawdown) ? (dd.drawdown * 100).toFixed(1) : '0.0')}% | 连亏 ${cl?.consecutive_losses ?? 0}笔` : '--'}
          color={guardClr}
        />
        <StatusCard
          title="事前检查"
          mainValue={pt.rejected_count > 0 ? `今日拦截 ${pt.rejected_count} 笔` : '全部通过'}
          subValue={pt.rejected_count > 0 ? pt.rejected_details.slice(0, 2).join(', ') : '无风控拦截'}
          color={preTradeClr}
        />
        <StatusCard
          title="订单审批"
          mainValue={`通${(ap?.auto_approved ?? 0) + (ap?.filled ?? 0)} / 审${ap?.pending_manual ?? 0} / 拒${ap?.rejected_risk ?? 0}`}
          subValue={`今日 ${ap?.total ?? 0} 笔`}
          color={approvalClr}
        />
      </div>

      {/* ── Bottom: 2-column detail ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left Top: Regime */}
        <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 16, border: '1px solid var(--border-default)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#7a8a9a', letterSpacing: '1px', marginBottom: 12 }}>REGIME 仓位控制</div>
          {r ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16, color: regimeClr }}>
                  {r.market_regime === 'strong' || r.market_regime === 'bullish' ? '▲' : r.market_regime === 'neutral' ? '■' : '▼'}
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: regimeClr }}>{regimeLabel}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>（{r.market_regime}）</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                持仓 {(r.current_position_pct * 100).toFixed(1)}% / 上限 {(r.position_limit * 100).toFixed(0)}%
              </div>
              {pctBar(r.current_position_pct, r.position_limit)}
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                可用额度: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{(r.regime_available / 10000).toFixed(1)}万</span>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                <span>ADR分: {r.adr_score?.toFixed(1) ?? '--'}</span>
                <span>TDR分: {r.tdr_score?.toFixed(1) ?? '--'}</span>
                <span>UP5分: {r.up5_score?.toFixed(1) ?? '--'}</span>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                <span>涨{r.up_stocks} / 跌{r.down_stocks}</span>
                <span>涨停{r.limit_up} / 跌停{r.limit_down}</span>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>暂无市场环境数据</div>
          )}
        </div>

        {/* Right Top: Risk Guard */}
        <div style={{
          background: 'var(--bg-card)', borderRadius: 8, padding: 16,
          border: rg?.buy_blocked ? `1px solid ${RED}55` : '1px solid var(--border-default)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#7a8a9a', letterSpacing: '1px', marginBottom: 12 }}>RISK GUARD 组合风控</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Drawdown */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {dd?.triggered ? '🚫' : '✅'} 最大回撤
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: dd?.triggered ? RED : 'var(--text-primary)' }}>
                {dd && dd.drawdown != null && !isNaN(dd.drawdown) ? `${(dd.drawdown * 100).toFixed(1)}%` : '0.0%'} / {dd?.threshold != null ? `${(dd.threshold * 100).toFixed(0)}%` : '8%'}
              </span>
            </div>
            {/* Consecutive Loss */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {cl?.triggered ? '🚫' : '✅'} 连续亏损
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: cl?.triggered ? RED : 'var(--text-primary)' }}>
                {cl ? `${cl.consecutive_losses}笔` : '0笔'} / {cl?.threshold ?? 3}笔
              </span>
            </div>
            {/* Daily Buy Count */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>📊 今日买入笔数</span>
              <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                {dl ? `${dl.today_count}` : '0'} / {dl?.max_count ?? 3}
              </span>
            </div>
            {/* Daily Buy Amount */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>📊 今日买入金额</span>
              <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                {dl ? `${(dl.today_amount / 10000).toFixed(0)}万` : '0'} / {dl ? `${(dl.max_amount / 10000).toFixed(0)}万` : '200万'}
              </span>
            </div>
          </div>
          {rg?.buy_blocked && rg.buy_block_reasons && rg.buy_block_reasons.length > 0 && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: `${RED}15`, borderRadius: 4, fontSize: 12, color: RED }}>
              拦截原因: {rg.buy_block_reasons.join('; ')}
            </div>
          )}
        </div>

        {/* Left Bottom: Gate Blocks */}
        <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 16, border: '1px solid var(--border-default)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#7a8a9a', letterSpacing: '1px', marginBottom: 12 }}>GATE 拦截清单</div>
          {data.gate.blocked_count > 0 ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                今日 <span style={{ color: RED, fontWeight: 600 }}>{data.gate.blocked_count}</span> 只股票被拦截
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.gate.block_reasons.filter(Boolean).map((reason, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '3px 0' }}>
                    • {reason}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>今日无拦截</div>
          )}
        </div>

        {/* Right Bottom: Order Status */}
        <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 16, border: '1px solid var(--border-default)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#7a8a9a', letterSpacing: '1px', marginBottom: 12 }}>今日订单状态</div>
          {(ap?.total ?? 0) > 0 ? (
            <>
              {/* Status bar */}
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                {ap.auto_approved > 0 && <div style={{ flex: ap.auto_approved, background: GREEN }} />}
                {ap.pending_manual > 0 && <div style={{ flex: ap.pending_manual, background: YELLOW }} />}
                {ap.rejected_risk > 0 && <div style={{ flex: ap.rejected_risk, background: RED }} />}
                {ap.filled > 0 && <div style={{ flex: ap.filled, background: BLUE }} />}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, flexShrink: 0 }} />
                  <span style={{ color: 'var(--text-secondary)' }}>自动通过</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--text-primary)' }}>{ap.auto_approved}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: YELLOW, flexShrink: 0 }} />
                  <span style={{ color: 'var(--text-secondary)' }}>待人工审批</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--text-primary)' }}>{ap.pending_manual}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: RED, flexShrink: 0 }} />
                  <span style={{ color: 'var(--text-secondary)' }}>风控拒绝</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--text-primary)' }}>{ap.rejected_risk}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: BLUE, flexShrink: 0 }} />
                  <span style={{ color: 'var(--text-secondary)' }}>已成交</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--text-primary)' }}>{ap.filled}</span>
                </div>
              </div>
              {/* Pre-trade rejection details */}
              {pt.rejected_count > 0 && pt.rejected_details.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>事前拦截详情:</div>
                  {pt.rejected_details.map((d, i) => (
                    <div key={i}>• {d}</div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>今日无订单</div>
          )}
        </div>
      </div>
    </div>
  )
}
