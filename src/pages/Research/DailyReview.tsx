import { useEffect, useState } from 'react'
import { fetchDailyReview } from '../../api'

const IDX_NAMES: Record<string, string> = {
  '000001.SH': '上证指数',
  '399001.SZ': '深证成指',
  '399006.SZ': '创业板指',
  '000688.SH': '科创50',
}

const REGIME_COLORS: Record<string, { bg: string; color: string }> = {
  strong: { bg: 'rgba(255,84,81,0.15)', color: '#ff5451' },
  bullish: { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
  neutral: { bg: 'rgba(234,179,8,0.15)', color: '#EAB308' },
  bearish: { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6' },
  weak: { bg: 'rgba(34,197,94,0.15)', color: '#22C55E' },
}

const REGIME_CN: Record<string, string> = {
  strong: '强势普涨', bullish: '偏强震荡', neutral: '震荡整理',
  bearish: '偏弱震荡', weak: '弱势普跌',
}

function fmtMoney(v: number | null | undefined) {
  if (v == null) return '-'
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

function fmtPct(v: number | null | undefined) {
  if (v == null) return '-'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function pctColor(v: number | null | undefined) {
  if (v == null) return undefined
  return v > 0 ? '#ff5451' : v < 0 ? '#22C55E' : '#c2c6d6'
}

function RegimeBadge({ regime }: { regime: string }) {
  const style = REGIME_COLORS[regime] || REGIME_COLORS.neutral
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '3px',
      fontSize: '11px', fontWeight: 600,
      background: style.bg, color: style.color,
    }}>
      {REGIME_CN[regime] || regime}
    </span>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ marginBottom: '12px', flex: 'none' }}>
      <div className="card-header" style={{ padding: '8px 16px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#c2c6d6' }}>{title}</span>
      </div>
      <div className="card-body" style={{ padding: '0 16px 12px' }}>
        {children}
      </div>
    </section>
  )
}

