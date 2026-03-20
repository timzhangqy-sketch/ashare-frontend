import { useEffect, useState } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getDashboardSummary, fetchConceptMomentum, fetchConceptSurge, fetchConceptRetreat, fetchConceptResonance } from '../api';
import type { ConceptMomentum, ConceptSurge, ConceptRetreat, ConceptResonance } from '../types/dashboard';
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
  const [hoveredConceptRow, setHoveredConceptRow] = useState<number | null>(null);
  const [hoveredHotStockRow, setHoveredHotStockRow] = useState<number | null>(null);
  const [momentum, setMomentum] = useState<ConceptMomentum[]>([]);
  const [surge, setSurge] = useState<ConceptSurge[]>([]);
  const [retreat, setRetreat] = useState<ConceptRetreat[]>([]);
  const [resonance, setResonance] = useState<ConceptResonance>({ resonance_hits: [], retreat_warnings: [] });
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchConceptMomentum(selectedDate),
      fetchConceptSurge(selectedDate),
      fetchConceptRetreat(selectedDate),
      fetchConceptResonance(selectedDate),
    ]).then(([m, s, r, res]) => {
      if (cancelled) return;
      setMomentum(m);
      setSurge(s);
      setRetreat(r);
      setResonance(res);
    });
    return () => { cancelled = true; };
  }, [selectedDate]);

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
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="card-title" style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700 }}>市场综述</h3>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '12px', flex: 1 }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8, margin: 0, textAlign: 'left' }}>
                {viewModel?.marketSummary || '暂无综述数据'}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="card-title" style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700 }}>今日行动清单</h3>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '12px', flex: 1 }}>
            {hasAnyAction ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
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
        </div>
      </section>

      {/* ═══ 第2行：概念热度 + 成交额 + 热门个股 ═══ */}
      <section className="dashboard-section-grid" style={{ gridTemplateColumns: '1fr 1.2fr 1fr', alignItems: 'stretch' }}>
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="card-title" style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700 }}>概念热度 Top10</h3>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '8px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '28px', fontSize: '11px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px' }}>概念</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '80px', fontSize: '11px' }}>涨跌幅</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '80px', fontSize: '11px' }}>热度</th>
                  </tr>
                </thead>
                <tbody>
                  {((viewModel as any)?.hotConcepts || []).slice(0, 10).map((c: any, i: number) => (
                    <tr
                      key={`hc-${i}`}
                      onMouseEnter={() => setHoveredConceptRow(i)}
                      onMouseLeave={() => setHoveredConceptRow(null)}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: hoveredConceptRow === i ? 'rgba(255,255,255,0.03)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)', width: '28px', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {c.rank ?? i + 1}
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-primary)', fontWeight: 500 }}>
                        {c.name}
                      </td>
                      <td
                        style={{
                          padding: '6px 8px',
                          textAlign: 'right',
                          color: (c.pct_change ?? 0) >= 0 ? 'var(--up)' : 'var(--down)',
                          fontWeight: 500,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {c.pct_change != null ? `${c.pct_change >= 0 ? '+' : ''}${c.pct_change.toFixed(2)}%` : '—'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {c.hot != null ? Math.round(c.hot).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {((viewModel as any)?.hotConcepts || []).length === 0 && (
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td colSpan={4} style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'center' }}>暂无数据</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="card-title" style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700 }}>两市成交额（亿元）</h3>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '8px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {(() => {
                const turnoverHistory: any[] = (viewModel as any)?.marketIndex?.turnoverHistory
                  ?? (viewModel as any)?.marketIndex?.turnover_history
                  ?? [];
                const breadthHistory: any[] = (viewModel as any)?.marketIndex?.breadthHistory
                  ?? (viewModel as any)?.marketIndex?.breadth_history
                  ?? [];
                const breadthScore = (viewModel as any)?.marketIndex?.breadth_score ?? (viewModel as any)?.marketIndex?.breadthScore ?? null;
                const breadthDelta = (viewModel as any)?.marketIndex?.breadth_delta ?? (viewModel as any)?.marketIndex?.breadthDelta ?? null;
                const breadthState: string = (viewModel as any)?.marketIndex?.breadth_state ?? (viewModel as any)?.marketIndex?.breadthState ?? '';

                // Merge breadth_score into chart data
                const breadthMap: Record<string, number> = {};
                for (const b of breadthHistory) if (b.date && b.score != null) breadthMap[b.date] = b.score;
                const chartData = turnoverHistory.map((t: any) => ({
                  ...t,
                  breadth_score: breadthMap[t.date] ?? null,
                }));

                const latest = turnoverHistory.length > 0 ? turnoverHistory[turnoverHistory.length - 1] : null;
                const avg5 = turnoverHistory.length >= 5
                  ? Math.round(turnoverHistory.slice(-5).reduce((s: number, d: any) => s + d.amount, 0) / 5)
                  : null;

                const stateLabelMap: Record<string, string> = { strong: '强势', bullish: '偏强', neutral: '中性', bearish: '偏弱', weak: '弱势' };

                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px 4px', fontSize: '12px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        今日 <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '16px' }}>
                          {latest ? Math.round(latest.amount).toLocaleString() : '—'}
                        </span> 亿
                        {avg5 != null && latest && (
                          <span style={{ color: latest.amount > avg5 * 1.1 ? 'var(--up)' : latest.amount < avg5 * 0.9 ? 'var(--down)' : 'var(--text-muted)', marginLeft: '8px' }}>
                            5日均 {avg5.toLocaleString()} 亿
                            ({latest.amount > avg5 ? '+' : ''}{((latest.amount / avg5 - 1) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </span>
                      {breadthScore != null && (
                        <span style={{ fontSize: '12px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>宽度 </span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{breadthScore}</span>
                          {breadthDelta != null && (
                            <span style={{ color: breadthDelta > 0 ? '#52c41a' : breadthDelta < 0 ? '#ff4d4f' : 'var(--text-primary)', marginLeft: '2px' }}>
                              {breadthDelta > 0 ? '↑' : breadthDelta < 0 ? '↓' : '→'}
                            </span>
                          )}
                          <span style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>{stateLabelMap[breadthState] ?? ''}</span>
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%" minHeight={180}>
                      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 4, bottom: 2 }}>
                        <defs>
                          <linearGradient id="turnoverGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: '#64748b', dy: 4 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                          tickLine={false}
                          interval={Math.floor(chartData.length / 5)}
                        />
                        <YAxis
                          yAxisId="left"
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                          width={50}
                          tickFormatter={(v: number) => {
                            const n = Number(v);
                            if (!Number.isFinite(n)) return '';
                            const abs = Math.abs(n);
                            if (abs >= 10000) return `${(n / 10000).toFixed(1)}万`;
                            return `${Math.round(n).toLocaleString()}`;
                          }}
                          domain={['auto', 'auto']}
                        />
                        <YAxis yAxisId="breadth" orientation="right" domain={[0, 100]} hide />
                        <Tooltip
                          contentStyle={{
                            background: 'rgba(15,23,42,0.95)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '8px',
                            fontSize: '12px',
                            padding: '8px 12px',
                          }}
                          labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0]?.payload;
                            if (!d) return null;
                            return (
                              <div style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', fontSize: '12px', padding: '8px 12px' }}>
                                <div style={{ color: '#94a3b8', marginBottom: '4px' }}>{label}</div>
                                <div style={{ color: '#3b82f6' }}>成交额：{Math.round(d.amount ?? 0).toLocaleString()} 亿</div>
                                {d.breadth_score != null && <div style={{ color: '#faad14' }}>市场宽度：{d.breadth_score} 分</div>}
                              </div>
                            );
                          }}
                        />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="amount"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          fill="url(#turnoverGrad)"
                          dot={false}
                          activeDot={{ r: 3, fill: '#3b82f6', stroke: '#fff', strokeWidth: 1.5 }}
                        />
                        <Line yAxisId="breadth" type="monotone" dataKey="breadth_score" stroke="#faad14" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="card-title" style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700 }}>热门个股 Top10</h3>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '8px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '28px', fontSize: '11px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px' }}>股票</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '100px', fontSize: '11px' }}>主概念</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '80px', fontSize: '11px' }}>涨跌幅</th>
                  </tr>
                </thead>
                <tbody>
                  {((viewModel as any)?.hotStocks || []).slice(0, 10).map((s: any, i: number) => (
                    <tr
                      key={`hs-${i}`}
                      onMouseEnter={() => setHoveredHotStockRow(i)}
                      onMouseLeave={() => setHoveredHotStockRow(null)}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: hoveredHotStockRow === i ? 'rgba(255,255,255,0.03)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)', width: '28px', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{s.rank ?? i + 1}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-primary)', fontWeight: 500 }}>
                        {s.name}{s.is_leader && <span title="概念龙头" style={{ marginLeft: '4px', fontSize: '11px' }}>👑</span>}
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-primary)', fontWeight: 500 }}>
                        {s.primary_concept ? (
                          s.primary_concept
                        ) : '—'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: (s.pct_change ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {s.pct_change != null ? `${s.pct_change >= 0 ? '+' : ''}${s.pct_change.toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                  {((viewModel as any)?.hotStocks || []).length === 0 && (
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}><td colSpan={4} style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'center' }}>暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 第3行：板块轮动三栏 ═══ */}
      <section className="dashboard-section-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr', alignItems: 'stretch' }}>
        {/* 左栏：强势板块 Top10 */}
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="card-title" style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700 }}>强势板块 Top10</h3>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '8px 12px', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, width: '24px', fontSize: '11px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>概念</th>
                    <th style={{ textAlign: 'right', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>3日涨幅</th>
                    <th style={{ textAlign: 'right', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>今日</th>
                    <th style={{ textAlign: 'right', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>涨停</th>
                    <th style={{ textAlign: 'right', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>上涨占比</th>
                    <th style={{ textAlign: 'right', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>龙头</th>
                    <th style={{ textAlign: 'center', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>命中</th>
                    <th style={{ textAlign: 'center', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>热度</th>
                  </tr>
                </thead>
                <tbody>
                  {momentum.length > 0 ? momentum.map((c, i) => (
                    <tr key={c.concept_code} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                      <td style={{ padding: '5px 6px', color: 'var(--text-primary)', fontWeight: 500 }}>{c.concept_name}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: (c.momentum_3d ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {(c.momentum_3d ?? 0) >= 0 ? '+' : ''}{(c.momentum_3d ?? 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: (c.avg_pct_chg ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {(c.avg_pct_chg ?? 0) >= 0 ? '+' : ''}{(c.avg_pct_chg ?? 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{c.limit_up_count ?? 0}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{Math.round((c.up_ratio ?? 0) * 100)}%</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: (c.leader_avg_pct_chg ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {c.leader_avg_pct_chg != null ? `${c.leader_avg_pct_chg >= 0 ? '+' : ''}${(c.leader_avg_pct_chg ?? 0).toFixed(2)}%` : '—'}
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', fontSize: '11px' }}>
                        {c.strategy_hit_count > 0 ? <span style={{ color: 'var(--info)' }}>🎯{c.strategy_hit_count}</span> : null}
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', fontSize: '11px' }}>
                        {c.heat_persistence > 0 ? <span style={{ color: '#f59e0b' }}>🔥×{c.heat_persistence}天</span> : null}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={9} style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {/* 中栏：异动板块 Top5 */}
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="card-title" style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700 }}>异动板块 Top5</h3>
            <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>近3日放量但价格未动</p>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '8px 12px', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, width: '24px', fontSize: '11px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>概念</th>
                    <th style={{ textAlign: 'right', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>量比</th>
                    <th style={{ textAlign: 'right', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>3日均额</th>
                    <th style={{ textAlign: 'right', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>今日</th>
                    <th style={{ textAlign: 'left', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>龙头领涨</th>
                  </tr>
                </thead>
                <tbody>
                  {surge.length > 0 ? surge.map((c, i) => (
                    <tr key={c.concept_code} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                      <td style={{ padding: '5px 6px', color: 'var(--text-primary)', fontWeight: 500 }}>{c.concept_name}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: (c.concept_vr3 ?? 0) >= 2.0 ? '#f59e0b' : 'var(--text-primary)' }}>
                        {(c.concept_vr3 ?? 0).toFixed(1)}倍
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {(c.amount_3d_avg ?? 0).toFixed(1)}亿
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: (c.avg_pct_chg ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {(c.avg_pct_chg ?? 0) >= 0 ? '+' : ''}{(c.avg_pct_chg ?? 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: '5px 6px', color: 'var(--text-secondary)', fontSize: '11px' }}>
                        {c.leader_top_stock ? (
                          <span>{c.leader_top_stock} <span style={{ color: (c.leader_top_pct_chg ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500 }}>{c.leader_top_pct_chg != null ? `${c.leader_top_pct_chg >= 0 ? '+' : ''}${(c.leader_top_pct_chg ?? 0).toFixed(1)}%` : ''}</span></span>
                        ) : '—'}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>暂无异动板块</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {/* 右栏：退潮板块 Top5 */}
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="card-title" style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700 }}>退潮板块 Top5</h3>
            <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>前期强势→今日回落</p>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '8px 12px', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, width: '24px', fontSize: '11px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>概念</th>
                    <th style={{ textAlign: 'right', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>今日涨幅</th>
                    <th style={{ textAlign: 'right', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>3日累计</th>
                    <th style={{ textAlign: 'right', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>跌停</th>
                    <th style={{ textAlign: 'right', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>龙头</th>
                  </tr>
                </thead>
                <tbody>
                  {retreat.length > 0 ? retreat.map((c, i) => (
                    <tr key={c.concept_code} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                      <td style={{ padding: '5px 6px', color: 'var(--text-primary)', fontWeight: 500 }}>{c.concept_name}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {(c.today_pct_chg ?? 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--up)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        +{(c.momentum_3d ?? 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{c.limit_down_count ?? 0}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {c.leader_avg_pct_chg != null ? `${(c.leader_avg_pct_chg ?? 0).toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>暂无退潮板块</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 第4行：板块×策略共振 ═══ */}
      <section className="dashboard-section-grid" style={{ gridTemplateColumns: '1fr', alignItems: 'stretch' }}>
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px' }}>
            <h3 className="card-title" style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700 }}>板块×策略共振</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {resonance.resonance_hits.map((hit, i) => (
                <div key={`rh-${i}`} style={{ background: 'rgba(82,196,26,0.1)', borderLeft: '3px solid #52c41a', borderRadius: '4px', padding: '8px 12px', fontSize: '13px', color: 'var(--text-primary)', fontWeight: 400 }}>
                  🎯 <strong>{hit.concept_name}</strong>板块连续强势（3日+{(hit.momentum_3d ?? 0).toFixed(2)}%），板块内策略触发{(hit.stocks ?? []).length}只：{(hit.stocks ?? []).map(s => s.name).join('、')}
                </div>
              ))}
              {resonance.retreat_warnings.map((warn, i) => (
                <div key={`rw-${i}`} style={{ background: 'rgba(250,173,20,0.1)', borderLeft: '3px solid #faad14', borderRadius: '4px', padding: '8px 12px', fontSize: '13px', color: 'var(--text-primary)', fontWeight: 400 }}>
                  ⚠️ <strong>{warn.concept_name}</strong>板块退潮中（今日{(warn.today_pct_chg ?? 0).toFixed(2)}%），持仓{(warn.stocks ?? []).map(s => s.name).join('、')}属该板块，注意卖点
                </div>
              ))}
              {resonance.resonance_hits.length === 0 && resonance.retreat_warnings.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>暂无板块共振信号</div>
              )}
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
