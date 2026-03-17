import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  buildSystemFocusQueryPatch,
  getSystemRows,
  getSystemTabTitle,
  loadSystemWorkspace,
} from '../../adapters/system'
import SourceBadge from '../../components/data-source/SourceBadge'
import SourceNotice from '../../components/data-source/SourceNotice'
import SourceStrip from '../../components/SourceStrip'
import { getSourcePanelText, getSourcePanelTitle } from '../../components/data-source/sourceLabels'
import { useApiData } from '../../hooks/useApiData'
import type { ApiHealthRow, CoverageItemRow, PipelineStepRow, RunlogVersionRow, SystemRow, SystemTab } from '../../types/system'

const STEP_LABEL: Record<string, string> = {
  intraday_5m: '日内5分钟行情',
  daily_price: '日线行情',
  daily_basic: '每日基础指标',
  adj_factor: '复权因子',
  index_daily: '指数日线',
  intraday_retention_60d: '5分钟历史保留',
  scan_snapshot: '策略扫描快照',
  SUPPLEMENT_DATA: '补充数据',
  ANN_COLLECT: '公告采集',
  EVENT_DETECT: '事件检测',
  RISK_SCORE: '风险评分',
  SIGNAL_GEN: '信号生成',
  PERF_ANALYZE: '绩效分析',
  pool_export: '榜单导出',
  healthcheck: '健康检查',
}

function buildSourceHint(source: string) {
  if (source === 'dashboard') return '当前页承接自 Dashboard，可继续核对首页摘要背后的运行明细。'
  if (source === 'risk') return '当前页承接自风险中心，用于补看运行链路和数据覆盖状态。'
  if (source === 'execution') return '当前页承接自执行工作域，用于补看接口、运行与版本状态。'
  if (source === 'signals') return '当前页承接自信号页，用于核对信号生成链路的运行状态。'
  if (source === 'watchlist') return '当前页承接自交易标的池，用于查看候选样本和数据覆盖状态。'
  if (source === 'portfolio') return '当前页承接自持仓中心，用于查看持仓相关运行状态。'
  return ''
}

function getRowMeta(row: SystemRow) {
  if (row.objectType === 'pipeline-step') {
    const pipelineRow = row as PipelineStepRow
    return [
      { label: 'Owner', value: pipelineRow.owner, numeric: false },
      { label: '耗时', value: pipelineRow.duration, numeric: true },
      { label: '行数', value: pipelineRow.rowCount, numeric: true },
    ]
  }

  if (row.objectType === 'coverage-item') {
    const coverageRow = row as CoverageItemRow
    return [
      { label: '最新交易日', value: coverageRow.latestTradeDate, numeric: true },
      { label: '状态', value: coverageRow.updateStatusLabel, numeric: false, tone: coverageRow.updateStatusLabel === '✓ 已更新' ? 'success' : 'warning' },
      { label: '总行数', value: coverageRow.totalRows, numeric: true },
      ...(coverageRow.dqStatus ? [{ label: 'DQ 状态', value: coverageRow.dqStatus, numeric: false }] : []),
    ]
  }

  if (row.objectType === 'api-item') {
    const apiRow = row as ApiHealthRow
    return [
      ...(apiRow.domain && apiRow.domain !== '--' ? [{ label: '域', value: apiRow.domain, numeric: false }] : []),
      { label: '最近检查', value: apiRow.latestCheck, numeric: true },
      { label: 'HTTP', value: apiRow.httpStatus, numeric: true },
      { label: '响应', value: apiRow.responseHint, numeric: false },
    ]
  }

  const runlogRow = row as RunlogVersionRow
  return [
    { label: '版本', value: runlogRow.versionLabel, numeric: true },
    { label: '发布时间', value: runlogRow.publishedAt, numeric: true },
    { label: '范围', value: runlogRow.scopeHint, numeric: false },
    { label: '异常级别', value: runlogRow.anomalyLevel, numeric: false },
  ]
}

