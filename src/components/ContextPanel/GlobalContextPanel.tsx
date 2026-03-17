import { useEffect, useState } from 'react'
import { loadStockContextViewModel } from '../../adapters/contextPanel'
import { useDate } from '../../context/useDate'
import type {
  ContextPanelPayloadBase,
  ContextPanelState,
  StockContextPanelPayload,
  StockContextViewModel,
} from '../../types/contextPanel'
import StockContextActions from './sections/StockContextActions'
import StockContextBasic from './sections/StockContextBasic'
import StockContextHeader from './sections/StockContextHeader'
import StockContextKline from './sections/StockContextKline'
import StockContextLifecycle from './sections/StockContextLifecycle'
import StockContextRisk from './sections/StockContextRisk'
import StockContextTags from './sections/StockContextTags'

function readStockPayload(payload: ContextPanelState['payload']): StockContextPanelPayload {
  if (!payload || typeof payload !== 'object') return {}
  return payload as StockContextPanelPayload
}

function getPanelKicker(sourcePage: ContextPanelState['sourcePage']) {
  if (sourcePage === 'signals') return '股票详情'
  return ''
}

function getLoadingCopy(sourcePage: ContextPanelState['sourcePage']) {
  if (sourcePage === 'signals') return '正在加载当前标的详情...'
  return '正在加载上下文信息...'
}

function getFallbackSubtitle(sourcePage: ContextPanelState['sourcePage']) {
  if (sourcePage === 'signals') return '当前对象的补充信息会在这里展示。'
  return '当前对象的补充说明、标签和后续动作会在这里展示。'
}

function GenericContextPanel({
  panel,
  payload,
}: {
  panel: ContextPanelState
  payload: ContextPanelPayloadBase
}) {
  return (
    <aside className="context-panel-slot" aria-label="右侧详情">
      <div className="context-panel-card global-context-panel" data-testid="context-panel">
        <div className="context-panel-kicker">{getPanelKicker(panel.sourcePage)}</div>
        <div className="context-panel-title">{payload.title || panel.entityKey}</div>
        <p className="context-panel-copy">{payload.subtitle || getFallbackSubtitle(panel.sourcePage)}</p>
        {payload.summary ? <p className="context-panel-copy">{payload.summary}</p> : null}
      </div>
    </aside>
  )
}

export default function GlobalContextPanel({ panel }: { panel: ContextPanelState }) {
  const { selectedDate } = useDate()
  const [loadState, setLoadState] = useState<{ key: string | null; viewModel: StockContextViewModel | null }>({
    key: null,
    viewModel: null,
  })

  const payload = readStockPayload(panel.payload)
  const stockCode = payload.tsCode ?? panel.tsCode ?? panel.focus ?? panel.entityKey
  const requestKey =
    panel.isOpen && panel.entityType === 'stock' && stockCode
      ? `${panel.entityKey}:${stockCode}:${selectedDate}:${panel.sourcePage}:${panel.activeTab ?? ''}`
      : null
  const loading = Boolean(requestKey) && loadState.key !== requestKey
  const viewModel = requestKey && loadState.key === requestKey ? loadState.viewModel : null

  useEffect(() => {
    if (!requestKey) return

    let cancelled = false

    loadStockContextViewModel(panel, selectedDate)
      .then((result) => {
        if (cancelled) return
        setLoadState({ key: requestKey, viewModel: result })
      })
      .catch(() => {
        if (cancelled) return
        setLoadState({ key: requestKey, viewModel: null })
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, selectedDate])

  if (!panel.isOpen || !panel.entityType || !panel.entityKey) return null
  if (panel.entityType !== 'stock' || !stockCode) return <GenericContextPanel panel={panel} payload={payload} />

  if (!viewModel && loading) {
    return (
      <aside className="context-panel-slot" aria-label="右侧详情">
        <div className="context-panel-card global-context-panel" data-testid="context-panel">
          <div className="context-panel-kicker">{getPanelKicker(panel.sourcePage)}</div>
          <div className="context-panel-title">{payload.name ?? stockCode}</div>
          <div className="global-context-empty">{getLoadingCopy(panel.sourcePage)}</div>
        </div>
      </aside>
    )
  }

  const title = viewModel?.title ?? payload.name ?? payload.title ?? stockCode
  const sourceStrategy = viewModel?.sourceStrategy ?? payload.sourceStrategy ?? null

  return (
    <aside className="context-panel-slot" aria-label="右侧详情">
      <div className="context-panel-card global-context-panel" data-testid="context-panel">
        <StockContextHeader name={title} tsCode={stockCode} sourcePage={panel.sourcePage} sourceStrategy={sourceStrategy} />
        <StockContextTags tags={viewModel?.tags ?? payload.tags ?? []} />
        <StockContextBasic
          data={viewModel?.main ?? null}
          loading={loading}
          summaryItems={viewModel?.summaryItems ?? payload.summaryItems ?? []}
        />
        <StockContextKline
          status={viewModel?.kline.status ?? (loading ? 'loading' : 'empty')}
          note={viewModel?.kline.note ?? 'K 线暂未返回可用结果。'}
          data={viewModel?.kline.data ?? null}
        />
        <StockContextRisk
          status={viewModel?.risk.status ?? (loading ? 'loading' : 'empty')}
          note={viewModel?.risk.note ?? '风险摘要当前未返回完整结果。'}
          data={viewModel?.risk.data ?? null}
        />
        <StockContextLifecycle
          status={viewModel?.lifecycle.status ?? (loading ? 'loading' : 'empty')}
          note={viewModel?.lifecycle.note ?? '生命周期当前未返回完整结果。'}
          data={viewModel?.lifecycle.data ?? null}
        />
        <StockContextActions actions={viewModel?.actions ?? payload.actions ?? []} />
      </div>
    </aside>
  )
}


