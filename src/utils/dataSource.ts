import type { DataSourceMeta, DataSourceState } from '../types/dataSource';

interface BuildDataSourceMetaInput {
  data_source: DataSourceState;
  source_label: string;
  source_detail: string;
  degraded?: boolean;
  degrade_reason?: string | null;
  is_empty?: boolean;
  is_observing?: boolean;
  sample_size?: number | null;
  empty_reason?: string | null;
}

export function buildDataSourceMeta(input: BuildDataSourceMetaInput): DataSourceMeta {
  return {
    data_source: input.data_source,
    degraded: input.degraded ?? input.data_source === 'degraded',
    degrade_reason: input.degrade_reason ?? null,
    source_label: input.source_label,
    source_detail: input.source_detail,
    is_empty: input.is_empty ?? (input.data_source === 'real_empty' || input.data_source === 'placeholder'),
    is_observing: input.is_observing ?? input.data_source === 'real_observing',
    sample_size: input.sample_size ?? null,
    empty_reason: input.empty_reason ?? null,
  };
}

export function withSampleSize(meta: DataSourceMeta, sampleSize: number | null | undefined): DataSourceMeta {
  return {
    ...meta,
    sample_size: sampleSize ?? null,
    is_observing: meta.is_observing || meta.data_source === 'real_observing',
  };
}

export function deriveMixedMeta(parts: DataSourceMeta[], sourceLabel: string, sourceDetail: string): DataSourceMeta {
  const hasFallbackLike = parts.some((item) => item.data_source === 'fallback' || item.data_source === 'mock');
  const hasRealLike = parts.some(
    (item) => item.data_source === 'real' || item.data_source === 'real_empty' || item.data_source === 'real_observing',
  );
  const hasDegraded = parts.some((item) => item.data_source === 'degraded' || item.degraded);

  const data_source: DataSourceState = hasFallbackLike && hasRealLike ? 'mixed' : hasDegraded ? 'degraded' : 'mixed';

  return buildDataSourceMeta({
    data_source,
    source_label: sourceLabel,
    source_detail: sourceDetail,
    degraded: hasDegraded || data_source === 'mixed',
    degrade_reason: hasFallbackLike && hasRealLike ? '当前区块同时包含真实与兼容来源，已按可用结果合并展示。' : '当前区块以真实数据为主，局部子块暂按降级结果展示。',
    is_empty: parts.every((item) => item.is_empty),
    is_observing: parts.some((item) => item.is_observing),
    sample_size: null,
    empty_reason: parts.every((item) => item.is_empty)
      ? parts.map((item) => item.empty_reason).filter(Boolean).join(' / ') || null
      : null,
  });
}
