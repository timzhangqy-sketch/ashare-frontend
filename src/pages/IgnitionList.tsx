import { useEffect, useRef, useState } from 'react';
import { useDate } from '../context/useDate';
import StockDrawer from '../components/Drawer/StockDrawer';
import WatchlistTab from '../components/WatchlistTab';
import { getMockDetail } from '../utils/score';
import { useApiData } from '../hooks/useApiData';
import { fetchWatchlist, type WatchlistItem } from '../api';
import type { StockDetail } from '../types/stock';
import { CrossTags } from '../components/CrossTags';

type MainTab = 'today' | 'watchlist';

const pctFmt = (v: number | null | undefined, d = 2) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(d)}%` : '--';
const pnlColor = (v: number | null | undefined) =>
  v == null ? 'var(--text-muted)' : v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--text-muted)';

function getStrategyLabel(strategy: string) {
  if (strategy === 'VOL_SURGE') return '连续放量蓄势';
  return strategy;
}

export default function IgnitionList() {
  const { selectedDate } = useDate();
  const { data, loading, error, refetch } = useApiData(
    () => fetchWatchlist(),
    [selectedDate],
  );
  const [selected, setSelected] = useState<StockDetail | null>(null);
  const [buyMode, setBuyMode] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>('today');
  const listRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);

  useEffect(() => {
    if (listRef.current && scrollPosRef.current > 0) {
      listRef.current.scrollTop = scrollPosRef.current;
    }
  }, [data, selected]);

  function handleRowClick(item: WatchlistItem) {
    if (listRef.current) scrollPosRef.current = listRef.current.scrollTop;
    const detail = getMockDetail(
      item.ts_code,
      item.name,
      ['能量蓄势'],
      0,
      item.latest_pct_chg ?? 0,
    );
    setSelected(detail);
  }

  const all = (data ?? []) as WatchlistItem[];
  const rows = all.filter(
    (item) => item.strategy === 'VOL_SURGE' && item.entry_date === selectedDate,
  );
  const buySignalCount = rows.filter((item) => item.buy_signal && item.buy_signal !== '').length;
  const sellSignalCount = rows.filter((item) => item.sell_signal && item.sell_signal !== '').length;

  return (
    <div data-testid="ignition-page">
      <div className="page-tabs">
        <button className={`page-tab-btn${mainTab === 'today' ? ' active' : ''}`} onClick={() => setMainTab('today')}>
          今日入选
        </button>
        <button className={`page-tab-btn${mainTab === 'watchlist' ? ' active' : ''}`} onClick={() => setMainTab('watchlist')}>
          持续观察池
        </button>
      </div>

      {mainTab === 'watchlist' ? (
        <WatchlistTab
          strategy="VOL_SURGE"
          onOpen={(stock) => { setBuyMode(false); setSelected(stock); }}
          onBuy={(stock) => { setBuyMode(true); setSelected(stock); }}
        />
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>今日入选</div>
              <div className={`stat-value c-red${loading ? ' loading' : ''}`}>{loading ? '--' : rows.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>买入信号</div>
              <div className={`stat-value c-gold${loading ? ' loading' : ''}`}>{loading ? '--' : buySignalCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>卖出信号</div>
              <div className={`stat-value c-green${loading ? ' loading' : ''}`}>{loading ? '--' : sellSignalCount}</div>
            </div>
          </div>

          <div className="card">
            {loading && <div className="page-loading"><div className="spinner" />加载中...</div>}
            {!loading && error && (
              <div className="page-error">
                <div className="page-error-msg">数据加载失败</div>
                <div className="page-error-detail">{error}</div>
                <button className="retry-btn" onClick={refetch}>重试</button>
              </div>
            )}
            {!loading && !error && rows.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">空</div>
                <div className="empty-text">该日期暂无能量蓄势数据</div>
              </div>
            )}
            {!loading && !error && rows.length > 0 && (
              <div ref={listRef} className="strategy-list-container">
                <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>代码</th>
                    <th>名称</th>
                    <th>策略</th>
                    <th className="center">入池日期</th>
                    <th className="right">最新涨跌</th>
                    <th className="right">入池以来</th>
                    <th className="center">买入信号</th>
                    <th className="center">卖出信号</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item: WatchlistItem) => (
                      <tr
                        key={`${item.ts_code}-${item.strategy}`}
                        onClick={() => handleRowClick(item)}
                      >
                        <td className="c-sec">{item.ts_code}</td>
                        <td style={{ fontWeight: 500 }}>
                          {item.name}
                          <CrossTags tsCode={item.ts_code} currentStrategy="VOL_SURGE" />
                        </td>
                        <td>
                          <span className="tag-pill">{getStrategyLabel(item.strategy)}</span>
                        </td>
                        <td className="center c-sec">{item.entry_date}</td>
                        <td className="right" style={{ color: pnlColor(item.latest_pct_chg), fontWeight: 600 }}>
                          {pctFmt(item.latest_pct_chg, 2)}
                        </td>
                        <td className="right c-muted">
                          {item.gain_since_entry != null
                            ? pctFmt(item.gain_since_entry * 100, 2)
                            : '--'}
                        </td>
                        <td className="center">
                          {item.buy_signal && item.buy_signal !== '' ? item.buy_signal : '--'}
                        </td>
                        <td className="center">
                          {item.sell_signal && item.sell_signal !== '' ? item.sell_signal : '--'}
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <StockDrawer
        stock={selected}
        autoOpenBuyForm={buyMode}
        onClose={() => { setSelected(null); setBuyMode(false); }}
      />
    </div>
  );
}
