import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import StockDrawer from '../components/Drawer/StockDrawer';
import WatchlistTab from '../components/WatchlistTab';
import { CrossTags } from '../components/CrossTags';
import { useDate } from '../context/useDate';
import { useApiData } from '../hooks/useApiData';
import {
  fetchPatternWeakBuy,
  fetchPatternT2up9,
  type PatternWeakBuyItem,
  type PatternT2up9Item,
} from '../api';
import type { StockDetail } from '../types/stock';
import { getMockDetail } from '../utils/score';

type MainTab = 'today' | 'watchlist';
type PatternTab = 't2' | 'weak_buy';
type WatchlistSub = 'PATTERN_T2UP9' | 'WEAK_BUY';

function formatPercent(value: number | null | undefined, decimal = true): string {
  if (value == null) return '--';
  const pct = decimal ? value * 100 : value;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

/** 弱市吸筹：涨跌幅显示，支持比例或百分点，负数用红色 */
function formatWeakBuyPct(value: number | null | undefined): { text: string; isNegative: boolean } {
  if (value == null) return { text: '--', isNegative: false };
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  const text = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
  return { text, isNegative: pct < 0 };
}

function openPatternStock(tsCode: string, name: string, strategy: string, pctChg: number): StockDetail {
  return getMockDetail(tsCode, name, [strategy], 0, pctChg);
}

function T2Table({ selectedDate, onOpen, listRef }: { selectedDate: string; onOpen: (stock: StockDetail) => void; listRef: React.RefObject<HTMLDivElement | null> }) {
  const { data, loading, error, refetch } = useApiData(() => fetchPatternT2up9(selectedDate), [selectedDate]);
  const rows = data ?? [];

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>形态样本</div>
          <div className="stat-value c-red">{loading ? '--' : rows.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>交易标的池命中</div>
          <div className="stat-value c-blue">{loading ? '--' : rows.filter(row => row.in_pool).length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>延续跟踪</div>
          <div className="stat-value c-cyan">{loading ? '--' : rows.filter(row => row.in_continuation).length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>T+2 平均收益</div>
          <div className="stat-value c-gold">
            {loading ? '--' : formatPercent(rows.length ? rows.reduce((sum, row) => sum + (row.ret_2d ?? 0), 0) / rows.length : 0)}
          </div>
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
          <div ref={listRef} className="strategy-list-container">
            <div className="table-shell data-table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>代码</th>
                  <th>名称</th>
                  <th className="center">入池日</th>
                  <th className="right">T-2涨幅%</th>
                  <th className="right">两日累计%</th>
                  <th className="right">今日收盘</th>
                  <th className="right">入池涨幅%</th>
                  <th className="right">剩余天数</th>
                  <th className="right">成交(亿)</th>
                  <th className="center">买入信号</th>
                  <th className="center">卖出信号</th>
                  <th className="center">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={12}>
                      <div className="empty-state">
                        <div className="empty-text">当前交易日没有形态策略样本。</div>
                      </div>
                    </td>
                  </tr>
                ) : rows.map((row: PatternT2up9Item) => {
                  const pctMaybe = (v: number | null | undefined) => {
                    if (v == null) return null;
                    return Math.abs(v) <= 1 ? v * 100 : v;
                  };

                  const t2Pct = pctMaybe(row.ret_t2);
                  const ret2dPct = pctMaybe(row.ret_2d);
                  const close = (row as any).close as number | null | undefined;
                  const amountYi = (row as any).amount_yi as number | null | undefined;
                  const amount = (row as any).amount as number | null | undefined;
                  const amountYiComputed = amountYi ?? (amount != null ? amount / 1e8 : null);

                  const pctStyle = (n: number | null) => ({
                    color: n == null ? 'var(--text-muted)' : n > 0 ? 'var(--up)' : n < 0 ? 'var(--down)' : 'var(--text-muted)',
                    fontWeight: 600,
                  });

                  const detail = openPatternStock(row.ts_code, row.name, '形态策略', (row.ret_t0 ?? 0) * 100);

                  return (
                    <tr key={row.ts_code} onClick={() => onOpen(detail)}>
                      <td className="c-sec numeric-muted">{row.ts_code}</td>
                      <td style={{ fontWeight: 500 }}>{row.name}<CrossTags tsCode={row.ts_code} currentStrategy="PATTERN_T2UP9" /></td>
                      <td className="center numeric-muted">{selectedDate}</td>
                      <td className="right numeric" style={pctStyle(t2Pct)}>
                        {t2Pct == null ? '--' : `${t2Pct > 0 ? '+' : ''}${t2Pct.toFixed(2)}%`}
                      </td>
                      <td className="right numeric" style={pctStyle(ret2dPct)}>
                        {ret2dPct == null ? '--' : `${ret2dPct > 0 ? '+' : ''}${ret2dPct.toFixed(2)}%`}
                      </td>
                      <td className="right numeric">{close != null ? close.toFixed(2) : '--'}</td>
                      <td className="right numeric c-muted">--</td>
                      <td className="right numeric">20</td>
                      <td className="right numeric">{amountYiComputed != null ? amountYiComputed.toFixed(2) : '--'}</td>
                      <td className="center c-muted">--</td>
                      <td className="center c-muted">--</td>
                      <td className="center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          title="承接"
                          style={{ background: 'rgba(59,130,246,0.10)', color: '#3B82F6', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer' }}
                          onClick={() => onOpen(detail)}
                        >
                          <ArrowRight size={15} />
                        </button>
                      </td>
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

function WeakBuyTable({ selectedDate, onOpen, listRef }: { selectedDate: string; onOpen: (stock: StockDetail) => void; listRef: React.RefObject<HTMLDivElement | null> }) {
  const { data, loading, error, refetch } = useApiData(() => fetchPatternWeakBuy(selectedDate), [selectedDate]);
  const rows = data ?? [];

  const minRet60 = rows.length ? Math.min(...rows.map(row => row.ret60_pct)) : null;
  const avgVolupDays = rows.length ? rows.reduce((sum, row) => sum + row.volup15_days, 0) / rows.length : null;

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>形态样本</div>
          <div className="stat-value c-red">{loading ? '--' : rows.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>最深超跌</div>
          <div className="stat-value c-blue">
            {loading ? '--' : (minRet60 != null ? formatWeakBuyPct(minRet60).text : '--')}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>平均放量天数</div>
          <div className="stat-value c-cyan">
            {loading ? '--' : (avgVolupDays != null ? avgVolupDays.toFixed(1) : '0.0')}
          </div>
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
          <div ref={listRef} className="strategy-list-container">
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
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">
                        <div className="empty-text">当前交易日没有弱市吸筹样本。</div>
                      </div>
                    </td>
                  </tr>
                ) : rows.map((row: PatternWeakBuyItem) => {
                  const ret60 = formatWeakBuyPct(row.ret60_pct);
                  const avgRet = formatWeakBuyPct(row.avg_ret_pct);
                  return (
                    <tr key={row.ts_code} onClick={() => onOpen(openPatternStock(row.ts_code, row.name, '弱市吸筹', row.ret60_pct != null ? row.ret60_pct * 100 : 0))}>
                      <td>
                        <div className="watchlist-cell-title">
                          {row.name}
                          <CrossTags tsCode={row.ts_code} currentStrategy="WEAK_BUY" />
                        </div>
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

export default function PatternScreen() {
  const { selectedDate } = useDate();
  const [mainTab, setMainTab] = useState<MainTab>('today');
  const [patternTab, setPatternTab] = useState<PatternTab>('t2');
  const [watchlistSub, setWatchlistSub] = useState<WatchlistSub>('PATTERN_T2UP9');
  const [selected, setSelected] = useState<StockDetail | null>(null);
  const [buyMode, setBuyMode] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);

  useEffect(() => {
    if (listRef.current && scrollPosRef.current > 0) {
      listRef.current.scrollTop = scrollPosRef.current;
    }
  }, [selected]);

  function handleOpen(stock: StockDetail) {
    if (listRef.current) scrollPosRef.current = listRef.current.scrollTop;
    setSelected(stock);
  }

  return (
    <div className="pattern-page" data-testid="pattern-page">
      <div className="page-tabs">
        <button type="button" className={`page-tab-btn${mainTab === 'today' ? ' active' : ''}`} onClick={() => setMainTab('today')}>
          今日样本
        </button>
        <button type="button" className={`page-tab-btn${mainTab === 'watchlist' ? ' active' : ''}`} onClick={() => setMainTab('watchlist')}>
          交易标的池承接
        </button>
      </div>

      {mainTab === 'watchlist' ? (
        <>
          <div className="page-tabs" style={{ marginBottom: 16 }}>
            <button type="button" className={`page-tab-btn${watchlistSub === 'PATTERN_T2UP9' ? ' active' : ''}`} onClick={() => setWatchlistSub('PATTERN_T2UP9')}>
              T-2 强势形态
            </button>
            <button type="button" className={`page-tab-btn${watchlistSub === 'WEAK_BUY' ? ' active' : ''}`} onClick={() => setWatchlistSub('WEAK_BUY')}>
              弱市吸筹
            </button>
          </div>

          <WatchlistTab
            key={watchlistSub}
            strategy={watchlistSub}
            onOpen={stock => {
              setBuyMode(false);
              setSelected(stock);
            }}
            onBuy={stock => {
              setBuyMode(true);
              setSelected(stock);
            }}
          />
        </>
      ) : (
        <>
          <div className="page-tabs" style={{ marginBottom: 16 }}>
            <button type="button" className={`page-tab-btn${patternTab === 't2' ? ' active' : ''}`} onClick={() => setPatternTab('t2')}>
              T-2 强势形态
            </button>
            <button type="button" className={`page-tab-btn${patternTab === 'weak_buy' ? ' active' : ''}`} onClick={() => setPatternTab('weak_buy')}>
              弱市吸筹
            </button>
          </div>

          {patternTab === 't2' ? <T2Table selectedDate={selectedDate} onOpen={handleOpen} listRef={listRef} /> : <WeakBuyTable selectedDate={selectedDate} onOpen={handleOpen} listRef={listRef} />}
        </>
      )}

      <StockDrawer
        stock={selected}
        autoOpenBuyForm={buyMode}
        onClose={() => {
          setSelected(null);
          setBuyMode(false);
        }}
      />
    </div>
  );
}
