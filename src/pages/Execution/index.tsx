import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadExecutionWorkspace } from '../../adapters/execution'
import SourceStrip from '../../components/SourceStrip'
import { useContextPanel } from '../../context/useContextPanel'
import { useApiData } from '../../hooks/useApiData'
import type { StockContextPanelPayload } from '../../types/contextPanel'
import type {
  ExecutionConstraintRow,
  ExecutionRow,
  ExecutionTab,
  SimFillRow,
  SimOrderRow,
  SimPositionRow,
} from '../../types/execution'

const TAB_TITLES: Record<ExecutionTab, string> = {
  orders: '模拟订单',
  positions: '模拟持仓',
  fills: '模拟成交',
  constraints: '执行约束',
}

const BADGE_BASE: CSSProperties = {
  display: 'inline-flex',
  padding: '2px 8px',
  borderRadius: 3,
  fontSize: 11,
  fontWeight: 600,
  marginRight: 6,
}

const BADGE_BLUE = { ...BADGE_BASE, background: 'rgba(59,130,246,0.15)', color: '#3B82F6' }
const BADGE_RED = { ...BADGE_BASE, background: 'rgba(220,38,38,0.15)', color: '#DC2626' }
const BADGE_GREEN = { ...BADGE_BASE, background: 'rgba(34,197,94,0.15)', color: '#22C55E' }
const BADGE_ORANGE = { ...BADGE_BASE, background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }
const BADGE_GRAY = { ...BADGE_BASE, background: 'rgba(107,114,128,0.15)', color: '#8B9AB5' }

function getExecutionBadgeStyle(
  label: string,
  kind: 'source' | 'strategy' | 'allow' | 'risk' | 'cap',
): CSSProperties {
  if (kind === 'allow') {
    if (label === '禁止下单') return BADGE_RED
    if (label === '允许下单') return BADGE_BLUE
    if (label.includes('需控制仓位')) return BADGE_ORANGE
    return BADGE_GRAY
  }
  if (kind === 'risk') {
    if (label === '低风险') return BADGE_GREEN
    if (label === '中风险') return BADGE_ORANGE
    if (label === '高风险') return BADGE_RED
    return BADGE_GRAY
  }
  if (kind === 'cap') {
    if (label.includes('建议按') && label.includes('仓位系数执行')) return BADGE_GRAY
    if (label === '当前未给出明确仓位上限') return BADGE_GRAY
    if (label.includes('当前不建议建立执行仓位')) return BADGE_RED
    return BADGE_GRAY
  }
  if (kind === 'source') {
    if (label === '直接进入') return BADGE_BLUE
    return BADGE_GRAY
  }
  if (kind === 'strategy') {
    if (label === '未指定策略') return BADGE_GRAY
    return BADGE_GRAY
  }
  return BADGE_GRAY
}

function formatNumber(value: number, digits = 2) {
  return value.toFixed(digits)
}

const OBSERVING_START_DATE = '2026-03-05'
const OBSERVING_START_MS = new Date(`${OBSERVING_START_DATE}T00:00:00`).getTime()

function calculateObservingDays(tradeDate: string) {
  return Math.max(0, Math.floor((new Date(`${tradeDate}T00:00:00`).getTime() - OBSERVING_START_MS) / 86_400_000))
}

