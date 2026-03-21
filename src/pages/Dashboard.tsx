import { useEffect, useMemo, useState } from 'react';
import { ComposedChart, BarChart, Bar, Cell, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, ReferenceLine } from 'recharts';
import api, { getDashboardSummary, fetchConceptMomentum, fetchConceptSurge, fetchConceptRetreat, fetchConceptResonance, fetchMarketDistribution } from '../api';
import type { ConceptMomentum, ConceptSurge, ConceptRetreat, ConceptResonance, MarketDistribution } from '../types/dashboard';
import {
  buildDashboardRuntimeSnapshot,
  fetchActionList,
  isDashboardSummaryEmpty,
  mapDashboardSummaryToViewModel,
  mapRawDashboardResponseToDto,
} from '../adapters/dashboard';
import type { ActionListResponse } from '../api';
import { getStrategyDisplayName } from '../utils/displayNames';
import StatusState from '../components/Dashboard/StatusState';
import SourceSummaryBar from '../components/data-source/SourceSummaryBar';
import StockDrawer from '../components/Drawer/StockDrawer';
import { useDashboardRuntime } from '../context/useDashboardRuntime';
import { useDate } from '../context/useDate';
import type { DashboardViewModel } from '../types/dashboard';
import type { StockDetail } from '../types/stock';
import InfoTip from '../components/InfoTip';
import { DASHBOARD_META } from '../config/dashboardMeta';

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
  const [distribution, setDistribution] = useState<MarketDistribution | null>(null);
  const [drawerStock, setDrawerStock] = useState<StockDetail | null>(null);
  const [portfolioRaw, setPortfolioRaw] = useState<any>(null);
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
    fetchActionList(selectedDate.replace(/-/g, ''))
      .then((data) => {
        if (!cancelled) setActionList(data);
      })
      .catch(() => {
        if (!cancelled) setActionList(null);
      });
    return () => { cancelled = true; };
  }, [selectedDate]);

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
    fetchMarketDistribution(selectedDate).then(d => { if (!cancelled) setDistribution(d); });
    api.get('/api/portfolio/summary').then(r => { if (!cancelled) setPortfolioRaw(r.data ?? null); }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedDate]);

  const handleRetry = () => {
    setRetrySeed((seed) => seed + 1);
  };

  const handleStockClick = (ts_code: string, name: string) => {
    setDrawerStock({ code: ts_code, name, close: 0, changePct: 0, lists: [], dims: [], gates: [] } as StockDetail);
  };

  const status = loadState.key === selectedDate ? loadState.status : 'loading';
  const viewModel = loadState.key === selectedDate ? loadState.viewModel : null;
  const errorMessage = loadState.key === selectedDate ? loadState.errorMessage : '';

  const hasSell = Array.isArray(actionList?.sell) && actionList.sell.length > 0;
  const hasBuy = Array.isArray(actionList?.buy) && actionList.buy.length > 0;
  const fills = actionList?.fills ?? [];
  const hasFills = fills.length > 0;

  const opp = viewModel?.opportunity;
  const risk = viewModel?.risk;
  const sys = viewModel?.systemHealth;

  const distData = useMemo(() => {
    if (!distribution) return [];
    return [
      { label: '>10%', value: distribution.gt10_up ?? 0, color: '#8B0000' },
      { label: '7~10', value: distribution.up_7_10 ?? 0, color: '#C62828' },
      { label: '5~7', value: distribution.up_5_7 ?? 0, color: '#E53935' },
      { label: '3~5', value: distribution.up_3_5 ?? 0, color: '#EF5350' },
      { label: '0~3', value: distribution.up_0_3 ?? 0, color: '#EF9A9A' },
      { label: '0', value: distribution.flat ?? 0, color: '#666666' },
      { label: '0~-3', value: distribution.down_0_3 ?? 0, color: '#A5D6A7' },
      { label: '-3~5', value: distribution.down_3_5 ?? 0, color: '#66BB6A' },
      { label: '-5~7', value: distribution.down_5_7 ?? 0, color: '#32CD32' },
      { label: '-7~10', value: distribution.down_7_10 ?? 0, color: '#228B22' },
      { label: '<-10%', value: distribution.gt10_down ?? 0, color: '#006400' },
    ];
  }, [distribution]);

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
            <h3 className="card-title" style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700 }}>市场综述<InfoTip data={DASHBOARD_META.market_summary} /></h3>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '12px', flex: 1 }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8, margin: 0, textAlign: 'left' }}>
                {viewModel?.marketSummary || '暂无综述数据'}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="card-title" style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700 }}>今日行动清单<InfoTip data={DASHBOARD_META.action_list} /></h3>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '8px 12px', flex: 1, overflow: 'auto' }}>
              {hasFills && (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '18%' }} />
                      <col style={{ width: '18%' }} />
                      <col style={{ width: '14%' }} />
                    </colgroup>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 28px', color: '#666', fontWeight: 400, fontSize: 12 }}>方向</th>
                        <th style={{ textAlign: 'left', padding: '6px 28px', color: '#666', fontWeight: 400, fontSize: 12 }}>股票</th>
                        <th style={{ textAlign: 'right', padding: '6px 28px', color: '#666', fontWeight: 400, fontSize: 12 }}>价格</th>
                        <th style={{ textAlign: 'right', padding: '6px 28px', color: '#666', fontWeight: 400, fontSize: 12 }}>数量</th>
                        <th style={{ textAlign: 'left', padding: '6px 28px', color: '#666', fontWeight: 400, fontSize: 12 }}>策略</th>
                        <th style={{ textAlign: 'left', padding: '6px 28px', color: '#666', fontWeight: 400, fontSize: 12 }}>信号</th>
                        <th style={{ textAlign: 'right', padding: '6px 28px', color: '#666', fontWeight: 400, fontSize: 12 }}>盈亏</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fills.map((f: any, i: number) => {
                        const SIGNAL_CN: Record<string, string> = { BREAKOUT: '突破', PULLBACK: '回踩', TREND_BREAK: '破位', STOP_LOSS: '止损', TIME_EXIT: '超期', TRAILING_STOP: '追踪止盈', TAKE_PROFIT: '止盈', WARN_MA_BREAK: '均线破位', BREAKOUT_FAIL: '突破失败' };
                        const STRAT_CN: Record<string, string> = { VOL_SURGE: '放量蓄势', RETOC2: '异动策略', PATTERN_T2UP9: '形态策略', WEAK_BUY: '弱市吸筹', PATTERN_GREEN10: '阳线形态', IGNITE: '点火策略' };
                        return (
                        <tr key={`fill-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '6px 28px', fontSize: 13, fontWeight: 600, color: f.direction === 'BUY' ? 'var(--up)' : 'var(--down)' }}>{f.direction === 'BUY' ? '买入' : '卖出'}</td>
                          <td style={{ padding: '6px 28px', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => handleStockClick(f.ts_code, f.name)}>{f.name}</td>
                          <td style={{ padding: '6px 28px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{f.fill_price?.toFixed(2) ?? '—'}</td>
                          <td style={{ padding: '6px 28px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{f.fill_shares?.toLocaleString() ?? '—'}</td>
                          <td style={{ padding: '6px 28px', fontSize: 13, color: 'var(--text-secondary)' }}>{STRAT_CN[f.strategy] ?? f.strategy}</td>
                          <td style={{ padding: '6px 28px', fontSize: 13, color: 'var(--text-secondary)' }}>{SIGNAL_CN[f.signal_type] ?? f.signal_type}</td>
                          <td style={{ padding: '6px 28px', fontSize: 13, textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: f.pnl_pct != null ? (f.pnl_pct >= 0 ? 'var(--up)' : 'var(--down)') : 'var(--text-muted)' }}>
                            {f.pnl_pct != null ? `${f.pnl_pct >= 0 ? '+' : ''}${f.pnl_pct.toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
              {(hasSell || hasBuy) && (
                <>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>{hasFills ? '待执行信号' : '今日信号'}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {hasSell && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: 'var(--down)', fontWeight: 600, minWidth: 40 }}>● 卖出</span>
                        {actionList!.sell!.slice(0, 5).map((item: any, i: number) => (
                          <span key={`sell-${item.ts_code ?? i}`} style={{ fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => item.ts_code && handleStockClick(item.ts_code, item.name ?? '')}>
                            {item.name} <span style={{ color: (item.gain_pct ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontSize: '11px' }}>{item.gain_pct != null ? `${item.gain_pct >= 0 ? '+' : ''}${(item.gain_pct * 100).toFixed(1)}%` : ''}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {hasBuy && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: 'var(--up)', fontWeight: 600, minWidth: 40 }}>● 买入</span>
                        {actionList!.buy!.slice(0, 5).map((item: any, i: number) => (
                          <span key={`buy-${item.ts_code ?? i}`} style={{ fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => item.ts_code && handleStockClick(item.ts_code, item.name ?? '')}>
                            {item.name}
                          </span>
                        ))}
                        {actionList!.buy!.length > 5 && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(+{actionList!.buy!.length - 5})</span>}
                      </div>
                    )}
                  </div>
                </>
              )}
              {!hasFills && !hasSell && !hasBuy && (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>今日无成交与信号</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 第2行：概念热度 + 成交额 + 热门个股 ═══ */}
      <section className="dashboard-section-grid" style={{ gridTemplateColumns: '1fr 1.2fr 1fr', alignItems: 'stretch' }}>
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="card-title" style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700 }}>概念热度 Top10<InfoTip data={DASHBOARD_META.concept_heat} /></h3>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '8px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '28px', fontSize: '11px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px' }}>概念</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '80px', fontSize: '11px' }}>涨跌幅</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '80px', fontSize: '11px' }}>热度</th>
                    <th style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px' }}>连续</th>
                    <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px' }}>3日涨幅</th>
                    <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px' }}>龙头</th>
                    <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px' }}>涨停</th>
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
                      <td style={{ padding: '6px 4px', textAlign: 'center', fontSize: '11px' }}>
                        {(c.heat_persistence ?? 0) >= 3 ? <span style={{ color: '#f59e0b' }}>🔥{c.heat_persistence}天</span> : (c.heat_persistence ?? 0) === 2 ? '2天' : <span style={{ color: 'var(--text-muted)' }}>首日</span>}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: (c.momentum_3d ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {c.momentum_3d != null ? `${c.momentum_3d >= 0 ? '+' : ''}${(c.momentum_3d ?? 0).toFixed(2)}%` : '—'}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: (c.leader_avg_pct_chg ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {c.leader_avg_pct_chg != null ? `${c.leader_avg_pct_chg >= 0 ? '+' : ''}${(c.leader_avg_pct_chg ?? 0).toFixed(2)}%` : '-'}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: (c.limit_up_count ?? 0) > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {c.limit_up_count ?? 0}
                      </td>
                    </tr>
                  ))}
                  {((viewModel as any)?.hotConcepts || []).length === 0 && (
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td colSpan={8} style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'center' }}>暂无数据</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="card-title" style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700 }}>两市成交额（亿元）<InfoTip data={DASHBOARD_META.turnover_chart} /></h3>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '8px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {(() => {
                const mi = (viewModel as any)?.marketIndex;
                const turnoverHistory: any[] = mi?.turnoverHistory ?? [];
                const breadthHistory: any[] = mi?.breadthHistory ?? [];
                const breadthScore = mi?.breadthScore ?? null;
                const breadthDelta = mi?.breadthDelta ?? null;
                  const avgPctChg: number | null = viewModel?.marketIndex?.avgPctChg ?? (viewModel as any)?.marketBreadth?.avg_pct_chg ?? null;
                const breadthState: string = mi?.breadthState ?? '';

                // Merge breadth_score into chart data
                const breadthMap: Record<string, number> = {};
                for (const b of breadthHistory) if (b.date && b.score != null) breadthMap[b.date] = b.score;
                const avgPctMap: Record<string, number> = {};
                for (const b of breadthHistory) if (b.date && (b as any).avg_pct_chg != null) avgPctMap[b.date] = (b as any).avg_pct_chg;
                const chartData = turnoverHistory.map((t: any) => ({
                  ...t,
                  breadth_score: breadthMap[t.date] ?? null,
                  avg_pct_chg: avgPctMap[t.date] ?? null,
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
                        {avgPctChg != null && (
                          <span style={{ fontSize: '12px', marginLeft: '12px' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>等权 </span>
                            <span style={{ color: avgPctChg > 0 ? 'var(--up)' : avgPctChg < 0 ? 'var(--down)' : 'var(--text-primary)', fontWeight: 600 }}>
                              {avgPctChg > 0 ? '+' : ''}{avgPctChg.toFixed(2)}%
                            </span>
                          </span>
                        )}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, outline: 'none' }} tabIndex={-1}>
                    <ResponsiveContainer width="100%" height={220}>
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
                          ticks={(() => {
                            if (chartData.length === 0) return [];
                            const step = Math.max(1, Math.floor(chartData.length / 5));
                            const t: string[] = [];
                            for (let i = 0; i < chartData.length - 1; i += step) t.push(chartData[i].date);
                            const last = chartData[chartData.length - 1].date;
                            if (!t.includes(last)) t.push(last);
                            return t;
                          })()}
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
                                {d.avg_pct_chg != null && <div style={{ color: d.avg_pct_chg > 0 ? 'var(--up)' : d.avg_pct_chg < 0 ? 'var(--down)' : '#999' }}>等权涨幅：{d.avg_pct_chg > 0 ? '+' : ''}{d.avg_pct_chg.toFixed(2)}%</div>}
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
                        <Line yAxisId="breadth" type="monotone" dataKey="breadth_score" stroke="rgba(250,173,20,0.4)" strokeWidth={1} strokeDasharray="3 2" dot={false} connectNulls />
                        <YAxis yAxisId="avgPct" orientation="right" domain={['auto', 'auto']} hide />
                        <Line yAxisId="avgPct" type="monotone" dataKey="avg_pct_chg" stroke="rgba(239,68,68,0.5)" strokeWidth={1.5} dot={false} connectNulls />
                        <ReferenceLine yAxisId="avgPct" y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 3" />
                      </ComposedChart>
                    </ResponsiveContainer>
                    </div>
                    {distData.length > 0 && (
                      <>
                        <div style={{ height: 4 }} />
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', right: 8, top: 0, fontSize: 11, color: '#666' }}>{(distribution?.total_stocks ?? 0).toLocaleString()}</span>
                          <ResponsiveContainer key="dist-chart" width="100%" height={100}>
                            <BarChart data={distData} margin={{ top: 15, right: 5, bottom: 0, left: 5 }}>
                              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} />
                              <YAxis hide />
                              <Bar dataKey="value" barSize={20} isAnimationActive={false}>
                                <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: '#ccc' }} />
                                {distData.map((entry, idx) => (
                                  <Cell key={idx} fill={entry.color} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                            {/* 涨跌比横柱 */}
                            {(() => {
                              const upCount = (distribution?.gt10_up ?? 0) + (distribution?.up_7_10 ?? 0) + (distribution?.up_5_7 ?? 0) + (distribution?.up_3_5 ?? 0) + (distribution?.up_0_3 ?? 0);
                              const downCount = (distribution?.down_0_3 ?? 0) + (distribution?.down_3_5 ?? 0) + (distribution?.down_5_7 ?? 0) + (distribution?.down_7_10 ?? 0) + (distribution?.gt10_down ?? 0);
                              const flatCount = distribution?.flat ?? 0;
                              const total = upCount + downCount + flatCount || 1;
                              const upPct = upCount / total * 100;
                              const downPct = downCount / total * 100;
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 2px' }}>
                                  <span style={{ fontSize: 10, color: 'var(--up)', whiteSpace: 'nowrap', minWidth: 32, textAlign: 'right' }}>{upCount}</span>
                                  <div style={{ flex: 1, display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
                                    <div style={{ width: `${upPct}%`, background: 'var(--up, #ef4444)', borderRadius: '4px 0 0 4px', transition: 'width 0.3s' }} />
                                    <div style={{ width: `${downPct}%`, background: 'var(--down, #22c55e)', borderRadius: '0 4px 4px 0', transition: 'width 0.3s', marginLeft: 'auto' }} />
                                  </div>
                                  <span style={{ fontSize: 10, color: 'var(--down)', whiteSpace: 'nowrap', minWidth: 32 }}>{downCount}</span>
                                </div>
                              );
                            })()}
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="card-title" style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700 }}>热门个股 Top10<InfoTip data={DASHBOARD_META.hot_stocks} /></h3>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '8px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '28px', fontSize: '11px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px' }}>股票</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '100px', fontSize: '11px' }}>主概念</th>
                    <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px' }}>板块势</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, width: '80px', fontSize: '11px' }}>涨跌幅</th>
                    <th style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px' }}>连续</th>
                    <th style={{ textAlign: 'center', padding: '6px 4px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px' }}>策略</th>
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
                      <td style={{ padding: '6px 8px', fontWeight: 500 }}>
                        <span style={{ color: 'var(--text-primary)', cursor: s.ts_code ? 'pointer' : 'default' }} onClick={() => s.ts_code && handleStockClick(s.ts_code, s.name)}>{s.name}</span>{s.is_leader && <span title="概念龙头" style={{ marginLeft: '4px', fontSize: '11px' }}>👑</span>}
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-primary)', fontWeight: 500 }}>
                        {s.primary_concept ? s.primary_concept : '—'}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: (s.concept_momentum_3d ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: '11px' }}>
                        {s.concept_momentum_3d != null ? `${s.concept_momentum_3d >= 0 ? '+' : ''}${(s.concept_momentum_3d ?? 0).toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: (s.pct_change ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {s.pct_change != null ? `${s.pct_change >= 0 ? '+' : ''}${s.pct_change.toFixed(2)}%` : '—'}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', fontSize: '11px' }}>
                        {(s.heat_persistence ?? 0) >= 3 ? <span style={{ color: '#f59e0b' }}>🔥{s.heat_persistence}天</span> : (s.heat_persistence ?? 0) === 2 ? '2天' : <span style={{ color: 'var(--text-muted)' }}>首日</span>}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', fontSize: '11px' }}>
                        {s.strategy_hit ? '🎯' : ''}
                      </td>
                    </tr>
                  ))}
                  {((viewModel as any)?.hotStocks || []).length === 0 && (
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}><td colSpan={7} style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'center' }}>暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 第3行：板块轮动三栏 ═══ */}
      <section className="dashboard-section-grid" style={{ gridTemplateColumns: '3fr 2fr 2fr', alignItems: 'stretch' }}>
        {/* 左栏：强势板块 Top10 */}
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="card-title" style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700 }}>强势板块 Top10<InfoTip data={DASHBOARD_META.momentum} /></h3>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '8px 12px', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 2px', color: 'var(--text-muted)', fontWeight: 400, width: '16px', fontSize: '11px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>概念</th>
                    <th style={{ textAlign: 'right', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>3日</th>
                    <th style={{ textAlign: 'right', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>今日</th>
                    <th style={{ textAlign: 'right', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>涨停</th>
                    <th style={{ textAlign: 'right', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>上涨比</th>
                    <th style={{ textAlign: 'right', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>龙头</th>
                    <th style={{ textAlign: 'center', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>标记</th>
                  </tr>
                </thead>
                <tbody>
                  {momentum.length > 0 ? momentum.map((c, i) => (
                    <tr key={c.concept_code} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '4px 2px', color: 'var(--text-muted)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                      <td style={{ padding: '4px 4px', color: 'var(--text-primary)', fontWeight: 500 }}>{c.concept_name}</td>
                      <td style={{ padding: '4px 4px', textAlign: 'right', color: (c.momentum_3d ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {(c.momentum_3d ?? 0) >= 0 ? '+' : ''}{(c.momentum_3d ?? 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: '4px 4px', textAlign: 'right', color: (c.avg_pct_chg ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {(c.avg_pct_chg ?? 0) >= 0 ? '+' : ''}{(c.avg_pct_chg ?? 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: '4px 4px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{c.limit_up_count ?? 0}</td>
                      <td style={{ padding: '4px 4px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{Math.round((c.up_ratio ?? 0) * 100)}%</td>
                      <td style={{ padding: '4px 4px', textAlign: 'right', color: (c.leader_avg_pct_chg ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {c.leader_avg_pct_chg != null ? `${c.leader_avg_pct_chg >= 0 ? '+' : ''}${(c.leader_avg_pct_chg ?? 0).toFixed(2)}%` : '—'}
                      </td>
                      <td style={{ padding: '4px 4px', textAlign: 'center', fontSize: '11px' }}>
                        {c.strategy_hit_count > 0 && <span style={{ color: 'var(--info)', marginRight: 3 }}>🎯{c.strategy_hit_count}</span>}
                        {c.heat_persistence > 0 && <span style={{ color: '#f59e0b' }}>🔥{c.heat_persistence}天</span>}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={8} style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {/* 中栏：异动板块 Top5 */}
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="card-title" style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700 }}>异动板块 Top5<InfoTip data={DASHBOARD_META.surge} /></h3>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '8px 12px', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, width: '20px', fontSize: '11px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>概念</th>
                    <th style={{ textAlign: 'right', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>量比</th>
                    <th style={{ textAlign: 'right', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>3日均额</th>
                    <th style={{ textAlign: 'right', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>今日</th>
                    <th style={{ textAlign: 'left', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>龙头领涨</th>
                  </tr>
                </thead>
                <tbody>
                  {surge.length > 0 ? surge.map((c, i) => (
                    <tr key={c.concept_code} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                      <td style={{ padding: '4px 4px', color: 'var(--text-primary)', fontWeight: 500 }}>{c.concept_name}</td>
                      <td style={{ padding: '4px 4px', textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: (c.concept_vr3 ?? 0) >= 2.0 ? '#f59e0b' : 'var(--text-primary)' }}>
                        {(c.concept_vr3 ?? 0).toFixed(1)}x
                      </td>
                      <td style={{ padding: '4px 4px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {(c.amount_3d_avg ?? 0).toFixed(1)}亿
                      </td>
                      <td style={{ padding: '4px 4px', textAlign: 'right', color: (c.avg_pct_chg ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {(c.avg_pct_chg ?? 0) >= 0 ? '+' : ''}{(c.avg_pct_chg ?? 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: '4px 4px', color: 'var(--text-secondary)', fontSize: '11px' }}>
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
            <h3 className="card-title" style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700 }}>退潮板块 Top5<InfoTip data={DASHBOARD_META.retreat} /></h3>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: '6px', padding: '8px 12px', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, width: '20px', fontSize: '11px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>概念</th>
                    <th style={{ textAlign: 'right', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>今日涨幅</th>
                    <th style={{ textAlign: 'right', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>3日累计</th>
                    <th style={{ textAlign: 'right', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>跌停</th>
                    <th style={{ textAlign: 'right', padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>龙头今日</th>
                  </tr>
                </thead>
                <tbody>
                  {retreat.length > 0 ? retreat.map((c, i) => (
                    <tr key={c.concept_code} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '4px 4px', color: 'var(--text-muted)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                      <td style={{ padding: '4px 4px', color: 'var(--text-primary)', fontWeight: 500 }}>{c.concept_name}</td>
                      <td style={{ padding: '4px 4px', textAlign: 'right', color: 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {(c.today_pct_chg ?? 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: '4px 4px', textAlign: 'right', color: (c.momentum_3d ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {(c.momentum_3d ?? 0) >= 0 ? '+' : ''}{(c.momentum_3d ?? 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: '4px 4px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{c.limit_down_count ?? 0}</td>
                      <td style={{ padding: '4px 4px', textAlign: 'right', color: 'var(--down)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
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

      {/* ═══ 第5行：机会 + 风控 ═══ */}
      <section className="dashboard-section-grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'stretch' }}>
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 className="card-title" style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>机会<InfoTip data={DASHBOARD_META.opportunity} /></h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 6px' }}>
                  买点 {opp?.metrics?.find(m => m.id === 'opp-buy')?.value ?? '—'} | 共振 {opp?.metrics?.find(m => m.id === 'opp-resonance')?.value ?? '—'} | 候选 {opp?.metrics?.find(m => m.id === 'opp-watchlist')?.value ?? '—'}
                </span>
                <a href="/signals" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>信号 →</a>
              </div>
            </div>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: 6, padding: '8px 12px' }}>
              {(opp?.topOpportunities?.length ?? 0) > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '35%' }} />
                  </colgroup>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <th style={{ textAlign: 'left', paddingBottom: 8, color: '#666', fontWeight: 400, fontSize: 12 }}>股票</th>
                      <th style={{ textAlign: 'left', paddingBottom: 8, color: '#666', fontWeight: 400, fontSize: 12 }}>策略</th>
                      <th style={{ textAlign: 'right', paddingBottom: 8, color: '#666', fontWeight: 400, fontSize: 12 }}>评分</th>
                      <th style={{ textAlign: 'right', paddingBottom: 8, color: '#666', fontWeight: 400, fontSize: 12 }}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opp!.topOpportunities.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '6px 0', fontSize: 13, fontWeight: 500 }}>
                          <span style={{ color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => handleStockClick(item.id, item.name)}>{item.name}</span>
                        </td>
                        <td style={{ padding: '6px 0', fontSize: 13, color: 'var(--text-secondary)' }}>{getStrategyDisplayName(item.strategy) || item.strategyLabel?.split(' / ')[0] || '—'}</td>
                        <td style={{ padding: '6px 0', fontSize: 13, textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{item.scoreLabel}</td>
                        <td style={{ padding: '6px 0', fontSize: 12, textAlign: 'right', color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.helperText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>暂无买点信号</div>
              )}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 className="card-title" style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>风控<InfoTip data={DASHBOARD_META.risk_alerts} /></h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 6px' }}>
                  拦截 {risk?.metrics?.find(m => m.id === 'risk-gate')?.value ?? '—'} | 最高风险 {risk?.metrics?.find(m => m.id === 'risk-highest')?.value ?? '—'}
                </span>
                <a href="/risk" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>风控 →</a>
              </div>
            </div>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: 6, padding: '8px 12px' }}>
              {(risk?.events?.length ?? 0) > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <th style={{ textAlign: 'left', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>事件</th>
                      <th style={{ textAlign: 'left', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>详情</th>
                      <th style={{ textAlign: 'right', padding: '5px 6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>风险分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risk!.events.map((ev) => (
                      <tr key={ev.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', height: 32 }}>
                        <td style={{ padding: '5px 6px', color: 'var(--warn)', fontWeight: 500 }}>{ev.name}</td>
                        <td style={{ padding: '5px 6px', color: 'var(--text-secondary)' }}>{ev.helperText}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{ev.scoreLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: 16, textAlign: 'center', color: '#52c41a', fontSize: 13 }}>风控正常，无拦截</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 第6行：组合 + 系统 ═══ */}
      <section className="dashboard-section-grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'stretch' }}>
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 className="card-title" style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>组合<InfoTip data={DASHBOARD_META.portfolio_overview} /></h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {portfolioRaw && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 6px' }}>
                    持仓 {portfolioRaw.position_count ?? '—'} | NAV {(() => { const v = portfolioRaw.snapshot?.total_nav; return v != null ? (v >= 10000 ? `${(v / 10000).toFixed(1)}万` : Math.round(v).toLocaleString()) : '—'; })()}
                  </span>
                )}
                <a href="/portfolio" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>组合 →</a>
              </div>
            </div>
            {portfolioRaw ? (() => {
              const snap = portfolioRaw.snapshot ?? {};
              const nav = snap.total_nav ?? 0;
              const initCap = portfolioRaw.initial_capital ?? 1000000;
              const cumPct = (snap.cumulative_pnl_pct ?? 0) * 100;
              const startDate = portfolioRaw.start_date ?? '';
              const daysDiff = startDate ? Math.max(1, Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000)) : 1;
              const annPct = cumPct / daysDiff * 365;
              const mv = snap.snap_market_value ?? 0;
              const cash = snap.cash ?? 0;
              const unrealPnl = portfolioRaw.total_unrealized_pnl ?? 0;
              const posCnt = portfolioRaw.position_count ?? 0;
              const cashRatio = (portfolioRaw.cash_ratio ?? 0) * 100;
              const mdd = portfolioRaw.max_drawdown_pct ?? 0;
              const bench = portfolioRaw.benchmark_pct ?? 0;
              const benchLabel = portfolioRaw.benchmark_label ?? '';
              const fmtMoney = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : Math.round(v).toLocaleString();
              const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
              const pctColor = (v: number) => v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--text-primary)';

              const cells: { label: string; value: string; color?: string; sub?: string }[] = [
                { label: '总资产(NAV)', value: fmtMoney(nav) },
                { label: '初始本金', value: fmtMoney(initCap) },
                { label: '累计收益', value: fmtPct(cumPct), color: pctColor(cumPct) },
                { label: '年化收益', value: fmtPct(annPct), color: pctColor(annPct) },
                { label: '股票市值', value: fmtMoney(mv) },
                { label: '现金', value: fmtMoney(cash) },
                { label: '持仓浮盈', value: `${unrealPnl >= 0 ? '+' : ''}${fmtMoney(unrealPnl)}`, color: pctColor(unrealPnl) },
                { label: '开始日期', value: startDate || '—' },
                { label: '当前持仓', value: `${posCnt}只` },
                { label: '现金比例', value: `${cashRatio.toFixed(1)}%` },
                { label: '最大回撤', value: `-${mdd.toFixed(2)}%`, color: 'var(--down)' },
                { label: benchLabel || '基准', value: fmtPct(bench), color: pctColor(bench), sub: startDate ? `自${startDate.slice(5)}至今` : '' },
              ];

              return (
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                    {cells.map((c) => (
                      <div key={c.label}>
                        <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>{c.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 400, color: c.color ?? 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
                        {c.sub && <div style={{ fontSize: 10, color: '#666', marginTop: 1 }}>{c.sub}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })() : (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>加载中...</div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 className="card-title" style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>系统<InfoTip data={DASHBOARD_META.system_health} /></h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {(() => {
                  const failed = sys?.metrics?.find(m => m.id === 'system-failed');
                  const isOk = (failed?.value ?? '0') === '0';
                  return <span style={{ fontSize: 11, color: isOk ? '#52c41a' : '#ff4d4f', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 6px' }}>
                    {isOk ? '运行正常' : `异常 ${failed?.value ?? ''}步`}
                  </span>;
                })()}
                <a href="/system" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>系统 →</a>
              </div>
            </div>
            <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', fontSize: 13 }}>
                {(sys?.metrics ?? []).map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{m.label}</span>
                    <span style={{ color: m.tone === 'positive' ? '#52c41a' : m.tone === 'danger' ? '#ff4d4f' : 'var(--text-primary)', fontWeight: 500 }}>{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <StockDrawer stock={drawerStock} onClose={() => setDrawerStock(null)} />
    </div>
  );
}
