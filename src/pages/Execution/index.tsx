import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadExecutionWorkspace } from '../../adapters/execution'
import { useApiData } from '../../hooks/useApiData'
import {
  fetchPendingApprovals,
  approveOrders,
  rejectOrders,
  fetchSimConfig,
  updateSimConfig,
} from '../../api'
import { getStrategyDisplayName } from '../../utils/displayNames'
import type {
  SimFillRow,
  SimPositionRow,
} from '../../types/execution'

// ─── Types ───────────────────────────────────────────────────────────────────

type PageTab = 'approval' | 'positions' | 'fills' | 'config'

interface ApprovalOrder {
  id: number
  order_date: string
  ts_code: string
  stock_name: string | null
  direction: string
  order_shares: number
  order_amount: number | null
  strategy: string | null
  signal_type: string | null
  status: string
  approval_status: string | null
  created_at: string | null
  risk_score_total: number | null
  position_cap_multiplier_final: number | null
  approved_by?: string | null
  approved_at?: string | null
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function formatNumber(value: number, digits = 2) {
  return value.toFixed(digits)
}

function formatWan(v: number | null | undefined) {
  if (v == null || v === 0) return '--'
  return (v / 10000).toFixed(1) + '万'
}

const STATUS_BADGE_STYLES: Record<string, CSSProperties> = {
  approved: { display: 'inline-block', padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: 'rgba(34,197,94,0.18)', color: '#22C55E' },
  auto_approved: { display: 'inline-block', padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: 'rgba(59,130,246,0.18)', color: '#3B82F6' },
  rejected_manual: { display: 'inline-block', padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: 'rgba(220,38,38,0.18)', color: '#DC2626' },
  pending_approval: { display: 'inline-block', padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: 'rgba(245,158,11,0.2)', color: '#D4A017' },
}

const STATUS_LABELS: Record<string, string> = {
  approved: '已批准',
  auto_approved: '自动放行',
  rejected_manual: '已拒绝',
  pending_approval: '待审批',
}

// ─── Approval Tab ────────────────────────────────────────────────────────────

function ApprovalTab() {
  const [orders, setOrders] = useState<ApprovalOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetchPendingApprovals()
      setOrders((resp.orders ?? []) as unknown as ApprovalOrder[])
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const pending = orders.filter(o => o.status === 'pending_approval')
  const processed = orders.filter(o => o.status !== 'pending_approval')

  const allSelected = pending.length > 0 && pending.every(o => selectedIds.has(o.id))

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pending.map(o => o.id)))
    }
  }

  function toggleOne(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleApprove(ids: number[]) {
    if (ids.length === 0) return
    setBusy(true)
    try {
      await approveOrders(ids)
      setSelectedIds(new Set())
      await loadData()
    } finally {
      setBusy(false)
    }
  }

  async function handleReject(ids: number[]) {
    if (ids.length === 0) return
    const reason = prompt('请输入拒绝原因（必填）：')
    if (!reason) return
    setBusy(true)
    try {
      await rejectOrders(ids, reason)
      setSelectedIds(new Set())
      await loadData()
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="page-banner">加载审批数据中...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Pending Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>
            待审批订单
            {pending.length > 0 && (
              <span style={{
                display: 'inline-flex', marginLeft: 8, padding: '1px 8px',
                borderRadius: 100, fontSize: 11, fontWeight: 700,
                background: 'rgba(245,158,11,0.2)', color: '#F59E0B',
                minWidth: 18, justifyContent: 'center',
              }}>{pending.length}</span>
            )}
          </h3>
          <button
            type="button"
            onClick={loadData}
            style={{
              background: 'none', border: '1px solid var(--border-default)',
              borderRadius: 5, padding: '3px 10px', fontSize: 12,
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            刷新
          </button>
        </div>

        <div className="execution-table-shell" style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: '3%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '5%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={pending.length === 0} />
                  </th>
                  <th>日期</th>
                  <th>股票代码</th>
                  <th>股票名称</th>
                  <th>方向</th>
                  <th style={{ textAlign: 'right' }}>股数</th>
                  <th style={{ textAlign: 'right' }}>金额</th>
                  <th>策略</th>
                  <th>信号</th>
                  <th style={{ textAlign: 'right' }}>风控分</th>
                  <th>状态</th>
                  <th style={{ textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {pending.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                      当前无待审批订单
                    </td>
                  </tr>
                )}
                {pending.map(o => (
                  <tr key={o.id}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleOne(o.id)} />
                    </td>
                    <td className="numeric" style={{ fontSize: 12 }}>{o.order_date}</td>
                    <td className="numeric" style={{ fontSize: 12 }}>{o.ts_code}</td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.stock_name || '--'}</td>
                    <td>
                      <span style={{
                        fontWeight: 600,
                        color: o.direction === 'BUY' ? 'var(--up)' : 'var(--down)',
                      }}>
                        {o.direction === 'BUY' ? '买入' : '卖出'}
                      </span>
                    </td>
                    <td className="numeric" style={{ textAlign: 'right' }}>{o.order_shares?.toLocaleString()}</td>
                    <td className="numeric" style={{ textAlign: 'right' }}>{formatWan(o.order_amount)}</td>
                    <td style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.strategy || '--'}</td>
                    <td style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.signal_type || '--'}</td>
                    <td className="numeric" style={{ textAlign: 'right' }}>
                      {o.risk_score_total != null ? o.risk_score_total.toFixed(1) : '--'}
                    </td>
                    <td>
                      <span style={STATUS_BADGE_STYLES[o.approval_status || o.status] ?? STATUS_BADGE_STYLES.pending_approval}>
                        {STATUS_LABELS[o.approval_status || o.status] ?? o.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleApprove([o.id])}
                        style={{
                          background: 'none', border: '1px solid var(--up)',
                          borderRadius: 3, padding: '2px 8px', fontSize: 11,
                          color: 'var(--up)', cursor: 'pointer', marginRight: 4,
                        }}
                      >批准</button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleReject([o.id])}
                        style={{
                          background: 'none', border: '1px solid var(--down)',
                          borderRadius: 3, padding: '2px 8px', fontSize: 11,
                          color: 'var(--down)', cursor: 'pointer',
                        }}
                      >拒绝</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        {/* Batch action bar */}
        {selectedIds.size > 0 && (
          <div style={{
            position: 'sticky', bottom: 0, display: 'flex', alignItems: 'center',
            gap: 12, padding: '10px 16px', marginTop: 8,
            background: 'var(--bg-elevated)', borderRadius: 5,
            border: '1px solid var(--border-default)',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              已选 {selectedIds.size} 笔
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleApprove(Array.from(selectedIds))}
              style={{
                background: 'rgba(34,197,94,0.12)', border: '1px solid var(--up)',
                borderRadius: 5, padding: '5px 16px', fontSize: 13,
                fontWeight: 600, color: 'var(--up)', cursor: 'pointer',
              }}
            >批量批准 ({selectedIds.size})</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleReject(Array.from(selectedIds))}
              style={{
                background: 'rgba(220,38,38,0.08)', border: '1px solid var(--down)',
                borderRadius: 5, padding: '5px 16px', fontSize: 13,
                fontWeight: 600, color: 'var(--down)', cursor: 'pointer',
              }}
            >批量拒绝 ({selectedIds.size})</button>
          </div>
        )}
      </div>

      {/* Processed Section */}
      {processed.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-secondary)' }}>
            最近已处理
          </h3>
          <div className="execution-table-shell" style={{ overflowX: 'auto', opacity: 0.75 }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>股票</th>
                  <th>方向</th>
                  <th style={{ textAlign: 'right' }}>金额</th>
                  <th>策略</th>
                  <th>状态</th>
                  <th>审批人</th>
                  <th>审批时间</th>
                </tr>
              </thead>
              <tbody>
                {processed.map(o => (
                  <tr key={o.id}>
                    <td className="numeric" style={{ fontSize: 12 }}>{o.order_date}</td>
                    <td>
                      <span className="numeric" style={{ fontSize: 12 }}>{o.ts_code}</span>
                      {o.stock_name && <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-secondary)' }}>{o.stock_name}</span>}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: o.direction === 'BUY' ? 'var(--up)' : 'var(--down)' }}>
                        {o.direction === 'BUY' ? '买入' : '卖出'}
                      </span>
                    </td>
                    <td className="numeric" style={{ textAlign: 'right' }}>{formatWan(o.order_amount)}</td>
                    <td style={{ fontSize: 12 }}>{o.strategy || '--'}</td>
                    <td>
                      <span style={STATUS_BADGE_STYLES[o.status] ?? STATUS_BADGE_STYLES.pending_approval}>
                        {STATUS_LABELS[o.status] ?? o.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.approved_by || '--'}</td>
                    <td className="numeric" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {o.approved_at ? new Date(o.approved_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Config Tab ──────────────────────────────────────────────────────────────

function ConfigTab() {
  const [mode, setMode] = useState<string>('AUTO')
  const [rules, setRules] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'AUTO' | 'APPROVAL' | null>(null)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetchSimConfig()
      const modeVal = resp.approval_mode?.value
      setMode(typeof modeVal === 'string' ? modeVal : 'AUTO')
      const rulesVal = resp.approval_rules?.value
      setRules(typeof rulesVal === 'object' && rulesVal ? rulesVal as Record<string, unknown> : {})
    } catch {
      // keep defaults
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  async function doToggle(newMode: 'AUTO' | 'APPROVAL') {
    setBusy(true)
    try {
      await updateSimConfig({ approval_mode: newMode })
      setMode(newMode)
    } finally {
      setBusy(false)
      setConfirmAction(null)
    }
  }

  if (loading) return <div className="page-banner">加载配置中...</div>

  const targetMode = mode === 'AUTO' ? 'APPROVAL' : 'AUTO'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Mode Card */}
      <div className="stat-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>当前审批模式</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: mode === 'AUTO' ? '#3B82F6' : '#F59E0B' }}>
              {mode === 'AUTO' ? '自动模式' : '审批模式'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {mode === 'AUTO'
                ? '所有新订单自动放行执行，无需人工审批'
                : '新订单按分级规则审批，部分需人工确认'}
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmAction(targetMode)}
            style={{
              background: targetMode === 'APPROVAL' ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)',
              border: `1px solid ${targetMode === 'APPROVAL' ? '#F59E0B' : '#3B82F6'}`,
              borderRadius: 5, padding: '8px 20px', fontSize: 13, fontWeight: 600,
              color: targetMode === 'APPROVAL' ? '#F59E0B' : '#3B82F6',
              cursor: 'pointer',
            }}
          >
            切换到{targetMode === 'APPROVAL' ? '审批' : '自动'}模式
          </button>
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmAction && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 8, padding: 24,
            maxWidth: 420, width: '90%', boxShadow: 'var(--shadow-modal)',
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: 'var(--text-primary)' }}>
              确认切换
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
              {confirmAction === 'APPROVAL'
                ? '切换到审批模式后，所有新订单需要人工审批才能执行。确定切换？'
                : '切换到自动模式后，所有新订单将自动放行执行，不再等待人工审批。确定切换？'}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                style={{
                  background: 'none', border: '1px solid var(--border-default)',
                  borderRadius: 5, padding: '6px 16px', fontSize: 13,
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >取消</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => doToggle(confirmAction)}
                style={{
                  background: confirmAction === 'APPROVAL' ? '#F59E0B' : '#3B82F6',
                  border: 'none', borderRadius: 5, padding: '6px 16px', fontSize: 13,
                  fontWeight: 600, color: '#fff', cursor: 'pointer',
                }}
              >确定</button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Card (read-only) */}
      <div className="stat-card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--text-primary)' }}>
          分级审批规则
        </h3>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...STATUS_BADGE_STYLES.auto_approved, fontSize: 12 }}>SELL</span>
            <span>卖出方向：{rules.sell_auto ? '自动放行' : '需审批'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...STATUS_BADGE_STYLES.auto_approved, fontSize: 12 }}>BUY</span>
            <span>买入金额 {'<'} 初始资金的{((rules.buy_amount_auto_pct as number) ?? 0.1) * 100}%（{'<'} {(((rules.buy_amount_auto_pct as number) ?? 0.1) * 10_000_000 / 10000).toFixed(0)}万）：自动放行</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...STATUS_BADGE_STYLES.approved, fontSize: 12 }}>策略</span>
            <span>白名单策略：{(rules.strategy_auto as string[] ?? []).join(', ') || '无'} — 自动放行</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...STATUS_BADGE_STYLES.pending_approval, fontSize: 12 }}>其余</span>
            <span>不满足以上条件的买入订单：需人工审批</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Positions Tab (table layout) ────────────────────────────────────────────

