export type SystemTab = 'pipeline' | 'coverage' | 'api' | 'runlog';

export type SystemSource = 'dashboard' | 'signals' | 'watchlist' | 'portfolio' | 'risk' | 'execution' | 'direct';

export type SystemObjectType = 'pipeline-step' | 'coverage-item' | 'api-item' | 'runlog-item';

export type SystemDataState = 'ready' | 'preview' | 'unsupported';

export type SystemSourceMode = 'real' | 'fallback' | 'mock' | 'unsupported';

import type { DataSourceMeta } from './dataSource';

export interface SystemQueryModel {
  tab: SystemTab;
  source: SystemSource;
  focus: string;
  tradeDate: string;
  step: string;
  dataset: string;
  api: string;
}

export interface SystemMetricViewModel {
  key: string;
  label: string;
  value: string;
  note: string;
  dataSource?: DataSourceMeta;
}

export interface SystemTabMeta {
  key: SystemTab;
  label: string;
  description: string;
}

export interface SystemFilterChipViewModel {
  key: string;
  label: string;
  value: string;
  dataSource?: DataSourceMeta;
}

export interface SystemRowBase {
  id: string;
  objectType: SystemObjectType;
  title: string;
  subtitle: string;
  summary: string;
  stateLabel: string;
  focusKey: string;
}

export type PipelineStateTone = 'success' | 'fail' | 'running' | 'skipped';

export interface PipelineStepRow extends SystemRowBase {
  objectType: 'pipeline-step';
  stepKey: string;
  runStatus: string;
  owner: string;
  duration: string;
  affectedDataset: string;
  rowCount: string;
  host: string;
  /** 仅 pipeline-step 有；用于状态 pill 颜色，无则不加 modifier class */
  stateTone?: PipelineStateTone | null;
}

export interface CoverageItemRow extends SystemRowBase {
  objectType: 'coverage-item';
  datasetKey: string;
  coverageLabel: string;
  latestTradeDate: string;
  expectedDate: string;
  freshness: string;
  gapHint: string;
  dqStatus: string;
  totalRows: string;
  /** 是否最新：✓ 已更新 | 待更新，用于「状态」列 */
  updateStatusLabel: string;
  /** 覆盖状态的语义色，用于状态 pill 颜色 */
  stateTone?: PipelineStateTone | null;
}

export interface ApiHealthRow extends SystemRowBase {
  objectType: 'api-item';
  apiKey: string;
  domain: string;
  healthLabel: string;
  latestCheck: string;
  responseHint: string;
  dependencyHint: string;
  httpStatus: string;
  /** 接口健康状态的语义色，用于状态 pill 颜色 */
  stateTone?: PipelineStateTone | null;
}

export interface RunlogVersionRow extends SystemRowBase {
  objectType: 'runlog-item';
  itemKey: string;
  versionLabel: string;
  publishedAt: string;
  scopeHint: string;
  logHint: string;
  anomalyLevel: string;
  /** 运行日志整体状态的语义色，用于状态 pill 颜色 */
  stateTone?: PipelineStateTone | null;
}

export type SystemRow = PipelineStepRow | CoverageItemRow | ApiHealthRow | RunlogVersionRow;

export interface SystemContextSectionViewModel {
  title: string;
  items: Array<{ label: string; value: string }>;
}

export interface SystemContextModel {
  title: string;
  subtitle: string;
  sourceSummary: string;
  sections: SystemContextSectionViewModel[];
  nextSteps: Array<{ label: string; note: string }>;
  dataSource?: DataSourceMeta;
}

export interface SystemStateViewModel {
  title: string;
  description: string;
}

export interface SystemTabStateViewModel {
  sourceMode: SystemSourceMode;
  label: string;
  note: string;
  dataSource?: DataSourceMeta;
}