function generateMarkdown(data: any): string {
  const d = data
  const td = d.trade_date || '-'
  const regime = d.current_regime || '-'
  const limit = d.regime_limit || '-'
  let md = `# 每日复盘 ${td}\n\n`
  md += `**市场环境**: ${REGIME_CN[regime] || regime} | **仓位上限**: ${limit}%\n\n`

  // 市场环境
  md += `## 1. 市场环境\n`
  md += `| 日期 | 得分 | 环境 | ADR | 均涨幅 | 中位涨幅 |\n`
  md += `|------|------|------|-----|--------|----------|\n`
  for (const r of d.market_env || []) {
    const dt = String(r.trade_date || '').slice(5)
    md += `| ${dt} | ${Number(r.breadth_score || 0).toFixed(1)} | ${r.market_regime || '-'} | ${Number(r.adr || 0).toFixed(3)} | ${fmtPct(r.avg_pct_chg)} | ${fmtPct(r.median_pct_chg)} |\n`
  }

  // 大盘指数
  md += `\n## 2. 大盘指数\n`
  md += `| 日期 | 指数 | 收盘 | 涨跌% |\n`
  md += `|------|------|------|-------|\n`
  for (const r of d.index || []) {
    const dt = String(r.trade_date || '').slice(5)
    md += `| ${dt} | ${IDX_NAMES[r.ts_code] || r.ts_code} | ${Number(r.close || 0).toFixed(2)} | ${fmtPct(r.pct_chg)} |\n`
  }

  // 当前持仓
  md += `\n## 3. 当前持仓\n`
  if ((d.positions || []).length === 0) {
    md += `（空仓）\n`
  } else {
    md += `| 代码 | 名称 | 策略 | 开仓日 | 持天数 | 成本 | 市值 | 浮盈 | 浮盈% | 卖出信号 |\n`
    md += `|------|------|------|--------|--------|------|------|------|-------|----------|\n`
    for (const r of d.positions || []) {
      const sell = r.sell_signal || ''
      md += `| ${r.ts_code} | ${r.stock_name || '-'} | ${r.strategy} | ${r.open_date} | ${r.hold_days} | ${fmtMoney(r.cost_amount)} | ${fmtMoney(r.market_value)} | ${fmtMoney(r.unrealized_pnl)} | ${fmtPct(r.unrealized_pnl_pct)} | ${sell} |\n`
    }
  }

  // 已平仓
  md += `\n## 4. 已平仓\n`
  if ((d.closed || []).length === 0) {
    md += `（暂无已平仓记录）\n`
  } else {
    md += `| 名称 | 策略 | 开仓→平仓 | 持天数 | 盈亏 | 盈亏% |\n`
    md += `|------|------|-----------|--------|------|-------|\n`
    for (const r of d.closed || []) {
      md += `| ${r.stock_name || '-'} | ${r.strategy} | ${r.open_date}→${r.close_date} | ${r.hold_days} | ${fmtMoney(r.realized_pnl)} | ${fmtPct(r.pnl_pct)} |\n`
    }
  }

  // 订单流水
  md += `\n## 5. 订单流水\n`
  if ((d.orders || []).length === 0) {
    md += `（无订单）\n`
  } else {
    md += `| ID | 日期 | 方向 | 名称 | 策略 | 信号 | 状态 | 金额 |\n`
    md += `|----|------|------|------|------|------|------|------|\n`
    for (const r of d.orders || []) {
      md += `| ${r.id} | ${r.trade_date} | ${r.direction} | ${r.stock_name || '-'} | ${r.strategy} | ${r.signal_type || '-'} | ${r.approval_status || r.status} | ${fmtMoney(r.fill_amount || r.order_amount)} |\n`
    }
  }

  // NAV走势
  md += `\n## 6. NAV走势\n`
  md += `| 日期 | NAV | 现金 | 市值 | 仓位% | 持仓 | 累计% |\n`
  md += `|------|-----|------|------|-------|------|-------|\n`
  for (const r of d.nav || []) {
    md += `| ${r.snap_date} | ${fmtMoney(r.total_nav)} | ${fmtMoney(r.cash_balance)} | ${fmtMoney(r.market_value)} | ${r.position_pct || 0}% | ${r.open_count || 0} | ${fmtPct(r.total_pnl_pct)} |\n`
  }

  // 策略入池
  md += `\n## 7. 策略入池\n`
  md += `| 日期 | 环境 | 策略 | 数量 |\n`
  md += `|------|------|------|------|\n`
  for (const r of d.watchlist_stats || []) {
    md += `| ${r.entry_date} | ${r.regime || '-'} | ${r.strategy} | ${r.cnt} |\n`
  }

  // 风控
  md += `\n## 8. 风控状态\n`
  md += `- 审批模式: ${JSON.stringify(d.risk_config?.approval_mode || '-')}\n`
  md += `- 环境: ${regime} → 仓位上限: ${limit}%\n`

  // 待处理
  md += `\n## 9. 待处理\n`
  const pa = d.pending_approvals || []
  const ss = d.sell_signals || []
  if (pa.length === 0 && ss.length === 0) {
    md += `✅ 无待处理事项\n`
  } else {
    if (pa.length > 0) {
      md += `- ${pa.length}笔待审批:\n`
      for (const r of pa) md += `  - ${r.direction} ${r.stock_name} (${r.strategy}) ${fmtMoney(r.order_amount)}\n`
    }
    if (ss.length > 0) {
      md += `- ${ss.length}只有卖出信号:\n`
      for (const r of ss) md += `  - ${r.stock_name} → ${r.sell_signal}\n`
    }
  }

  return md
}

