import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { fetchDailyReview } from '../../api'

const IDX_NAMES: Record<string, string> = {
  '000001.SH': '上证指数', '399001.SZ': '深证成指',
  '399006.SZ': '创业板指', '000688.SH': '科创50',
}
const REGIME_CN: Record<string, string> = {
  strong: '强势普涨', bullish: '偏强震荡', neutral: '震荡整理',
  bearish: '偏弱震荡', weak: '弱势普跌',
}
const STRATEGY_CN: Record<string, string> = {
  VOL_SURGE: '连续放量', RETOC2: '异动反抽', PATTERN_T2UP9: '大涨蓄势',
  WEAK_BUY: '弱市吸筹', POOL_ENTRY: '入池买入',
}

function fm(v: number | null | undefined) {
  if (v == null) return '-'
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}
function fp(v: number | null | undefined) {
  if (v == null) return '-'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}
function toneClass(v: number | null | undefined) {
  if (v == null) return ''
  return v > 0 ? 'up' : v < 0 ? 'down' : ''
}
function cn(strategy: string) { return STRATEGY_CN[strategy] || strategy }
function ds(d: string | null | undefined) { return d ? String(d).slice(5) : '-' }

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="review-section-card">
      <div className="review-section-title">{title}</div>
      <div className="review-section-body">{children}</div>
    </div>
  )
}

function RegimeBadge({ regime }: { regime: string }) {
  return <span className={`regime-badge ${regime}`}>{REGIME_CN[regime] || regime}</span>
}

