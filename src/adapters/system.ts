import {
  fetchSystemApiHealth,
  fetchSystemDataCoverage,
  fetchSystemPipelineRuns,
  fetchSystemRunlogLatest,
  fetchSystemVersion,
} from '../api/system';
import { systemMockSource } from '../mocks/system';
import type {
  ApiHealthRow,
  CoverageItemRow,
  PipelineStateTone,
  PipelineStepRow,
  RunlogVersionRow,
  SystemApiHealthRawDto,
  SystemContextModel,
  SystemDataCoverageRawDto,
  SystemDataState,
  SystemPipelineRunRawDto,
  SystemQueryModel,
  SystemRow,
  SystemRunlogLatestRawDto,
  SystemSource,
  SystemSourceMode,
  SystemTab,
  SystemTabMeta,
  SystemTabStateViewModel,
  SystemVersionRawDto,
  SystemWorkspaceViewModel,
} from '../types/system';
import { buildDataSourceMeta } from '../utils/dataSource';
import type { DataSourceMeta } from '../types/dataSource';

const SYSTEM_TABS: SystemTabMeta[] = [
  { key: 'pipeline', label: '流程运行', description: '查看当日关键步骤、执行状态与处理摘要。' },
  { key: 'coverage', label: '数据覆盖', description: '查看数据集更新、覆盖率与数据质量状态。' },
  { key: 'api', label: '接口健康', description: '查看关键接口可用性、延迟与依赖状态。' },
  { key: 'runlog', label: '运行日志与版本', description: '查看最新运行摘要、版本快照与异常线索。' },
];

function normalizeTab(value: string | null): SystemTab {
  return value === 'coverage' || value === 'api' || value === 'runlog' ? value : 'pipeline';
}

function normalizeSource(value: string | null): SystemSource {
  return value === 'dashboard' ||
    value === 'signals' ||
    value === 'watchlist' ||
    value === 'portfolio' ||
    value === 'risk' ||
    value === 'execution'
    ? value
    : 'direct';
}

function getSourceLabel(source: SystemSource) {
  if (source === 'dashboard') return '来自 Dashboard';
  if (source === 'signals') return '来自 Signals';
  if (source === 'watchlist') return '来自交易标的池';
  if (source === 'portfolio') return '来自持仓中心';
  if (source === 'risk') return '来自风控中心';
  if (source === 'execution') return '来自模拟执行';
  return '直接进入';
}

function getSourceSummary(source: SystemSource) {
  if (source === 'dashboard') return '这里继续查看今日系统运行概览、关键异常和版本摘要。';
  if (source === 'signals') return '这里核对信号判断依赖的系统流程、数据质量与接口状态。';
  if (source === 'watchlist') return '这里核对交易标的池判断依赖的数据更新、运行流程与接口可用性。';
  if (source === 'portfolio') return '这里核对持仓判断依赖的系统状态、版本快照和运行日志。';
  if (source === 'risk') return '这里核对风险结论依赖的数据覆盖、流程状态与版本信息。';
  if (source === 'execution') return '这里核对执行判断依赖的接口状态、运行流程和版本快照。';
  return '这里集中查看系统运行、数据质量、接口健康和版本摘要。';
}

function getModeLabel(mode: SystemSourceMode) {
  if (mode === 'real') return '真实数据';
  if (mode === 'fallback') return '兼容承接';
  if (mode === 'mock') return '演示数据';
  return '暂未接入';
}

function getModeNote(mode: SystemSourceMode, tab: SystemTab) {
  if (mode === 'real') return '当前标签已优先展示系统返回的最新结果。';
  if (mode === 'fallback') return '当前标签未拿到完整结果，已切换到兼容承接视图。';
  if (mode === 'mock') {
    return tab === 'runlog'
      ? '当前环境未返回最新摘要，已使用演示数据维持查看结构。'
      : '当前环境未返回完整结果，已使用演示数据维持当前视图。';
  }
  return '当前环境尚未接入该标签的可用结果。';
}

