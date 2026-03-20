import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  buildSystemFocusQueryPatch,
  getSystemRows,
  loadSystemWorkspace,
} from '../../adapters/system'
import SourceBadge from '../../components/data-source/SourceBadge'
import SourceNotice from '../../components/data-source/SourceNotice'
import { getSourcePanelText, getSourcePanelTitle } from '../../components/data-source/sourceLabels'
import { useApiData } from '../../hooks/useApiData'
import type { ApiHealthRow, CoverageItemRow, PipelineStepRow, RunlogVersionRow, SystemRow, SystemTab } from '../../types/system'

const TABLE_CN: Record<string, string> = {
  ashare_daily_price: '日线行情', ashare_daily_basic: '基础指标', ashare_adj_factor: '复权因子',
  ashare_daily_price_adj: '复权日线', ashare_index_daily_price: '指数日线', ashare_intraday_5m: '5分钟行情',
  ashare_fin_income: '利润表', ashare_fin_balance: '资产负债表', ashare_fin_cashflow: '现金流量表',
  ashare_audit_opinion: '审计意见', ashare_stock_basic: '股票基础', ashare_trade_calendar: '交易日历',
  ashare_pledge_stat: '质押统计', ashare_risk_score: '风险评分', ashare_market_breadth: '市场宽度',
  ashare_ths_concept: '概念定义', ashare_ths_concept_member: '概念成分股', ashare_ths_hot_stock: '热股榜',
  ashare_ths_hot_concept: '概念热度', ashare_concept_daily_stats: '板块日度统计', ashare_market_distribution: '涨跌分布',
  ashare_market_turnover: '成交额汇总', ashare_market_summary: 'AI综述', ashare_watchlist: '交易标的池',
  ashare_vol_surge_pool: '放量蓄势池', ashare_portfolio: '持仓', ashare_sim_orders: '模拟订单',
}

const API_CN: Record<string, string> = {
  health: '健康检查', dashboard_summary: 'Dashboard摘要', watchlist_stats: '标的池统计',
  portfolio: '持仓中心', signals: '信号中心', risk: '风控中心', system: '系统中心',
  context: '上下文面板', market: '市场数据', research: '研究中心', execution: '执行中心',
}

const STEP_LABEL: Record<string, string> = {
  intraday_5m: '5分钟行情', daily_price: '日线行情', daily_basic: '基础指标',
  adj_factor: '复权因子', index_daily: '指数日线', intraday_retention_60d: '5分钟清理',
  scan_snapshot: '策略快照', SUPPLEMENT_DATA: '补充数据', ANN_COLLECT: '公告采集',
  EVENT_DETECT: '事件检测', RISK_SCORE: '风险评分', MARKET_BREADTH: '市场宽度',
  'VOL_SURGE:SCAN': '放量:扫描', 'VOL_SURGE:TRACK': '放量:跟踪',
  retoc2_v3_signals: 'RETOC2信号', pattern_t2up9_2dup_lt5: 'T2UP9候选',
  pattern_t2up9_watch: 'T2UP9观察', WEAK_BUY: '弱市吸筹', WEAK_BUY_TRIGGER: '弱市触发',
  WATCH_EXPIRE: '观察过期', WATCHLIST_ENTRY: '入池', WATCHLIST_TRACK: '池跟踪',
  WATCHLIST_SIGNAL: '信号生成', POSITION_SIZE: '仓位计算', SELL_SIGNAL: '卖点信号',
  SIM_ENGINE: '模拟引擎', WATCHLIST_EXIT: '退池', PORTFOLIO_TRACK: '持仓跟踪',
  SYNC_LEGACY: '同步兼容', FACTOR_IC: '因子IC', PERF_ANALYZE: '绩效分析',
  DATA_AUDIT: '数据审计', strategy_snapshot: '策略快照', index_turnover: '指数成交额',
  ths_hot_daily: '热度采集', concept_drift_fix: '概念修正', concept_daily_stats: '板块统计',
  market_summary_gen: 'AI综述', mailer: '邮件通知', dq_gate: '数据质量',
  healthcheck: '健康检查', pool_export: '榜单导出', SIGNAL_GEN: '信号生成',
}