function buildExecutionContextPanelPayload(row: ExecutionRow): StockContextPanelPayload {
  return {
    title: row.name,
    name: row.name,
    tsCode: row.tsCode,
    sourceStrategy: row.sourceStrategy,
    subtitle: row.statusLabel,
    summary: row.summary,
    tags: [
      { label: row.sourceLabel, tone: 'source' },
      { label: row.strategyLabel, tone: 'strategy' },
      { label: row.tradeAllowedLabel, tone: 'state' },
      { label: row.riskLevelLabel, tone: 'risk' },
    ],
    summaryItems: [
      { label: '对象', value: TAB_TITLES[row.objectType === 'order' ? 'orders' : row.objectType === 'position' ? 'positions' : row.objectType === 'fill' ? 'fills' : 'constraints'] },
      { label: '来源', value: row.sourceLabel },
      { label: '策略', value: row.strategyLabel },
      { label: '交易结论', value: row.tradeAllowedLabel },
      { label: '风控等级', value: row.riskLevelLabel },
      { label: '仓位倍率', value: row.positionCapText },
      { label: '拦截原因', value: row.blockReason ?? '--' },
    ],
    actions: [
      {
        label: '查看风控中心',
        href: `/risk?tab=breakdown&source=execution&focus=${encodeURIComponent(row.tsCode)}&scope=portfolio`,
        note: '查看当前标的的风控拆解和约束来源。',
      },
      {
        label: '查看持仓中心',
        href: `/portfolio?source=execution&focus=${encodeURIComponent(row.tsCode)}`,
        note: '查看当前标的在持仓中心的承接结果。',
      },
      {
        label: '查看研究中心',
        href: `/research?source=execution&focus=${encodeURIComponent(row.tsCode)}${row.sourceStrategy ? `&strategy=${encodeURIComponent(row.sourceStrategy)}` : ''}`,
        note: '查看当前标的的研究承接与策略背景。',
      },
      {
        label: '查看运行中心',
        href: '/system?source=execution&tab=api',
        note: '查看执行相关的接口和运行状态。',
      },
    ],
  }
}

function renderRowSummary(row: ExecutionRow) {
  if (row.objectType === 'order') {
    const order = row as SimOrderRow
    return (
      <>
        <span className="execution-inline-meta">{order.side === 'buy' ? '买入订单' : '卖出订单'}</span>
        <span className="execution-inline-meta numeric">{order.qty} 股</span>
        <span className="execution-inline-meta numeric">{formatNumber(order.price)}</span>
        <span className="execution-inline-meta">{order.orderStatusLabel}</span>
      </>
    )
  }

  if (row.objectType === 'position') {
    const position = row as SimPositionRow
    return (
      <>
        <span className="execution-inline-meta numeric">{position.shares} 股</span>
        <span className="execution-inline-meta numeric">入场 {formatNumber(position.entryPrice)}</span>
        <span className="execution-inline-meta numeric">浮盈 {formatNumber(position.unrealizedPnlPct)}%</span>
      </>
    )
  }

  if (row.objectType === 'fill') {
    const fill = row as SimFillRow
    return (
      <>
        <span className="execution-inline-meta">{fill.side === 'buy' ? '买入成交' : '卖出成交'}</span>
        <span className="execution-inline-meta numeric">{fill.fillQty} 股</span>
        <span className="execution-inline-meta numeric">{formatNumber(fill.fillPrice)}</span>
        <span className="execution-inline-meta">{fill.fillStatusLabel}</span>
      </>
    )
  }

  const constraint = row as ExecutionConstraintRow
  return (
    <>
      <span className="execution-inline-meta">{constraint.constraintStatusLabel}</span>
      <span className="execution-inline-meta">{constraint.positionCapText}</span>
      <span className="execution-inline-meta">{constraint.actionHint}</span>
    </>
  )
}

