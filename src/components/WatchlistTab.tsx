import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { getMockDetail } from '../utils/score';
import { useApiData } from '../hooks/useApiData';
import { fetchWatchlist, type WatchlistItem } from '../api';
import type { StockDetail } from '../types/stock';
import { CrossTags } from './CrossTags';
import { getStrategyDisplayName } from '../utils/displayNames';

const SIGNAL_CFG: Record<string, string> = {
  PULLBACK: 'status-badge source-badge source-badge-info',
  REHEAT: 'status-badge source-badge source-badge-warning',
  BREAKOUT: 'status-badge source-badge source-badge-info',
  VOL_BREAK: 'status-badge source-badge source-badge-info',
  SELL: 'status-badge source-badge source-badge-warning',
  WARN_DRAWDOWN: 'status-badge source-badge source-badge-warning',
  WARN_MA_BREAK: 'status-badge source-badge source-badge-warning',
  WARN_VR_FADE: 'status-badge source-badge source-badge-warning',
  TAKE_PROFIT_50: 'status-badge source-badge source-badge-info',
  VOL_CONFIRM: 'status-badge source-badge source-badge-info',
};

const SIGNAL_LABEL: Record<string, string> = {
  WARN_DRAWDOWN: '回撤预警',
  WARN_MA_BREAK: '破位预警',
  WARN_VR_FADE: '量能衰竭',
  TAKE_PROFIT_50: '止盈50%',
  BREAKOUT: '突破买入',
  VOL_CONFIRM: '放量确认',
  PULLBACK: '回踩买入',
  REHEAT: '再次启动',
  VOL_BREAK: '量能突破',
  SELL: '卖出',
  ADD: '加入观察',
};

const STATUS_LABEL: Record<string, string> = {
  active: '观察中',
  exited: '已退池',
};

const STRATEGY_LABEL: Record<string, string> = {
  RETOC2: '异动反抽',
};

function SignalBadge({ label }: { label: string | null }) {
  if (!label) return <span className="c-muted">--</span>;
  const text = SIGNAL_LABEL[label] ?? label;
  return <span className={SIGNAL_CFG[label] ?? 'status-badge tag-pill'}>{text}</span>;
}

const ANOM_TRIGGER_CFG: Record<number, { color: string; bg: string; border: string }> = {
  3: { color: 'var(--info)', bg: 'var(--info-bg)', border: 'rgba(59,130,246,.4)' },
  4: { color: 'var(--warn)', bg: 'var(--warn-bg)', border: 'rgba(245,158,11,.4)' },
  5: { color: '#ef4444', bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,.4)' },
};

function AnomTriggerBadge({ trigger }: { trigger: number | null | undefined }) {
  if (trigger == null) return <span className="c-muted">—</span>;
  const cfg = ANOM_TRIGGER_CFG[trigger] ?? ANOM_TRIGGER_CFG[3];
  const text = trigger === 3 ? '第3次' : trigger === 4 ? '第4次' : trigger === 5 ? '第5次' : `第${trigger}次`;
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 6,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {text}
    </span>
  );
}

function PctCell({ v, isDecimal = false }: { v: number; isDecimal?: boolean }) {
  const n = isDecimal ? (v ?? 0) * 100 : (v ?? 0);
  const color = n > 0 ? 'var(--color-up)' : n < 0 ? 'var(--color-down)' : 'var(--text-muted)';
  return (
    <td className="right numeric" style={{ color, fontWeight: 600 }}>
      {n > 0 ? '+' : ''}{n.toFixed(2)}%
    </td>
  );
}

function PctCellOrNull({ v, isDecimal = false }: { v: number | null | undefined; isDecimal?: boolean }) {
  if (v == null) return <td className="right numeric c-muted">—</td>;
  const n = isDecimal ? (v ?? 0) * 100 : (v ?? 0);
  const color = n > 0 ? 'var(--color-up)' : n < 0 ? 'var(--color-down)' : 'var(--text-muted)';
  return (
    <td className="right numeric" style={{ color, fontWeight: 600 }}>
      {n > 0 ? '+' : ''}{n.toFixed(2)}%
    </td>
  );
}

interface Props {
  strategy: string | string[];
  onOpen: (s: StockDetail) => void;
  onBuy?: (s: StockDetail) => void;
}

function makeDetail(s: WatchlistItem): StockDetail {
  return getMockDetail(s.ts_code, s.name, [s.strategy], 0, s.latest_pct_chg);
}

type SortKey = 'turnover_rate' | null;
type SortDir = 'asc' | 'desc';

