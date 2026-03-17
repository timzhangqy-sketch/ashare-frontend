export type DataSourceState =
  | 'real'
  | 'real_empty'
  | 'real_observing'
  | 'fallback'
  | 'mock'
  | 'mixed'
  | 'degraded'
  | 'placeholder';

export interface DataSourceMeta {
  data_source: DataSourceState;
  degraded: boolean;
  degrade_reason: string | null;
  source_label: string;
  source_detail: string;
  is_empty: boolean;
  is_observing: boolean;
  sample_size: number | null;
  empty_reason: string | null;
}

export interface DataSourceRegistryEntry {
  page: string;
  section: string;
  state: DataSourceState;
  source_label: string;
  source_detail: string;
}