export default function ExecutionPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { openPanel, closePanel } = useContextPanel()
  const stableFetchKey = useMemo(
    () =>
      `${searchParams.get('tab') ?? 'constraints'}|${searchParams.get('source') ?? ''}|${searchParams.get('strategy') ?? ''}`,
    [searchParams.get('tab'), searchParams.get('source'), searchParams.get('strategy')],
  )
  const { data, loading, error } = useApiData(() => loadExecutionWorkspace(searchParams), [stableFetchKey])

  const activeTab = data?.query.tab ?? 'constraints'
  const rows =
    !data
      ? []
      : activeTab === 'orders'
        ? data.orders
        : activeTab === 'positions'
          ? data.positions
          : activeTab === 'fills'
            ? data.fills
            : data.constraints

  const activeRow =
    rows.find((row) => row.id === data?.selectedId) ??
    rows.find((row) => row.tsCode === data?.query.focus || row.focusKey === data?.query.focus) ??
    null

  const focusMissNote =
    data?.query.focus && !activeRow ? `未定位到 ${data.query.focus}，当前展示该标签下的默认结果。` : null
  const daysSinceStart = calculateObservingDays(activeRow?.tradeDate ?? OBSERVING_START_DATE)

  function setTab(tab: ExecutionTab) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next)
  }

  const listRef = useRef<HTMLDivElement>(null)
  const scrollPosRef = useRef(0)

  function setFocus(row: ExecutionRow) {
    if (listRef.current) scrollPosRef.current = listRef.current.scrollTop
    const next = new URLSearchParams(searchParams)
    next.set('focus', row.focusKey)
    setSearchParams(next)
  }

  useEffect(() => {
    if (listRef.current && scrollPosRef.current > 0) {
      listRef.current.scrollTop = scrollPosRef.current
    }
  }, [data, activeRow])

  useEffect(() => {
    if (!activeRow) {
      closePanel()
      return
    }

    openPanel({
      entityType: 'stock',
      entityKey: activeRow.tsCode,
      sourcePage: 'execution',
      focus: activeRow.tsCode,
      activeTab,
      payloadVersion: 'v1',
      payload: buildExecutionContextPanelPayload(activeRow),
    })
  }, [activeRow, activeTab, openPanel, closePanel])

  useEffect(() => () => closePanel(), [closePanel])

  return (
    <div className="domain-page execution-page" data-testid="execution-page">
      <SourceStrip type="observing" message={`模拟盘观察期 · 第 ${daysSinceStart} 天 · 数据自 2026-03-05 起累积，样本量尚不具统计意义。`} />

      <section className="page-tabs execution-tabs">
        {(data?.tabs ?? []).map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`page-tab-btn${tab.key === activeTab ? ' active' : ''}`}
            onClick={() => setTab(tab.key)}
            style={{ display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <span className="execution-tab-label">{tab.label}</span>
            <span
              className="execution-tab-count-badge"
              style={{
                display: 'inline-flex',
                marginLeft: 6,
                padding: '0 6px',
                borderRadius: 100,
                fontSize: 11,
                fontWeight: 600,
                background: 'rgba(59,130,246,0.15)',
                color: '#3B82F6',
                minWidth: 18,
                justifyContent: 'center',
              }}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </section>

      {loading ? <div className="page-banner">加载模拟执行数据中...</div> : null}
      {error ? <div className="page-banner warning">模拟执行数据加载失败：{error}</div> : null}
      {focusMissNote ? <div className="page-banner warning">{focusMissNote}</div> : null}

      <section className="execution-workspace">
        <div className="execution-main card">
          <div className="card-body">
            {rows.length === 0 ? (
              <div className="empty-state execution-empty-state">
                <h3>当前暂无可展示的执行对象</h3>
                <p>{data?.noFocus.description ?? '执行样本会在这里展示。'}</p>
              </div>
            ) : (
              <div ref={listRef} className="execution-list-container">
              <div className="execution-list">
                {rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={row.id === data?.selectedId ? 'execution-row selected' : 'execution-row'}
                    onClick={() => setFocus(row)}
                  >
                    <div className="execution-row-top">
                      <div className="execution-row-copy">
                        <strong className="execution-row-title">
                          <span className="execution-row-name">{row.name}</span>
                          <span className="execution-row-code numeric">{row.tsCode}</span>
                        </strong>
                        <p>{renderRowSummary(row)}</p>
                      </div>
                      <div className={`execution-status-pill execution-status-${row.constraintStatus}`}>{row.constraintStatusLabel}</div>
                    </div>
                    <div className="execution-row-summary">{row.summary}</div>
                    <div className="execution-row-bottom">
                      <span style={getExecutionBadgeStyle(row.sourceLabel, 'source')}>{row.sourceLabel}</span>
                      <span style={getExecutionBadgeStyle(row.strategyLabel, 'strategy')}>{row.strategyLabel}</span>
                      <span style={getExecutionBadgeStyle(row.tradeAllowedLabel, 'allow')}>{row.tradeAllowedLabel}</span>
                      <span style={getExecutionBadgeStyle(row.riskLevelLabel, 'risk')}>{row.riskLevelLabel}</span>
                      <span style={getExecutionBadgeStyle(row.positionCapText, 'cap')}>{row.positionCapText}</span>
                    </div>
                  </button>
                ))}
              </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
