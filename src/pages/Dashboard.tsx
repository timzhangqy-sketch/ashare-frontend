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

      {/* ═══ 第1行：市场综述 + 行动清单 ═══ */}
      <section className="dashboard-section-grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'stretch' }}>
        <div className="card">
          <div className="card-body dashboard-module-body">
            <h3 className="card-title">市场综述</h3>
            <div className="stat-card" style={{ marginTop: '8px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8, margin: 0, textAlign: 'left' }}>
                {viewModel?.marketSummary || '暂无综述数据'}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body dashboard-module-body">
            <h3 className="card-title">今日行动清单</h3>
            {hasAnyAction ? (
              <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px', padding: '12px', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: '#4ade80', fontWeight: 600, minWidth: '48px' }}>● 待卖出</span>
                  {hasSell ? actionList!.sell!.slice(0, 5).map((item, i) => (
                    <span key={`sell-${item.ts_code ?? i}`} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {item.name} <span style={{ color: (item.gain_pct ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>{formatSignedPercentSafe(item.gain_pct, 2, 100, '—')}</span>
                    </span>
                  )) : <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>暂无</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: 'var(--up)', fontWeight: 600, minWidth: '48px' }}>● 待买入</span>
                  {hasBuy ? actionList!.buy!.slice(0, 5).map((item, i) => (
                    <span key={`buy-${item.ts_code ?? i}`} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {item.name}
                    </span>
                  )) : <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>暂无</span>}
                  {hasBuy && actionList!.buy!.length > 5 ? <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(+{actionList!.buy!.length - 5}更多)</span> : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 600, minWidth: '48px' }}>● 关注</span>
                  {hasWatch ? actionList!.watch!.slice(0, 3).map((item, i) => (
                    <span key={`watch-${item.ts_code ?? i}`} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {item.name}
                    </span>
                  )) : <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>暂无</span>}
                </div>
              </div>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>今日无需操作</span>
            )}
          </div>
        </div>
      </section>

      {/* ═══ 第2行：概念热度 + 热门个股 ═══ */}
      <section className="dashboard-section-grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'stretch' }}>
        <div className="card">
          <div className="card-body dashboard-module-body">
            <h3 className="card-title">概念热度 Top10</h3>
            <div className="stat-card" style={{ marginTop: '8px', padding: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '30px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>概念</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '80px' }}>涨跌幅</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '80px' }}>热度</th>
                  </tr>
                </thead>
                <tbody>
                  {((viewModel as any)?.hotConcepts || []).slice(0, 10).map((c: any, i: number) => (
                    <tr key={`hc-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{c.rank ?? i + 1}</td>
                      <td style={{ padding: '5px 8px', color: 'var(--text-primary)', fontWeight: 500 }}>{c.name}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: (c.pct_change ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500 }}>
                        {c.pct_change != null ? `${c.pct_change >= 0 ? '+' : ''}${c.pct_change.toFixed(2)}%` : '—'}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {c.hot != null ? Math.round(c.hot).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {((viewModel as any)?.hotConcepts || []).length === 0 && (
                    <tr><td colSpan={4} style={{ padding: '12px 8px', color: 'var(--text-muted)', textAlign: 'center' }}>暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body dashboard-module-body">
            <h3 className="card-title">热门个股 Top10</h3>
            <div className="stat-card" style={{ marginTop: '8px', padding: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '30px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>股票</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '100px' }}>主概念</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '80px' }}>涨跌幅</th>
                  </tr>
                </thead>
                <tbody>
                  {((viewModel as any)?.hotStocks || []).slice(0, 10).map((s: any, i: number) => (
                    <tr key={`hs-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{s.rank ?? i + 1}</td>
                      <td style={{ padding: '5px 8px', color: 'var(--text-primary)', fontWeight: 500 }}>
                        {s.name}{s.is_leader && <span title="概念龙头" style={{ marginLeft: '4px', fontSize: '11px' }}>👑</span>}
                      </td>
                      <td style={{ padding: '5px 8px' }}>
                        {s.primary_concept ? (
                          <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '1px 6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {s.primary_concept}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: (s.pct_change ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500 }}>
                        {s.pct_change != null ? `${s.pct_change >= 0 ? '+' : ''}${s.pct_change.toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                  {((viewModel as any)?.hotStocks || []).length === 0 && (
                    <tr><td colSpan={4} style={{ padding: '12px 8px', color: 'var(--text-muted)', textAlign: 'center' }}>暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