export default function WatchlistTab({ strategy, onOpen, onBuy }: Props) {
  const { data, loading, error, refetch } = useApiData(() => fetchWatchlist(), []);
  const allItems = data ?? [];
  const isRetoc2 = Array.isArray(strategy) ? strategy.includes('RETOC2') : strategy === 'RETOC2';
  const [sortKey, setSortKey] = useState<SortKey>(isRetoc2 ? 'turnover_rate' : null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const items = useMemo(() => {
    if (!allItems.length) return [];
    if (Array.isArray(strategy)) return allItems.filter((s) => strategy.includes(s.strategy));
    return allItems.filter((s) => s.strategy === strategy);
  }, [allItems, strategy]);

  const sortedItems = useMemo(() => {
    if (!sortKey || sortKey !== 'turnover_rate') return items;
    const dir = sortDir === 'desc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const va = a.turnover_rate ?? -1;
      const vb = b.turnover_rate ?? -1;
      return dir * (vb - va);
    });
  }, [items, sortKey, sortDir]);

  const buyCount = items.filter((s) => s.buy_signal).length;
  const sellCount = items.filter((s) => s.sell_signal).length;

  const handleTurnoverSort = () => {
    if (!isRetoc2) return;
    setSortKey('turnover_rate');
    setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
  };

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>{isRetoc2 ? '交易标的池信号' : '候选数量'}</div>
          <div className={`stat-value numeric c-cyan${loading ? ' loading' : ''}`}>{loading ? '--' : items.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>买入信号</div>
          <div className={`stat-value numeric c-red${loading ? ' loading' : ''}`}>{loading ? '--' : buyCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>卖出信号</div>
          <div className={`stat-value numeric c-green${loading ? ' loading' : ''}`}>{loading ? '--' : sellCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>数据来源</div>
          <div className="stat-value" style={{ fontSize: '16px', fontWeight: 700 }}>真实数据</div>
        </div>
      </div>

      <div className="card">
        {loading ? <div className="page-loading"><div className="spinner" />正在加载...</div> : null}
        {!loading && error ? (
          <div className="page-error">
            <div className="page-error-msg">交易标的池加载失败</div>
            <div className="page-error-detail">{error}</div>
            <button className="retry-btn" onClick={refetch}>重试</button>
          </div>
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">-</div>
            <div className="empty-text">当前没有交易标的池标的</div>
          </div>
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>代码</th>
                  <th>名称</th>
                  <th>策略</th>
                  {isRetoc2 ? (
                    <>
                      <th className="center" style={{ width: 60 }}>异动次数</th>
                      <th
                        className="right"
                        style={{ width: 70, cursor: isRetoc2 ? 'pointer' : undefined }}
                        onClick={handleTurnoverSort}
                        title={isRetoc2 ? '点击切换升序/降序' : undefined}
                      >
                        换手率{sortKey === 'turnover_rate' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                      </th>
                      <th className="right" style={{ width: 70 }}>10日涨幅</th>
                    </>
                  ) : null}
                  <th className="center">入池日期</th>
                  <th className="right">池天数</th>
                  <th className="right">最新涨跌</th>
                  {isRetoc2 ? <th className="right">入池涨跌</th> : null}
                  <th className="right">入池以来</th>
                  <th className="center">买入信号</th>
                  <th className="center">卖出信号</th>
                  <th className="center">操作</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((s: WatchlistItem) => {
                  const detail = makeDetail(s);
                  const strategyLabel = STRATEGY_LABEL[s.strategy] ?? getStrategyDisplayName(s.strategy) ?? s.strategy;
                  const statusLabel = s.status != null ? (STATUS_LABEL[s.status] ?? s.status) : null;
                  const entryPctChg = s.entry_pct_chg ?? (s.entry_price != null && s.latest_close != null && s.entry_price > 0
                    ? ((s.latest_close - s.entry_price) / s.entry_price) * 100
                    : null);
                  const ret10Pct = s.ret10 != null ? (Math.abs(s.ret10) <= 1 ? s.ret10 * 100 : s.ret10) : null;
                  return (
                    <tr key={`${s.ts_code}-${s.strategy}`} onClick={() => onOpen(detail)}>
                      <td className="c-sec numeric-muted">{s.ts_code}</td>
                      <td style={{ fontWeight: 500 }}>
                        {s.name}<CrossTags tsCode={s.ts_code} currentStrategy={s.strategy} />
                      </td>
                      <td>
                        <span className="tag-pill">{strategyLabel}</span>
                        {statusLabel ? <span className="c-muted" style={{ marginLeft: 4, fontSize: 12 }}>{statusLabel}</span> : null}
                      </td>
                      {isRetoc2 ? (
                        <>
                          <td className="center"><AnomTriggerBadge trigger={s.anom_trigger} /></td>
                          <td className="right numeric">{s.turnover_rate != null ? `${s.turnover_rate.toFixed(2)}%` : '—'}</td>
                          <PctCellOrNull v={ret10Pct} />
                        </>
                      ) : null}
                      <td className="center numeric-muted">{s.entry_date}</td>
                      <td className="right numeric">{s.pool_day}</td>
                      <PctCell v={s.latest_pct_chg} />
                      {isRetoc2 ? <PctCellOrNull v={entryPctChg} /> : null}
                      {/* TODO: 若 gain_since_entry 全为 0 或空，需排查后端 watchlist 入池以来收益计算 */}
                      <PctCell v={s.gain_since_entry} isDecimal />
                      <td className="center"><SignalBadge label={s.buy_signal} /></td>
                      <td className="center"><SignalBadge label={s.sell_signal} /></td>
                      <td className="center" onClick={(e) => e.stopPropagation()}>
                        <button type="button" title="承接" style={{ background: 'rgba(59,130,246,0.10)', color: '#3B82F6', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer' }} onClick={() => (onBuy ?? onOpen)(detail)}>
                          <ArrowRight size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