function normalizeQuery(searchParams: URLSearchParams): SystemQueryModel {
  return {
    tab: normalizeTab(searchParams.get('tab')),
    source: normalizeSource(searchParams.get('source')),
    focus: searchParams.get('focus')?.trim() ?? '',
    tradeDate: searchParams.get('trade_date')?.trim() ?? '2026-03-09',
    step: searchParams.get('step')?.trim() ?? '',
    dataset: searchParams.get('dataset')?.trim() ?? '',
    api: searchParams.get('api')?.trim() ?? '',
  };
}

function getMockPipelineTitle(stepKey: string) {
  if (stepKey === 'ingest_daily') return '日线入库';
  if (stepKey === 'feature_compute') return '特征计算';
  if (stepKey === 'publish_workspace') return '工作域发布';
  return stepKey;
}

function getMockCoverageTitle(datasetKey: string) {
  if (datasetKey === 'daily_bar') return '日线行情';
  if (datasetKey === 'factor_snapshot') return '因子快照';
  if (datasetKey === 'risk_snapshot') return '风险快照';
  return datasetKey;
}

function getMockApiTitle(apiKey: string) {
  if (apiKey === '/api/dashboard/summary') return 'Dashboard 汇总接口';
  if (apiKey === '/api/risk/{ts_code}/{date}') return '风险拆解接口';
  if (apiKey === '/api/execution/checks') return '执行约束接口';
  return apiKey;
}

type PipelineStateResult = { label: string; tone?: PipelineStateTone | null };

function getPipelineState(status: string): PipelineStateResult {
  const s = (status ?? '').toLowerCase();
  if (s === 'success' || s === 'ok') return { label: '成功', tone: 'success' };
  if (s === 'fail' || s === 'error') return { label: '失败', tone: 'fail' };
  if (s === 'running') return { label: '运行中', tone: 'running' };
  if (s === 'skipped') return { label: '已跳过', tone: 'skipped' };
  return { label: '', tone: null };
}

function getCoverageStateLabel(status: string, coverageLabel: string) {
  if (status === 'ok') {
    const ratio = Number.parseFloat(coverageLabel);
    return Number.isFinite(ratio) && ratio < 98 ? '需复核' : '覆盖正常';
  }
  if (status === 'warn') return '需复核';
  if (status === 'fail' || status === 'late') return '待补齐';
  return '不可用';
}

function getApiStateLabel(status: string, fallbackTriggered?: boolean | null) {
  if (status === 'ok') return '健康';
  if (status === 'warn') return '需关注';
  if (status === 'fail') return '不可用';
  if (fallbackTriggered) return '兼容承接';
  return '状态未知';
}

function getRunlogStateLabel(anomalyLevel?: string | null, hasFailure?: boolean) {
  if (hasFailure) return '需关注';
  if (anomalyLevel && anomalyLevel !== '正常') return anomalyLevel;
  return '运行正常';
}

function fromMockPipeline(): PipelineStepRow[] {
  return systemMockSource.pipeline.map((item) => {
    const state = getPipelineState(item.runStatus);
    return {
      id: item.id,
      objectType: 'pipeline-step',
      title: getMockPipelineTitle(item.stepKey),
      subtitle: `流程步骤 · ${item.owner}`,
      summary: item.summary,
      stateLabel: state.label,
      stateTone: state.tone ?? undefined,
      focusKey: item.stepKey,
      stepKey: item.stepKey,
      runStatus: item.runStatus,
      owner: item.owner,
      duration: item.duration,
      affectedDataset: item.affectedDataset,
      rowCount: item.rowCount ?? '--',
      host: item.host ?? '--',
    };
  });
}

function fromMockCoverage(): CoverageItemRow[] {
  return systemMockSource.coverage.map((item) => ({
    id: item.id,
    objectType: 'coverage-item',
    title: getMockCoverageTitle(item.datasetKey),
    subtitle: `数据集 · ${item.datasetKey}`,
    summary: item.summary,
    stateLabel: getCoverageStateLabel(item.dqStatus ?? item.freshness, item.coverageLabel),
    focusKey: item.datasetKey,
    datasetKey: item.datasetKey,
    coverageLabel: item.coverageLabel,
    latestTradeDate: item.latestTradeDate,
    expectedDate: item.expectedDate ?? item.latestTradeDate,
    freshness: item.freshness,
    gapHint: item.gapHint,
    dqStatus: item.dqStatus ?? '待核对',
    totalRows: '--',
    updateStatusLabel: '✓ 已更新',
  }));
}

