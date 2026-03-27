import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { buildResearchQuery, loadResearchWorkspace } from '../../adapters/research'
import { buildResearchDetailHref } from '../../adapters/researchDetail'
import SourceBadge from '../../components/data-source/SourceBadge'

import { getSourcePanelText, getSourcePanelTitle } from '../../components/data-source/sourceLabels'
import { useContextPanel } from '../../context/useContextPanel'
import { useApiData } from '../../hooks/useApiData'
import type { ResearchTab, ResearchWorkspaceViewModel } from '../../types/research'
import { getStrategyDisplayName } from '../../utils/displayNames'
import DailyReview from './DailyReview'

const TAB_ORDER: ResearchTab[] = ['summary', 'ic', 'attribution', 'resonance', 'review']

const TAB_LABELS: Record<ResearchTab, string> = {
  summary: '回测概览',
  ic: '因子 IC',
  attribution: '归因分析',
  resonance: '共振研究',
  review: '每日复盘',
}

function formatPercent(value: number | null | undefined, digits = 2) {
  return value != null ? `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%` : '--'
}

function formatNumber(value: number | null | undefined, digits = 2) {
  return value != null ? value.toFixed(digits) : '--'
}

const TONE_COLUMNS = ['t5', 'winRate', 'drawdown', 'ic', 'icir']

function resolveTable(viewModel: ResearchWorkspaceViewModel, tab: ResearchTab) {
  type TableRowVm = {
    id: string
    actionKey: string | null
    cells: Record<string, string>
    numericKeys: string[]
    valueForTone?: Record<string, number>
    comboSubtitle?: string
    _factorEnName?: string
    _applied?: boolean
  }

  if (tab === 'summary') {
    return {
      title: '策略回测概览',
      columns: [
        { key: 'strategy', label: '策略' },
        { key: 'sampleN', label: '样本数', align: 'right' as const },
        { key: 't5', label: 'T+5', align: 'right' as const },
        { key: 'winRate', label: '胜率', align: 'right' as const },
        { key: 'drawdown', label: '回撤', align: 'right' as const },
      ],
      rows: viewModel.summaryRows.map<TableRowVm>((row) => ({
        id: row.id,
        actionKey: row.strategy,
        cells: {
          strategy: getStrategyDisplayName(row.strategy) ?? row.strategy,
          sampleN: String(row.sampleN),
          t5: formatPercent(row.returns.T5),
          winRate: formatPercent(row.winRate, 1),
          drawdown: formatPercent(-Math.abs(row.drawdown), 1),
        },
        numericKeys: ['sampleN', 't5', 'winRate', 'drawdown'],
        valueForTone: {
          t5: row.returns.T5,
          winRate: row.winRate,
          drawdown: row.drawdown ?? 0,
        },
      })),
      emptyTitle: '当前暂无回测结果',
      emptyText: '策略回测样本为空时，这里会显示策略维度的回测概览。',
    }
  }

  if (tab === 'ic') {
    return {
      title: '因子 IC 概览',
      columns: [
        { key: 'factorName', label: '因子' },
        { key: 'group', label: '分组' },
        { key: 'horizon', label: '周期' },
        { key: 'ic', label: 'IC', align: 'right' as const },
        { key: 'icir', label: 'ICIR', align: 'right' as const },
        { key: 'applied', label: '应用状态', align: 'center' as const },
        { key: 'formula', label: '公式' },
        { key: 'note', label: '说明' },
      ],
      rows: viewModel.icSummaryRows.map<TableRowVm>((row) => ({
        id: row.id,
        actionKey: null,
        cells: {
          factorName: row.factorCn,
          group: row.group || '--',
          horizon: row.horizon,
          ic: formatNumber(row.ic, 4),
          icir: formatNumber(row.icir, 4),
          applied: row.applied ? '✓ 排序中' : '—',
          formula: row.formula || '--',
          note: row.note || '—',
        },
        numericKeys: ['ic', 'icir'],
        valueForTone: { ic: row.ic, icir: row.icir },
        _factorEnName: row.factorName,
        _applied: row.applied,
      })),
      emptyTitle: '真实接口已通，当前暂无数据',
      emptyText: '因子 IC 接口已接通，当前交易日暂无可展示的因子样本。',
    }
  }

  if (tab === 'attribution') {
    return {
      title: '归因分组概览',
      columns: [
        { key: 'groupKey', label: '分组' },
        { key: 'sampleN', label: '样本数', align: 'right' as const },
        { key: 'avgReturn', label: '平均收益', align: 'right' as const },
        { key: 'winRate', label: '胜率', align: 'right' as const },
      ],
      rows: viewModel.attributionRows.map<TableRowVm>((row) => ({
        id: row.id,
        actionKey: null,
        cells: {
          groupKey: row.groupKey,
          sampleN: String(row.sampleN),
          avgReturn: formatPercent(row.avgReturn),
          winRate: formatPercent(row.winRate, 1),
        },
        numericKeys: ['sampleN', 'avgReturn', 'winRate'],
      })),
      emptyTitle: '真实接口已通，当前暂无数据',
      emptyText: '归因接口已接通，当前交易日暂无可展示的分组结果。',
    }
  }

  return {
    title: '共振组合概览',
    columns: [
      { key: 'combo', label: '组合' },
      { key: 'strategyCount', label: '策略数', align: 'right' as const },
      { key: 'strategiesDisplay', label: '策略组合' },
      { key: 'avgScore', label: '超额收益', align: 'right' as const },
    ],
    rows: viewModel.resonanceRows.map<TableRowVm>((row) => ({
      id: row.id,
      actionKey: null,
      cells: {
        combo: row.name,
        strategyCount: String(row.strategyCount),
        strategiesDisplay: row.strategiesDisplay,
        avgScore: formatNumber(row.avgScore, 2),
      },
      numericKeys: ['strategyCount', 'avgScore'],
      comboSubtitle: row.tsCode,
    })),
    emptyTitle: '当前暂无共振样本',
    emptyText: '当策略组合没有形成有效共振样本时，这里会显示空表状态。',
  }
}