function PositionsTab() {
  const [searchParams] = useSearchParams()

  const stableFetchKey = useMemo(
    () => `positions|${searchParams.get('source') ?? ''}|${searchParams.get('strategy') ?? ''}`,
    [searchParams],
  )

  const paramsCopy = useMemo(() => {
    const p = new URLSearchParams(searchParams)
    p.set('tab', 'positions')
    return p
  }, [searchParams])

  const { data, loading, error } = useApiData(() => loadExecutionWorkspace(paramsCopy), [stableFetchKey])
  const rows = (data?.positions ?? []) as SimPositionRow[]

  if (loading) return <div className="page-banner">加载持仓数据中...</div>
  if (error) return <div className="page-banner warning">持仓数据加载失败：{error}</div>

  return (
    <div className="execution-table-shell" style={{ overflowX: 'auto' }}>
      <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          <col style={{ width: '9%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '10%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>股票代码</th>
            <th>股票名称</th>
            <th>方向</th>
            <th style={{ textAlign: 'right' }}>股数</th>
            <th style={{ textAlign: 'right' }}>入场价</th>
            <th style={{ textAlign: 'right' }}>最新价</th>
            <th style={{ textAlign: 'right' }}>浮盈%</th>
            <th style={{ textAlign: 'right' }}>持仓天数</th>
            <th>策略</th>
            <th style={{ textAlign: 'right' }}>风控评分</th>
            <th style={{ textAlign: 'right' }}>仓位系数</th>
            <th>执行状态</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={12} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                暂无持仓数据
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const pnlPct = row.unrealizedPnlPct
            const latestPrice = row.entryPrice * (1 + pnlPct / 100)
            const strategyDisplay = row.sourceStrategy
              ? (getStrategyDisplayName(row.sourceStrategy) ?? row.sourceStrategy)
              : row.strategyLabel
            return (
              <tr key={row.id}>
                <td className="numeric" style={{ fontSize: 12 }}>{row.tsCode}</td>
                <td>{row.name}</td>
                <td>
                  <span style={{ fontWeight: 600, color: 'var(--up)' }}>持仓</span>
                </td>
                <td className="numeric" style={{ textAlign: 'right' }}>{row.shares.toLocaleString()}</td>
                <td className="numeric" style={{ textAlign: 'right' }}>{formatNumber(row.entryPrice)}</td>
                <td className="numeric" style={{ textAlign: 'right' }}>{formatNumber(latestPrice)}</td>
                <td className="numeric" style={{
                  textAlign: 'right', fontWeight: 600,
                  color: pnlPct > 0 ? 'var(--up)' : pnlPct < 0 ? 'var(--down)' : 'var(--text-secondary)',
                }}>
                  {pnlPct > 0 ? '+' : ''}{formatNumber(pnlPct)}%
                </td>
                <td className="numeric" style={{ textAlign: 'right' }}>
                  {row.observingDay != null ? row.observingDay : '--'}
                </td>
                <td style={{ fontSize: 12 }}>{strategyDisplay}</td>
                <td className="numeric" style={{ textAlign: 'right' }}>{row.riskLevelLabel}</td>
                <td className="numeric" style={{ textAlign: 'right' }}>{row.positionCapText}</td>
                <td>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 3,
                    fontSize: 11, fontWeight: 600,
                    background: row.constraintStatus === 'allow' ? 'rgba(34,197,94,0.15)' : row.constraintStatus === 'warn' ? 'rgba(245,158,11,0.15)' : 'rgba(220,38,38,0.15)',
                    color: row.constraintStatus === 'allow' ? '#22C55E' : row.constraintStatus === 'warn' ? '#F59E0B' : '#DC2626',
                  }}>
                    {row.constraintStatusLabel}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Fills Tab (table layout) ────────────────────────────────────────────────

function FillsTab() {
  const [searchParams] = useSearchParams()

  const stableFetchKey = useMemo(
    () => `fills|${searchParams.get('source') ?? ''}|${searchParams.get('strategy') ?? ''}`,
    [searchParams],
  )

  const paramsCopy = useMemo(() => {
    const p = new URLSearchParams(searchParams)
    p.set('tab', 'fills')
    return p
  }, [searchParams])

  const { data, loading, error } = useApiData(() => loadExecutionWorkspace(paramsCopy), [stableFetchKey])
  const rows = (data?.fills ?? []) as SimFillRow[]

  if (loading) return <div className="page-banner">加载成交数据中...</div>
  if (error) return <div className="page-banner warning">成交数据加载失败：{error}</div>

  return (
    <div className="execution-table-shell" style={{ overflowX: 'auto' }}>
      <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '10%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>成交日期</th>
            <th>股票代码</th>
            <th>股票名称</th>
            <th>方向</th>
            <th style={{ textAlign: 'right' }}>成交价</th>
            <th style={{ textAlign: 'right' }}>成交股数</th>
            <th style={{ textAlign: 'right' }}>成交金额</th>
            <th>策略</th>
            <th>信号类型</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                暂无成交数据
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const fillAmount = row.fillPrice * row.fillQty
            const strategyDisplay = row.sourceStrategy
              ? (getStrategyDisplayName(row.sourceStrategy) ?? row.sourceStrategy)
              : row.strategyLabel
            return (
              <tr key={row.id}>
                <td className="numeric" style={{ fontSize: 12 }}>{row.tradeDate}</td>
                <td className="numeric" style={{ fontSize: 12 }}>{row.tsCode}</td>
                <td>{row.name}</td>
                <td>
                  <span style={{
                    fontWeight: 600,
                    color: row.side === 'buy' ? 'var(--up)' : 'var(--down)',
                  }}>
                    {row.side === 'buy' ? '买入' : '卖出'}
                  </span>
                </td>
                <td className="numeric" style={{ textAlign: 'right' }}>{formatNumber(row.fillPrice)}</td>
                <td className="numeric" style={{ textAlign: 'right' }}>{row.fillQty.toLocaleString()}</td>
                <td className="numeric" style={{ textAlign: 'right' }}>{formatWan(fillAmount)}</td>
                <td style={{ fontSize: 12 }}>{strategyDisplay}</td>
                <td style={{ fontSize: 12 }}>{row.fillStatusLabel}</td>
                <td>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 3,
                    fontSize: 11, fontWeight: 600,
                    background: 'rgba(59,130,246,0.15)', color: '#3B82F6',
                  }}>
                    {row.orderStatusLabel}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const TAB_DEFS: { key: PageTab; label: string }[] = [
  { key: 'approval', label: '订单审批' },
  { key: 'positions', label: '当前持仓' },
  { key: 'fills', label: '成交数据' },
  { key: 'config', label: '执行配置' },
]

export default function ExecutionPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab: PageTab = (rawTab === 'approval' || rawTab === 'positions' || rawTab === 'fills' || rawTab === 'config')
    ? rawTab
    : 'approval'

  function setTab(tab: PageTab) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    next.delete('focus')
    next.delete('source')
    next.delete('strategy')
    setSearchParams(next)
  }

  return (
    <div className="domain-page execution-page" data-testid="execution-page">
      <section className="page-tabs execution-tabs">
        {TAB_DEFS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`page-tab-btn${t.key === activeTab ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span className="execution-tab-label">{t.label}</span>
          </button>
        ))}
      </section>

      <section className="execution-workspace">
        <div className="execution-main card">
          <div className="card-body">
            {activeTab === 'approval' && <ApprovalTab />}
            {activeTab === 'positions' && <PositionsTab />}
            {activeTab === 'fills' && <FillsTab />}
            {activeTab === 'config' && <ConfigTab />}
          </div>
        </div>
      </section>
    </div>
  )
}