function fromMockApi(): ApiHealthRow[] {
  return systemMockSource.apiHealth.map((item) => ({
    id: item.id,
    objectType: 'api-item',
    title: getMockApiTitle(item.apiKey),
    subtitle: `接口域 · ${item.domain}`,
    summary: item.summary,
    stateLabel: item.healthLabel,
    focusKey: item.apiKey,
    apiKey: item.apiKey,
    domain: item.domain,
    healthLabel: item.healthLabel,
    latestCheck: item.latestCheck,
    responseHint: item.responseHint,
    dependencyHint: item.dependencyHint,
    httpStatus: item.httpStatus ?? '--',
  }));
}

function fromMockRunlog(versionRaw?: SystemVersionRawDto | null, runlogRaw?: SystemRunlogLatestRawDto | null): RunlogVersionRow[] {
  const rows: RunlogVersionRow[] = [];

  if (versionRaw) {
    rows.push({
      id: 'real-version',
      objectType: 'runlog-item',
      title: '系统版本快照',
      subtitle: `版本号 · ${versionRaw.version ?? versionRaw.frontend_version ?? '未提供'}`,
      summary: '核对当前前后端、风险模型和策略快照的版本信息。',
      stateLabel: '真实数据',
      stateTone: 'success',
      focusKey: 'system-version',
      itemKey: 'system-version',
      versionLabel: versionRaw.version_snapshot ?? versionRaw.version ?? '未提供',
      publishedAt: versionRaw.updated_at ?? '--',
      scopeHint: `前端 ${versionRaw.frontend_version ?? '--'} / 后端 ${versionRaw.backend_version ?? '--'}`,
      logHint: `风险模型 ${versionRaw.risk_model_version ?? '--'} / 策略快照 ${versionRaw.strategy_snapshot_version ?? '--'}`,
      anomalyLevel: '正常',
    });
  }

  if (runlogRaw) {
    rows.push({
      id: 'real-runlog-latest',
      objectType: 'runlog-item',
      title: '最新运行摘要',
      subtitle: `交易日 · ${runlogRaw.trade_date ?? '--'}`,
      summary: runlogRaw.summary_text ?? '查看当前环境最新一次运行摘要、异常步骤和版本快照。',
      stateLabel: getRunlogStateLabel(runlogRaw.anomaly_level, Boolean(runlogRaw.latest_fail_step)),
      stateTone:
        getRunlogStateLabel(runlogRaw.anomaly_level, Boolean(runlogRaw.latest_fail_step)).includes('正常') ||
        getRunlogStateLabel(runlogRaw.anomaly_level, Boolean(runlogRaw.latest_fail_step)).toLowerCase().includes('ok') ||
        getRunlogStateLabel(runlogRaw.anomaly_level, Boolean(runlogRaw.latest_fail_step)).includes('成功')
          ? 'success'
          : getRunlogStateLabel(runlogRaw.anomaly_level, Boolean(runlogRaw.latest_fail_step)).includes('异常') ||
              getRunlogStateLabel(runlogRaw.anomaly_level, Boolean(runlogRaw.latest_fail_step)).includes('失败') ||
              getRunlogStateLabel(runlogRaw.anomaly_level, Boolean(runlogRaw.latest_fail_step)).toLowerCase().includes('error') ||
              getRunlogStateLabel(runlogRaw.anomaly_level, Boolean(runlogRaw.latest_fail_step)).toLowerCase().includes('fail')
            ? 'fail'
            : 'running',
      focusKey: 'runlog-latest',
      itemKey: 'runlog-latest',
      versionLabel: runlogRaw.version_snapshot ?? '未提供',
      publishedAt: runlogRaw.updated_at ?? runlogRaw.latest_success_time ?? '--',
      scopeHint: runlogRaw.latest_fail_step ? `异常步骤 · ${runlogRaw.latest_fail_step}` : '未记录异常步骤',
      logHint: runlogRaw.latest_fail_message ?? '未返回额外异常说明',
      anomalyLevel: runlogRaw.anomaly_level ?? '正常',
    });
  }

  if (!rows.length) {
    return systemMockSource.runlog.map((item) => ({
      id: item.id,
      objectType: 'runlog-item',
      title: item.itemKey === 'workspace-v4.3' ? '系统版本快照' : item.itemKey === 'risk-handoff' ? '风险联动记录' : '最新运行摘要',
      subtitle:
        item.itemKey === 'workspace-v4.3'
          ? `版本号 · ${item.versionLabel}`
          : item.itemKey === 'risk-handoff'
            ? '联动记录 · Dashboard / Risk / Execution'
            : `运行批次 · ${item.id}`,
      summary: item.summary,
      stateLabel: getRunlogStateLabel(item.anomalyLevel),
      stateTone:
        getRunlogStateLabel(item.anomalyLevel).includes('正常') ||
        getRunlogStateLabel(item.anomalyLevel).toLowerCase().includes('ok') ||
        getRunlogStateLabel(item.anomalyLevel).includes('成功')
          ? 'success'
          : getRunlogStateLabel(item.anomalyLevel).includes('异常') ||
              getRunlogStateLabel(item.anomalyLevel).includes('失败') ||
              getRunlogStateLabel(item.anomalyLevel).toLowerCase().includes('error') ||
              getRunlogStateLabel(item.anomalyLevel).toLowerCase().includes('fail')
            ? 'fail'
            : 'running',
      focusKey: item.itemKey,
      itemKey: item.itemKey,
      versionLabel: item.versionLabel,
      publishedAt: item.publishedAt,
      scopeHint: item.scopeHint,
      logHint: item.logHint,
      anomalyLevel: item.anomalyLevel ?? '正常',
    }));
  }

  return rows;
}

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
};