const IC_GROUPS = ['全部', '动量', '波动率', 'K线', '均线', '极值', '成交量', '量价'] as const

export default function ResearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { closePanel } = useContextPanel()
  const [icGroupFilter, setIcGroupFilter] = useState<string>('全部')
  const query = useMemo(() => buildResearchQuery(searchParams), [searchParams])
  const stableFetchKey = useMemo(
    () =>
      `${query.tab}|${query.source ?? ''}|${query.tradeDate ?? ''}|${query.riskLevel ?? ''}|${query.resonance ?? ''}`,
    [query.tab, query.source, query.tradeDate, query.riskLevel, query.resonance],
  )
  const { data, loading, error, refetch } = useApiData(() => loadResearchWorkspace(query), [stableFetchKey])

  const listRef = useRef<HTMLDivElement>(null)
  const scrollPosRef = useRef(0)

  useEffect(() => {
    closePanel()
  }, [closePanel])

  useEffect(() => {
    if (listRef.current && scrollPosRef.current > 0) {
      listRef.current.scrollTop = scrollPosRef.current
    }
  }, [data, query.strategy])

  const activeTab = data?.tabs[query.tab] ?? data?.tabs.summary
  const activeState = data?.tabStates[query.tab] ?? data?.tabStates.summary
  const activeDataSource = activeState?.dataSource ?? data?.dataSources[query.tab]
  const tableModelRaw = data ? resolveTable(data, query.tab) : null
  const tableModel = useMemo(() => {
    if (!tableModelRaw || query.tab !== 'ic' || icGroupFilter === '全部') return tableModelRaw
    return { ...tableModelRaw, rows: tableModelRaw.rows.filter(r => r.cells.group === icGroupFilter) }
  }, [tableModelRaw, query.tab, icGroupFilter])
  const emptyTitle = getSourcePanelTitle(activeDataSource) ?? activeTab?.emptyTitle ?? tableModel?.emptyTitle ?? '当前暂无研究数据'
  const emptyText = getSourcePanelText(activeDataSource) ?? activeTab?.emptyText ?? tableModel?.emptyText ?? '相关研究结果会在这里展示。'

  function syncTab(tab: ResearchTab) {
    const next = new URLSearchParams(searchParams)
    if (tab === 'summary') next.delete('tab')
    else next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  function handleRowClick(actionKey: string | null) {
    if (listRef.current) scrollPosRef.current = listRef.current.scrollTop
    if (!actionKey) return
    if (query.tab === 'summary') {
      navigate(buildResearchDetailHref('backtest', actionKey, { ...query, strategy: actionKey }))
    }
  }

  return (
    <div className="domain-page research-page" data-testid="research-page">
      <div className="research-overview-strip">
        {(data?.metrics ?? []).map((metric) => {
          const isTextKpi = metric.label === '聚焦策略' || metric.label === '数据来源'
          return (
            <article key={metric.label} className="research-summary-card compact stat-card">
              <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>{metric.label}</div>
              <div className="stat-value numeric" style={isTextKpi ? { fontSize: '16px', fontWeight: 700 } : undefined}>{metric.value}</div>
            </article>
          )
        })}
      </div>

      <div className="page-tabs research-tabs">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`page-tab-btn${query.tab === tab ? ' active' : ''}`}
            onClick={() => syncTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {query.tab === 'review' ? (
        <div className="review-container">
          <DailyReview />
        </div>
      ) : (
      <div className="research-layout">
        <section className="card research-main">
          <div className="card-header research-section-header">
            <div className="source-section-head">

            </div>
            <SourceBadge meta={activeDataSource} showWhenReal />
          </div>

          {query.tab === 'ic' && !loading && !error ? (
            <div className="ic-group-filter-bar">
              <div className="ic-group-filter-tags">
                {IC_GROUPS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`ic-group-tag${icGroupFilter === g ? ' active' : ''}`}
                    onClick={() => setIcGroupFilter(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <span className="ic-group-filter-count">共 {tableModel?.rows.length ?? 0} 条</span>
            </div>
          ) : null}

          {loading ? (
            <div className="page-loading">
              <div className="spinner" />
              加载研究数据中...
            </div>
          ) : null}

          {!loading && error ? (
            <div className="page-error">
              <div className="page-error-msg">研究数据加载失败</div>
              <div className="page-error-detail">{error}</div>
              <button type="button" className="btn-secondary retry-btn" onClick={refetch}>
                重新加载
              </button>
            </div>
          ) : null}

          {!loading && !error ? (
            <div className="card-body research-table-shell">
              {data && tableModel ? (
                <>
                  {tableModel.rows.length === 0 ? (
                    <div className="empty-state research-empty-state">
                      <h3>{emptyTitle}</h3>
                      <p>{emptyText}</p>
                    </div>
                  ) : (
                    <div ref={listRef} className="research-list-container">
                    <div className="table-shell research-table-shell">
                      <table className="data-table research-compare-table">
                        <thead>
                          <tr>
                            {tableModel.columns.map((column) => (
                              <th
                                key={column.key}
                                className={column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : undefined}
                              >
                                {column.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tableModel.rows.map((row) => (
                            <tr
                              key={row.id}
                              className={row.actionKey ? 'research-table-row' : undefined}
                              onClick={row.actionKey ? () => handleRowClick(row.actionKey) : undefined}
                            >
                          {tableModel.columns.map((column) => {
                            const isNumeric = row.numericKeys.includes(column.key)
                            const toneValue = row.valueForTone && TONE_COLUMNS.includes(column.key) ? row.valueForTone[column.key] : null
                            const toneClass = toneValue != null ? (toneValue > 0 ? 'c-up' : toneValue < 0 ? 'c-down' : '') : ''
                            const spanClass = [isNumeric ? 'numeric' : '', toneClass].filter(Boolean).join(' ') || undefined
                            const isComboWithSubtitle = column.key === 'combo' && row.comboSubtitle != null
                            const isFactorNameWithEn = column.key === 'factorName' && row._factorEnName != null
                            const isAppliedCol = column.key === 'applied'
                            const isFormulaCol = column.key === 'formula'
                            const isNoteCol = column.key === 'note'
                            return (
                              <td
                                key={`${row.id}-${column.key}`}
                                className={column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : undefined}
                              >
                                {isComboWithSubtitle ? (
                                  <>
                                    <div className="research-cell-title">{row.cells[column.key]}</div>
                                    <div className="portfolio-inline-meta numeric-muted">{row.comboSubtitle}</div>
                                  </>
                                ) : isFactorNameWithEn ? (
                                  <>
                                    <div className="research-cell-title">{row.cells[column.key]}</div>
                                    <div className="ic-factor-en">{row._factorEnName}</div>
                                  </>
                                ) : isAppliedCol ? (
                                  <span className={row._applied ? 'ic-applied-active' : 'ic-applied-inactive'}>{row.cells[column.key]}</span>
                                ) : isFormulaCol ? (
                                  <span className="ic-formula">{row.cells[column.key]}</span>
                                ) : isNoteCol ? (
                                  <span className="ic-note">{row.cells[column.key]}</span>
                                ) : (
                                  <span className={spanClass}>{row.cells[column.key]}</span>
                                )}
                              </td>
                            )
                          })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state research-empty-state">
                  <h3>{emptyTitle}</h3>
                  <p>{emptyText}</p>
                </div>
              )}
            </div>
          ) : null}
        </section>
      </div>
      )}
    </div>
  )
}
