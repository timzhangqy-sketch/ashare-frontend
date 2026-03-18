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
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>今日样本</div>
          <div className="stat-value c-red">{loading ? '--' : rows.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>最深超跌</div>
          <div className="stat-value c-blue">{loading ? '--' : (minRet60 != null ? formatWeakBuyPct(minRet60).text : '--')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>平均放量天数</div>
          <div className="stat-value c-cyan">{loading ? '--' : (avgVolupDays != null ? avgVolupDays.toFixed(1) : '0.0')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>交易标的池命中</div>
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
                    <th>股票</th>
                    <th className="right">60日涨幅</th>
                    <th className="right">放量天数</th>
                    <th className="right">平均涨幅</th>
                    <th className="right">弱市天数</th>
                    <th className="right">成交(亿)</th>
                    <th className="center">交易标的池</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={7}><div className="empty-state"><div className="empty-text">当前交易日没有弱市吸筹样本</div></div></td></tr>
                  ) : rows.map((row: PatternWeakBuyItem) => {
                    const ret60 = formatWeakBuyPct(row.ret60_pct);
                    const avgRet = formatWeakBuyPct(row.avg_ret_pct);
                    return (
                      <tr key={row.ts_code} onClick={() => onOpen(getMockDetail(row.ts_code, row.name, ['弱市吸筹'], 0, row.ret60_pct != null ? row.ret60_pct * 100 : 0))}>
                        <td>
                          <div className="watchlist-cell-title">{row.name}<CrossTags tsCode={row.ts_code} currentStrategy="WEAK_BUY" /></div>
                          <div className="watchlist-inline-meta">{row.ts_code}</div>
                        </td>
                        <td className={`right ${ret60.isNegative ? 'c-red' : ''}`}>{ret60.text}</td>
                        <td className="right">{row.volup15_days}</td>
                        <td className="right">{avgRet.text}</td>
                        <td className="right">{row.weak_days}</td>
                        <td className="right">{row.amount_yi != null ? Number(row.amount_yi).toFixed(2) : '--'}</td>
                        <td className="center">{row.in_pool ? '是' : '否'}</td>
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
        <button type="button" className={`page-tab-btn${mainTab === 'today' ? ' active' : ''}`} onClick={() => setMainTab('today')}>今日样本</button>
        <button type="button" className={`page-tab-btn${mainTab === 'watchlist' ? ' active' : ''}`} onClick={() => setMainTab('watchlist')}>持续观察池</button>
      </div>
      {mainTab === 'watchlist' ? (
        <WatchlistTab strategy="WEAK_BUY" onOpen={(stock) => { setBuyMode(false); setSelected(stock); }} onBuy={(stock) => { setBuyMode(true); setSelected(stock); }} />
      ) : (
        <WeakBuyTodayTable selectedDate={selectedDate} onOpen={(stock) => { setBuyMode(false); setSelected(stock); }} />
      )}
      <StockDrawer stock={selected} autoOpenBuyForm={buyMode} onClose={() => { setSelected(null); setBuyMode(false); }} />
    </div>
  );
}