export default function SystemPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const stableFetchKey = useMemo(
    () =>
      `${searchParams.get('tab') ?? 'pipeline'}|${searchParams.get('source') ?? ''}|${searchParams.get('trade_date') ?? ''}`,
    [searchParams.get('tab'), searchParams.get('source'), searchParams.get('trade_date')],
  )
  const { data: viewModel, loading, error } = useApiData(() => loadSystemWorkspace(searchParams), [stableFetchKey])

  const listRef = useRef<HTMLDivElement>(null)
  const scrollPosRef = useRef(0)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  useEffect(() => {
    if (listRef.current && scrollPosRef.current > 0) {
      listRef.current.scrollTop = scrollPosRef.current
    }
  }, [viewModel, searchParams.get('focus')])

  function setTab(tab: SystemTab) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next)
  }

  function setFocus(row: SystemRow) {
    if (listRef.current) scrollPosRef.current = listRef.current.scrollTop
    const next = new URLSearchParams(searchParams)
    const patch = buildSystemFocusQueryPatch(row)

    if (patch.focus !== undefined) next.set('focus', patch.focus)
    if (patch.step !== undefined) {
      if (patch.step) next.set('step', patch.step)
      else next.delete('step')
    }
    if (patch.dataset !== undefined) {
      if (patch.dataset) next.set('dataset', patch.dataset)
      else next.delete('dataset')
    }
    if (patch.api !== undefined) {
      if (patch.api) next.set('api', patch.api)
      else next.delete('api')
    }

    setSearchParams(next)
  }

  if (loading || !viewModel) {
    return (
      <div className="domain-page system-page" data-testid="system-page">
        <div className="page-banner">加载系统中心数据中...</div>
      </div>
    )
  }

  const rows = getSystemRows(viewModel)
  const activeTabState = viewModel.tabStates[viewModel.query.tab]
  const activeDataSource = activeTabState.dataSource ?? viewModel.dataSources[viewModel.query.tab]
  const emptyStateTitle = getSourcePanelTitle(activeDataSource) ?? viewModel.emptyState.title
  const emptyStateText = getSourcePanelText(activeDataSource) ?? viewModel.emptyState.description
  const unsupportedTitle = getSourcePanelTitle(activeDataSource) ?? viewModel.unsupportedState.title
  const unsupportedText = getSourcePanelText(activeDataSource) ?? viewModel.unsupportedState.description

  return (
    <div className="domain-page system-page" data-testid="system-page">
      <section className="system-hero">
        <div className="system-source-hint">{buildSourceHint(viewModel.query.source)}</div>
      </section>

      <SourceStrip meta={viewModel.dataSource} showWhenReal />

      <section className="system-metrics">
        {viewModel.metrics.map((metric) => (
          <article key={metric.key} className="system-metric-card stat-card">
            <span>{metric.label}</span>
            <strong className="numeric">{metric.value}</strong>
            <p>{metric.note}</p>
          </article>
        ))}
      </section>

      <section className="page-tabs system-tabs">
        {viewModel.tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`page-tab-btn${tab.key === viewModel.query.tab ? ' active' : ''}`}
            onClick={() => setTab(tab.key)}
          >
            <span className="system-tab-label">{tab.label}</span>
            <small className="system-tab-desc">{tab.description}</small>
          </button>
        ))}
      </section>

      <section className="system-workspace">
        <div className="system-main card">
          <div className="card-header section-header system-section-header">
            <div className="source-section-head">
              <h2>{getSystemTabTitle(viewModel.query.tab)}</h2>
              <p>{viewModel.dataStateNote}</p>
              <SourceNotice meta={activeDataSource} showWhenReal />
            </div>
            <SourceBadge meta={activeDataSource} showWhenReal />
          </div>

          <div className="card-body">
            {error ? <div className="page-banner warning">{error}</div> : null}

            {viewModel.dataState === 'unsupported' ? (
              <div className="empty-state">
                <h3>{unsupportedTitle}</h3>
                <p>{unsupportedText}</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="empty-state">
                <h3>{emptyStateTitle}</h3>
                <p>{emptyStateText}</p>
              </div>
            ) : (
              <div ref={listRef} className="system-list-container">
              <div className="system-list">
                {rows.map((row) => {
                  const metaItems = getRowMeta(row)

                  return (
                    <button
                      key={row.id}
                      type="button"
                      className={row.id === highlightedId ? 'system-row selected' : 'system-row'}
                      onClick={() => {
                        setFocus(row)
                        setHighlightedId(row.id)
                      }}
                    >
                      <div className="system-row-body">
                        <div className="system-row-top">
                          <div className="system-row-copy">
                            <strong>
                              {row.objectType === 'pipeline-step'
                                ? STEP_LABEL[(row as PipelineStepRow).stepKey] || row.title
                                : row.title}
                            </strong>
                            <p>{row.subtitle}</p>
                          </div>
                        </div>

                        <div className="system-row-meta">
                          {metaItems.map((item) => (
                            <div key={item.label} className="system-row-meta-item">
                              <span>{item.label}</span>
                              <strong
                                className={[
                                  item.numeric ? 'numeric' : '',
                                  item.tone ? `system-row-meta-value--${item.tone}` : '',
                                ].filter(Boolean).join(' ') || undefined}
                              >
                                {item.value}
                              </strong>
                            </div>
                          ))}
                        </div>

                        {row.summary ? <div className="system-row-summary">{row.summary}</div> : null}
                      </div>

                      {row.stateLabel ? (
                        <div
                          className={
                            (row as any).stateTone
                              ? `system-status-pill system-status-pill--${(row as any).stateTone}`
                              : 'system-status-pill'
                          }
                        >
                          {row.stateLabel}
                        </div>
                      ) : null}
                    </button>
                  )
                })}
              </div>
              </div>
            )}
          </div>
        </div>

        <aside className="system-context">
          {viewModel.context ? (
            <div className="card system-context-card">
              <div className="risk-context-body">
                <header className="system-context-header">
                  <div className="system-context-kicker">运行上下文</div>
                  <h3>{viewModel.context.title}</h3>
                  <p>{viewModel.context.subtitle}</p>
                  <span>{viewModel.context.sourceSummary}</span>
                </header>

                {viewModel.context.sections.map((section) => (
                  <section key={section.title} className="system-context-section">
                    <h4>{section.title}</h4>
                    <div className="system-context-grid">
                      {section.items.map((item) => (
                        <div key={item.label} className="system-context-stat">
                          <span>{item.label}</span>
                          <strong className="numeric">{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}

                <section className="system-context-section">
                  <h4>后续动作</h4>
                  <div className="system-next-steps">
                    {viewModel.context.nextSteps.map((step) => (
                      <article key={step.label} className="system-next-step">
                        <strong>{step.label}</strong>
                        <p>{step.note}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="card system-context-card">
              <div className="risk-context-body">
                <div className="system-context-empty-kicker">运行上下文</div>
                <div className="system-context-empty-summary">
                  <span>{getSystemTabTitle(viewModel.query.tab)}</span>
                  <strong className="numeric">{viewModel.filterChips.find((chip) => chip.key === 'source')?.value ?? '直接进入'}</strong>
                </div>
                <h3>{viewModel.noFocus.title}</h3>
                <p className="execution-empty-text">{viewModel.noFocus.description}</p>
                <div className="system-context-empty-list">
                  <div className="system-context-empty-item">
                    <strong>查看运行对象</strong>
                    <span>选中一条流程、覆盖、接口或日志记录后，会在右侧展示上下文信息。</span>
                  </div>
                  <div className="system-context-empty-item">
                    <strong>状态承接</strong>
                    <span>当前页会保留来源页与 focus 信息，便于回查问题链路。</span>
                  </div>
                </div>
                <p className="system-context-empty-note">{buildSourceHint(viewModel.query.source)}</p>
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}
