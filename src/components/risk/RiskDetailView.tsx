import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../api'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RiskRow {
  ts_code: string
  name: string
  trade_date: string
  trade_allowed: boolean
  block_reason: string | null
  risk_score_total: number | null
  risk_score_financial: number | null
  risk_score_market: number | null
  risk_score_event: number | null
  risk_score_compliance: number | null
  position_cap_multiplier_final: number | null
  in_watchlist: boolean
  in_portfolio: boolean
}

type Scope = 'all' | 'blocked' | 'watchlist' | 'portfolio'
type SortKey = 'score_asc' | 'score_desc' | 'cap_asc'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GREEN = '#4ecf7a'
const YELLOW = '#f0b840'
const RED = '#e74c3c'
const BLUE = '#3498db'

function scoreColor(v: number | null) {
  if (v == null) return 'var(--text-muted)'
  if (v >= 80) return GREEN
  if (v >= 60) return YELLOW
  return RED
}

function scoreBg(v: number | null) {
  if (v == null) return 'rgba(255,255,255,0.05)'
  if (v >= 80) return `${GREEN}20`
  if (v >= 60) return `${YELLOW}20`
  return `${RED}20`
}

function miniBar(v: number | null) {
  const w = Math.min(v ?? 0, 100)
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 12, color: scoreColor(v), minWidth: 24 }}>
        {v != null ? v.toFixed(0) : '--'}
      </span>
      <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${w}%`, height: 4, borderRadius: 2, background: scoreColor(v) }} />
      </div>
    </div>
  )
}

function dimBar(label: string, v: number | null) {
  const w = Math.min(v ?? 0, 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 28, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${w}%`, height: 6, borderRadius: 3, background: scoreColor(v), transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: scoreColor(v), width: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {v != null ? v.toFixed(0) : '--'}
      </span>
    </div>
  )
}

function weakestDim(row: RiskRow): string {
  const dims = [
    { name: '财务', score: row.risk_score_financial },
    { name: '市场', score: row.risk_score_market },
    { name: '事件', score: row.risk_score_event },
    { name: '合规', score: row.risk_score_compliance },
  ].filter(d => d.score != null) as Array<{ name: string; score: number }>
  if (dims.length === 0) return '--'
  dims.sort((a, b) => a.score - b.score)
  return `${dims[0].name}维度偏弱(${dims[0].score.toFixed(0)})`
}

function sourceBadges(row: RiskRow) {
  const badges = []
  if (row.in_watchlist) badges.push(<span key="w" style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: `${GREEN}18`, color: GREEN, marginRight: 3 }}>池</span>)
  if (row.in_portfolio) badges.push(<span key="p" style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: `${BLUE}18`, color: BLUE }}>仓</span>)
  if (badges.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return <>{badges}</>
}

const pillStyle = (active: boolean) => ({
  padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500 as const,
  border: active ? '1px solid var(--text-primary)' : '1px solid var(--border-default)',
  background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
  cursor: 'pointer' as const,
})

// ─── Detail Panel ────────────────────────────────────────────────────────────

