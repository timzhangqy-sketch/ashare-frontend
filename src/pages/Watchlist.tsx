import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import StockDrawer from '../components/Drawer/StockDrawer'
import PreCheckModal from '../components/PreCheckModal'
import WatchlistActionMenu from '../components/WatchlistActionMenu'
import WatchlistGroupView from '../components/WatchlistGroupView'
import WatchlistStatusBadge from '../components/WatchlistStatusBadge'
import { addPortfolio } from '../api'
import { loadWatchlistWorkspace } from '../adapters/watchlist'
import { displaySignalLabel, displayStrategyLabel } from '../utils/labelMaps'
import { useContextPanel } from '../context/useContextPanel'
import { useDate } from '../context/useDate'
import { useApiData } from '../hooks/useApiData'
import type { StockDetail } from '../types/stock'
import type { WatchlistActionVm, WatchlistQueryState, WatchlistRowVm, WatchlistViewKey } from '../types/watchlist'

function normalizeView(value: string | null): WatchlistViewKey {
  if (value === 'group' || value === 'heat') return value
  return 'table'
}

function buildQueryState(searchParams: URLSearchParams): WatchlistQueryState {
  return {
    source: searchParams.get('source'),
    focus: searchParams.get('focus'),
    strategy: searchParams.get('strategy'),
    status: searchParams.get('status'),
    signal: searchParams.get('signal'),
    query: searchParams.get('query'),
    view: normalizeView(searchParams.get('view')),
    groupBy: searchParams.get('groupBy') === 'strategy' ? 'strategy' : 'lifecycle',
  }
}

const formatPct = (v: number | null | undefined): string => {
  if (v === null || v === undefined) return '--'
  const pct = (v * 100).toFixed(2)
  return Number(v) >= 0 ? `+${pct}%` : `${pct}%`
}

const pctColor = (v: number | null | undefined): string => {
  if (v === null || v === undefined || v === 0) return 'var(--text-muted)'
  return v > 0 ? 'var(--up)' : 'var(--down)'
}

const formatDay = (d: number | null | undefined): string => {
  if (d === null || d === undefined) return '--'
  return `${d}天`
}

const formatPrice = (v: number | null | undefined): string => {
  if (v === null || v === undefined) return '--'
  return Number(v).toFixed(2)
}

const formatVr = (v: number | null | undefined): string => {
  if (v === null || v === undefined) return '--'
  return Number(v).toFixed(2)
}

function buildFocusMissNote(focus: string | null, rows: WatchlistRowVm[]): string | null {
  if (!focus || rows.length === 0) return null
  return rows.some((row) => row.tsCode === focus) ? null : `当前 focus=${focus} 不在交易标的池结果中，已自动回退到首条记录。`
}