function fromRealPipeline(rows: SystemPipelineRunRawDto[], tradeDate: string): PipelineStepRow[] {
  return rows.map((item, index) => {
    const status = item.status ?? 'unknown';
    const state = getPipelineState(status);
    const durationMs = item.duration_ms ?? null;
    const stepKey = item.step ?? `pipeline-${index}`;
    return {
      id: `pipeline-${item.step ?? index}`,
      objectType: 'pipeline-step',
      title: STEP_LABEL[stepKey] ?? item.step ?? '未命名步骤',
      subtitle: `交易日 · ${item.trade_date ?? tradeDate}`,
      summary: item.message ?? '未返回该步骤的补充说明。',
      stateLabel: state.label,
      stateTone: state.tone ?? undefined,
      focusKey: stepKey,
      stepKey,
      runStatus: status,
      owner: item.pid ? `PID ${item.pid}` : '系统任务',
      duration: durationMs == null ? '--' : durationMs < 1000 ? `${durationMs}ms` : `${Math.round(durationMs / 1000)}s`,
      affectedDataset: item.step ?? '--',
      rowCount: item.rowcount == null ? '--' : String(item.rowcount),
      host: item.host ?? '--',
    };
  });
}

function fromRealCoverage(rows: SystemDataCoverageRawDto[], tradeDate: string): CoverageItemRow[] {
  return rows.map((item, index) => {
    const coverageLabel = item.is_current === true ? '正常' : '';
    const updateStatusLabel = item.is_current === true ? '✓ 已更新' : '待更新';
    const datasetKey = item.dataset_key != null && String(item.dataset_key).trim() !== '' ? item.dataset_key : '';
    return {
      id: `coverage-${item.dataset_key ?? index}`,
      objectType: 'coverage-item',
      title: item.table_name ?? item.dataset_key ?? '未命名数据集',
      subtitle: '',
      summary: item.dq_message ?? '',
      stateLabel: coverageLabel || updateStatusLabel,
      stateTone:
        item.is_current === true || updateStatusLabel.includes('已更新') || updateStatusLabel.includes('正常')
          ? 'success'
          : item.is_current === false || updateStatusLabel.includes('待更新')
            ? 'skipped'
            : 'fail',
      focusKey: item.dataset_key ?? `coverage-${index}`,
      datasetKey,
      coverageLabel,
      latestTradeDate: item.latest_date ?? item.latest_available_date ?? item.trade_date ?? tradeDate,
      expectedDate: tradeDate,
      freshness: item.is_current === true ? '最新' : '待补齐',
      gapHint: item.dq_message ?? '当前未返回更多覆盖差异说明。',
      dqStatus: item.dq_status ?? '',
      totalRows: item.total_rows != null ? String(item.total_rows) : '--',
      updateStatusLabel,
    };
  });
}