export default function DailyReview() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchDailyReview()
      .then(d => { setData(d); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleCopy() {
    if (!data) return
    const md = generateMarkdown(data)
    await navigator.clipboard.writeText(md)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="page-loading"><div className="spinner" />加载复盘数据中...</div>
  if (error) return <div className="page-error"><div className="page-error-msg">复盘数据加载失败</div><div className="page-error-detail">{error}</div></div>
  if (!data) return null

  const regime = data.current_regime || 'neutral'
  const positions = data.positions || []
  const closed = data.closed || []
  const orders = data.orders || []
  const nav = data.nav || []

  return (
    <div style={{ display: 'block' }}>
      {/* 顶部信息栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#e2e4ea' }}>
          {data.trade_date}
        </span>
        <RegimeBadge regime={regime} />
        <span style={{ fontSize: '12px', color: '#8b8fa3' }}>
          仓位上限 {data.regime_limit}%
        </span>
        {nav.length > 0 && (
          <span style={{ fontSize: '12px', color: pctColor(nav[0].total_pnl_pct), fontWeight: 600 }}>
            NAV {fmtMoney(nav[0].total_nav)} ({fmtPct(nav[0].total_pnl_pct)})
          </span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          style={{
            marginLeft: 'auto', padding: '4px 12px', fontSize: '12px', fontWeight: 600,
            background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
            color: copied ? '#22C55E' : '#3B82F6',
            border: 'none', borderRadius: '3px', cursor: 'pointer',
          }}
        >
          {copied ? '✅ 已复制' : '📋 复制Markdown报告'}
        </button>
      </div>

      {/* 模块1: 市场环境 */}
      <SectionCard title="市场环境（最近5天）">
        <table className="data-table" style={{ tableLayout: 'auto', width: '100%' }}>
          <thead><tr>
            <th>日期</th><th style={{ textAlign: 'right' }}>得分</th><th>环境</th>
            <th style={{ textAlign: 'right' }}>ADR</th><th style={{ textAlign: 'right' }}>均涨幅</th>
            <th style={{ textAlign: 'right' }}>中位涨幅</th>
          </tr></thead>
          <tbody>
            {(data.market_env || []).map((r: any, i: number) => {
              const isToday = String(r.trade_date) === data.trade_date
              return (
                <tr key={i} style={isToday ? { background: 'rgba(59,130,246,0.08)' } : undefined}>
                  <td>{String(r.trade_date || '').slice(5)}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.breadth_score || 0).toFixed(1)}</td>
                  <td><RegimeBadge regime={r.market_regime || 'neutral'} /></td>
                  <td style={{ textAlign: 'right' }}>{Number(r.adr || 0).toFixed(3)}</td>
                  <td style={{ textAlign: 'right', color: pctColor(r.avg_pct_chg) }}>{fmtPct(r.avg_pct_chg)}</td>
                  <td style={{ textAlign: 'right', color: pctColor(r.median_pct_chg) }}>{fmtPct(r.median_pct_chg)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </SectionCard>

      {/* 模块2: 大盘指数 */}
      <SectionCard title="大盘指数（最近3天）">
        <table className="data-table" style={{ tableLayout: 'auto', width: '100%' }}>
          <thead><tr>
            <th>日期</th><th>指数</th><th style={{ textAlign: 'right' }}>收盘</th>
            <th style={{ textAlign: 'right' }}>涨跌%</th>
          </tr></thead>
          <tbody>
            {(data.index || []).map((r: any, i: number) => (
              <tr key={i}>
                <td>{String(r.trade_date || '').slice(5)}</td>
                <td>{IDX_NAMES[r.ts_code] || r.ts_code}</td>
                <td style={{ textAlign: 'right' }}>{Number(r.close || 0).toFixed(2)}</td>
                <td style={{ textAlign: 'right', color: pctColor(r.pct_chg) }}>{fmtPct(r.pct_chg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      {/* 模块3: 当前持仓 */}
      <SectionCard title={`当前持仓（${positions.length}只）`}>
        {positions.length === 0 ? (
          <div style={{ padding: '16px', color: '#8b8fa3', textAlign: 'center' }}>空仓</div>
        ) : (
          <>
            <div style={{ fontSize: '12px', color: '#8b8fa3', marginBottom: '8px' }}>
              总成本 {fmtMoney(positions.reduce((s: number, r: any) => s + (r.cost_amount || 0), 0))}
              {' | '}总市值 {fmtMoney(positions.reduce((s: number, r: any) => s + (r.market_value || 0), 0))}
              {' | '}总浮盈{' '}
              <span style={{ color: pctColor(positions.reduce((s: number, r: any) => s + (r.unrealized_pnl || 0), 0)) }}>
                {fmtMoney(positions.reduce((s: number, r: any) => s + (r.unrealized_pnl || 0), 0))}
              </span>
            </div>
            <table className="data-table" style={{ tableLayout: 'auto', width: '100%' }}>
              <thead><tr>
                <th></th><th>代码</th><th>名称</th><th>策略</th><th>开仓日</th>
                <th style={{ textAlign: 'right' }}>开仓价</th><th style={{ textAlign: 'right' }}>持天数</th>
                <th style={{ textAlign: 'right' }}>成本</th><th style={{ textAlign: 'right' }}>市值</th>
                <th style={{ textAlign: 'right' }}>浮盈</th><th style={{ textAlign: 'right' }}>浮盈%</th>
                <th>概念</th><th>信号</th>
              </tr></thead>
              <tbody>
                {positions.map((r: any, i: number) => {
                  const pnlPct = r.unrealized_pnl_pct || 0
                  const icon = pnlPct < -5 ? '🔴' : pnlPct < -2 ? '🟡' : pnlPct > 2 ? '🟢' : '⚪'
                  return (
                    <tr key={i}>
                      <td>{icon}</td>
                      <td>{r.ts_code}</td>
                      <td>{r.stock_name || '-'}</td>
                      <td>{r.strategy}</td>
                      <td>{r.open_date}</td>
                      <td style={{ textAlign: 'right' }}>{Number(r.open_price || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{r.hold_days}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMoney(r.cost_amount)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMoney(r.market_value)}</td>
                      <td style={{ textAlign: 'right', color: pctColor(r.unrealized_pnl) }}>{fmtMoney(r.unrealized_pnl)}</td>
                      <td style={{ textAlign: 'right', color: pctColor(pnlPct), fontWeight: 600 }}>{fmtPct(pnlPct)}</td>
                      <td style={{ fontSize: '11px', color: '#8b8fa3' }}>{r.concept || ''}</td>
                      <td>{r.sell_signal ? <span style={{ color: '#F59E0B', fontWeight: 600 }}>⚠️{r.sell_signal}</span> : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </SectionCard>

      {/* 模块4: 已平仓 */}
      <SectionCard title={`已平仓记录（最近10笔）`}>
        {closed.length === 0 ? (
          <div style={{ padding: '16px', color: '#8b8fa3', textAlign: 'center' }}>暂无已平仓记录</div>
        ) : (
          <>
            <div style={{ fontSize: '12px', color: '#8b8fa3', marginBottom: '8px' }}>
              盈{closed.filter((r: any) => (r.realized_pnl || 0) > 0).length}
              {' '}亏{closed.filter((r: any) => (r.realized_pnl || 0) <= 0).length}
              {' | '}合计{' '}
              <span style={{ color: pctColor(closed.reduce((s: number, r: any) => s + (r.realized_pnl || 0), 0)) }}>
                {fmtMoney(closed.reduce((s: number, r: any) => s + (r.realized_pnl || 0), 0))}
              </span>
            </div>
            <table className="data-table" style={{ tableLayout: 'auto', width: '100%' }}>
              <thead><tr>
                <th></th><th>名称</th><th>策略</th><th>开仓→平仓</th>
                <th style={{ textAlign: 'right' }}>持天数</th>
                <th style={{ textAlign: 'right' }}>盈亏</th><th style={{ textAlign: 'right' }}>盈亏%</th>
              </tr></thead>
              <tbody>
                {closed.map((r: any, i: number) => (
                  <tr key={i}>
                    <td>{(r.realized_pnl || 0) > 0 ? '✅' : '❌'}</td>
                    <td>{r.stock_name || '-'}</td>
                    <td>{r.strategy}</td>
                    <td>{r.open_date}→{r.close_date}</td>
                    <td style={{ textAlign: 'right' }}>{r.hold_days}</td>
                    <td style={{ textAlign: 'right', color: pctColor(r.realized_pnl) }}>{fmtMoney(r.realized_pnl)}</td>
                    <td style={{ textAlign: 'right', color: pctColor(r.pnl_pct), fontWeight: 600 }}>{fmtPct(r.pnl_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </SectionCard>

      {/* 模块5: 订单流水 */}
      <SectionCard title="订单流水（最近2天）">
        {orders.length === 0 ? (
          <div style={{ padding: '16px', color: '#8b8fa3', textAlign: 'center' }}>无订单</div>
        ) : (
          <table className="data-table" style={{ tableLayout: 'auto', width: '100%' }}>
            <thead><tr>
              <th>ID</th><th>日期</th><th>方向</th><th>名称</th><th>策略</th>
              <th>信号</th><th>状态</th><th style={{ textAlign: 'right' }}>金额</th><th>拒绝原因</th>
            </tr></thead>
            <tbody>
              {orders.map((r: any, i: number) => (
                <tr key={i}>
                  <td>{r.id}</td>
                  <td>{String(r.trade_date || '').slice(5)}</td>
                  <td style={{ color: r.direction === 'BUY' ? '#ff5451' : '#22C55E', fontWeight: 600 }}>{r.direction}</td>
                  <td>{r.stock_name || '-'}</td>
                  <td>{r.strategy}</td>
                  <td style={{ fontSize: '11px' }}>{r.signal_type || '-'}</td>
                  <td>{r.approval_status || r.status}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(r.fill_amount || r.order_amount)}</td>
                  <td style={{ fontSize: '11px', color: '#F59E0B' }}>{r.reject_reason || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* 模块6: NAV走势 */}
      <SectionCard title="NAV走势">
        {nav.length === 0 ? (
          <div style={{ padding: '16px', color: '#8b8fa3', textAlign: 'center' }}>暂无数据</div>
        ) : (
          <table className="data-table" style={{ tableLayout: 'auto', width: '100%' }}>
            <thead><tr>
              <th>日期</th><th style={{ textAlign: 'right' }}>NAV</th><th style={{ textAlign: 'right' }}>现金</th>
              <th style={{ textAlign: 'right' }}>市值</th><th style={{ textAlign: 'right' }}>仓位%</th>
              <th style={{ textAlign: 'right' }}>持仓</th><th style={{ textAlign: 'right' }}>累计%</th>
            </tr></thead>
            <tbody>
              {nav.map((r: any, i: number) => (
                <tr key={i}>
                  <td>{r.snap_date}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(r.total_nav)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(r.cash_balance)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(r.market_value)}</td>
                  <td style={{ textAlign: 'right' }}>{r.position_pct || 0}%</td>
                  <td style={{ textAlign: 'right' }}>{r.open_count || 0}</td>
                  <td style={{ textAlign: 'right', color: pctColor(r.total_pnl_pct), fontWeight: 600 }}>{fmtPct(r.total_pnl_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* 模块7+8+9: 策略入池 + 风控 + 待处理 — 两列布局 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {/* 策略入池 */}
        <SectionCard title="策略入池统计（最近5天）">
          <table className="data-table" style={{ tableLayout: 'auto', width: '100%' }}>
            <thead><tr><th>日期</th><th>环境</th><th>策略</th><th style={{ textAlign: 'right' }}>数量</th></tr></thead>
            <tbody>
              {(data.watchlist_stats || []).map((r: any, i: number) => (
                <tr key={i}>
                  <td>{String(r.entry_date || '').slice(5)}</td>
                  <td><RegimeBadge regime={r.regime || 'neutral'} /></td>
                  <td>{r.strategy}</td>
                  <td style={{ textAlign: 'right' }}>{r.cnt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        {/* 风控 + 待处理 */}
        <div>
          <SectionCard title="风控状态">
            <div style={{ fontSize: '13px', lineHeight: '1.8', color: '#c2c6d6' }}>
              <div>审批模式: <span style={{ fontWeight: 600 }}>{JSON.stringify(data.risk_config?.approval_mode || '-').replace(/"/g, '')}</span></div>
              <div>环境: <RegimeBadge regime={regime} /> → 仓位上限 <span style={{ fontWeight: 600 }}>{data.regime_limit}%</span></div>
              {nav.length > 0 && (
                <div>NAV: <span style={{ fontWeight: 600, color: pctColor(nav[0].total_pnl_pct) }}>{fmtMoney(nav[0].total_nav)} ({fmtPct(nav[0].total_pnl_pct)})</span></div>
              )}
              <div>最大回撤阈值: 8%</div>
            </div>
          </SectionCard>
          <SectionCard title="待处理事项">
            {(data.pending_approvals || []).length === 0 && (data.sell_signals || []).length === 0 ? (
              <div style={{ padding: '8px 0', color: '#22C55E', fontSize: '13px' }}>✅ 无待处理事项</div>
            ) : (
              <div style={{ fontSize: '13px', color: '#c2c6d6' }}>
                {(data.pending_approvals || []).length > 0 && (
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ color: '#ff5451', fontWeight: 600 }}>🔴 {data.pending_approvals.length}笔待审批</span>
                    {data.pending_approvals.map((r: any, i: number) => (
                      <div key={i} style={{ paddingLeft: '16px', fontSize: '12px' }}>
                        {r.direction} {r.stock_name} ({r.strategy}) {fmtMoney(r.order_amount)}
                      </div>
                    ))}
                  </div>
                )}
                {(data.sell_signals || []).length > 0 && (
                  <div>
                    <span style={{ color: '#F59E0B', fontWeight: 600 }}>⚠️ {data.sell_signals.length}只有卖出信号</span>
                    {data.sell_signals.map((r: any, i: number) => (
                      <div key={i} style={{ paddingLeft: '16px', fontSize: '12px' }}>
                        {r.stock_name} → {r.sell_signal}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
