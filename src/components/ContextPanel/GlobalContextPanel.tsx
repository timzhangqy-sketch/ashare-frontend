import { useEffect, useState } from 'react'
import { loadStockContextViewModel } from '../../adapters/contextPanel'
import { useDate } from '../../context/useDate'
import type {
  ContextPanelState,
  StockContextPanelPayload,
  StockContextViewModel,
} from '../../types/contextPanel'
import StockContextHeader from './sections/StockContextHeader'
// StockContextTags removed - info now in Header
import StockContextQuote from './sections/StockContextQuote'
import StockContextStatus from './sections/StockContextStatus'

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

function GenericContextPanel() {
  return null
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
      .then((result) => { if (!cancelled) setLoadState({ key: requestKey, viewModel: result }) })
      .catch(() => { if (!cancelled) setLoadState({ key: requestKey, viewModel: null }) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, selectedDate])

  if (!panel.isOpen || !panel.entityType || !panel.entityKey) return null
  if (panel.entityType !== 'stock' || !stockCode) return <GenericContextPanel />

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
  const mainData = viewModel?.main ?? null

  return (
    <aside className="context-panel-slot" aria-label="右侧详情">
      <div className="context-panel-card global-context-panel" data-testid="context-panel">
        <StockContextHeader
          name={title}
          tsCode={stockCode}
          sourcePage={panel.sourcePage}
          sourceStrategy={sourceStrategy}
          primaryConcept={mainData?.primaryConcept}
          isLeader={mainData?.isLeader}
        />
        {/* Tags removed - concept + strategy shown in Header */}
        <StockContextQuote data={mainData} loading={loading} />
        <StockContextStatus
          risk={viewModel?.risk.data ?? null}
          lifecycle={viewModel?.lifecycle.data ?? null}
          loading={loading}
        />
      </div>
    </aside>
  )
}