function fromRealApi(rows: SystemApiHealthRawDto[]): ApiHealthRow[] {
  return rows.map((item, index) => {
    const statusRaw = item.status ?? 'unknown';
    const label = getApiStateLabel(statusRaw, item.fallback_triggered);
    const apiName = item.endpoint_key ?? item.api_key ?? '未命名接口';
    const apiPath = item.path ?? item.url ?? item.endpoint ?? item.endpoint_key ?? '--';
    const latestCheck =
      item.checked_at ??
      item.last_success_at ??
      item.last_check ??
      '--';
    const httpStatusValue =
      item.http_status ??
      item.status_code ??
      item.code ??
      null;
    const httpStatus = httpStatusValue != null ? String(httpStatusValue) : '--';
    const latencySource =
      item.response_time_ms ??
      item.latency_ms ??
      item.latency ??
      item.duration ??
      null;
    const responseHint =
      latencySource == null
        ? '未返回延迟数据'
        : `最近延迟 ${Math.round(Number(latencySource))}ms`;

    return {
      id: `api-${item.api_key ?? index}`,
      objectType: 'api-item',
      title: apiName,
      subtitle: `接口 · ${apiPath}`,
      summary: item.error_message ?? '',
      stateLabel: label,
      stateTone: statusRaw === 'ok' ? 'success' : statusRaw === 'warn' ? 'running' : 'fail',
      focusKey: item.api_key ?? `api-${index}`,
      apiKey: item.api_key ?? `api-${index}`,
      domain: item.domain ?? '--',
      healthLabel: label,
      latestCheck,
      responseHint,
      dependencyHint: item.source_mode ?? (item.fallback_triggered ? '当前走兼容承接链路' : '依赖信息未返回'),
      httpStatus,
    };
  });
}

function getRowsForTab(tab: SystemTab, workspace: Pick<SystemWorkspaceViewModel, 'pipeline' | 'coverage' | 'apiHealth' | 'runlog'>): SystemRow[] {
  if (tab === 'pipeline') return workspace.pipeline;
  if (tab === 'coverage') return workspace.coverage;
  if (tab === 'api') return workspace.apiHealth;
  return workspace.runlog;
}

function filterRows(query: SystemQueryModel, rows: SystemRow[]): SystemRow[] {
  return rows.filter((row) => {
    if (query.focus && row.focusKey !== query.focus) return false;
    if (row.objectType === 'pipeline-step' && query.step && row.stepKey !== query.step) return false;
    if (row.objectType === 'coverage-item' && query.dataset && row.datasetKey !== query.dataset) return false;
    if (row.objectType === 'api-item' && query.api && row.apiKey !== query.api) return false;
    return true;
  });
}

