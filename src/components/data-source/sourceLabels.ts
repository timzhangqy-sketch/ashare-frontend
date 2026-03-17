import type { DataSourceMeta, DataSourceState } from '../../types/dataSource'

export type SourceTone = 'info' | 'warning' | 'neutral'

const SOURCE_STATE_LABELS: Record<DataSourceState, string> = {
  real: '真实数据',
  fallback: '兼容结果',
  mock: '演示数据',
  mixed: '兼容结果',
  degraded: '降级展示',
  real_empty: '真实空态',
  placeholder: '占位内容',
  real_observing: '真实观察',
}

const SOURCE_STATE_DESCRIPTIONS: Record<DataSourceState, string> = {
  real: '当前区块已接入真实数据。',
  fallback: '当前区块使用兼容结果承接，未完全来自目标真链路。',
  mock: '当前区块仅为演示内容，不代表真实业务结果。',
  mixed: '当前区块以真实数据为主，局部字段仍包含兼容或派生成分。',
  degraded: '当前区块以已接入真链路为主，局部子块暂按降级结果展示。',
  real_empty: '真实接口已接通，但当前标的暂无这类记录。',
  placeholder: '当前区块尚未接入真实详情接口，仅保留占位承接。',
  real_observing: '真实接口已接通，当前处于观察态记录。',
}

export function getSourceStateLabel(state: DataSourceState): string {
  return SOURCE_STATE_LABELS[state]
}

export function getSourceTone(state: DataSourceState): SourceTone {
  if (state === 'real' || state === 'real_observing') return 'info'
  if (state === 'real_empty' || state === 'placeholder') return 'neutral'
  return 'warning'
}

export function shouldShowSourceMeta(meta?: DataSourceMeta | null, showWhenReal = false): boolean {
  if (!meta) return false
  if (meta.data_source === 'real') return showWhenReal
  return true
}

function getSourceDetail(meta: DataSourceMeta): string {
  const candidates = [
    meta.degrade_reason?.trim(),
    meta.source_detail?.trim(),
    meta.empty_reason?.trim(),
    meta.source_label?.trim(),
  ]

  return candidates.find(Boolean) ?? ''
}

export function getSourceDescription(meta: DataSourceMeta): string {
  const base =
    meta.data_source === 'real_observing' && meta.sample_size != null
      ? `${SOURCE_STATE_DESCRIPTIONS.real_observing} 当前样本数 ${meta.sample_size}。`
      : SOURCE_STATE_DESCRIPTIONS[meta.data_source]

  const detail = getSourceDetail(meta)
  if (!detail || detail === base) return base
  if (meta.data_source === 'real_observing') return base
  return `${base} ${detail}`
}

export function getSourceEmptyTitle(meta?: DataSourceMeta | null): string | null {
  if (!meta || meta.data_source !== 'real_empty') return null
  return SOURCE_STATE_LABELS.real_empty
}

export function getSourceEmptyText(meta?: DataSourceMeta | null): string | null {
  if (!meta || meta.data_source !== 'real_empty') return null
  return meta.empty_reason?.trim() || meta.source_detail?.trim() || SOURCE_STATE_DESCRIPTIONS.real_empty
}

export function getSourcePanelTitle(meta?: DataSourceMeta | null): string | null {
  if (!meta) return null
  if (meta.data_source === 'real_empty') return getSourceEmptyTitle(meta)
  return getSourceStateLabel(meta.data_source)
}

export function getSourcePanelText(meta?: DataSourceMeta | null): string | null {
  if (!meta) return null
  if (meta.data_source === 'real_empty') return getSourceEmptyText(meta)
  return getSourceDescription(meta)
}
