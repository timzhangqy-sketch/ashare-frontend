import { useState } from 'react';
import StockDrawer from '../components/Drawer/StockDrawer';
import WatchlistTab from '../components/WatchlistTab';
import { useDate } from '../context/useDate';
import { useApiData } from '../hooks/useApiData';
import { fetchPatternT2up9, type PatternT2up9Item } from '../api';
import { getMockDetail } from '../utils/score';
import { CrossTags } from '../components/CrossTags';
import { displaySignalLabel } from '../utils/labelMaps';
import type { StockDetail } from '../types/stock';

type MainTab = 'today' | 'watchlist';

function formatPercent(value: number | null | undefined, decimal = true): string {
  if (value == null) return '--';
  const pct = decimal ? value * 100 : value;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function T2TodayTable({ selectedDate, onOpen }: { selectedDate: string; onOpen: (stock: StockDetail) => void }) {
  const { data, loading, error, refetch } = useApiData(() => fetchPatternT2up9(selectedDate), [selectedDate]);
  const rows = data ?? [];

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>形态样本</div>
          <div className="stat-value c-red">{loading ? '--' : rows.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>交易标的池命中</div>
          <div className="stat-value c-blue">{loading ? '--' : rows.filter(row => row.in_pool).length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>延续跟踪</div>
          <div className="stat-value c-cyan">{loading ? '--' : rows.filter(row => row.in_continuation).length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>T+2 平均收益</div>
          <div className="stat-value c-gold">{loading ? '--' : formatPercent(rows.length ? rows.reduce((sum, row) => sum + (row.ret_2d ?? 0), 0) / rows.length : 0)}</div>
        </div>
      </div>
      <section className="card">
        {loading ? <div className="page-loading"><div className="spinner" />加载中...</div> : null}
        {!loading && error ? (
          <div className="page-error">
            <div className="page-error-msg">形态策略加载失败</div>
            <div className="page-error-detail">{error}</div>
            <button className="retry-btn" onClick={refetch}>重试</button>
          </div>
        ) : null}
        {!loading && !error ? (
          <div className="strategy-list-container">
            <div className="table-shell data-table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>代码</th>
                    <th>名称</th>
                    <th style={{ textAlign: 'left' }}>主概念</th>
                    <th className="center">入池日</th>
                    <th className="right">T-2涨幅%</th>
                    <th className="right">两日累计%</th>
                    <th className="right">今日收盘</th>
                    <th className="right">入池涨幅%</th>
                    <th className="right">剩余天数</th>
                    <th className="right">成交(亿)</th>
                    <th className="center">买入信号</th>
                    <th className="center">卖出信号</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={12}><div className="empty-state"><div className="empty-text">当前交易日没有形态策略样本</div></div></td></tr>
                  ) : rows.map((row: PatternT2up9Item) => {
                    const pctMaybe = (v: number | null | undefined) => v == null ? null : Math.abs(v) <= 1 ? v * 100 : v;
                    const t2Pct = pctMaybe(row.ret_t2);
                    const ret2dPct = pctMaybe(row.ret_2d);
                    const pctStyle = (n: number | null) => ({ color: n == null ? '#8c909f' : n > 0 ? '#ff5451' : n < 0 ? '#22C55E' : '#8c909f', fontWeight: 600 as const });
                    const detail = getMockDetail(row.ts_code, row.name, ['形态策略'], row.close ?? 0, (row.ret_t0 ?? 0) * 100);
                    return (
                      <tr key={row.ts_code} onClick={() => onOpen(detail)}>
                        <td className="c-sec numeric-muted">{row.ts_code}</td>
                        <td style={{ fontWeight: 500 }}>{row.name}<CrossTags tsCode={row.ts_code} currentStrategy="PATTERN_T2UP9" /></td>
                        <td style={{ textAlign: 'left' }}>
                          {(row as any).primary_concept ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: '#c2c6d6' }}>
                                {(row as any).primary_concept}
                              </span>
                              {(row as any).is_leader && <span title={(row as any).leader_reason || '概念龙头'} style={{ fontSize: '12px', cursor: 'help' }}>👑</span>}
                            </span>
                          ) : <span style={{ color: '#8c909f' }}>—</span>}
                        </td>
                        <td className="center numeric-muted">{selectedDate}</td>
                        <td className="right numeric" style={pctStyle(t2Pct)}>{t2Pct == null ? '--' : `${t2Pct > 0 ? '+' : ''}${t2Pct.toFixed(2)}%`}</td>
                        <td className="right numeric" style={pctStyle(ret2dPct)}>{ret2dPct == null ? '--' : `${ret2dPct > 0 ? '+' : ''}${ret2dPct.toFixed(2)}%`}</td>
                        <td className="right numeric">{row.close != null ? Number(row.close).toFixed(2) : '--'}</td>
                        <td className="right numeric c-muted">--</td>
                        <td className="right numeric">20</td>
                        <td className="right numeric">{row.amount_yi != null ? Number(row.amount_yi).toFixed(2) : '--'}</td>
                        <td className="center">{row.buy_signal ? <span className="status-badge source-badge source-badge-info">{displaySignalLabel(row.buy_signal)}</span> : <span className="c-muted">--</span>}</td>
                        <td className="center">{row.sell_signal ? <span className="status-badge source-badge source-badge-warning">{displaySignalLabel(row.sell_signal)}</span> : <span className="c-muted">--</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}

export default function PatternScreen() {
  const { selectedDate } = useDate();
  const [mainTab, setMainTab] = useState<MainTab>('today');
  const [selected, setSelected] = useState<StockDetail | null>(null);
  const [buyMode, setBuyMode] = useState(false);

  return (
    <div className="pattern-page" data-testid="pattern-page">
      <div className="page-tabs">
        <button type="button" className={`page-tab-btn${mainTab === 'today' ? ' active' : ''}`} onClick={() => setMainTab('today')}>今日入选</button>
        <button type="button" className={`page-tab-btn${mainTab === 'watchlist' ? ' active' : ''}`} onClick={() => setMainTab('watchlist')}>持续观察池</button>
      </div>
      {mainTab === 'watchlist' ? (
        <WatchlistTab strategy="PATTERN_T2UP9" onOpen={(stock) => { setBuyMode(false); setSelected(stock); }} onBuy={(stock) => { setBuyMode(true); setSelected(stock); }} />
      ) : (
        <T2TodayTable selectedDate={selectedDate} onOpen={(stock) => { setBuyMode(false); setSelected(stock); }} />
      )}
      <StockDrawer stock={selected} autoOpenBuyForm={buyMode} onClose={() => { setSelected(null); setBuyMode(false); }} sourcePage="pattern" />
    </div>
  );
}