function buildContext(row: SystemRow, source: SystemSource): SystemContextModel {
  const sections =
    row.objectType === 'pipeline-step'
      ? [
          {
            title: '当前对象',
            items: [
              { label: '对象类型', value: '流程步骤' },
              { label: '当前状态', value: row.stateLabel },
            ],
          },
          {
            title: '运行信息',
            items: [
              { label: '步骤键', value: row.stepKey },
              { label: '执行主体', value: row.owner },
              { label: '关联数据集', value: row.affectedDataset },
              { label: '处理行数', value: row.rowCount },
            ],
          },
        ]
      : row.objectType === 'coverage-item'
        ? [
            {
              title: '当前对象',
              items: [
                { label: '对象类型', value: '数据覆盖项' },
                { label: '当前状态', value: row.stateLabel },
              ],
            },
            {
              title: '覆盖信息',
              items: [
                ...(row.datasetKey != null && row.datasetKey !== '' && row.datasetKey !== '--' ? [{ label: '数据集', value: row.datasetKey }] : []),
                ...((row as CoverageItemRow).coverageLabel != null && (row as CoverageItemRow).coverageLabel !== '待核对' ? [{ label: '覆盖率', value: (row as CoverageItemRow).coverageLabel }] : []),
                { label: '最新交易日', value: row.latestTradeDate },
                { label: '状态', value: (row as CoverageItemRow).updateStatusLabel },
                { label: '总行数', value: (row as CoverageItemRow).totalRows },
                ...(row.dqStatus ? [{ label: '质量状态', value: row.dqStatus }] : []),
              ],
            },
          ]
        : row.objectType === 'api-item'
          ? [
              {
                title: '当前对象',
                items: [
                  { label: '对象类型', value: '接口健康项' },
                  { label: '当前状态', value: row.stateLabel },
                ],
              },
              {
                title: '接口信息',
                items: [
                  { label: '接口键', value: row.apiKey },
                  { label: '所属域', value: row.domain },
                  { label: '最近检查', value: row.latestCheck },
                  { label: 'HTTP 状态', value: row.httpStatus },
                ],
              },
            ]
          : [
              {
                title: '当前对象',
                items: [
                  { label: '对象类型', value: '运行日志 / 版本' },
                  { label: '当前状态', value: row.stateLabel },
                ],
              },
              {
                title: '版本与摘要',
                items: [
                  { label: '版本快照', value: row.versionLabel },
                  { label: '更新时间', value: row.publishedAt },
                  { label: '异常等级', value: row.anomalyLevel },
                  { label: '影响范围', value: row.scopeHint },
                ],
              },
            ];

  return {
    title: row.title,
    subtitle: row.subtitle,
    sourceSummary: getSourceSummary(source),
    sections,
    nextSteps: [
      { label: '查看关联摘要', note: '结合左侧当前条目，继续核对运行状态、版本信息和上下游影响。' },
      { label: '返回来源工作域', note: '如需继续处理业务判断，可回到来源工作域查看当前链路上的原始对象。' },
    ],
  };
}

function buildTabState(sourceMode: SystemSourceMode, tab: SystemTab): SystemTabStateViewModel {
  return {
    sourceMode,
    label: getModeLabel(sourceMode),
    note: getModeNote(sourceMode, tab),
  };
}

function buildSystemDataSource(mode: SystemSourceMode, sourceLabel: string, sourceDetail: string, sampleSize: number | null): DataSourceMeta {
  return buildDataSourceMeta({
    data_source:
      mode === 'real'
        ? 'real'
        : mode === 'mock'
          ? 'mock'
          : mode === 'fallback'
            ? 'fallback'
            : 'placeholder',
    source_label: sourceLabel,
    source_detail: sourceDetail,
    sample_size: sampleSize,
    is_empty: sampleSize === 0,
    empty_reason: sampleSize === 0 ? '当前 tab 的真实接口已响应，但没有返回任何行。' : null,
  });
}