export interface SystemWorkspaceViewModel {
  title: string;
  subtitle: string;
  query: SystemQueryModel;
  metrics: SystemMetricViewModel[];
  tabs: SystemTabMeta[];
  filterChips: SystemFilterChipViewModel[];
  dataState: SystemDataState;
  dataStateNote: string;
  loadingState: SystemStateViewModel;
  emptyState: SystemStateViewModel;
  unsupportedState: SystemStateViewModel;
  noFocus: SystemStateViewModel;
  pipeline: PipelineStepRow[];
  coverage: CoverageItemRow[];
  apiHealth: ApiHealthRow[];
  runlog: RunlogVersionRow[];
  tabStates: Record<SystemTab, SystemTabStateViewModel>;
  dataSources: Record<SystemTab, DataSourceMeta>;
  selectedId: string | null;
  selectedRow: SystemRow | null;
  focusMissNote: string;
  context: SystemContextModel | null;
  dataSource?: DataSourceMeta;
}

export interface SystemMetricRaw {
  key: string;
  label: string;
  value: string;
  note: string;
}

export interface PipelineStepRaw {
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  stepKey: string;
  runStatus: string;
  owner: string;
  duration: string;
  affectedDataset: string;
  rowCount?: string;
  host?: string;
}

export interface CoverageItemRaw {
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  datasetKey: string;
  coverageLabel: string;
  latestTradeDate: string;
  expectedDate?: string;
  freshness: string;
  gapHint: string;
  dqStatus?: string;
}

export interface ApiHealthRaw {
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  apiKey: string;
  domain: string;
  healthLabel: string;
  latestCheck: string;
  responseHint: string;
  dependencyHint: string;
  httpStatus?: string;
}

export interface RunlogVersionRaw {
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  itemKey: string;
  versionLabel: string;
  publishedAt: string;
  scopeHint: string;
  logHint: string;
  anomalyLevel?: string;
}

export interface SystemMockSource {
  tabs: SystemTabMeta[];
  metrics: SystemMetricRaw[];
  pipeline: PipelineStepRaw[];
  coverage: CoverageItemRaw[];
  apiHealth: ApiHealthRaw[];
  runlog: RunlogVersionRaw[];
}

export interface SystemVersionRawDto {
  version?: string | null;
  frontend_version?: string | null;
  backend_version?: string | null;
  risk_model_version?: string | null;
  strategy_snapshot_version?: string | null;
  updated_at?: string | null;
  version_snapshot?: string | null;
}

export interface SystemRunlogLatestRawDto {
  trade_date?: string | null;
  latest_success_time?: string | null;
  latest_fail_step?: string | null;
  latest_fail_message?: string | null;
  summary_text?: string | null;
  anomaly_level?: string | null;
  version_snapshot?: string | null;
  updated_at?: string | null;
}

export interface SystemPipelineRunRawDto {
  trade_date?: string | null;
  step?: string | null;
  status?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_ms?: number | null;
  rowcount?: number | null;
  message?: string | null;
  host?: string | null;
  pid?: number | null;
}

export interface SystemDataCoverageRawDto {
  dataset_key?: string | null;
  table_name?: string | null;
  trade_date?: string | null;
  latest_available_date?: string | null;
  latest_date?: string | null;
  expected_date?: string | null;
  symbol_count?: number | null;
  rowcount?: number | null;
  coverage_ratio?: number | null;
  is_current?: boolean | null;
  total_rows?: number | null;
  dq_status?: string | null;
  dq_message?: string | null;
  updated_at?: string | null;
}

export interface SystemApiHealthRawDto {
  api_key?: string | null;
  endpoint_key?: string | null;
  domain?: string | null;
  status?: string | null;
  response_time_ms?: number | null;
  http_status?: number | null;
  status_code?: number | null;
  path?: string | null;
  url?: string | null;
  endpoint?: string | null;
  checked_at?: string | null;
  last_check?: string | null;
  latency_ms?: number | null;
  latency?: number | null;
  duration?: number | null;
  source_mode?: string | null;
  fallback_triggered?: boolean | null;
  last_success_at?: string | null;
  last_error_at?: string | null;
  code?: number | null;
  error?: string | null;
  error_message?: string | null;
}