function DetailPanel({ row, onClose }: { row: RiskRow; onClose: () => void }) {
  return (
    <div style={{
      width: 300, flexShrink: 0, background: 'var(--bg-card)', borderRadius: 8,
      border: '1px solid var(--border-default)', padding: 16, overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{row.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{row.ts_code}</div>
        </div>
        <button type="button" onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px',
        }}>✕</button>
      </div>

      {/* Verdict */}
      <div style={{ marginBottom: 14 }}>
        <span style={{
          display: 'inline-block', padding: '3px 10px', borderRadius: 4,
          fontSize: 12, fontWeight: 600,
          background: row.trade_allowed ? `${GREEN}18` : `${RED}18`,
          color: row.trade_allowed ? GREEN : RED,
        }}>
          {row.trade_allowed ? '允许交易' : '已拦截'}
        </span>
      </div>

      {/* Total Score */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>综合评分</div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 56, height: 40, borderRadius: 6, fontSize: 22, fontWeight: 700,
          background: scoreBg(row.risk_score_total), color: scoreColor(row.risk_score_total),
        }}>
          {row.risk_score_total != null ? row.risk_score_total.toFixed(0) : '--'}
        </div>
      </div>

      {/* 4-Dimension Bars */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>四维评分</div>
        {dimBar('财务', row.risk_score_financial)}
        {dimBar('市场', row.risk_score_market)}
        {dimBar('事件', row.risk_score_event)}
        {dimBar('合规', row.risk_score_compliance)}
      </div>

      {/* Position Cap */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
        <span style={{ color: 'var(--text-muted)' }}>仓位倍数</span>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          {row.position_cap_multiplier_final != null ? `${row.position_cap_multiplier_final.toFixed(2)}x` : '--'}
        </span>
      </div>

      {/* Block Reason */}
      {!row.trade_allowed && row.block_reason && (
        <div style={{
          marginTop: 10, padding: '8px 10px', borderRadius: 4,
          background: `${RED}12`, fontSize: 12, color: RED, lineHeight: 1.5,
        }}>
          拦截原因: {row.block_reason}
        </div>
      )}

      {/* Source */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 10, color: 'var(--text-muted)' }}>
        <span>来源</span>
        <span>{sourceBadges(row)}</span>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function RiskDetailView() {
  const [rows, setRows] = useState<RiskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<Scope>('all')
  const [sortKey, setSortKey] = useState<SortKey>('score_desc')
  const [selected, setSelected] = useState<RiskRow | null>(null)

  const load = useCallback(async (s: Scope) => {
    setLoading(true)
    try {
      if (s === 'blocked') {
        const res = await api.get('/api/risk/gate_blocks')
        setRows(Array.isArray(res.data) ? res.data : [])
      } else {
        const res = await api.get('/api/risk/top_scores', { params: { scope: s } })
        setRows(Array.isArray(res.data) ? res.data : [])
      }
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(scope) }, [scope, load])

  // Sort: blocked first, then by user sort
  const sorted = useMemo(() => {
    const arr = [...rows]
    arr.sort((a, b) => {
      // Blocked always first
      if (!a.trade_allowed && b.trade_allowed) return -1
      if (a.trade_allowed && !b.trade_allowed) return 1
      // Then by sort key
      if (sortKey === 'score_desc') return (a.risk_score_total ?? 999) - (b.risk_score_total ?? 999)
      if (sortKey === 'score_asc') return (b.risk_score_total ?? 0) - (a.risk_score_total ?? 0)
      if (sortKey === 'cap_asc') return (a.position_cap_multiplier_final ?? 999) - (b.position_cap_multiplier_final ?? 999)
      return 0
    })
    return arr
  }, [rows, sortKey])

  // Stats
  const blockedCount = rows.filter(r => !r.trade_allowed).length
  const blockedReasons: Record<string, number> = {}
  rows.filter(r => !r.trade_allowed).forEach(r => {
    (r.block_reason || 'unknown').split(',').forEach(reason => {
      const k = reason.trim()
      blockedReasons[k] = (blockedReasons[k] || 0) + 1
    })
  })
  const highRiskPortfolio = rows.filter(r => r.in_portfolio && (r.risk_score_total ?? 100) < 60)
  const highRiskWatchlist = rows.filter(r => r.in_watchlist && !r.in_portfolio && (r.risk_score_total ?? 100) < 60)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Top 3 cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '12px 16px', border: `1px solid ${blockedCount > 0 ? RED + '33' : 'var(--border-default)'}` }}>
          <div style={{ fontSize: 11, color: '#7a8a9a', fontWeight: 600, letterSpacing: '1px', marginBottom: 4 }}>GATE 拦截</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: blockedCount > 0 ? RED : GREEN }}>{blockedCount}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {Object.entries(blockedReasons).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' ') || '无拦截'}
          </div>
        </div>
        <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '12px 16px', border: `1px solid ${highRiskPortfolio.length > 0 ? RED + '33' : 'var(--border-default)'}` }}>
          <div style={{ fontSize: 11, color: '#7a8a9a', fontWeight: 600, letterSpacing: '1px', marginBottom: 4 }}>高风险持仓</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: highRiskPortfolio.length > 0 ? RED : GREEN }}>{highRiskPortfolio.length}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {highRiskPortfolio[0]?.name || '暂无持仓'}
          </div>
        </div>
        <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '12px 16px', border: `1px solid ${highRiskWatchlist.length > 0 ? YELLOW + '33' : 'var(--border-default)'}` }}>
          <div style={{ fontSize: 11, color: '#7a8a9a', fontWeight: 600, letterSpacing: '1px', marginBottom: 4 }}>高风险观察池</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: highRiskWatchlist.length > 0 ? YELLOW : GREEN }}>{highRiskWatchlist.length}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {highRiskWatchlist[0]?.name || '全部正常'}
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#7a8a9a', marginRight: 4 }}>范围:</span>
        {([
          { key: 'all' as Scope, label: '全部' },
          { key: 'blocked' as Scope, label: '仅被拦截' },
          { key: 'watchlist' as Scope, label: '观察池' },
          { key: 'portfolio' as Scope, label: '持仓' },
        ]).map(b => (
          <button key={b.key} type="button" onClick={() => { setScope(b.key); setSelected(null) }} style={pillStyle(scope === b.key)}>{b.label}</button>
        ))}
        <span style={{ width: 1, height: 16, background: 'var(--border-default)', margin: '0 10px' }} />
        <span style={{ fontSize: 12, color: '#7a8a9a', marginRight: 4 }}>排序:</span>
        {([
          { key: 'score_desc' as SortKey, label: '风险评分↓' },
          { key: 'score_asc' as SortKey, label: '风险评分↑' },
          { key: 'cap_asc' as SortKey, label: '仓位倍数↑' },
        ]).map(b => (
          <button key={b.key} type="button" onClick={() => setSortKey(b.key)} style={pillStyle(sortKey === b.key)}>{b.label}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{sorted.length} 只</span>
      </div>

      {/* ── Table + Detail Panel ── */}
      {loading ? (
        <div className="page-banner">加载风控数据中...</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>
          {scope === 'blocked' ? '无被拦截标的' : '暂无风控数据'}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="table-shell data-table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>标的</th>
                    <th>交易结论</th>
                    <th>综合评分</th>
                    <th>财务</th>
                    <th>市场</th>
                    <th>事件</th>
                    <th>合规</th>
                    <th style={{ textAlign: 'right' }}>仓位倍数</th>
                    <th>风险/拦截原因</th>
                    <th>来源</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(row => (
                    <tr
                      key={row.ts_code}
                      onClick={() => setSelected(row)}
                      style={{
                        cursor: 'pointer',
                        background: selected?.ts_code === row.ts_code
                          ? 'rgba(59,130,246,0.08)'
                          : !row.trade_allowed
                            ? 'rgba(231,76,60,0.06)'
                            : undefined,
                      }}
                    >
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{row.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{row.ts_code}</div>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 3,
                          fontSize: 11, fontWeight: 600,
                          background: row.trade_allowed ? `${GREEN}18` : `${RED}18`,
                          color: row.trade_allowed ? GREEN : RED,
                        }}>
                          {row.trade_allowed ? '允许' : '拦截'}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 32, height: 20, borderRadius: 3, fontSize: 12, fontWeight: 700,
                          background: scoreBg(row.risk_score_total),
                          color: scoreColor(row.risk_score_total),
                        }}>
                          {row.risk_score_total != null ? row.risk_score_total.toFixed(0) : '--'}
                        </span>
                      </td>
                      <td>{miniBar(row.risk_score_financial)}</td>
                      <td>{miniBar(row.risk_score_market)}</td>
                      <td>{miniBar(row.risk_score_event)}</td>
                      <td>{miniBar(row.risk_score_compliance)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 12 }}>
                        {row.position_cap_multiplier_final != null ? `${row.position_cap_multiplier_final.toFixed(2)}x` : '--'}
                      </td>
                      <td style={{ fontSize: 12, color: !row.trade_allowed ? RED : 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {!row.trade_allowed ? (row.block_reason || '拦截') : weakestDim(row)}
                      </td>
                      <td>{sourceBadges(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail Panel */}
          {selected && (
            <DetailPanel row={selected} onClose={() => setSelected(null)} />
          )}
        </div>
      )}
    </div>
  )
}