async function settle<T>(promise: Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

function mergeMetrics(versionRaw: SystemVersionRawDto | null, runlogRaw: SystemRunlogLatestRawDto | null) {
  const fallback = systemMockSource.metrics;
  return [
    {
      key: 'pipeline',
      label: '流程步骤',
      value: fallback[0].value,
      note: runlogRaw?.latest_fail_step ? `异常步骤：${runlogRaw.latest_fail_step}` : '查看当天关键步骤与处理状态。',
    },
    {
      key: 'coverage',
      label: '数据覆盖',
      value: fallback[1].value,
      note: '查看主要数据集的更新完整度与质量状态。',
    },
    {
      key: 'api',
      label: '接口健康',
      value: fallback[2].value,
      note: '查看关键接口可用性与最近响应情况。',
    },
    {
      key: 'runlog',
      label: '版本快照',
      value: versionRaw?.version_snapshot ?? versionRaw?.version ?? fallback[3].value,
      note: versionRaw?.updated_at ? `最近更新时间：${versionRaw.updated_at}` : '查看最新版本和运行摘要。',
    },
  ];
}

export async function loadSystemWorkspace(searchParams: URLSearchParams): Promise<SystemWorkspaceViewModel> {
  const query = normalizeQuery(searchParams);

  const [versionResult, runlogResult] = await Promise.all([
    settle(fetchSystemVersion()),
    settle(fetchSystemRunlogLatest()),
  ]);

  const versionRaw = versionResult.ok ? versionResult.data : null;
  const runlogRaw = runlogResult.ok ? runlogResult.data : null;

  let pipelineRows = fromMockPipeline();
  let coverageRows = fromMockCoverage();
  let apiRows = fromMockApi();
  const runlogRows = fromMockRunlog(versionRaw, runlogRaw);

  let pipelineMode: SystemSourceMode = 'mock';
  let coverageMode: SystemSourceMode = 'mock';
  let apiMode: SystemSourceMode = 'mock';
  const runlogMode: SystemSourceMode = versionRaw || runlogRaw ? 'real' : 'mock';

  if (query.tab === 'pipeline') {
    const result = await settle(fetchSystemPipelineRuns(query.tradeDate));
    if (result.ok && result.data.length > 0) {
      pipelineRows = fromRealPipeline(result.data, query.tradeDate);
      pipelineMode = 'real';
    } else if (result.ok && result.data.length === 0) {
      pipelineRows = [];
      pipelineMode = 'fallback';
    }
  }

  if (query.tab === 'coverage') {
    const result = await settle(fetchSystemDataCoverage(query.tradeDate));
    if (result.ok && result.data.length > 0) {
      coverageRows = fromRealCoverage(result.data, query.tradeDate);
      coverageMode = 'real';
    } else if (result.ok && result.data.length === 0) {
      coverageRows = [];
      coverageMode = 'fallback';
    }
  }

  if (query.tab === 'api') {
    const result = await settle(fetchSystemApiHealth());
    if (result.ok && result.data.length > 0) {
      apiRows = fromRealApi(result.data);
      apiMode = 'real';
    } else if (result.ok && result.data.length === 0) {
      apiRows = [];
      apiMode = 'unsupported';
    }
  }

  const workspaceBase = {
    pipeline: pipelineRows,
    coverage: coverageRows,
    apiHealth: apiRows,
    runlog: runlogRows,
  };
  const activeRows = getRowsForTab(query.tab, workspaceBase);
  const matchedRows = filterRows(query, activeRows);
  const selectedRow = query.focus ? matchedRows[0] ?? null : null;

  const tabStates: Record<SystemTab, SystemTabStateViewModel> = {
    pipeline: buildTabState(pipelineMode, 'pipeline'),
    coverage: buildTabState(coverageMode, 'coverage'),
    api: buildTabState(apiMode, 'api'),
    runlog: buildTabState(runlogMode, 'runlog'),
  };
  const dataSources = {
    pipeline: buildSystemDataSource(pipelineMode, 'System pipeline API', pipelineMode === 'fallback' ? 'Pipeline 真实接口当前无行，区块退回兼容承接。' : 'Pipeline 区块直接使用真实运行接口结果。', pipelineRows.length),
    coverage: buildSystemDataSource(coverageMode, 'System coverage API', coverageMode === 'fallback' ? 'Coverage 真实接口当前无行，区块退回兼容承接。' : 'Coverage 区块直接使用真实覆盖接口结果。', coverageRows.length),
    api: buildSystemDataSource(apiMode, 'System API health API', apiMode === 'unsupported' ? '当前 API 健康区块仍是占位内容，等待后续安全接入。' : 'API 健康区块直接使用真实接口结果。', apiRows.length),
    runlog: buildSystemDataSource(runlogMode, 'System version/runlog APIs', 'Runlog 区块直接使用真实版本与运行摘要接口结果。', runlogRows.length),
  };

  const activeTabState = tabStates[query.tab];
  const dataState: SystemDataState =
    activeTabState.sourceMode === 'unsupported'
      ? 'unsupported'
      : activeTabState.sourceMode === 'real'
        ? 'ready'
        : 'preview';

  return {
    title: '系统运行中心',
    subtitle: '围绕运行步骤、数据覆盖、接口健康和版本摘要，统一查看今日系统状态。',
    query,
    metrics: mergeMetrics(versionRaw, runlogRaw).map((metric) => ({
      ...metric,
      dataSource: dataSources[metric.key as keyof typeof dataSources] ?? dataSources[query.tab],
    })),
    tabs: SYSTEM_TABS,
    filterChips: [
      { key: 'source', label: '来源', value: getSourceLabel(query.source) },
      { key: 'focus', label: '当前对象', value: query.focus || '未指定' },
      { key: 'date', label: '交易日', value: query.tradeDate },
      {
        key: 'tab',
        label: '当前标签',
        value: SYSTEM_TABS.find((tab) => tab.key === query.tab)?.label ?? '流程运行',
      },
    ],
    dataState,
    dataStateNote: activeTabState.note,
    loadingState: {
      title: '正在加载系统运行数据',
      description: '正在整理当前环境的流程状态、数据覆盖和版本摘要，请稍候。',
    },
    emptyState: {
      title: '当前标签暂无可展示对象',
      description: '当前查询条件下没有找到可展示的运行对象，可切换标签或放宽筛选条件。',
    },
    unsupportedState: {
      title: '当前环境尚未接入该视图',
      description: '该标签在当前环境下还没有可用结果，页面已保留正式结构以便后续接入。',
    },
    noFocus: {
      title: '请选择一个运行对象',
      description: '从左侧选择流程步骤、数据集、接口或运行摘要后，这里会承接对象状态、来源说明和下一步建议。',
    },
    pipeline: pipelineRows,
    coverage: coverageRows,
    apiHealth: apiRows,
    runlog: runlogRows,
    tabStates: {
      pipeline: { ...tabStates.pipeline, dataSource: dataSources.pipeline },
      coverage: { ...tabStates.coverage, dataSource: dataSources.coverage },
      api: { ...tabStates.api, dataSource: dataSources.api },
      runlog: { ...tabStates.runlog, dataSource: dataSources.runlog },
    },
    dataSources,
    selectedId: selectedRow?.id ?? null,
    selectedRow,
    focusMissNote:
      query.focus && !selectedRow
        ? `未找到 ${query.focus} 对应的系统对象，已保留当前标签，请重新选择。`
        : '',
    context: selectedRow ? { ...buildContext(selectedRow, query.source), dataSource: dataSources[query.tab] } : null,
    dataSource: dataSources[query.tab],
  };
}

export function getSystemRows(viewModel: SystemWorkspaceViewModel): SystemRow[] {
  return getRowsForTab(viewModel.query.tab, viewModel);
}

export function getSystemTabTitle(tab: SystemTab) {
  if (tab === 'pipeline') return '流程运行';
  if (tab === 'coverage') return '数据覆盖';
  if (tab === 'api') return '接口健康';
  return '运行日志与版本';
}

export function buildSystemFocusQueryPatch(row: SystemRow): Partial<Pick<SystemQueryModel, 'focus' | 'step' | 'dataset' | 'api'>> {
  if (row.objectType === 'pipeline-step') return { focus: row.focusKey, step: row.stepKey, dataset: '', api: '' };
  if (row.objectType === 'coverage-item') return { focus: row.focusKey, step: '', dataset: row.datasetKey, api: '' };
  if (row.objectType === 'api-item') return { focus: row.focusKey, step: '', dataset: '', api: row.apiKey };
  return { focus: row.focusKey, step: '', dataset: '', api: '' };
}
