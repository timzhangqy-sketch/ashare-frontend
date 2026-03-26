import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { getMockDetail } from '../utils/score';
import { useApiData } from '../hooks/useApiData';
import { fetchWatchlist, type WatchlistItem } from '../api';
import type { StockDetail } from '../types/stock';
import { CrossTags } from './CrossTags';
import { displaySignalLabel } from '../utils/labelMaps';

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

function SignalBadge({ label }: { label: string | null }) {
  if (!label) return <span className="c-muted">--</span>;
  const text = displaySignalLabel(label);
  return <span className={SIGNAL_CFG[label] ?? 'status-badge tag-pill'}>{text}</span>;
}

function PctCell({ v, isDecimal = false }: { v: number | null | undefined; isDecimal?: boolean }) {
  if (v == null) return <td className="right numeric c-muted">--</td>;
  const n = isDecimal ? v * 100 : v;
  const color = n > 0 ? '#ff5451' : n < 0 ? '#22C55E' : '#8c909f';
  return (
    <td className="right numeric" style={{ color, fontWeight: 600 }}>
      {n > 0 ? '+' : ''}{n.toFixed(2)}%
    </td>
  );
}

function NumCell({ v, decimals = 2, suffix = '' }: { v: number | null | undefined; decimals?: number; suffix?: string }) {
  if (v == null) return <td className="right numeric c-muted">--</td>;
  return <td className="right numeric">{v.toFixed(decimals)}{suffix}</td>;
}


interface Props {
  strategy: string | string[];
  onOpen: (s: StockDetail) => void;
  onBuy?: (s: StockDetail) => void;
}

function makeDetail(s: WatchlistItem): StockDetail {
  return getMockDetail(s.ts_code, s.name, [s.strategy], 0, s.latest_pct_chg);
}

type SortKey = 'turnover_rate' | 'amount_yi' | null;
type SortDir = 'asc' | 'desc';