// getRowMeta removed — all tabs now use inline compact rendering

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
      <section className="system-metrics">
        {viewModel.metrics.map((metric) => (
          <article key={metric.key} className="system-metric-card stat-card">
            <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>{metric.label}</span>
            <strong className="numeric">{metric.value}</strong>
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
          </button>
        ))}
      </section>

      <section className="system-workspace">
        <div className="system-main card">
          <div className="card-header section-header system-section-header">
            <div className="source-section-head">
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
                  // Pipeline steps: compact single-row layout
                  if (row.objectType === 'pipeline-step') {
                    const pr = row as PipelineStepRow
                    const tone = pr.stateTone ?? (pr.stateLabel === '成功' ? 'success' : 'fail')
                    return (
                      <div key={row.id} className={`pipeline-row${row.id === highlightedId ? ' selected' : ''}`} onClick={() => { setFocus(row); setHighlightedId(row.id) }}>
                        <span className="pipeline-name">{STEP_LABEL[pr.stepKey] || row.title}</span>
                        <span className="pipeline-duration numeric">{pr.duration}</span>
                        <span className="pipeline-rows numeric">{pr.rowCount}</span>
                        <span className={`pipeline-badge ${tone === 'success' ? 'badge-green' : tone === 'fail' ? 'badge-red' : 'badge-yellow'}`}>{row.stateLabel}</span>
                        <span className="pipeline-log" title={row.summary ?? ''}>{row.summary ?? ''}</span>
                      </div>
                    )
                  }

                  // Coverage: compact row
                  if (row.objectType === 'coverage-item') {
                    const cr = row as CoverageItemRow
                    const ok = cr.updateStatusLabel === '✓ 已更新'
                    return (
                      <div key={row.id} className={`pipeline-row coverage-row${row.id === highlightedId ? ' selected' : ''}`} onClick={() => { setFocus(row); setHighlightedId(row.id) }}>
                        <span className="pipeline-name">{TABLE_CN[cr.datasetKey] || row.title}</span>
                        <span className="pipeline-duration numeric">{cr.latestTradeDate}</span>
                        <span className="pipeline-rows numeric">{cr.totalRows}</span>
                        <span className={`pipeline-badge ${ok ? 'badge-green' : 'badge-yellow'}`}>{ok ? '正常' : '待更新'}</span>
                        <span className="pipeline-log">{cr.dqStatus || cr.freshness || ''}</span>
                      </div>
                    )
                  }

                  // API health: compact row
                  if (row.objectType === 'api-item') {
                    const ar = row as ApiHealthRow
                    const ok = ar.stateTone === 'success' || ar.healthLabel === '正常'
                    return (
                      <div key={row.id} className={`pipeline-row health-row${row.id === highlightedId ? ' selected' : ''}`} onClick={() => { setFocus(row); setHighlightedId(row.id) }}>
                        <span className="pipeline-name">{API_CN[ar.apiKey] || row.title}</span>
                        <span className="pipeline-duration numeric">{ar.httpStatus}</span>
                        <span className="pipeline-rows numeric">{(ar.latestCheck ?? '').replace('T', ' ').substring(0, 19)}</span>
                        <span className={`pipeline-badge ${ok ? 'badge-green' : 'badge-red'}`}>{row.stateLabel || ar.healthLabel}</span>
                        <span className="pipeline-log">{ar.responseHint || ''}</span>
                      </div>
                    )
                  }

                  // Runlog: compact row
                  if (row.objectType === 'runlog-item') {
                    const rr = row as RunlogVersionRow
                    return (
                      <div key={row.id} className={`pipeline-row runlog-row${row.id === highlightedId ? ' selected' : ''}`} onClick={() => { setFocus(row); setHighlightedId(row.id) }}>
                        <span className="pipeline-name">{row.title}</span>
                        <span className="pipeline-duration numeric">{(rr.publishedAt ?? '').replace('T', ' ').substring(0, 19)}</span>
                        <span className="pipeline-rows">{rr.scopeHint}</span>
                        <span className={`pipeline-badge ${rr.stateTone === 'fail' ? 'badge-red' : 'badge-green'}`}>{row.stateLabel || rr.anomalyLevel}</span>
                        <span className="pipeline-log" title={rr.logHint}>{rr.logHint || ''}</span>
                      </div>
                    )
                  }

                  // Fallback (should not reach)
                  return null
                })}
              </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
