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

// ─── Component ───────────────────────────────────────────────────────────────

export default function RiskDetailView() {
  const [rows, setRows] = useState<RiskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<Scope>('all')
  const [sortKey, setSortKey] = useState<SortKey>('score_desc')

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

  const sorted = useMemo(() => {
    const arr = [...rows]
    if (sortKey === 'score_desc') arr.sort((a, b) => (a.risk_score_total ?? 999) - (b.risk_score_total ?? 999))
    else if (sortKey === 'score_asc') arr.sort((a, b) => (b.risk_score_total ?? 0) - (a.risk_score_total ?? 0))
    else if (sortKey === 'cap_asc') arr.sort((a, b) => (a.position_cap_multiplier_final ?? 999) - (b.position_cap_multiplier_final ?? 999))
    return arr
  }, [rows, sortKey])

  // Stats for top cards
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

  const scopeButtons: { key: Scope; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'blocked', label: '仅被拦截' },
    { key: 'watchlist', label: '观察池' },
    { key: 'portfolio', label: '持仓' },
  ]

  const sortButtons: { key: SortKey; label: string }[] = [
    { key: 'score_desc', label: '风险评分↓' },
    { key: 'score_asc', label: '风险评分↑' },
    { key: 'cap_asc', label: '仓位倍数↑' },
  ]

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
            {highRiskPortfolio[0]?.name || '无'}
          </div>
        </div>
        <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '12px 16px', border: `1px solid ${highRiskWatchlist.length > 0 ? YELLOW + '33' : 'var(--border-default)'}` }}>
          <div style={{ fontSize: 11, color: '#7a8a9a', fontWeight: 600, letterSpacing: '1px', marginBottom: 4 }}>高风险观察池</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: highRiskWatchlist.length > 0 ? YELLOW : GREEN }}>{highRiskWatchlist.length}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {highRiskWatchlist[0]?.name || '无'}
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>范围</span>
        {scopeButtons.map(b => (
          <button key={b.key} type="button" onClick={() => setScope(b.key)}
            style={{
              padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500,
              border: scope === b.key ? '1px solid var(--text-primary)' : '1px solid var(--border-default)',
              background: scope === b.key ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: scope === b.key ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >{b.label}</button>
        ))}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 12, marginRight: 4 }}>排序</span>
        {sortButtons.map(b => (
          <button key={b.key} type="button" onClick={() => setSortKey(b.key)}
            style={{
              padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500,
              border: sortKey === b.key ? '1px solid var(--text-primary)' : '1px solid var(--border-default)',
              background: sortKey === b.key ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: sortKey === b.key ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >{b.label}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{sorted.length} 只</span>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="page-banner">加载风控数据中...</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>
          {scope === 'blocked' ? '无被拦截标的' : '暂无风控数据'}
        </div>
      ) : (
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
                <tr key={row.ts_code} style={{
                  background: !row.trade_allowed ? 'rgba(231,76,60,0.05)' : undefined,
                }}>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 32, height: 20, borderRadius: 3, fontSize: 12, fontWeight: 700,
                        background: scoreBg(row.risk_score_total),
                        color: scoreColor(row.risk_score_total),
                      }}>
                        {row.risk_score_total != null ? row.risk_score_total.toFixed(0) : '--'}
                      </span>
                    </div>
                  </td>
                  <td>{miniBar(row.risk_score_financial)}</td>
                  <td>{miniBar(row.risk_score_market)}</td>
                  <td>{miniBar(row.risk_score_event)}</td>
                  <td>{miniBar(row.risk_score_compliance)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 12 }}>
                    {row.position_cap_multiplier_final != null ? `${row.position_cap_multiplier_final.toFixed(2)}x` : '--'}
                  </td>
                  <td style={{ fontSize: 12, color: !row.trade_allowed ? RED : 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {!row.trade_allowed
                      ? (row.block_reason || '拦截')
                      : weakestDim(row)}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {row.in_portfolio && <span title="持仓" style={{ marginRight: 4 }}>💼</span>}
                    {row.in_watchlist && <span title="观察池">📋</span>}
                    {!row.in_portfolio && !row.in_watchlist && <span style={{ color: 'var(--text-muted)' }}>--</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
