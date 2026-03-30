import { useState } from 'react';
import StockDrawer from '../components/Drawer/StockDrawer';
import WatchlistTab from '../components/WatchlistTab';
import { useDate } from '../context/useDate';
import { useApiData } from '../hooks/useApiData';
import { fetchPatternWeakBuy, type PatternWeakBuyItem } from '../api';
import { getMockDetail } from '../utils/score';
import { CrossTags } from '../components/CrossTags';
import type { StockDetail } from '../types/stock';

type MainTab = 'today' | 'watchlist';

function formatWeakBuyPct(value: number | null | undefined): { text: string; isNegative: boolean } {
  if (value == null) return { text: '--', isNegative: false };
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  const text = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
  return { text, isNegative: pct < 0 };
}

function WeakBuyTodayTable({ selectedDate, onOpen }: { selectedDate: string; onOpen: (stock: StockDetail) => void }) {
  const { data, loading, error, refetch } = useApiData(() => fetchPatternWeakBuy(selectedDate), [selectedDate]);
  const rows = data ?? [];
  const minRet60 = rows.length ? Math.min(...rows.map(row => row.ret60_pct)) : null;
  const avgVolupDays = rows.length ? rows.reduce((sum, row) => sum + row.volup15_days, 0) / rows.length : null;

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>今日样本</div>
          <div className="stat-value c-red">{loading ? '--' : rows.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>最深超跌</div>
          <div className="stat-value c-blue">{loading ? '--' : (minRet60 != null ? formatWeakBuyPct(minRet60).text : '--')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>平均放量天数</div>
          <div className="stat-value c-cyan">{loading ? '--' : (avgVolupDays != null ? avgVolupDays.toFixed(1) : '0.0')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>交易标的池命中</div>
          <div className="stat-value c-gold">{loading ? '--' : rows.filter(row => row.in_pool).length}</div>
        </div>
      </div>
      <section className="card">
        {loading ? <div className="page-loading"><div className="spinner" />加载中...</div> : null}
        {!loading && error ? (
          <div className="page-error">
            <div className="page-error-msg">弱市吸筹加载失败</div>
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
                    <th className="right">收盘</th>
                    <th className="right">60日涨幅</th>
                    <th className="right">放量天数</th>
                    <th className="right">平均涨幅</th>
                    <th className="right">弱市天数</th>
                    <th className="right">成交(亿)</th>
                    <th className="center">触发状态</th>
                    <th className="center">过期日期</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={11}><div className="empty-state"><div className="empty-text">当前交易日没有弱市吸筹样本</div></div></td></tr>
                  ) : rows.map((row: PatternWeakBuyItem) => {
                    const ret60 = formatWeakBuyPct(row.ret60_pct);
                    const avgRet = formatWeakBuyPct(row.avg_ret_pct);
                    return (
                      <tr key={row.ts_code} onClick={() => onOpen(getMockDetail(row.ts_code, row.name, ['弱市吸筹'], row.close ?? 0, 0 /* TODO: 当日涨跌幅字段待接入 */))}>
                        <td className="c-sec numeric-muted">{row.ts_code}</td>
                        <td style={{ fontWeight: 500 }}>{row.name}<CrossTags tsCode={row.ts_code} currentStrategy="WEAK_BUY" /></td>
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
                        <td className="right numeric">{row.close != null ? Number(row.close).toFixed(2) : '--'}</td>
                        <td className="right numeric" style={{ color: ret60.isNegative ? '#22C55E' : '#ff5451', fontWeight: 600 }}>{ret60.text}</td>
                        <td className="right numeric">{row.volup15_days}</td>
                        <td className="right numeric">{avgRet.text}</td>
                        <td className="right numeric">{row.weak_days}</td>
                        <td className="right numeric">{row.amount_yi != null ? Number(row.amount_yi).toFixed(2) : '--'}</td>
                        <td className="center">{row.triggered_date ? <span className="status-badge source-badge source-badge-info">已触发</span> : row.in_watchlist ? <span className="status-badge source-badge source-badge-warning">已入池</span> : <span className="c-muted">观察中</span>}</td>
                        <td className="center numeric-muted">{row.expire_date ?? '--'}</td>
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

export default function WeakBuyPage() {
  const { selectedDate } = useDate();
  const [mainTab, setMainTab] = useState<MainTab>('today');
  const [selected, setSelected] = useState<StockDetail | null>(null);
  const [buyMode, setBuyMode] = useState(false);

  return (
    <div>
      <div className="page-tabs">
        <button type="button" className={`page-tab-btn${mainTab === 'today' ? ' active' : ''}`} onClick={() => setMainTab('today')}>今日入选</button>
        <button type="button" className={`page-tab-btn${mainTab === 'watchlist' ? ' active' : ''}`} onClick={() => setMainTab('watchlist')}>持续观察池</button>
      </div>
      {mainTab === 'watchlist' ? (
        <WatchlistTab strategy="WEAK_BUY" onOpen={(stock) => { setBuyMode(false); setSelected(stock); }} onBuy={(stock) => { setBuyMode(true); setSelected(stock); }} />
      ) : (
        <WeakBuyTodayTable selectedDate={selectedDate} onOpen={(stock) => { setBuyMode(false); setSelected(stock); }} />
      )}
      <StockDrawer stock={selected} autoOpenBuyForm={buyMode} onClose={() => { setSelected(null); setBuyMode(false); }} sourcePage="weak_buy" />
    </div>
  );
}