function generateMarkdown(data: any): string {
  const d = data
  const regime = d.current_regime || '-'
  const limit = d.regime_limit || '-'
  let md = `# 每日复盘 ${d.trade_date}\n\n`
  md += `**市场环境**: ${REGIME_CN[regime] || regime} | **仓位上限**: ${limit}%\n\n`

  md += `## 1. 市场环境\n| 日期 | 得分 | 环境 | ADR | 均涨幅 | 中位涨幅 |\n|------|------|------|-----|--------|----------|\n`
  for (const r of d.market_env || []) {
    md += `| ${ds(r.trade_date)} | ${Number(r.breadth_score || 0).toFixed(1)} | ${r.market_regime || '-'} | ${Number(r.adr || 0).toFixed(3)} | ${fp(r.avg_pct_chg)} | ${fp(r.median_pct_chg)} |\n`
  }

  md += `\n## 2. 大盘指数\n| 日期 | 指数 | 收盘 | 涨跌% |\n|------|------|------|-------|\n`
  for (const r of d.index || []) {
    md += `| ${ds(r.trade_date)} | ${IDX_NAMES[r.ts_code] || r.ts_code} | ${Number(r.close || 0).toFixed(2)} | ${fp(r.pct_chg)} |\n`
  }

  md += `\n## 3. 当前持仓\n`
  if (!(d.positions || []).length) { md += `（空仓）\n` } else {
    md += `| 代码 | 名称 | 策略 | 开仓日 | 持天数 | 成本 | 市值 | 浮盈 | 浮盈% | 卖出信号 |\n|------|------|------|--------|--------|------|------|------|-------|----------|\n`
    for (const r of d.positions || []) {
      md += `| ${r.ts_code} | ${r.stock_name || '-'} | ${cn(r.strategy)} | ${r.open_date} | ${r.hold_days} | ${fm(r.cost_amount)} | ${fm(r.market_value)} | ${fm(r.unrealized_pnl)} | ${fp((r.unrealized_pnl_pct || 0) * 100)} | ${r.sell_signal || ''} |\n`
    }
  }

  md += `\n## 4. 已平仓\n`
  if (!(d.closed || []).length) { md += `（暂无）\n` } else {
    md += `| 名称 | 策略 | 开仓→平仓 | 持天数 | 盈亏 | 盈亏% |\n|------|------|-----------|--------|------|-------|\n`
    for (const r of d.closed || []) { md += `| ${r.stock_name || '-'} | ${cn(r.strategy)} | ${r.open_date}→${r.close_date} | ${r.hold_days} | ${fm(r.realized_pnl)} | ${fp(r.pnl_pct)} |\n` }
  }

  md += `\n## 5. 订单流水\n`
  if (!(d.orders || []).length) { md += `（无订单）\n` } else {
    md += `| ID | 日期 | 方向 | 名称 | 策略 | 信号 | 状态 | 金额 |\n|----|------|------|------|------|------|------|------|\n`
    for (const r of d.orders || []) { md += `| ${r.id} | ${r.trade_date} | ${r.direction === 'BUY' ? '买入' : '卖出'} | ${r.stock_name || '-'} | ${cn(r.strategy)} | ${r.signal_type || '-'} | ${r.approval_status || r.status} | ${fm(r.fill_amount || r.order_amount)} |\n` }
  }

  md += `\n## 6. NAV走势\n| 日期 | NAV | 现金 | 市值 | 仓位% | 持仓 | 累计% |\n|------|-----|------|------|-------|------|-------|\n`
  for (const r of d.nav || []) { md += `| ${r.snap_date} | ${fm(r.total_nav)} | ${fm(r.cash_balance)} | ${fm(r.market_value)} | ${r.position_pct || 0}% | ${r.open_count || 0} | ${fp((r.total_pnl_pct || 0) * 100)} |\n` }

  md += `\n## 7. 策略入池\n| 日期 | 环境 | 策略 | 数量 |\n|------|------|------|------|\n`
  for (const r of d.watchlist_stats || []) { md += `| ${r.entry_date} | ${REGIME_CN[r.regime] || r.regime || '-'} | ${cn(r.strategy)} | ${r.cnt} |\n` }

  md += `\n## 8. 风控状态\n- 审批模式: ${JSON.stringify(d.risk_config?.approval_mode || '-').replace(/"/g, '')}\n- 环境: ${REGIME_CN[regime] || regime} → 仓位上限: ${limit}%\n`

  md += `\n## 9. 待处理\n`
  const pa = d.pending_approvals || [], ss = d.sell_signals || []
  if (!pa.length && !ss.length) { md += `✅ 无待处理事项\n` } else {
    if (pa.length) { md += `- ${pa.length}笔待审批:\n`; for (const r of pa) md += `  - ${r.direction === 'BUY' ? '买入' : '卖出'} ${r.stock_name} (${cn(r.strategy)}) ${fm(r.order_amount)}\n` }
    if (ss.length) { md += `- ${ss.length}只有卖出信号:\n`; for (const r of ss) md += `  - ${r.stock_name} → ${r.sell_signal}\n` }
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

  function handleCopy() {
    if (!data) return
    const md = generateMarkdown(data)
    try {
      const textarea = document.createElement('textarea')
      textarea.value = md
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      const blob = new Blob([md], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `复盘报告_${data.trade_date || ''}.md`; a.click()
      URL.revokeObjectURL(url)
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" />加载复盘数据中...</div>
  if (error) return <div className="page-error"><div className="page-error-msg">复盘数据加载失败</div><div className="page-error-detail">{error}</div></div>
  if (!data) return null

  const regime = data.current_regime || 'neutral'
  const positions = data.positions || []
  const closed = data.closed || []
  const orders = data.orders || []
  const nav = data.nav || []
  const navTop = nav[0]

  return (
    <div>
      {/* 顶部信息栏 */}
      <div className="review-header">
        <span className="review-header-date">{data.trade_date}</span>
        <RegimeBadge regime={regime} />
        <span className="review-header-info">仓位上限 {data.regime_limit}%</span>
        {navTop && (
          <span className={`review-header-nav ${toneClass(navTop.total_pnl_pct)}`}>
            NAV {fm(navTop.total_nav)} ({fp((navTop.total_pnl_pct || 0) * 100)})
          </span>
        )}
        <button type="button" className={`review-copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
          {copied ? '✅ 已复制' : '📋 复制Markdown报告'}
        </button>
      </div>

      {/* 复盘要点 */}
      <Card title="复盘要点">
        <div className="review-summary">
          {(() => {
            const env = data.market_env || []
            const today = env[0] || {}, yesterday = env[1] || {}
            const pa = data.pending_approvals || [], ss = data.sell_signals || []
            const totalPnl = positions.reduce((s: number, r: any) => s + (r.unrealized_pnl || 0), 0)
            const posPct = navTop?.position_pct || 0
            const lines: string[] = []

            if (today.market_regime && yesterday.market_regime) {
              if (today.market_regime !== yesterday.market_regime) {
                lines.push(`📊 市场环境从 ${REGIME_CN[yesterday.market_regime] || yesterday.market_regime} 转为 ${REGIME_CN[today.market_regime] || today.market_regime}，得分 ${Number(today.breadth_score || 0).toFixed(1)}`)
              } else {
                lines.push(`📊 市场维持 ${REGIME_CN[today.market_regime] || today.market_regime}，得分 ${Number(today.breadth_score || 0).toFixed(1)}，均涨幅 ${fp(today.avg_pct_chg)}`)
              }
            }
            if (!positions.length) { lines.push('💰 当前空仓') }
            else { lines.push(`💼 持仓 ${positions.length} 只，仓位 ${posPct}%（上限 ${data.regime_limit}%），总浮盈 ${fm(totalPnl)}（${fp((navTop?.total_pnl_pct || 0) * 100)}）`) }
            if (posPct > (data.regime_limit || 100)) { lines.push(`⚠️ 仓位 ${posPct}% 超过环境上限 ${data.regime_limit}%`) }
            for (const s of ss) {
              const pi = positions.find((p: any) => p.ts_code === s.ts_code)
              lines.push(`🔴 ${s.stock_name} 触发卖出信号 ${s.sell_signal}${pi ? '，浮盈 ' + fp((pi.unrealized_pnl_pct || 0) * 100) : ''}`)
            }
            for (const p of positions) { if ((p.unrealized_pnl_pct || 0) < -0.05) lines.push(`❗ ${p.stock_name} 浮亏 ${fp((p.unrealized_pnl_pct || 0) * 100)}，需关注止损`) }
            if (pa.length) lines.push(`📋 ${pa.length} 笔订单待审批`)
            const ts = (data.watchlist_stats || []).filter((r: any) => String(r.entry_date) === data.trade_date)
            if (ts.length) { lines.push(`🆕 今日入池 ${ts.reduce((s: number, r: any) => s + (r.cnt || 0), 0)} 只：${ts.map((r: any) => `${cn(r.strategy)} ${r.cnt}只`).join('、')}`) }
            else lines.push('📭 今日无新入池标的')
            if (!lines.length) lines.push('暂无特别事项')
            return lines.map((l, i) => <div key={i} className="review-summary-line">{l}</div>)
          })()}
        </div>
      </Card>

      {/* 市场环境 + 大盘指数 并排 */}
      <div className="review-grid-2col">
        <Card title="市场环境（最近5天）">
          <table className="review-table">
            <thead><tr><th>日期</th><th className="r">得分</th><th>环境</th><th className="r">ADR</th><th className="r">均涨幅</th><th className="r">中位涨幅</th></tr></thead>
            <tbody>
              {(data.market_env || []).map((r: any, i: number) => (
                <tr key={i} className={String(r.trade_date) === data.trade_date ? 'highlight' : undefined}>
                  <td>{ds(r.trade_date)}</td>
                  <td className="r num">{Number(r.breadth_score || 0).toFixed(1)}</td>
                  <td><RegimeBadge regime={r.market_regime || 'neutral'} /></td>
                  <td className="r num">{Number(r.adr || 0).toFixed(3)}</td>
                  <td className={`r num ${toneClass(r.avg_pct_chg)}`}>{fp(r.avg_pct_chg)}</td>
                  <td className={`r num ${toneClass(r.median_pct_chg)}`}>{fp(r.median_pct_chg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="大盘每日涨跌（近3月）">
          {(() => {
            const raw = data.index || []
            const dates = [...new Set(raw.map((r: any) => String(r.trade_date)))].sort() as string[]
            const chartData = dates.map((d: string) => {
              const row: any = { date: d.slice(5) }
              raw.filter((r: any) => String(r.trade_date) === d).forEach((r: any) => {
                const name = IDX_NAMES[r.ts_code] || r.ts_code
                if (r.pct_chg != null) row[name] = Number(r.pct_chg)
              })
              return row
            })
            const tickInterval = Math.max(1, Math.floor(dates.length / 8))
            const names = ['上证指数', '深证成指', '创业板指', '科创50']
            const colors = ['#ff5451', '#3B82F6', '#F59E0B', '#A855F7']
            return (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#8c909f' }} axisLine={{ stroke: 'rgba(66,71,84,0.15)' }} tickLine={false} interval={tickInterval} />
                  <YAxis tick={{ fontSize: 9, fill: '#8c909f' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} width={42} domain={['auto', 'auto']} />
                  <ReferenceLine y={0} stroke="rgba(66,71,84,0.6)" strokeWidth={1} />
                  <Tooltip contentStyle={{ background: '#1c2027', border: '1px solid rgba(66,71,84,0.3)', borderRadius: '2px', fontSize: '11px' }} labelStyle={{ color: '#8c909f', fontSize: '10px' }} formatter={(value: any, name: any) => [value != null ? `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}%` : '-', name]} />
                  <Legend wrapperStyle={{ fontSize: '10px', color: '#8c909f' }} iconSize={8} />
                  {names.map((name, i) => (
                    <Line key={name} type="monotone" dataKey={name} stroke={colors[i]} strokeWidth={1} dot={false} activeDot={{ r: 3 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )
          })()}
        </Card>
      </div>

      {/* 当前持仓 */}
      <Card title={`当前持仓（${positions.length}只）`}>
        {!positions.length ? <div className="review-empty">空仓</div> : (<>
          <div className="review-pos-summary">
            总成本 {fm(positions.reduce((s: number, r: any) => s + (r.cost_amount || 0), 0))}
            {' | '}总市值 {fm(positions.reduce((s: number, r: any) => s + (r.market_value || 0), 0))}
            {' | '}总浮盈 <span className={toneClass(positions.reduce((s: number, r: any) => s + (r.unrealized_pnl || 0), 0))}>{fm(positions.reduce((s: number, r: any) => s + (r.unrealized_pnl || 0), 0))}</span>
          </div>
          <table className="review-table">
            <thead><tr><th className="c"></th><th>代码</th><th>名称</th><th>策略</th><th>开仓日</th><th className="r">开仓价</th><th className="r">持天数</th><th className="r">成本</th><th className="r">市值</th><th className="r">浮盈</th><th className="r">浮盈%</th><th>概念</th><th>信号</th></tr></thead>
            <tbody>
              {positions.map((r: any, i: number) => {
                const pp = (r.unrealized_pnl_pct || 0) * 100
                const icon = pp < -5 ? '🔴' : pp < -2 ? '🟡' : pp > 2 ? '🟢' : '⚪'
                return (
                  <tr key={i}>
                    <td className="c">{icon}</td>
                    <td className="num">{r.ts_code}</td>
                    <td className="stock-name">{r.stock_name || '-'}</td>
                    <td>{cn(r.strategy)}</td>
                    <td>{r.open_date}</td>
                    <td className="r num">{Number(r.open_price || 0).toFixed(2)}</td>
                    <td className="r num">{r.hold_days}</td>
                    <td className="r num">{fm(r.cost_amount)}</td>
                    <td className="r num">{fm(r.market_value)}</td>
                    <td className={`r num ${toneClass(r.unrealized_pnl)}`}>{fm(r.unrealized_pnl)}</td>
                    <td className={`r num ${toneClass(pp)}`}>{fp(pp)}</td>
                    <td className="muted">{r.concept || ''}</td>
                    <td className="warn-signal">{r.sell_signal ? `⚠️${r.sell_signal}` : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>)}
      </Card>

      {/* 已平仓 */}
      <Card title="已平仓记录（最近10笔）">
        {!closed.length ? <div className="review-empty">暂无已平仓记录</div> : (<>
          <div className="review-pos-summary">
            盈{closed.filter((r: any) => (r.realized_pnl || 0) > 0).length}
            {' '}亏{closed.filter((r: any) => (r.realized_pnl || 0) <= 0).length}
            {' | '}合计 <span className={toneClass(closed.reduce((s: number, r: any) => s + (r.realized_pnl || 0), 0))}>{fm(closed.reduce((s: number, r: any) => s + (r.realized_pnl || 0), 0))}</span>
          </div>
          <table className="review-table">
            <thead><tr><th className="c"></th><th>名称</th><th>策略</th><th>开仓→平仓</th><th className="r">持天数</th><th className="r">盈亏</th><th className="r">盈亏%</th></tr></thead>
            <tbody>
              {closed.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="c">{(r.realized_pnl || 0) > 0 ? '✅' : '❌'}</td>
                  <td className="stock-name">{r.stock_name || '-'}</td>
                  <td>{cn(r.strategy)}</td>
                  <td>{r.open_date}→{r.close_date}</td>
                  <td className="r num">{r.hold_days}</td>
                  <td className={`r num ${toneClass(r.realized_pnl)}`}>{fm(r.realized_pnl)}</td>
                  <td className={`r num ${toneClass(r.pnl_pct)}`}>{fp(r.pnl_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>)}
      </Card>

      {/* 订单流水 */}
      <Card title="订单流水（最近2天）">
        {!orders.length ? <div className="review-empty">无订单</div> : (
          <table className="review-table">
            <thead><tr><th>ID</th><th>日期</th><th>方向</th><th>名称</th><th>策略</th><th>信号</th><th>状态</th><th className="r">金额</th><th>拒绝原因</th></tr></thead>
            <tbody>
              {orders.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="num">{r.id}</td>
                  <td>{ds(r.trade_date)}</td>
                  <td className={r.direction === 'BUY' ? 'up' : 'down'}>{r.direction === 'BUY' ? '买入' : '卖出'}</td>
                  <td className="stock-name">{r.stock_name || '-'}</td>
                  <td>{cn(r.strategy)}</td>
                  <td className="muted">{r.signal_type || '-'}</td>
                  <td>{r.approval_status || r.status}</td>
                  <td className="r num">{fm(r.fill_amount || r.order_amount)}</td>
                  <td className="warn-signal">{r.reject_reason || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* NAV走势 */}
      <Card title="NAV走势">
        {!nav.length ? <div className="review-empty">暂无数据</div> : (
          <table className="review-table">
            <thead><tr><th>日期</th><th className="r">NAV</th><th className="r">现金</th><th className="r">市值</th><th className="r">仓位%</th><th className="r">持仓</th><th className="r">累计%</th></tr></thead>
            <tbody>
              {nav.map((r: any, i: number) => (
                <tr key={i}>
                  <td>{r.snap_date}</td>
                  <td className="r num">{fm(r.total_nav)}</td>
                  <td className="r num">{fm(r.cash_balance)}</td>
                  <td className="r num">{fm(r.market_value)}</td>
                  <td className="r num">{r.position_pct || 0}%</td>
                  <td className="r num">{r.open_count || 0}</td>
                  <td className={`r num ${toneClass(r.total_pnl_pct)}`}>{fp((r.total_pnl_pct || 0) * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* 策略入池 + 风控+待处理 并排 */}
      <div className="review-grid-2col">
        <Card title="策略入池统计（最近5天）">
          <table className="review-table">
            <thead><tr><th>日期</th><th>环境</th><th>策略</th><th className="r">数量</th></tr></thead>
            <tbody>
              {(data.watchlist_stats || []).map((r: any, i: number) => (
                <tr key={i}>
                  <td>{ds(r.entry_date)}</td>
                  <td><RegimeBadge regime={r.regime || 'neutral'} /></td>
                  <td>{cn(r.strategy)}</td>
                  <td className="r num">{r.cnt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div>
          <Card title="风控状态">
            <div className="review-risk-info">
              <div><span className="label">审批模式: </span><span className="value">{JSON.stringify(data.risk_config?.approval_mode || '-').replace(/"/g, '')}</span></div>
              <div><span className="label">环境: </span><RegimeBadge regime={regime} /> → 仓位上限 <span className="value">{data.regime_limit}%</span></div>
              {navTop && <div><span className="label">NAV: </span><span className={`value ${toneClass(navTop.total_pnl_pct)}`}>{fm(navTop.total_nav)} ({fp((navTop.total_pnl_pct || 0) * 100)})</span></div>}
              <div><span className="label">最大回撤阈值: </span><span className="value">8%</span></div>
            </div>
          </Card>
          <Card title="待处理事项">
            {!(data.pending_approvals || []).length && !(data.sell_signals || []).length ? (
              <div className="review-summary-line" style={{ color: '#22C55E' }}>✅ 无待处理事项</div>
            ) : (
              <div className="review-summary">
                {(data.pending_approvals || []).length > 0 && <div className="review-summary-line">🔴 {data.pending_approvals.length}笔待审批
                  {data.pending_approvals.map((r: any, i: number) => <div key={i} style={{ paddingLeft: '16px' }}>{r.direction === 'BUY' ? '买入' : '卖出'} {r.stock_name} ({cn(r.strategy)}) {fm(r.order_amount)}</div>)}
                </div>}
                {(data.sell_signals || []).length > 0 && <div className="review-summary-line">⚠️ {data.sell_signals.length}只有卖出信号
                  {data.sell_signals.map((r: any, i: number) => <div key={i} style={{ paddingLeft: '16px' }}>{r.stock_name} → {r.sell_signal}</div>)}
                </div>}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
