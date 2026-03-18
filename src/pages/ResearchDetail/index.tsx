import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { loadResearchWorkspace } from '../../adapters/research'
import {
  buildResearchDetailHref,
  buildResearchDetailQuery,
  normalizeResearchDetailRouteTab,
  resolveResearchDetailViewModel,
} from '../../adapters/researchDetail'
import SourceBadge from '../../components/data-source/SourceBadge'
import SourceSummaryBar from '../../components/data-source/SourceSummaryBar'
import { getSourcePanelText, getSourcePanelTitle } from '../../components/data-source/sourceLabels'
import { useContextPanel } from '../../context/useContextPanel'
import { useApiData } from '../../hooks/useApiData'
import type { StockContextPanelPayload } from '../../types/contextPanel'
import type { BacktestDetailRow } from '../../types/research'
import type {
  AttributionDetailVm,
  BacktestDetailVm,
  FactorIcDetailVm,
  ResearchDetailRouteTab,
  ResearchDetailSummaryItem,
  ResearchDetailTableColumn,
  ResearchDetailTableRow,
  ResearchDetailViewModel,
  ResonanceDetailVm,
} from '../../types/researchDetail'
import { getStrategyDisplayName } from '../../utils/displayNames'

const DETAIL_KIND_LABELS: Record<ResearchDetailRouteTab, string> = {
  backtest: '回测详情',
  'factor-ic': '因子 IC 详情',
  attribution: '归因详情',
  resonance: '共振详情',
}

function formatChartNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '--'
}

function chartTone(value: number | null | undefined): 'up' | 'down' | 'muted' {
  if (value == null || !Number.isFinite(value)) return 'muted'
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'muted'
}

function buildResearchContextPanelPayload(row: BacktestDetailRow): StockContextPanelPayload {
  const strategyLabel = getStrategyDisplayName(row.strategy) ?? row.strategy

  return {
    title: row.name,
    name: row.name,
    tsCode: row.tsCode,
    sourceStrategy: row.strategy,
    subtitle: row.statusLabel,
    summary: `${strategyLabel} / 入选日期 ${row.entryDate}`,
    tags: [
      { label: strategyLabel, tone: 'strategy' },
      { label: row.statusLabel, tone: 'state' },
      { label: '研究中心', tone: 'source' },
    ],
    summaryItems: [
      { label: '策略', value: strategyLabel },
      { label: '入选日期', value: row.entryDate },
      { label: '入选价', value: row.entryPrice.toFixed(2) },
      { label: 'T+5', value: row.horizonReturns.T5 != null ? `${row.horizonReturns.T5.toFixed(2)}%` : '--' },
    ],
    actions: [
      {
        label: '查看风控拆解',
        href: `/risk?tab=breakdown&source=research&focus=${encodeURIComponent(row.tsCode)}`,
        note: '查看该样本在风控中心的拆解结果。',
      },
      {
        label: '查看持仓中心',
        href: `/portfolio?source=research&focus=${encodeURIComponent(row.tsCode)}`,
        note: '查看该标的在持仓中心的承接状态。',
      },
    ],
  }
}

function SummaryGrid({ items }: { items: ResearchDetailSummaryItem[] }) {
  return (
    <div className="research-detail-grid">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className={`research-detail-stat tone-${item.tone ?? 'default'}`}>
          <span>{item.label}</span>
          <strong className="numeric">{item.value}</strong>
        </div>
      ))}
    </div>
  )
}

function InfoGrid({ items }: { items: ResearchDetailSummaryItem[] }) {
  return (
    <div className="research-detail-grid">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="research-detail-stat muted">
          <span>{item.label}</span>
          <strong className="numeric">{item.value}</strong>
        </div>
      ))}
    </div>
  )
}

function NotesBlock({ items }: { items: string[] }) {
  return (
    <div className="risk-context-list">
      {items.map((item) => (
        <div key={item} className="risk-context-list-row">
          <span className="risk-context-list-value">{item}</span>
        </div>
      ))}
    </div>
  )
}

