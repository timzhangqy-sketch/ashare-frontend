import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useDate } from '../context/useDate';
import StockDrawer from '../components/Drawer/StockDrawer';
import WatchlistTab from '../components/WatchlistTab';
import { getMockDetail } from '../utils/score';
import { useApiData } from '../hooks/useApiData';
import { fetchWatchlist, type WatchlistItem } from '../api';
import type { StockDetail } from '../types/stock';
import { displaySignalLabel } from '../utils/labelMaps';

type MainTab = 'today' | 'watchlist';

export default function IgnitionList() {
  const { selectedDate } = useDate();
  // 单次调用 /api/watchlist/active，与持续观察池同一数据源；按 entry_date 拆分为今日入选 / 全部
  const { data, loading, error, refetch } = useApiData(
    () => fetchWatchlist(),
    [],
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
  const allVolSurge = all.filter((item) => item.strategy === 'VOL_SURGE');
  const rows = allVolSurge.filter((item) => item.entry_date === selectedDate);
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
                    <th>#</th>
                    <th>代码</th>
                    <th>名称</th>
                    <th style={{ textAlign: 'left' }}>主概念</th>
                    <th className="center">入池日</th>
                    <th className="right">收盘</th>
                    <th className="right">3日均VR</th>
                    <th className="right">5日%</th>
                    <th className="right">20日%</th>
                    <th className="right">成交(亿)</th>
                    <th className="right">换手%</th>
                    <th className="center">买入信号</th>
                    <th className="center">卖出信号</th>
                    <th className="center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item: WatchlistItem, index) => (
                      <tr
                        key={`${item.ts_code}-${item.strategy}`}
                        onClick={() => handleRowClick(item)}
                      >
                        <td className="c-sec">{index + 1}</td>
                        <td className="c-sec">{item.ts_code}</td>
                        <td style={{ fontWeight: 500 }}>{item.name}</td>
                        <td style={{ textAlign: 'left' }}>
                          {(item as any).primary_concept ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                {(item as any).primary_concept}
                              </span>
                              {(item as any).is_leader && <span title={(item as any).leader_reason || '概念龙头'} style={{ fontSize: '12px', cursor: 'help' }}>👑</span>}
                            </span>
                          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td className="center c-sec">{item.entry_date}</td>
                        <td className="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {item.latest_close != null ? Number(item.latest_close).toFixed(2) : '--'}
                        </td>
                        <td className="right c-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {(item as any).avg_vr3 != null ? Number((item as any).avg_vr3).toFixed(2) : '--'}
                        </td>
                        <td className="right" style={{ color: Number((item as any).ret5_pct || 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>
                          {(item as any).ret5_pct != null ? `${(Number((item as any).ret5_pct) * 100).toFixed(2)}%` : '--'}
                        </td>
                        <td className="right" style={{ color: Number((item as any).ret20_pct || 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>
                          {(item as any).ret20_pct != null ? `${(Number((item as any).ret20_pct) * 100).toFixed(2)}%` : '--'}
                        </td>
                        <td className="right c-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {(item as any).amount_yi != null ? Number((item as any).amount_yi).toFixed(2) : '--'}
                        </td>
                        <td className="right c-muted">
                          {(item as any).turnover_rate != null ? `${Number((item as any).turnover_rate).toFixed(2)}%` : '--'}
                        </td>
                        <td className="center">{displaySignalLabel(item.buy_signal)}</td>
                        <td className="center">{displaySignalLabel(item.sell_signal)}</td>
                        <td className="center">
                          <button type="button" title="承接" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }} onClick={(e) => { e.stopPropagation(); }}>
                            <ArrowRight size={16} />
                          </button>
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
