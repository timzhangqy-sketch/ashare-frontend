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
import StatusState from '../components/Dashboard/StatusState';
import StockDrawer from '../components/Drawer/StockDrawer';
import { useDashboardRuntime } from '../context/useDashboardRuntime';
import { useDate } from '../context/useDate';
import type { DashboardViewModel } from '../types/dashboard';
import type { StockDetail } from '../types/stock';
import InfoTip from '../components/InfoTip';
import { DASHBOARD_META } from '../config/dashboardMeta';

function OpinionCard({ opinion }: { opinion: { author: string; title: string; content: string; publishedAt: string; sourceUrl: string; source: string } }) {
  const [expanded, setExpanded] = useState(false);
  const timeStr = opinion.publishedAt ? new Date(opinion.publishedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div className="s-opinion-card" onClick={() => setExpanded(!expanded)}>
      <div className="s-opinion-row" style={{ marginBottom: expanded ? '8px' : 0 }}>
        <span className="s-opinion-dot">●</span>
        <span className="s-opinion-author">{opinion.author}</span>
        <span className="s-opinion-title">{opinion.title}</span>
        <span className="s-opinion-time">{timeStr}</span>
        <span className="s-opinion-time" style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>&#x25BC;</span>
      </div>
      {expanded && (
        <div className="s-opinion-content" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {opinion.content}
          {opinion.sourceUrl && (
            <a href={opinion.sourceUrl} target="_blank" rel="noopener noreferrer"
              className="s-opinion-source"
              onClick={(e) => e.stopPropagation()}
            >
              查看原文 →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { selectedDate } = useDate();
  const { setSnapshot } = useDashboardRuntime();

  const [actionList, setActionList] = useState<ActionListResponse | null>(null);
  const [momentum, setMomentum] = useState<ConceptMomentum[]>([]);
  const [surge, setSurge] = useState<ConceptSurge[]>([]);
  const [, setRetreat] = useState<ConceptRetreat[]>([]);
  const [resonance, setResonance] = useState<ConceptResonance>({ resonance_hits: [], retreat_warnings: [] }); // kept for hidden card
  void resonance;
  const [distribution, setDistribution] = useState<MarketDistribution | null>(null);
  const [drawerStock, setDrawerStock] = useState<StockDetail | null>(null);
  const [portfolioRaw, setPortfolioRaw] = useState<any>(null);
  const [fundFlow, setFundFlow] = useState<any>(null);
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
    api.get('/api/concept-stats/fund-flow').then(r => { if (!cancelled) setFundFlow(r.data ?? null); }).catch(() => { if (!cancelled) setFundFlow({ flow_in: [], flow_out: [] }); });
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


      {/* ═══ 第1行：市场观点 + 行动清单 ═══ */}
      <section className="dashboard-section-grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'stretch' }}>
        <div className="card">
          <div className="card-body dashboard-module-body s-card-body-flex">
            <h3 className="card-title s-card-title">市场观点<InfoTip data={DASHBOARD_META.market_opinions} /></h3>
            {(() => {
              const opinions = viewModel?.marketOpinions || [];
              if (opinions.length === 0) {
                return <div className="s-empty">暂无观点数据</div>;
              }
              return (
                <div className="opinions-grid">
                  {opinions.map((op, idx) => (
                    <OpinionCard key={idx} opinion={op} />
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
        <div className="card">
          <div className="card-body dashboard-module-body s-card-body-flex">
            <h3 className="card-title s-card-title">今日行动清单<InfoTip data={DASHBOARD_META.action_list} /></h3>
            <div className="s-card-inner" style={{ overflow: 'auto' }}>
              {hasFills && (
                <>
                  <table className="s-table">
                    <thead>
                      <tr>
                        <th className="s-left" style={{width:'48px'}}>方向</th>
                        <th className="s-left" style={{width:'80px'}}>股票</th>
                        <th className="s-right" style={{width:'60px'}}>价格</th>
                        <th className="s-right" style={{width:'60px'}}>数量</th>
                        <th className="s-left" style={{width:'90px'}}>策略</th>
                        <th className="s-left" style={{width:'72px'}}>信号</th>
                        <th className="s-right" style={{width:'56px'}}>盈亏</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fills.map((f: any, i: number) => {
                        const SIGNAL_CN: Record<string, string> = { BREAKOUT: '突破', PULLBACK: '回踩', TREND_BREAK: '破位', STOP_LOSS: '止损', TIME_EXIT: '超期', TRAILING_STOP: '追踪止盈', TAKE_PROFIT: '止盈', WARN_MA_BREAK: '均线破位', BREAKOUT_FAIL: '突破失败', POOL_ENTRY: '入池买入', VOL_CONFIRM: '放量确认', REHEAT: '再热买入', REGIME_SHIFT: '环境恶化', SECTOR_RETREAT: '板块退潮', VOL_COLLAPSE: '缩量破位', TIME_DECAY: '持有超期', HARD_STOP: '硬止损', REDUCE: '减仓' };
                        const STRAT_CN: Record<string, string> = { VOL_SURGE: '连续放量蓄势', RETOC2: '异动策略', PATTERN_T2UP9: '形态策略', WEAK_BUY: '弱市吸筹', PATTERN_GREEN10: '阳线形态', IGNITE: '点火策略' };
                        return (
                        <tr key={`fill-${i}`}>
                          <td style={{ width: '48px', color: f.direction === 'BUY' ? '#ff5451' : '#22C55E', fontWeight: 500 }}>{f.direction === 'BUY' ? '买入' : '卖出'}</td>
                          <td className="s-td-name s-clickable" onClick={() => handleStockClick(f.ts_code, f.name)}>{f.name}</td>
                          <td className="s-num s-right">{f.fill_price?.toFixed(2) ?? '—'}</td>
                          <td className="s-num s-right">{f.fill_shares?.toLocaleString() ?? '—'}</td>
                          <td className="s-td-name">{STRAT_CN[f.strategy] ?? f.strategy}</td>
                          <td className="s-td-name">{SIGNAL_CN[f.signal_type] ?? f.signal_type}</td>
                          <td className={f.pnl_pct != null ? (f.pnl_pct >= 0 ? 's-up s-num s-right' : 's-down s-num s-right') : 's-num s-right'}>
                            {f.pnl_pct != null ? `${f.pnl_pct >= 0 ? '+' : ''}${f.pnl_pct.toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}

              {!hasFills && !hasSell && !hasBuy && (
                <span className="s-text-sm s-text-muted">今日无成交记录</span>
              )}
            </div>
          </div>
        </div>
      </section>
      {/* ═══ 第2行：成交额图 + 组合概览&今日机会 ═══ */}
      <section className="dashboard-section-grid" style={{ gridTemplateColumns: '7fr 5fr', alignItems: 'stretch' }}>
        <div className="card">
          <div className="card-body dashboard-module-body s-card-body-flex">
            <h3 className="card-title s-card-title">两市成交额（亿元）<InfoTip data={DASHBOARD_META.turnover_chart} /></h3>
            <div className="s-card-inner">
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
                      <span className="s-text-secondary">
                        今日 <span style={{ color: '#e0e2ed', fontWeight: 700, fontSize: '16px' }}>
                          {latest ? Math.round(latest.amount).toLocaleString() : '—'}
                        </span> 亿
                        {avg5 != null && latest && (
                          <span style={{ color: latest.amount > avg5 * 1.1 ? '#ff5451' : latest.amount < avg5 * 0.9 ? '#22C55E' : '#8c909f', marginLeft: '8px' }}>
                            5日均 {avg5.toLocaleString()} 亿
                            ({latest.amount > avg5 ? '+' : ''}{((latest.amount / avg5 - 1) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </span>
                      {breadthScore != null && (
                        <span className="s-text-sm">
                          <span className="s-text-secondary">宽度 </span>
                          <span style={{ color: '#e0e2ed', fontWeight: 600 }}>{breadthScore}</span>
                          {breadthDelta != null && (
                            <span style={{ color: breadthDelta > 0 ? '#ff5451' : breadthDelta < 0 ? '#22C55E' : '#e0e2ed', marginLeft: '2px' }}>
                              {breadthDelta > 0 ? '↑' : breadthDelta < 0 ? '↓' : '→'}
                            </span>
                          )}
                          <span style={{ color: '#c2c6d6', marginLeft: '4px' }}>{stateLabelMap[breadthState] ?? ''}</span>
                        </span>
                      )}
                        {avgPctChg != null && (
                          <span style={{ fontSize: '12px', marginLeft: '12px' }}>
                            <span className="s-text-secondary">等权 </span>
                            <span style={{ color: avgPctChg > 0 ? '#ff5451' : avgPctChg < 0 ? '#22C55E' : '#e0e2ed', fontWeight: 600 }}>
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
                                                       fontSize: '12px',
                            padding: '8px 12px',
                          }}
                          labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0]?.payload;
                            if (!d) return null;
                            return (
                              <div style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '2px', fontSize: '12px', padding: '8px 12px' }}>
                                <div style={{ color: '#94a3b8', marginBottom: '4px' }}>{label}</div>
                                <div style={{ color: '#3b82f6' }}>成交额：{Math.round(d.amount ?? 0).toLocaleString()} 亿</div>
                                {d.breadth_score != null && <div style={{ color: '#faad14' }}>市场宽度：{d.breadth_score} 分</div>}
                                {d.avg_pct_chg != null && <div style={{ color: d.avg_pct_chg > 0 ? '#ff5451' : d.avg_pct_chg < 0 ? '#22C55E' : '#999' }}>等权涨幅：{d.avg_pct_chg > 0 ? '+' : ''}{d.avg_pct_chg.toFixed(2)}%</div>}
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
                                  <span style={{ fontSize: 10, color: '#ff5451', whiteSpace: 'nowrap', minWidth: 32, textAlign: 'right' }}>{upCount}</span>
                                  <div style={{ flex: 1, display: 'flex', height: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
                                    <div style={{ width: `${upPct}%`, background: '#ff5451', borderRadius: '4px 0 0 4px', transition: 'width 0.3s' }} />
                                    <div style={{ width: `${downPct}%`, background: '#22C55E', borderRadius: '0 4px 4px 0', transition: 'width 0.3s', marginLeft: 'auto' }} />
                                  </div>
                                  <span style={{ fontSize: 10, color: '#22C55E', whiteSpace: 'nowrap', minWidth: 32 }}>{downCount}</span>
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
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 className="card-title s-card-title">组合概览<InfoTip data={DASHBOARD_META.portfolio_overview} /></h3>
              <a href="/portfolio" style={{ fontSize: 11, color: '#3B82F6', textDecoration: 'none' }}>组合 →</a>
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
              const fmtMoney = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : Math.round(v).toLocaleString();
              const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
              const pctColor = (v: number) => v > 0 ? '#ff5451' : v < 0 ? '#22C55E' : '#e0e2ed';
              const cells: { label: string; value: string; color?: string }[] = [
                { label: '总资产', value: fmtMoney(nav) },
                { label: '本金', value: fmtMoney(initCap) },
                { label: '累计', value: fmtPct(cumPct), color: pctColor(cumPct) },
                { label: '年化', value: fmtPct(annPct), color: pctColor(annPct) },
                { label: '市值', value: fmtMoney(mv) },
                { label: '现金', value: fmtMoney(cash) },
                { label: '浮盈', value: `${unrealPnl >= 0 ? '+' : ''}${fmtMoney(unrealPnl)}`, color: pctColor(unrealPnl) },
                { label: '持仓', value: `${posCnt}只` },
                { label: '现金比', value: `${cashRatio.toFixed(0)}%` },
              ];
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, padding: '8px 12px' }}>
                  {cells.map((c) => (
                    <div key={c.label}>
                      <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>{c.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 400, color: c.color ?? '#e0e2ed', fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
                    </div>
                  ))}
                </div>
              );
            })() : (
              <div style={{ padding: 12, textAlign: 'center', color: '#8c909f', fontSize: 13 }}>加载中...</div>
            )}

            <div style={{ borderTop: '1px solid rgba(30, 45, 69, 0.3)', margin: '12px 0' }}></div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 className="card-title s-card-title" style={{ margin: 0 }}>今日信号</h3>
              <a href="/signals" className="s-text-xs" style={{ color: '#3B82F6', textDecoration: 'none' }}>信号中心 →</a>
            </div>
            <div className="s-card-inner">
              {((actionList?.sell?.length ?? 0) + (actionList?.buy?.length ?? 0)) > 0 ? (
                <table className="s-table">
                  <thead>
                    <tr>
                      <th className="s-left">方向</th>
                      <th className="s-left">股票</th>
                      <th className="s-left">策略</th>
                      <th className="s-left">信号</th>
                      <th className="s-right">风控分</th>
                      <th className="s-left">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(actionList?.sell ?? []).map((item: any, i: number) => (
                      <tr key={`sig-sell-${i}`}>
                        <td className="s-down s-semi">卖出</td>
                        <td className="s-td-name s-clickable" onClick={() => item.ts_code && handleStockClick(item.ts_code, item.name ?? '')}>{item.name}</td>
                        <td>{item.strategy ?? '—'}</td>
                        <td>{item.signal ?? '—'}</td>
                        <td className="s-right s-num">{item.gain_pct != null ? `${item.gain_pct >= 0 ? '+' : ''}${(item.gain_pct * 100).toFixed(1)}%` : '—'}</td>
                        <td className="s-text-muted">{item.reason_cn ?? '—'}</td>
                      </tr>
                    ))}
                    {(actionList?.buy ?? []).map((item: any, i: number) => (
                      <tr key={`sig-buy-${i}`}>
                        <td className="s-up s-semi">买入</td>
                        <td className="s-td-name s-clickable" onClick={() => item.ts_code && handleStockClick(item.ts_code, item.name ?? '')}>{item.name}</td>
                        <td>{(() => { const STRAT_CN: Record<string, string> = { VOL_SURGE: '连续放量蓄势', RETOC2: '第4次异动', PATTERN_T2UP9: 'T-2大涨蓄势', WEAK_BUY: '弱市吸筹' }; return STRAT_CN[item.strategy] ?? item.strategy ?? '—'; })()}</td>
                        <td>{(() => { const SIG_CN: Record<string, string> = { POOL_ENTRY: '入池买入', BREAKOUT: '突破', PULLBACK: '回踩', VOL_CONFIRM: '放量确认' }; return SIG_CN[item.signal] ?? item.signal ?? '—'; })()}</td>
                        <td className="s-right s-num">{item.risk_score != null && item.risk_score > 0 ? `${Number(item.risk_score).toFixed(0)} 分` : '—'}</td>
                        <td className="s-text-muted">{item.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="s-empty">暂无待执行信号</div>
              )}
            </div>
          </div>
        </div>
      </section>
      {/* ═══ 第3行：概念热度 + 热门个股 + 强势板块 ═══ */}
      <section className="dashboard-section-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'stretch' }}>
        <div className="card">
          <div className="card-body dashboard-module-body s-card-body-flex">
            <h3 className="card-title s-card-title">概念热度 Top10<InfoTip data={DASHBOARD_META.concept_heat} /></h3>
            <div className="s-card-inner">
              <table className="s-table">
                <thead>
                  <tr>
                    <th className="s-left">#</th>
                    <th className="s-left">概念</th>
                    <th className="s-right">涨跌幅</th>
                    <th className="s-right">热度</th>
                    <th className="s-center">连续</th>
                    <th className="s-right">3日涨幅</th>
                    <th className="s-right">龙头</th>
                    <th className="s-right">涨停</th>
                  </tr>
                </thead>
                <tbody>
                  {((viewModel as any)?.hotConcepts || []).slice(0, 10).map((c: any, i: number) => (
                    <tr key={`hc-${i}`}>
                      <td>{c.rank ?? i + 1}</td>
                      <td className="s-td-name">{c.name}</td>
                      <td className={(c.pct_change ?? 0) >= 0 ? 's-up s-num s-right' : 's-down s-num s-right'}>
                        {c.pct_change != null ? `${c.pct_change >= 0 ? '+' : ''}${c.pct_change.toFixed(2)}%` : '—'}
                      </td>
                      <td className="s-num s-right">
                        {c.hot != null ? Math.round(c.hot).toLocaleString() : '—'}
                      </td>
                      <td className="s-center">
                        {(c.heat_persistence ?? 0) >= 3 ? <span className="s-fire">🔥{c.heat_persistence}天</span> : (c.heat_persistence ?? 0) === 2 ? '2天' : <span className="s-text-muted">首日</span>}
                      </td>
                      <td className={(c.momentum_3d ?? 0) >= 0 ? 's-up s-num s-right' : 's-down s-num s-right'}>
                        {c.momentum_3d != null ? `${c.momentum_3d >= 0 ? '+' : ''}${(c.momentum_3d ?? 0).toFixed(2)}%` : '—'}
                      </td>
                      <td className={(c.leader_avg_pct_chg ?? 0) >= 0 ? 's-up s-num s-right' : 's-down s-num s-right'}>
                        {c.leader_avg_pct_chg != null ? `${c.leader_avg_pct_chg >= 0 ? '+' : ''}${(c.leader_avg_pct_chg ?? 0).toFixed(2)}%` : '-'}
                      </td>
                      <td className="s-num s-right">
                        {c.limit_up_count ?? 0}
                      </td>
                    </tr>
                  ))}
                  {((viewModel as any)?.hotConcepts || []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="s-center">暂无数据</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body dashboard-module-body s-card-body-flex">
            <h3 className="card-title s-card-title">热门个股 Top10<InfoTip data={DASHBOARD_META.hot_stocks} /></h3>
            <div className="s-card-inner">
              <table className="s-table">
                <thead>
                  <tr>
                    <th className="s-left">#</th>
                    <th className="s-left">股票</th>
                    <th className="s-left">主概念</th>
                    <th className="s-right">板块势</th>
                    <th className="s-right">涨跌幅</th>
                    <th className="s-center">连续</th>
                    <th className="s-center">策略</th>
                  </tr>
                </thead>
                <tbody>
                  {((viewModel as any)?.hotStocks || []).slice(0, 10).map((s: any, i: number) => (
                    <tr key={`hs-${i}`}>
                      <td>{s.rank ?? i + 1}</td>
                      <td className="s-td-name">
                        <span style={{ cursor: s.ts_code ? 'pointer' : 'default' }} onClick={() => s.ts_code && handleStockClick(s.ts_code, s.name)}>{s.name}</span>{s.is_leader && <span title="概念龙头" style={{ marginLeft: '4px', fontSize: '11px' }}>👑</span>}
                      </td>
                      <td className="s-td-name">
                        {s.primary_concept ? s.primary_concept : '—'}
                      </td>
                      <td className={(s.concept_momentum_3d ?? 0) >= 0 ? 's-up s-num s-right' : 's-down s-num s-right'}>
                        {s.concept_momentum_3d != null ? `${s.concept_momentum_3d >= 0 ? '+' : ''}${(s.concept_momentum_3d ?? 0).toFixed(1)}%` : '—'}
                      </td>
                      <td className={(s.pct_change ?? 0) >= 0 ? 's-up s-num s-right' : 's-down s-num s-right'}>
                        {s.pct_change != null ? `${s.pct_change >= 0 ? '+' : ''}${s.pct_change.toFixed(2)}%` : '—'}
                      </td>
                      <td className="s-center">
                        {(s.heat_persistence ?? 0) >= 3 ? <span className="s-fire">🔥{s.heat_persistence}天</span> : (s.heat_persistence ?? 0) === 2 ? '2天' : <span className="s-text-muted">首日</span>}
                      </td>
                      <td className="s-center">
                        {s.strategy_hit ? '🎯' : ''}
                      </td>
                    </tr>
                  ))}
                  {((viewModel as any)?.hotStocks || []).length === 0 && (
                    <tr><td colSpan={7} className="s-center">暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body dashboard-module-body s-card-body-flex">
            <h3 className="card-title s-card-title">强势板块 Top10<InfoTip data={DASHBOARD_META.momentum} /></h3>
            <div className="sector-table-wrap s-card-inner">
              <table className="s-table">
                <thead>
                  <tr>
                    <th className="s-left">#</th>
                    <th className="s-left">概念</th>
                    <th className="s-right">3日</th>
                    <th className="s-right">今日</th>
                    <th className="s-right">涨停</th>
                    <th className="s-right">上涨比</th>
                    <th className="s-right">龙头</th>
                    <th className="s-center">标记</th>
                  </tr>
                </thead>
                <tbody>
                  {momentum.length > 0 ? momentum.map((c, i) => (
                    <tr key={c.concept_code}>
                      <td>{i + 1}</td>
                      <td className="s-td-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{c.concept_name}</td>
                      <td className={(c.momentum_3d ?? 0) >= 0 ? 's-up s-num s-right' : 's-down s-num s-right'}>
                        {(c.momentum_3d ?? 0) >= 0 ? '+' : ''}{(c.momentum_3d ?? 0).toFixed(2)}%
                      </td>
                      <td className={(c.avg_pct_chg ?? 0) >= 0 ? 's-up s-num s-right' : 's-down s-num s-right'}>
                        {(c.avg_pct_chg ?? 0) >= 0 ? '+' : ''}{(c.avg_pct_chg ?? 0).toFixed(2)}%
                      </td>
                      <td className="s-num s-right">{c.limit_up_count ?? 0}</td>
                      <td className="s-num s-right">{Math.round((c.up_ratio ?? 0) * 100)}%</td>
                      <td className={(c.leader_avg_pct_chg ?? 0) >= 0 ? 's-up s-num s-right' : 's-down s-num s-right'}>
                        {c.leader_avg_pct_chg != null ? `${c.leader_avg_pct_chg >= 0 ? '+' : ''}${(c.leader_avg_pct_chg ?? 0).toFixed(2)}%` : '—'}
                      </td>
                      <td className="s-center">
                        {c.strategy_hit_count > 0 && <span style={{ color: '#3B82F6', marginRight: 3 }}>🎯{c.strategy_hit_count}</span>}
                        {c.heat_persistence > 0 && <span className="s-fire">🔥{c.heat_persistence}天</span>}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={8} className="s-center">暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
      {/* ═══ 第4行：异动板块 + 板块资金异动 ═══ */}
      <section className="dashboard-section-grid dashboard-sector-row" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'stretch' }}>
        {/* 左栏：异动板块 Top5 */}
        <div className="card">
          <div className="card-body dashboard-module-body s-card-body-flex">
            <h3 className="card-title s-card-title">异动板块 Top5<InfoTip data={DASHBOARD_META.surge} /></h3>
            <div className="sector-table-wrap s-card-inner">
              <table className="s-table">
                <thead>
                  <tr>
                    <th className="s-left">#</th>
                    <th className="s-left">概念</th>
                    <th className="s-right">量比</th>
                    <th className="s-right">3日均额</th>
                    <th className="s-right">今日</th>
                    <th className="s-left">龙头</th>
                    <th className="s-right">涨幅</th>
                  </tr>
                </thead>
                <tbody>
                  {surge.length > 0 ? surge.map((c, i) => (
                    <tr key={c.concept_code}>
                      <td>{i + 1}</td>
                      <td className="s-td-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{c.concept_name}</td>
                      <td className={(c.concept_vr3 ?? 0) >= 2.0 ? 's-warn s-num s-right' : 's-num s-right'}>
                        {(c.concept_vr3 ?? 0).toFixed(1)}x
                      </td>
                      <td className="s-num s-right">
                        {(c.amount_3d_avg ?? 0).toFixed(1)}亿
                      </td>
                      <td className={(c.avg_pct_chg ?? 0) >= 0 ? 's-up s-num s-right' : 's-down s-num s-right'}>
                        {(c.avg_pct_chg ?? 0) >= 0 ? '+' : ''}{(c.avg_pct_chg ?? 0).toFixed(2)}%
                      </td>
                      <td className="s-td-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px' }}>
                        {c.leader_top_stock || '—'}
                      </td>
                      <td className={(c.leader_top_pct_chg ?? 0) >= 0 ? 's-up s-num s-right' : 's-down s-num s-right'}>
                        {c.leader_top_pct_chg != null ? `${c.leader_top_pct_chg >= 0 ? '+' : ''}${(c.leader_top_pct_chg ?? 0).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7} className="s-center">暂无异动板块</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {/* 右栏：板块资金异动 */}
        <div className="card">
          <div className="card-body dashboard-module-body s-card-body-flex">
            <h3 className="card-title s-card-title">板块资金异动<InfoTip data={DASHBOARD_META.fund_flow} /></h3>
            {fundFlow ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                {/* 流入 */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '10px', color: '#c2c6d6', marginBottom: '4px' }}>放量流入</div>
                  <table className="s-table" style={{ fontSize: '12px' }}>
                    <thead><tr>
                      <th className="s-center" style={{width:'24px'}}>#</th>
                      <th>板块</th>
                      <th className="s-right">成交额(亿)</th>
                      <th className="s-right">环比</th>
                      <th className="s-right">涨幅</th>
                    </tr></thead>
                    <tbody>
                      {(fundFlow.flow_in || []).map((item: any, i: number) => (
                        <tr key={i}>
                          <td className="s-center s-text-muted">{i + 1}</td>
                          <td className="s-td-name">{item.concept_name}</td>
                          <td className="s-num s-right">{item.total_amount}</td>
                          <td className="s-num s-right s-up">{item.ratio}x</td>
                          <td className="s-num s-right s-up">{item.avg_pct_chg > 0 ? '+' : ''}{item.avg_pct_chg}%</td>
                        </tr>
                      ))}
                      {(!fundFlow.flow_in || fundFlow.flow_in.length === 0) && (
                        <tr><td colSpan={5} className="s-center s-text-muted">暂无放量流入板块</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* 流出 */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '10px', color: '#c2c6d6', marginBottom: '4px' }}>放量流出</div>
                  <table className="s-table" style={{ fontSize: '12px' }}>
                    <thead><tr>
                      <th className="s-center" style={{width:'24px'}}>#</th>
                      <th>板块</th>
                      <th className="s-right">成交额(亿)</th>
                      <th className="s-right">环比</th>
                      <th className="s-right">涨跌</th>
                    </tr></thead>
                    <tbody>
                      {(fundFlow.flow_out || []).map((item: any, i: number) => (
                        <tr key={i}>
                          <td className="s-center s-text-muted">{i + 1}</td>
                          <td className="s-td-name">{item.concept_name}</td>
                          <td className="s-num s-right">{item.total_amount}</td>
                          <td className={`s-num s-right ${item.avg_pct_chg >= 0 ? 's-up' : 's-down'}`}>{item.ratio}x</td>
                          <td className={`s-num s-right ${item.avg_pct_chg >= 0 ? 's-up' : 's-down'}`}>{item.avg_pct_chg > 0 ? '+' : ''}{item.avg_pct_chg}%</td>
                        </tr>
                      ))}
                      {(!fundFlow.flow_out || fundFlow.flow_out.length === 0) && (
                        <tr><td colSpan={5} className="s-center s-text-muted">暂无放量流出板块</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="s-center s-text-muted" style={{ padding: '20px' }}>加载中...</div>
            )}
          </div>
        </div>
      </section>
      {/* ═══ 第5行：风控 + 系统 ═══ */}
      <section className="dashboard-section-grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'stretch' }}>

        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 className="card-title s-card-title">风控<InfoTip data={DASHBOARD_META.risk_alerts} /></h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#8c909f', background: 'rgba(255,255,255,0.05)', padding: '2px 6px' }}>
                  拦截 {risk?.metrics?.find(m => m.id === 'risk-gate')?.value ?? '—'} | 最高风险 {risk?.metrics?.find(m => m.id === 'risk-highest')?.value ?? '—'}
                </span>
                <a href="/risk" style={{ fontSize: 11, color: '#3B82F6', textDecoration: 'none' }}>风控 →</a>
              </div>
            </div>
            <div className="s-card-inner">
              {(risk?.events?.length ?? 0) > 0 ? (
                <table className="s-table">
                  <thead>
                    <tr>
                      <th className="s-left">事件</th>
                      <th className="s-left">详情</th>
                      <th className="s-right">风险分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risk!.events.map((ev) => (
                      <tr key={ev.id}>
                        <td className="s-warn" style={{ fontWeight: 500 }}>{ev.name}</td>
                        <td>{ev.helperText}</td>
                        <td className="s-num s-right">{ev.scoreLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: 16, textAlign: 'center', color: '#3B82F6', fontSize: 13 }}>风控正常，无拦截</div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body dashboard-module-body" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 className="card-title s-card-title">系统<InfoTip data={DASHBOARD_META.system_health} /></h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {(() => {
                  const failed = sys?.metrics?.find(m => m.id === 'system-failed');
                  const isOk = (failed?.value ?? '0') === '0';
                  return <span style={{ fontSize: 11, color: isOk ? '#3B82F6' : '#ff4d4f', background: 'rgba(255,255,255,0.05)', padding: '2px 6px' }}>
                    {isOk ? '运行正常' : `异常 ${failed?.value ?? ''}步`}
                  </span>;
                })()}
                <a href="/system" style={{ fontSize: 11, color: '#3B82F6', textDecoration: 'none' }}>系统 →</a>
              </div>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', fontSize: 13 }}>
                {(sys?.metrics ?? []).map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: '#8c909f', fontSize: 12 }}>{m.label}</span>
                    <span style={{ color: m.tone === 'positive' ? '#3B82F6' : m.tone === 'danger' ? '#ff4d4f' : '#e0e2ed', fontWeight: 500 }}>{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>


      <StockDrawer stock={drawerStock} onClose={() => setDrawerStock(null)} sourcePage="dashboard" />
    </div>
  );
}
