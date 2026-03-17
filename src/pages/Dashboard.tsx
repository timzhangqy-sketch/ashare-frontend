import { useEffect, useState } from 'react';
import { getDashboardSummary } from '../api';
import {
  buildDashboardRuntimeSnapshot,
  fetchActionList,
  isDashboardSummaryEmpty,
  mapDashboardSummaryToViewModel,
  mapRawDashboardResponseToDto,
} from '../adapters/dashboard';
import type { ActionListResponse } from '../api';
import { formatSignedPercentSafe } from '../utils/formatters';
import KpiCard from '../components/Dashboard/KpiCard';
import OpportunitySection from '../components/Dashboard/OpportunitySection';
import PortfolioSection from '../components/Dashboard/PortfolioSection';
import RiskSection from '../components/Dashboard/RiskSection';
import StatusState from '../components/Dashboard/StatusState';
import SystemHealthSection from '../components/Dashboard/SystemHealthSection';
import TodaySummarySection from '../components/Dashboard/TodaySummarySection';
import SourceSummaryBar from '../components/data-source/SourceSummaryBar';
import { useDashboardRuntime } from '../context/useDashboardRuntime';
import { useDate } from '../context/useDate';
import type { DashboardViewModel } from '../types/dashboard';

export default function Dashboard() {
  const { selectedDate } = useDate();
  const { setSnapshot } = useDashboardRuntime();

  const [actionList, setActionList] = useState<ActionListResponse | null>(null);
  const [retrySeed, setRetrySeed] = useState(0);
  const [loadState, setLoadState] = useState<{
    key: string | null;
    status: 'empty' | 'error' | 'normal';
    viewModel: DashboardViewModel | null;
    errorMessage: string;
  }>({
    key: null,
    status: 'normal',
    viewModel: null,
    errorMessage: '',
  });

  useEffect(() => {
    let cancelled = false;

    getDashboardSummary(selectedDate)
      .then((raw) => {
        if (cancelled) return;
        const dto = mapRawDashboardResponseToDto(raw);
        const snapshot = buildDashboardRuntimeSnapshot(dto);
        setLoadState({
          key: selectedDate,
          status: isDashboardSummaryEmpty(dto) ? 'empty' : 'normal',
          viewModel: mapDashboardSummaryToViewModel(dto),
          errorMessage: '',
        });
        setSnapshot(snapshot);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadState({
          key: selectedDate,
          status: 'error',
          viewModel: null,
          errorMessage: error instanceof Error ? `数据加载失败：${error.message}` : '数据加载失败',
        });
        setSnapshot(null);
      });

    return () => {
      cancelled = true;
      setSnapshot(null);
    };
  }, [retrySeed, selectedDate, setSnapshot]);

  useEffect(() => {
    let cancelled = false;
    fetchActionList()
      .then((data) => {
        if (!cancelled) setActionList(data);
      })
      .catch(() => {
        if (!cancelled) setActionList(null);
      });
    return () => { cancelled = true; };
  }, []);

  const handleRetry = () => {
    setRetrySeed((seed) => seed + 1);
  };

  const status = loadState.key === selectedDate ? loadState.status : 'loading';
  const viewModel = loadState.key === selectedDate ? loadState.viewModel : null;
  const errorMessage = loadState.key === selectedDate ? loadState.errorMessage : '';

  const hasSell = Array.isArray(actionList?.sell) && actionList.sell.length > 0;
  const hasBuy = Array.isArray(actionList?.buy) && actionList.buy.length > 0;
  const hasWatch = Array.isArray(actionList?.watch) && actionList.watch.length > 0;
  const hasAnyAction = hasSell || hasBuy || hasWatch;

  const kpis = viewModel?.kpis ?? [];
  const mainKpis = kpis.filter(
    (item) => item.id !== 'failedStepsCount' && item.id !== 'versionLabel',
  );
  const pipelineKpi = kpis.find((item) => item.id === 'failedStepsCount');
  const versionKpi = kpis.find((item) => item.id === 'versionLabel');

  return (
    <div className="dashboard-page" data-testid="dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-actions" />
      </section>

      <SourceSummaryBar meta={viewModel?.dataSource} className="dashboard-source-summary" />

      {status === 'error' ? (
        <section className="card">
          <div className="card-body dashboard-module-body">
            <StatusState
              type="error"
              title="Dashboard 数据加载失败"
              description={errorMessage || '当前无法获取 Dashboard 总览数据，请稍后重试。'}
              actionLabel="重新加载"
              onAction={handleRetry}
            />
          </div>
        </section>
      ) : null}

      <TodaySummarySection data={viewModel?.todaySummary} onRetry={handleRetry} status={status} />

      <section className="action-list-section">
        <div className="action-list-header">
          <h3 className="action-list-title card-title">今日行动清单</h3>
        </div>
        <div className="action-list-body">
          {hasAnyAction ? (
            <>
              <div className="action-list-row">
                <div className="action-list-label">
                  <span className="action-list-dot action-list-dot--sell" />
                  待卖出
                </div>
                <div className="action-list-content">
                  {hasSell ? (
                    <>
                      {actionList!.sell!.slice(0, 5).map((item, i) => (
                        <div key={`sell-${item.ts_code ?? i}`} className="action-chip">
                          <span className="action-chip-name">{item.name ?? '—'}</span>
                          <span
                            className={`action-chip-badge ${
                              (item.gain_pct ?? 0) >= 0 ? 'action-chip-badge--up' : 'action-chip-badge--down'
                            }`}
                          >
                            {formatSignedPercentSafe(item.gain_pct, 2, 100, '—')}
                          </span>
                        </div>
                      ))}
                      {actionList!.sell!.length > 5 ? (
                        <span className="action-list-more">(+{actionList!.sell!.length - 5}更多)</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="action-list-empty">暂无</span>
                  )}
                </div>
              </div>
              <div className="action-list-row">
                <div className="action-list-label">
                  <span className="action-list-dot action-list-dot--buy" />
                  待买入
                </div>
                <div className="action-list-content">
                  {hasBuy ? (
                    <>
                      {actionList!.buy!.slice(0, 5).map((item, i) => (
                        <div key={`buy-${item.ts_code ?? i}`} className="action-chip">
                          <span className="action-chip-name">{item.name ?? '—'}</span>
                          <span className="action-chip-badge action-chip-badge--neutral">—</span>
                        </div>
                      ))}
                      {actionList!.buy!.length > 5 ? (
                        <span className="action-list-more">(+{actionList!.buy!.length - 5}更多)</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="action-list-empty">暂无</span>
                  )}
                </div>
              </div>
              <div className="action-list-row action-list-row--last">
                <div className="action-list-label">
                  <span className="action-list-dot action-list-dot--watch" />
                  重要关注
                </div>
                <div className="action-list-content">
                  {hasWatch ? (
                    <>
                      {actionList!.watch!.slice(0, 5).map((item, i) => (
                        <div key={`watch-${item.ts_code ?? i}`} className="action-chip">
                          <span className="action-chip-name">{item.name ?? '—'}</span>
                          <span className="action-chip-badge action-chip-badge--neutral">—</span>
                        </div>
                      ))}
                      {actionList!.watch!.length > 5 ? (
                        <span className="action-list-more">(+{actionList!.watch!.length - 5}更多)</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="action-list-empty">暂无</span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="action-list-row action-list-row--single">
              <div className="action-list-label">
                今日行动清单
              </div>
              <div className="action-list-content">
                <span className="action-list-empty">今日无需操作</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="dashboard-kpi-strip card">
        {status === 'loading' ? (
          <div className="dashboard-kpi-strip-skeleton" />
        ) : (
          <>
            <div className="dashboard-kpi-strip-main">
              {mainKpis.slice(0, 8).map((item) => (
                <KpiCard item={item} key={item.id} />
              ))}
            </div>
            <div className="dashboard-kpi-strip-side">
              <div className="dashboard-kpi-pipeline">
                <span
                  className={
                    pipelineKpi && pipelineKpi.tone === 'danger'
                      ? 'kpi-dot kpi-dot--bad'
                      : 'kpi-dot kpi-dot--ok'
                  }
                />
                <span className="dashboard-kpi-pipeline-text">
                  Pipeline {pipelineKpi?.value ?? '—'}
                </span>
              </div>
              <div className="dashboard-kpi-version">
                {versionKpi?.value ?? '—'}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="dashboard-section-grid">
        <OpportunitySection data={viewModel?.opportunity} onRetry={handleRetry} status={status} />
        <RiskSection data={viewModel?.risk} onRetry={handleRetry} status={status} />
        <PortfolioSection data={viewModel?.portfolio} onRetry={handleRetry} status={status} />
        <SystemHealthSection data={viewModel?.systemHealth} onRetry={handleRetry} status={status} />
      </section>

    </div>
  );
}