function ChartCard({
  title,
  description,
  status,
  data,
  emptyText,
  valueSuffix = '',
}: {
  title: string
  description: string
  status: 'real' | 'fallback' | 'placeholder'
  data: Array<{ label: string; value: number; secondaryValue?: number }>
  emptyText?: string
  valueSuffix?: string
}) {
  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">{title}</span>
      </div>
      <div className={`research-detail-chart-shell is-${status}`}>
        <div className="research-detail-chart-copy">{description}</div>
        {data.length === 0 ? (
          <div className="research-detail-chart-empty">{emptyText ?? '当前图表暂无可展示的数据。'}</div>
        ) : (
          <div className="research-chart-list">
            {data.map((item) => (
              <div key={`${title}-${item.label}`} className="research-chart-list-row">
                <span>{item.label}</span>
                <span className="research-chart-list-numerics">
                  <strong className={`numeric tone-${chartTone(item.value)}`}>{formatChartNumber(item.value)}{valueSuffix}</strong>
                  {item.secondaryValue != null ? (
                    <span className={`c-muted numeric tone-${chartTone(item.secondaryValue)}`}>{formatChartNumber(item.secondaryValue)}{valueSuffix}</span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function TableSection({
  title,
  note,
  columns,
  rows,
  selectedFocus,
  onRowClick,
}: {
  title: string
  note: string
  columns: ResearchDetailTableColumn[]
  rows: ResearchDetailTableRow[]
  selectedFocus: string | null
  onRowClick?: (row: ResearchDetailTableRow) => void
}) {
  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">{title}</span>
        <span className="card-subtitle">{note}</span>
      </div>
      <div className="table-shell research-table-shell">
        <table className="data-table research-compare-table">
          <thead>
            <tr>
              <th>对象</th>
              {columns.map((column) => (
                <th key={column.key} className={column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1}>
                  <div className="table-empty">
                    <div className="risk-empty-title">当前暂无明细样本</div>
                    <div className="risk-empty-text">研究明细样本会在这里展示。</div>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={selectedFocus && row.stockFocus?.tsCode === selectedFocus ? 'research-table-row selected' : 'research-table-row'}
                  onClick={() => onRowClick?.(row)}
                >
                  <td>
                    <div className="risk-cell-title">{row.title}</div>
                    {row.subtitle ? <div className="risk-inline-meta">{row.subtitle}</div> : null}
                  </td>
                  {columns.map((column) => {
                    const cell = row.cells[column.key]
                    return (
                      <td key={column.key} className={column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : undefined}>
                        <div className={`research-detail-cell tone-${cell?.tone ?? 'default'}`}>
                          <span className="numeric">{cell?.value ?? '--'}</span>
                          {cell?.subValue ? <div className="risk-inline-meta">{cell.subValue}</div> : null}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function BacktestSection({ vm, onOpenStockSample, listRef }: { vm: BacktestDetailVm; onOpenStockSample: (row: ResearchDetailTableRow) => void; listRef?: RefObject<HTMLDivElement | null> }) {
  return (
    <>
      <section className="card">
        <div className="card-header">
          <span className="card-title">回测摘要</span>
          <SourceBadge meta={vm.dataSource} showWhenReal />
        </div>
        <div className="card-body">
          <SummaryGrid items={vm.summaryCards} />
        </div>
      </section>
      <div ref={listRef} className="research-detail-sample-list-scroll">
        <TableSection title="样本明细" note={vm.sampleNote} columns={vm.sampleColumns} rows={vm.sampleRows} selectedFocus={vm.selectedFocus} onRowClick={onOpenStockSample} />
      </div>
      <div className="research-detail-chart-grid">
        <ChartCard {...vm.charts.performanceSeries} />
        <ChartCard {...vm.charts.horizonBars} />
        <ChartCard {...vm.charts.returnDistribution} />
      </div>
    </>
  )
}

function FactorSection({ vm }: { vm: FactorIcDetailVm }) {
  return (
    <>
      <section className="card">
        <div className="card-header">
          <span className="card-title">因子 IC 摘要</span>
          <SourceBadge meta={vm.dataSource} showWhenReal />
        </div>
        <div className="card-body">
          <SummaryGrid items={vm.summaryCards} />
        </div>
      </section>
      <TableSection title="分桶表现" note={vm.bucketNote} columns={vm.bucketColumns} rows={vm.bucketRows} selectedFocus={null} />
      <div className="research-detail-chart-grid">
        <ChartCard {...vm.charts.icSeries} />
        <ChartCard {...vm.charts.bucketBars} />
        <ChartCard {...vm.charts.layerProfile} />
      </div>
    </>
  )
}

function AttributionSection({ vm }: { vm: AttributionDetailVm }) {
  return (
    <>
      <section className="card">
        <div className="card-header">
          <span className="card-title">归因摘要</span>
          <SourceBadge meta={vm.dataSource} showWhenReal />
        </div>
        <div className="card-body">
          <SummaryGrid items={vm.summaryCards} />
        </div>
      </section>
      <TableSection title="分组结果" note={vm.contributionNote} columns={vm.contributionColumns} rows={vm.contributionRows} selectedFocus={null} />
      <div className="research-detail-chart-grid">
        <ChartCard {...vm.charts.contributionBars} />
        <ChartCard {...vm.charts.groupCompare} />
        <ChartCard {...vm.charts.drawdownCompare} />
      </div>
    </>
  )
}

function ResonanceSection({ vm, onOpenStockSample }: { vm: ResonanceDetailVm; onOpenStockSample: (row: ResearchDetailTableRow) => void }) {
  return (
    <>
      <section className="card">
        <div className="card-header">
          <span className="card-title">共振摘要</span>
          <SourceBadge meta={vm.dataSource} showWhenReal />
        </div>
        <div className="card-body">
          <SummaryGrid items={vm.summaryCards} />
        </div>
      </section>
      <TableSection title="命中样本" note={vm.hitNote} columns={vm.hitColumns} rows={vm.hitRows} selectedFocus={vm.selectedFocus} onRowClick={onOpenStockSample} />
      <div className="research-detail-chart-grid">
        <ChartCard {...vm.charts.intensityBars} />
        <ChartCard {...vm.charts.excessBars} />
        <ChartCard {...vm.charts.hitPerformance} />
      </div>
    </>
  )
}

function DetailBody({ vm, onOpenStockSample, listRef }: { vm: ResearchDetailViewModel; onOpenStockSample: (row: ResearchDetailTableRow) => void; listRef?: RefObject<HTMLDivElement | null> }) {
  if (vm.kind === 'backtest') return <BacktestSection vm={vm} onOpenStockSample={onOpenStockSample} listRef={listRef} />
  if (vm.kind === 'factor-ic') return <FactorSection vm={vm} />
  if (vm.kind === 'attribution') return <AttributionSection vm={vm} />
  return <ResonanceSection vm={vm} onOpenStockSample={onOpenStockSample} />
}

export default function ResearchDetailPage() {
  const navigate = useNavigate()
  const { detailTab: detailTabParam, detailKey: detailKeyParam } = useParams()
  const [searchParams] = useSearchParams()
  const routeTab = normalizeResearchDetailRouteTab(detailTabParam)
  const { openPanel, closePanel } = useContextPanel()

  useEffect(() => {
    if (!routeTab) navigate('/research', { replace: true })
  }, [routeTab, navigate])

  const query = useMemo(() => {
    if (!routeTab) return null
    return buildResearchDetailQuery(routeTab, searchParams, detailKeyParam ?? '')
  }, [routeTab, searchParams, detailKeyParam])

  const { data, loading, error, refetch } = useApiData(
    () => (query ? loadResearchWorkspace(query) : Promise.resolve(null)),
    [routeTab ?? 'invalid', detailKeyParam ?? ''],
  )

  const detailVm = useMemo(() => {
    if (!routeTab || !query || !data) return null
    return resolveResearchDetailViewModel(data, routeTab, detailKeyParam, query)
  }, [routeTab, query, data, detailKeyParam])

  useEffect(() => {
    console.log('[ResearchDetail] detailVm:', detailVm?.kind, 'focusSample:', (detailVm as BacktestDetailVm | null)?.focusSample?.tsCode)
    if (!detailVm || detailVm.kind !== 'backtest' || !detailVm.focusSample) {
      console.log('[ResearchDetail] closePanel, reason:', !detailVm ? 'no vm' : detailVm.kind !== 'backtest' ? 'not backtest' : 'no focusSample')
      closePanel()
      return
    }
    console.log('[ResearchDetail] openPanel for:', detailVm.focusSample.tsCode)
    openPanel({
      entityType: 'stock',
      entityKey: detailVm.focusSample.tsCode,
      sourcePage: 'research',
      focus: detailVm.focusSample.tsCode,
      activeTab: 'summary',
      payloadVersion: 'v1',
      payload: buildResearchContextPanelPayload(detailVm.focusSample),
    })
  }, [detailVm])

  useEffect(() => {
    if (listRef.current && scrollPosRef.current > 0) {
      listRef.current.scrollTop = scrollPosRef.current
    }
  }, [detailVm])

  useEffect(() => () => closePanel(), [closePanel])

  const listRef = useRef<HTMLDivElement>(null)
  const scrollPosRef = useRef(0)

  if (!routeTab || !query) return null

  function openStockSample(row: ResearchDetailTableRow) {
    if (!detailVm || !row.stockFocus) return
    if (listRef.current) scrollPosRef.current = listRef.current.scrollTop

    if (detailVm.kind === 'backtest') {
      navigate(
        buildResearchDetailHref('backtest', detailVm.detailKey, {
          ...detailVm.query,
          strategy: row.stockFocus.strategy,
          focus: row.stockFocus.tsCode,
          tradeDate: row.stockFocus.entryDate ?? detailVm.query.tradeDate,
        }),
      )
      return
    }

    if (detailVm.kind === 'resonance') {
      navigate(
        buildResearchDetailHref('resonance', detailVm.detailKey, {
          ...detailVm.query,
          focus: row.stockFocus.tsCode,
        }),
      )
    }
  }

  const emptyTitle = detailVm ? getSourcePanelTitle(detailVm.dataSource) ?? detailVm.emptyTitle : '当前暂无详情数据'
  const emptyText = detailVm ? getSourcePanelText(detailVm.dataSource) ?? detailVm.emptyText : '详情结果会在这里展示。'

  return (
    <div className="domain-page research-page research-detail-page" data-testid="research-detail-page">
      <section className="card research-detail-hero">
        <div className="research-detail-hero-main">
          <button type="button" className="research-detail-back btn-ghost" onClick={() => navigate('/research')}>
            返回研究中心
          </button>
          <div className="risk-kicker">{DETAIL_KIND_LABELS[routeTab]}</div>
          <div className="research-hero-headline">
            <h1>{detailVm?.title ?? '研究详情'}</h1>
            <p>{detailVm?.subtitle ?? '查看当前研究对象的摘要、图表和明细样本。'}</p>
          </div>
          <div className="research-context-chips">
            {(detailVm?.sourceBadges ?? []).map((item) => (
              <span key={`${item.label}-${item.value}`} className="research-filter-chip">
                <span className="c-muted">{item.label}</span>
                <strong className="numeric">{item.value}</strong>
              </span>
            ))}
          </div>
        </div>
      </section>

      {detailVm ? <SourceSummaryBar meta={detailVm.dataSource} showWhenReal /> : null}

      {loading ? (
        <div className="card risk-loading-state">
          <div className="spinner" />
          <span>加载研究详情中...</span>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="page-error">
          <div className="page-error-msg">研究详情加载失败</div>
          <div className="page-error-detail">{error}</div>
          <button type="button" className="btn-secondary retry-btn" onClick={refetch}>
            重新加载
          </button>
        </div>
      ) : null}

      {!loading && !error && detailVm ? (
        detailVm.isEmpty ? (
          <div className="empty-state research-empty-state">
            <h3>{emptyTitle}</h3>
            <p>{emptyText}</p>
          </div>
        ) : (
          <div className="research-detail-layout" data-testid="research-detail-body">
            <DetailBody vm={detailVm} onOpenStockSample={openStockSample} listRef={listRef} />

            <section className="card">
              <div className="card-header">
                <span className="card-title">筛选上下文</span>
                <span className="card-subtitle">展示当前详情页承接的过滤条件与参数。</span>
              </div>
              <div className="card-body">
                <InfoGrid items={detailVm.infoCards} />
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <span className="card-title">说明</span>
                <span className="card-subtitle">保留研究说明与后续解读建议，不额外叠加重复来源提示。</span>
              </div>
              <div className="card-body">
                <NotesBlock items={detailVm.notes} />
              </div>
            </section>
          </div>
        )
      ) : null}
    </div>
  )
}