export default function WatchlistTab({ strategy, onOpen, onBuy }: Props) {
  const { data, loading, error, refetch } = useApiData(() => fetchWatchlist(), []);
  const allItems = data ?? [];
  const strategyStr = Array.isArray(strategy) ? strategy[0] : strategy;
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const items = useMemo(() => {
    if (!allItems.length) return [];
    if (Array.isArray(strategy)) return allItems.filter((s) => strategy.includes(s.strategy));
    return allItems.filter((s) => s.strategy === strategy);
  }, [allItems, strategy]);

  const sortedItems = useMemo(() => {
    if (!sortKey) return items;
    const dir = sortDir === 'desc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const va = (a as unknown as Record<string, number>)[sortKey] ?? -999;
      const vb = (b as unknown as Record<string, number>)[sortKey] ?? -999;
      return dir * (vb - va);
    });
  }, [items, sortKey, sortDir]);

  const buyCount = items.filter((s) => s.buy_signal).length;
  const sellCount = items.filter((s) => s.sell_signal).length;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortIndicator = (key: SortKey) => sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>观察池数量</div>
          <div className={`stat-value numeric c-cyan${loading ? ' loading' : ''}`}>{loading ? '--' : items.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>买入信号</div>
          <div className={`stat-value numeric c-red${loading ? ' loading' : ''}`}>{loading ? '--' : buyCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>卖出信号</div>
          <div className={`stat-value numeric c-green${loading ? ' loading' : ''}`}>{loading ? '--' : sellCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>数据来源</div>
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
            <div className="empty-text">当前没有观察池标的</div>
          </div>
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                {strategyStr === 'VOL_SURGE' ? (
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>代码</th>
                    <th>名称</th>
                    <th style={{ textAlign: 'left' }}>主概念</th>
                    <th className="center">入池日</th>
                    <th className="right">收盘</th>
                    <th className="right">3日均VR</th>
                    <th className="right">5日%</th>
                    <th className="right">20日%</th>
                    <th className="right" style={{ cursor: 'pointer' }} onClick={() => handleSort('amount_yi')}>成交(亿){sortIndicator('amount_yi')}</th>
                    <th className="right" style={{ cursor: 'pointer' }} onClick={() => handleSort('turnover_rate')}>换手%{sortIndicator('turnover_rate')}</th>
                    <th className="center">买入信号</th>
                    <th className="center">卖出信号</th>
                    <th className="center">操作</th>
                  </tr>
                ) : strategyStr === 'RETOC2' ? (
                  <tr>
                    <th>代码</th>
                    <th>名称</th>
                    <th style={{ textAlign: 'left' }}>主概念</th>
                    <th className="center">入池日</th>
                    <th className="right">在池天</th>
                    <th className="right">10日bar</th>
                    <th className="right">当日bar</th>
                    <th className="right">ret10%</th>
                    <th className="right" style={{ cursor: 'pointer' }} onClick={() => handleSort('turnover_rate')}>换手%{sortIndicator('turnover_rate')}</th>
                    <th className="right">收盘</th>
                    <th className="right" style={{ cursor: 'pointer' }} onClick={() => handleSort('amount_yi')}>成交(亿){sortIndicator('amount_yi')}</th>
                    <th className="center">买入信号</th>
                    <th className="center">卖出信号</th>
                    <th className="center">操作</th>
                  </tr>
                ) : strategyStr === 'PATTERN_T2UP9' ? (
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
                    <th className="right" style={{ cursor: 'pointer' }} onClick={() => handleSort('amount_yi')}>成交(亿){sortIndicator('amount_yi')}</th>
                    <th className="center">买入信号</th>
                    <th className="center">卖出信号</th>
                    <th className="center">操作</th>
                  </tr>
                ) : strategyStr === 'WEAK_BUY' ? (
                  <tr>
                    <th>代码</th>
                    <th>名称</th>
                    <th style={{ textAlign: 'left' }}>主概念</th>
                    <th className="center">入池日</th>
                    <th className="right">池天数</th>
                    <th className="right">收盘</th>
                    <th className="right">VR量比</th>
                    <th className="right" style={{ cursor: 'pointer' }} onClick={() => handleSort('turnover_rate')}>换手%{sortIndicator('turnover_rate')}</th>
                    <th className="right" style={{ cursor: 'pointer' }} onClick={() => handleSort('amount_yi')}>成交(亿){sortIndicator('amount_yi')}</th>
                    <th className="right">入池以来</th>
                    <th className="center">买入信号</th>
                    <th className="center">卖出信号</th>
                    <th className="center">操作</th>
                  </tr>
                ) : (
                  <tr>
                    <th>代码</th>
                    <th>名称</th>
                    <th style={{ textAlign: 'left' }}>主概念</th>
                    <th className="center">入池日</th>
                    <th className="right">池天数</th>
                    <th className="right">收盘</th>
                    <th className="right" style={{ cursor: 'pointer' }} onClick={() => handleSort('turnover_rate')}>换手%{sortIndicator('turnover_rate')}</th>
                    <th className="right">入池以来</th>
                    <th className="center">买入信号</th>
                    <th className="center">卖出信号</th>
                    <th className="center">操作</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {sortedItems.map((s: WatchlistItem, idx: number) => {
                  const detail = makeDetail(s);
                  return (
                    <tr key={`${s.ts_code}-${s.strategy}`} onClick={() => onOpen(detail)}>
                      {strategyStr === 'VOL_SURGE' ? (
                        <>
                          <td className="center numeric-muted">{idx + 1}</td>
                          <td className="c-sec numeric-muted">{s.ts_code}</td>
                          <td style={{ fontWeight: 500 }}>{s.name}<CrossTags tsCode={s.ts_code} currentStrategy={s.strategy} /></td>
                          <td style={{ textAlign: 'left' }}>
                            {s.primary_concept ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: '#c2c6d6' }}>
                                  {s.primary_concept}
                                </span>
                                {s.is_leader && <span title={s.leader_reason || '概念龙头'} style={{ fontSize: '12px', cursor: 'help' }}>👑</span>}
                              </span>
                            ) : <span style={{ color: '#8c909f' }}>—</span>}
                          </td>
                          <td className="center numeric-muted">{s.entry_date}</td>
                          <NumCell v={s.latest_close} />
                          <NumCell v={s.avg_vr3} />
                          <PctCell v={s.ret5_pct} isDecimal />
                          <PctCell v={s.ret20_pct} isDecimal />
                          <NumCell v={s.amount_yi} />
                          <NumCell v={s.turnover_rate} suffix="%" />
                          <td className="center"><SignalBadge label={s.buy_signal} /></td>
                          <td className="center"><SignalBadge label={s.sell_signal} /></td>
                          <td className="center" onClick={(e) => e.stopPropagation()}>
                            <button type="button" title="承接" style={{ background: 'rgba(59,130,246,0.10)', color: '#3B82F6', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer' }} onClick={() => (onBuy ?? onOpen)(detail)}>
                              <ArrowRight size={15} />
                            </button>
                          </td>
                        </>
                      ) : strategyStr === 'RETOC2' ? (
                        <>
                          <td className="c-sec numeric-muted">{s.ts_code}</td>
                          <td style={{ fontWeight: 500 }}>{s.name}<CrossTags tsCode={s.ts_code} currentStrategy={s.strategy} /></td>
                          <td style={{ textAlign: 'left' }}>
                            {s.primary_concept ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: '#c2c6d6' }}>
                                  {s.primary_concept}
                                </span>
                                {s.is_leader && <span title={s.leader_reason || '概念龙头'} style={{ fontSize: '12px', cursor: 'help' }}>👑</span>}
                              </span>
                            ) : <span style={{ color: '#8c909f' }}>—</span>}
                          </td>
                          <td className="center numeric-muted">{s.entry_date}</td>
                          <td className="right numeric">{s.pool_day}</td>
                          <NumCell v={s.retoc_cnt} decimals={0} />
                          <td className="right numeric">{(s as any).bars_today != null ? Math.round(Number((s as any).bars_today)) : '--'}</td>
                          <PctCell v={s.ret10} isDecimal={s.ret10 != null && Math.abs(s.ret10) <= 1} />
                          <NumCell v={s.turnover_rate} suffix="%" />
                          <NumCell v={s.latest_close} />
                          <NumCell v={s.amount_yi} />
                          <td className="center"><SignalBadge label={s.buy_signal} /></td>
                          <td className="center"><SignalBadge label={s.sell_signal} /></td>
                          <td className="center" onClick={(e) => e.stopPropagation()}>
                            <button type="button" title="承接" style={{ background: 'rgba(59,130,246,0.10)', color: '#3B82F6', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer' }} onClick={() => (onBuy ?? onOpen)(detail)}>
                              <ArrowRight size={15} />
                            </button>
                          </td>
                        </>
                      ) : strategyStr === 'PATTERN_T2UP9' ? (
                        <>
                          <td className="c-sec numeric-muted">{s.ts_code}</td>
                          <td style={{ fontWeight: 500 }}>{s.name}<CrossTags tsCode={s.ts_code} currentStrategy={s.strategy} /></td>
                          <td style={{ textAlign: 'left' }}>
                            {s.primary_concept ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: '#c2c6d6' }}>
                                  {s.primary_concept}
                                </span>
                                {s.is_leader && <span title={s.leader_reason || '概念龙头'} style={{ fontSize: '12px', cursor: 'help' }}>👑</span>}
                              </span>
                            ) : <span style={{ color: '#8c909f' }}>—</span>}
                          </td>
                          <td className="center numeric-muted">{s.entry_date}</td>
                          <PctCell v={(s as any).ret_t2} isDecimal />
                          <PctCell v={(s as any).ret_2d_cum} isDecimal />
                          <NumCell v={s.latest_close} />
                          <PctCell v={s.gain_since_entry} isDecimal />
                          <td className="right numeric">{s.pool_day != null ? Math.max(0, 20 - s.pool_day) : '--'}</td>
                          <NumCell v={s.amount_yi} />
                          <td className="center"><SignalBadge label={s.buy_signal} /></td>
                          <td className="center"><SignalBadge label={s.sell_signal} /></td>
                          <td className="center" onClick={(e) => e.stopPropagation()}>
                            <button type="button" title="承接" style={{ background: 'rgba(59,130,246,0.10)', color: '#3B82F6', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer' }} onClick={() => (onBuy ?? onOpen)(detail)}>
                              <ArrowRight size={15} />
                            </button>
                          </td>
                        </>
                      ) : strategyStr === 'WEAK_BUY' ? (
                        <>
                          <td className="c-sec numeric-muted">{s.ts_code}</td>
                          <td style={{ fontWeight: 500 }}>{s.name}<CrossTags tsCode={s.ts_code} currentStrategy={s.strategy} /></td>
                          <td style={{ textAlign: 'left' }}>
                            {s.primary_concept ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: '#c2c6d6' }}>
                                  {s.primary_concept}
                                </span>
                                {s.is_leader && <span title={s.leader_reason || '概念龙头'} style={{ fontSize: '12px', cursor: 'help' }}>👑</span>}
                              </span>
                            ) : <span style={{ color: '#8c909f' }}>—</span>}
                          </td>
                          <td className="center numeric-muted">{s.entry_date}</td>
                          <td className="right numeric">{s.pool_day}</td>
                          <NumCell v={s.latest_close} />
                          <NumCell v={s.vr_today} />
                          <NumCell v={s.turnover_rate} suffix="%" />
                          <NumCell v={s.amount_yi} />
                          <PctCell v={s.gain_since_entry} isDecimal />
                          <td className="center"><SignalBadge label={s.buy_signal} /></td>
                          <td className="center"><SignalBadge label={s.sell_signal} /></td>
                          <td className="center" onClick={(e) => e.stopPropagation()}>
                            <button type="button" title="承接" style={{ background: 'rgba(59,130,246,0.10)', color: '#3B82F6', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer' }} onClick={() => (onBuy ?? onOpen)(detail)}>
                              <ArrowRight size={15} />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="c-sec numeric-muted">{s.ts_code}</td>
                          <td style={{ fontWeight: 500 }}>{s.name}<CrossTags tsCode={s.ts_code} currentStrategy={s.strategy} /></td>
                          <td style={{ textAlign: 'left' }}>
                            {s.primary_concept ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: '#c2c6d6' }}>
                                  {s.primary_concept}
                                </span>
                                {s.is_leader && <span title={s.leader_reason || '概念龙头'} style={{ fontSize: '12px', cursor: 'help' }}>👑</span>}
                              </span>
                            ) : <span style={{ color: '#8c909f' }}>—</span>}
                          </td>
                          <td className="center numeric-muted">{s.entry_date}</td>
                          <td className="right numeric">{s.pool_day}</td>
                          <NumCell v={s.latest_close} />
                          <NumCell v={s.turnover_rate} suffix="%" />
                          <PctCell v={s.gain_since_entry} isDecimal />
                          <td className="center"><SignalBadge label={s.buy_signal} /></td>
                          <td className="center"><SignalBadge label={s.sell_signal} /></td>
                          <td className="center" onClick={(e) => e.stopPropagation()}>
                            <button type="button" title="承接" style={{ background: 'rgba(59,130,246,0.10)', color: '#3B82F6', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer' }} onClick={() => (onBuy ?? onOpen)(detail)}>
                              <ArrowRight size={15} />
                            </button>
                          </td>
                        </>
                      )}
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
