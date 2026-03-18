import { useEffect, useRef, useState } from 'react';
import { useDate } from '../context/useDate';
import StockDrawer from '../components/Drawer/StockDrawer';
import WatchlistTab from '../components/WatchlistTab';
import { getMockDetail } from '../utils/score';
import { useApiData } from '../hooks/useApiData';
import { fetchRetoc2, type Retoc2Item } from '../api';
import type { StockDetail } from '../types/stock';
import { CrossTags } from '../components/CrossTags';

type MainTab = 'today' | 'watchlist';

const fmt = (v: number | null | undefined, d = 2) => v != null ? v.toFixed(d) : '--';
const pnlColor = (v: number | null | undefined) =>
  v == null ? 'var(--text-muted)' : v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--text-muted)';

const GRADE_CFG: Record<string, { color: string; bg: string; border: string }> = {
  A: { color: 'var(--down)', bg: 'var(--down-bg)', border: 'rgba(34,197,94,.4)' },
  B: { color: 'var(--info)', bg: 'var(--info-bg)', border: 'rgba(59,130,246,.4)' },
};

function GradeBadge({ grade }: { grade: string }) {
  const cfg = GRADE_CFG[grade] ?? GRADE_CFG.B;
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        padding: '2px 10px',
        borderRadius: 10,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {grade}
    </span>
  );
}

export default function Retoc2Alert() {
  const { selectedDate } = useDate();
  const { data, loading, error, refetch } = useApiData(
    () => fetchRetoc2(selectedDate),
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

  function handleRowClick(item: Retoc2Item) {
    if (listRef.current) scrollPosRef.current = listRef.current.scrollTop;
    setSelected(getMockDetail(item.ts_code, item.name, ['异动策略'], item.close ?? 0, item.pct_chg ?? 0));
  }

  const alerts = data ?? [];
  const aCount = alerts.filter((item) => item.grade === 'A').length;
  const avgRet10 = alerts.length
    ? alerts.reduce((sum, item) => sum + (item.ret10_pct ?? 0), 0) / alerts.length
    : 0;
  const maxBars = alerts.length
    ? alerts.reduce((best, item) => item.total_bars_10 > best.total_bars_10 ? item : best, alerts[0])
    : null;

  return (
    <div>
      <div className="page-tabs">
        <button className={`page-tab-btn${mainTab === 'today' ? ' active' : ''}`} onClick={() => setMainTab('today')}>
          今日触发
        </button>
        <button className={`page-tab-btn${mainTab === 'watchlist' ? ' active' : ''}`} onClick={() => setMainTab('watchlist')}>
          持续观察池
        </button>
      </div>

      {mainTab === 'watchlist' ? (
        <WatchlistTab
          strategy="RETOC2"
          onOpen={(stock) => { setBuyMode(false); setSelected(stock); }}
          onBuy={(stock) => { setBuyMode(true); setSelected(stock); }}
        />
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>今日异动</div>
              <div className={`stat-value c-gold${loading ? ' loading' : ''}`}>{loading ? '--' : alerts.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>A 级信号</div>
              <div className={`stat-value c-green${loading ? ' loading' : ''}`}>{loading ? '--' : aCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>平均 ret10%</div>
              <div className="stat-value" style={{ color: loading ? 'var(--text-muted)' : pnlColor(avgRet10) }}>
                {loading ? '--' : `${avgRet10 >= 0 ? '+' : ''}${avgRet10.toFixed(2)}%`}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>10 日最多触发</div>
              <div className="stat-value" style={{ fontSize: maxBars ? 16 : 24, color: 'var(--accent)' }}>
                {loading ? '--' : maxBars ? maxBars.name : '--'}
              </div>
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
            {!loading && !error && alerts.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">空</div>
                <div className="empty-text">该日期暂无数据</div>
              </div>
            )}
            {!loading && !error && alerts.length > 0 && (
              <div ref={listRef} className="strategy-list-container">
                <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="center">级别</th>
                    <th>代码</th>
                    <th>名称</th>
                    <th className="right">10日 Bar</th>
                    <th className="right">当日 Bar</th>
                    <th className="right">ret10%</th>
                    <th className="right">换手%</th>
                    <th className="right">涨幅%</th>
                    <th className="right">收盘</th>
                    <th className="right">MA20</th>
                    <th className="right">成交(亿)</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((item: Retoc2Item) => (
                    <tr
                      key={item.ts_code}
                      onClick={() => handleRowClick(item)}
                    >
                      <td className="center"><GradeBadge grade={item.grade} /></td>
                      <td className="c-sec">{item.ts_code}</td>
                      <td style={{ fontWeight: 500 }}>
                        {item.name}<CrossTags tsCode={item.ts_code} currentStrategy="RETOC2" />
                      </td>
                      <td className="right"><span style={{ color: 'var(--warn)', fontWeight: 600 }}>{item.total_bars_10}</span></td>
                      <td className="right c-sec">{item.cnt_bars}</td>
                      <td className="right" style={{ color: pnlColor(item.ret10_pct), fontWeight: 600 }}>
                        {item.ret10_pct != null ? `${item.ret10_pct >= 0 ? '+' : ''}${fmt(item.ret10_pct)}%` : '--'}
                      </td>
                      <td className="right c-muted">{fmt(item.turnover_rate)}%</td>
                      <td className="right" style={{ color: pnlColor(item.pct_chg), fontWeight: 600 }}>
                        {item.pct_chg != null ? `${item.pct_chg >= 0 ? '+' : ''}${fmt(item.pct_chg)}%` : '--'}
                      </td>
                      <td className="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(item.close)}</td>
                      <td className="right c-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(item.ma20)}</td>
                      <td className="right c-muted">{fmt(item.amount_yi)}</td>
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