export default function Watchlist() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { selectedDate } = useDate()
  const { openPanel, closePanel } = useContextPanel()
  const unmountedRef = useRef(false)
  const queryState = buildQueryState(searchParams)
  const stableFetchKey = useMemo(
    () =>
      `${selectedDate ?? ''}|${queryState.source ?? ''}|${queryState.strategy ?? ''}|${queryState.status ?? ''}|${queryState.signal ?? ''}|${queryState.query ?? ''}|${queryState.view}|${queryState.groupBy ?? ''}`,
    [selectedDate, queryState.source, queryState.strategy, queryState.status, queryState.signal, queryState.query, queryState.view, queryState.groupBy],
  )
  const { data, loading, error, refetch } = useApiData(
    () => loadWatchlistWorkspace(queryState, selectedDate),
    [stableFetchKey],
  )

  const rows = data?.rows ?? []
  const groups = data?.groups ?? []
  const selectedCode = queryState.focus
  const selectedRow = rows.find((row) => row.tsCode === selectedCode) ?? rows[0] ?? null

  const [drawerStock, setDrawerStock] = useState<StockDetail | null>(null)
  const [preCheckTsCode, setPreCheckTsCode] = useState<string | null>(null)

  const focusMissNote = buildFocusMissNote(selectedCode, rows)

  useEffect(() => {
    return () => { unmountedRef.current = true; };
  }, []);

  // Drive GlobalContextPanel with selected row
  useEffect(() => {
    if (unmountedRef.current) return;

    if (!selectedRow) {
      closePanel();
      return;
    }

    openPanel({
      entityType: 'stock',
      entityKey: selectedRow.tsCode,
      sourcePage: 'watchlist',
      tradeDate: selectedDate,
      focus: selectedRow.tsCode,
      activeTab: queryState.view,
      payloadVersion: 'v1',
      payload: {
        title: selectedRow.name,
        name: selectedRow.name,
        tsCode: selectedRow.tsCode,
        sourceStrategy: selectedRow.sourceStrategyPrimary,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow?.tsCode, selectedDate, data?.tradeDate, openPanel, closePanel]);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      closePanel();
    };
  }, [closePanel]);

  useEffect(() => {
    if (listRef.current && scrollPosRef.current > 0) {
      listRef.current.scrollTop = scrollPosRef.current
    }
  }, [data, selectedCode]);

  const syncParams = (updater: (params: URLSearchParams) => void) => {
    if (unmountedRef.current) return;
    const next = new URLSearchParams(searchParams)
    updater(next)
    setSearchParams(next, { replace: true })
  }

  const updateFilterParam = (key: string, value: string) => {
    syncParams((params) => {
      if (!value || value === 'all') params.delete(key)
      else params.set(key, value)
    })
  }

  const handleViewChange = (view: WatchlistViewKey) => {
    syncParams((params) => {
      if (view === 'table') params.delete('view')
      else params.set('view', view)
    })
  }

  const listRef = useRef<HTMLDivElement>(null)
  const scrollPosRef = useRef(0)

  const handleRowSelect = (row: WatchlistRowVm) => {
    if (listRef.current) scrollPosRef.current = listRef.current.scrollTop
    syncParams((params) => {
      params.set('focus', row.tsCode)
    })
  }

  const handleConfirmAccept = (tsCode: string, preCheckData?: Record<string, unknown>) => {
    const row = rows.find((r) => r.tsCode === tsCode)
    if (!row) {
      setPreCheckTsCode(null)
      return
    }
    const position = (preCheckData?.position as Record<string, unknown>) ?? {}
    const suggestedShares = position.suggested_shares != null ? Number(position.suggested_shares) : null
    const suggestedAmount = position.suggested_amount != null ? Number(position.suggested_amount) : null
    const openPrice = suggestedShares != null && suggestedShares > 0 && suggestedAmount != null
      ? suggestedAmount / suggestedShares
      : null
    const shares = suggestedShares != null && suggestedShares > 0 ? Math.round(suggestedShares) : null
    if (openPrice != null && shares != null) {
      const openDate = selectedDate || new Date().toISOString().split('T')[0]
      addPortfolio({
        ts_code: row.tsCode,
        name: row.name,
        open_price: openPrice,
        shares,
        open_date: openDate,
        source_strategy: row.sourceStrategyPrimary ?? row.strategy ?? 'WATCHLIST',
      }).then(() => {
        refetch()
        setPreCheckTsCode(null)
      }).catch(() => {
        setPreCheckTsCode(null)
      })
    } else {
      setDrawerStock({
        code: row.tsCode,
        name: row.name,
        changePct: row.latestPctChg ?? 0,
        close: row.latestClose ?? 0,
        lists: [row.sourceStrategyPrimary ?? '交易标的池'],
        dims: [],
        gates: [],
      })
      setPreCheckTsCode(null)
    }
  }

  const handleAction = (row: WatchlistRowVm, action: WatchlistActionVm) => {
    if (action.href) {
      navigate(action.href)
      return
    }
    if (action.kind === 'portfolio' && !row.inPortfolio) {
      setPreCheckTsCode(row.tsCode)
      return
    }
    if (action.kind === 'detail') {
      handleRowSelect(row)
      setDrawerStock({
        code: row.tsCode,
        name: row.name,
        changePct: row.latestPctChg ?? 0,
        close: row.latestClose ?? 0,
        lists: [row.sourceStrategyPrimary ?? '交易标的池'],
        dims: [],
        gates: [],
      })
    }
  }

  return (
    <div className="watchlist-page" data-testid="watchlist-page">
      {preCheckTsCode ? (
        <PreCheckModal
          ts_code={preCheckTsCode}
          onConfirm={(data) => {
            handleConfirmAccept(preCheckTsCode, data)
          }}
          onCancel={() => setPreCheckTsCode(null)}
        />
      ) : null}
      {focusMissNote ? <section className="watchlist-feedback-banner warning">{focusMissNote}</section> : null}

      <section className="card">
        <div className="card-body watchlist-metric-strip watchlist-metric-strip-5">
          {(data?.metrics ?? []).map((metric) => (
            <div key={metric.label} className="stat-card watchlist-metric-card">
              <div className="stat-label">{metric.label}</div>
              <div className="stat-value watchlist-metric-value numeric">{metric.value}</div>
              <div className="stat-sub">{metric.helper}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="page-tabs">
        {(data?.viewOptions ?? []).map((option) => (
          <button
            key={option.key}
            type="button"
            className={`page-tab-btn${queryState.view === option.key ? ' active' : ''}`}
            onClick={() => handleViewChange(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <section className="card">
        <div className="card-body watchlist-controls">
          <label className="watchlist-control">
            <span>状态</span>
            <select value={queryState.status ?? 'all'} onChange={(event) => updateFilterParam('status', event.target.value)}>
              {(data?.filterOptions.statusOptions ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="watchlist-control">
            <span>策略</span>
            <select value={queryState.strategy ?? 'all'} onChange={(event) => updateFilterParam('strategy', event.target.value)}>
              {(data?.filterOptions.strategyOptions ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="watchlist-control">
            <span>信号</span>
            <select value={queryState.signal ?? 'all'} onChange={(event) => updateFilterParam('signal', event.target.value)}>
              {(data?.filterOptions.signalOptions ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <div ref={listRef} className="watchlist-list-container">
        {loading ? (
          <div className="watchlist-loading-state">
            <div className="spinner" />
            <span>正在加载交易标的池…</span>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="page-error">
            <div className="page-error-msg">交易标的池加载失败</div>
            <div className="page-error-detail">{error}</div>
            <button className="retry-btn" onClick={refetch}>
              重试
            </button>
          </div>
        ) : null}

        {!loading && !error && queryState.view === 'heat' ? (
          <div className="watchlist-heat-grid">
            {[...rows]
              .sort((a, b) => {
                const score = (row: WatchlistRowVm): number => {
                  let s = 0
                  if (row.buySignal) s += 40
                  if (row.sellSignal) s += 20
                  const vr = row.vrToday ?? 0
                  if (vr >= 2) s += 20
                  else if (vr >= 1) s += 10
                  const gain = Math.abs(row.gainSinceEntry ?? 0) * 100
                  s += Math.min(gain * 2, 20)
                  const dd = Math.abs(row.drawdownFromPeak ?? 0) * 100
                  s += Math.min(dd, 10)
                  return s
                }
                return score(b) - score(a)
              })
              .map((row) => {
                const computeHeat = (r: WatchlistRowVm): number => {
                  let score = 0
                  if (r.buySignal) score += 40
                  if (r.sellSignal) score += 20
                  const vr = r.vrToday ?? 0
                  if (vr >= 2) score += 20
                  else if (vr >= 1) score += 10
                  const gain = Math.abs(r.gainSinceEntry ?? 0) * 100
                  score += Math.min(gain * 2, 20)
                  const dd = Math.abs(r.drawdownFromPeak ?? 0) * 100
                  score += Math.min(dd, 10)
                  return score
                }

                const heatScore = computeHeat(row)
                const heat =
                  heatScore >= 50
                    ? { label: '高热', color: 'var(--up)', bg: 'rgba(239,68,68,0.08)' }
                    : heatScore >= 25
                      ? { label: '中热', color: 'var(--warn)', bg: 'rgba(245,158,11,0.08)' }
                      : { label: '低热', color: 'var(--text-muted)', bg: 'transparent' }

                const gainVal = row.gainSinceEntry
                const gainColor =
                  gainVal && gainVal > 0 ? 'var(--up)' : gainVal && gainVal < 0 ? 'var(--down)' : 'var(--text-muted)'
                const gainText =
                  gainVal != null ? `${gainVal >= 0 ? '+' : ''}${(gainVal * 100).toFixed(2)}%` : '--'

                return (
                  <div
                    key={row.id}
                    className="watchlist-heat-card"
                    style={{ borderTopColor: heat.color, background: heat.bg }}
                    onClick={() => handleRowSelect(row)}
                  >
                    <div className="heat-card-header">
                      <div>
                        <div className="heat-card-name">{row.name}</div>
                        <div className="heat-card-code">{row.tsCode}</div>
                      </div>
                      <span
                        className="heat-card-badge"
                        style={{ color: heat.color, borderColor: heat.color }}
                      >
                        {heat.label}
                      </span>
                    </div>

                    <div className="heat-card-strategy">
                      <span className="watchlist-mini-pill active">
                        {displayStrategyLabel(row.strategy)}
                      </span>
                    </div>

                    <div className="heat-card-stats">
                      <div className="heat-card-stat">
                        <div className="heat-card-stat-label">最新价</div>
                        <div className="heat-card-stat-value">
                          {row.latestClose != null ? Number(row.latestClose).toFixed(2) : '--'}
                        </div>
                      </div>
                      <div className="heat-card-stat">
                        <div className="heat-card-stat-label">入池收益</div>
                        <div className="heat-card-stat-value" style={{ color: gainColor }}>
                          {gainText}
                        </div>
                      </div>
                      <div className="heat-card-stat">
                        <div className="heat-card-stat-label">量比</div>
                        <div className="heat-card-stat-value">
                          {row.vrToday != null ? Number(row.vrToday).toFixed(2) : '--'}
                        </div>
                      </div>
                      <div className="heat-card-stat">
                        <div className="heat-card-stat-label">观察天数</div>
                        <div className="heat-card-stat-value">
                          {row.poolDay != null ? `${row.poolDay}天` : '--'}
                        </div>
                      </div>
                    </div>

                    <div className="heat-card-signal">
                      {row.buySignal && (
                        <span className="watchlist-signal-badge buy">
                          {displaySignalLabel(row.buySignal)}
                        </span>
                      )}
                      {row.sellSignal && (
                        <span className="watchlist-signal-badge sell" style={{ marginLeft: 4 }}>
                          {displaySignalLabel(row.sellSignal)}
                        </span>
                      )}
                      {!row.buySignal && !row.sellSignal && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>无信号</span>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        ) : null}

        {!loading && !error && queryState.view === 'group' ? (
          <WatchlistGroupView groups={groups} selectedCode={selectedCode} onSelect={handleRowSelect} onAction={handleAction} />
        ) : null}

        {!loading && !error && queryState.view === 'table' ? (
          <div className="watchlist-table-shell table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 130, textAlign: 'left' }}>标的</th>
                  <th style={{ width: 100, textAlign: 'left' }}>策略</th>
                  <th style={{ width: 60, textAlign: 'center' }}>状态</th>
                  <th style={{ width: 60, textAlign: 'right' }}>观察天数</th>
                  <th style={{ width: 80, textAlign: 'right' }}>最新价</th>
                  <th style={{ width: 80, textAlign: 'right' }}>入池收益</th>
                  <th style={{ width: 80, textAlign: 'right' }}>最大涨幅</th>
                  <th style={{ width: 70, textAlign: 'right' }}>回撤</th>
                  <th style={{ width: 60, textAlign: 'right' }}>量比</th>
                  <th style={{ width: 80, textAlign: 'center' }}>信号</th>
                  <th style={{ width: 150, textAlign: 'right' }}>动作</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="watchlist-table-empty-row">
                    <td colSpan={11}>
                      <div className="watchlist-empty-state table-empty">
                        <div className="watchlist-empty-title">{data?.emptyTitle ?? '当前没有可展示的交易标的池记录'}</div>
                        <div className="watchlist-empty-text">{data?.emptyText ?? '请调整筛选条件后重试。'}</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      className={selectedCode === row.tsCode ? 'watchlist-table-row selected' : 'watchlist-table-row'}
                      onClick={() => handleRowSelect(row)}
                    >
                      {/* 标的 */}
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{row.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.tsCode}</div>
                      </td>
                      {/* 策略 */}
                      <td>
                        <span className="watchlist-mini-pill active">
                          {displayStrategyLabel(row.strategy)}
                        </span>
                      </td>
                      {/* 状态 */}
                      <td style={{ textAlign: 'center' }}>
                        <WatchlistStatusBadge status={row.lifecycleStatus} />
                      </td>
                      {/* 观察天数 */}
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatDay(row.poolDay)}
                      </td>
                      {/* 最新价 */}
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatPrice(row.latestClose)}
                      </td>
                      {/* 入池收益 */}
                      <td
                        style={{
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: pctColor(row.gainSinceEntry),
                        }}
                      >
                        {formatPct(row.gainSinceEntry)}
                      </td>
                      {/* 最大涨幅 */}
                      <td
                        style={{
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: pctColor(row.maxGain ?? null),
                        }}
                      >
                        {formatPct(row.maxGain ?? null)}
                      </td>
                      {/* 回撤 */}
                      <td
                        style={{
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color:
                            row.drawdownFromPeak == null || row.drawdownFromPeak === 0
                              ? 'var(--text-muted)'
                              : 'var(--down)',
                        }}
                      >
                        {row.drawdownFromPeak != null
                          ? `-${(row.drawdownFromPeak * 100).toFixed(2)}%`
                          : '--'}
                      </td>
                      {/* 量比 */}
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatVr(row.vrToday)}
                      </td>
                      {/* 信号 */}
                      <td style={{ textAlign: 'center' }}>
                        {row.buySignal && (
                          <span className="watchlist-signal-badge buy">
                            {displaySignalLabel(row.buySignal)}
                          </span>
                        )}
                        {row.sellSignal && (
                          <span className="watchlist-signal-badge sell" style={{ marginLeft: 4 }}>
                            {displaySignalLabel(row.sellSignal)}
                          </span>
                        )}
                        {!row.buySignal && !row.sellSignal && (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      {/* 动作 */}
                      <td style={{ textAlign: 'right' }} onClick={(event) => event.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <WatchlistActionMenu
                            actions={row.availableActions}
                            onAction={(action) => handleAction(row, action)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
        </div>
      </section>

      <StockDrawer stock={drawerStock} onClose={() => setDrawerStock(null)} />
    </div>
  )
}
