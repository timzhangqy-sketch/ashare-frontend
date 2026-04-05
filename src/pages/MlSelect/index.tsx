import { useState } from 'react';
import StockDrawer from '../../components/Drawer/StockDrawer';
import { useDate } from '../../context/useDate';
import { useApiData } from '../../hooks/useApiData';
import {
  fetchMlSelect, fetchMlSelectWatch, fetchMlSelectTriggered,
  type MlSelectResponse, type MlSelectStock,
  type MlSelectWatchResponse, type MlSelectWatchStock,
  type MlSelectTriggeredResponse, type MlSelectTriggeredStock,
} from '../../api';
import { getMockDetail } from '../../utils/score';
import type { StockDetail } from '../../types/stock';

type MainTab = 'daily' | 'watch' | 'triggered';

const FEATURE_CN: Record<string, string> = {
  std_20: '20日波动率', std_10: '10日波动率', std_5: '5日波动率', std_60: '60日波动率',
  pe: '市盈率', pb: '市净率',
  circ_mv_rank: '流通市值排名', total_mv_rank: '总市值排名', amount_rank: '成交额排名',
  cma_60: '60日均线偏离', cma_20: '20日均线偏离', cma_10: '10日均线偏离', cma_5: '5日均线偏离',
  klen: 'K线振幅', kmid: 'K线实体', kupper: '上影线', klower: '下影线',
  roc_60: '60日动量', roc_20: '20日动量', roc_10: '10日动量', roc_5: '5日动量',
  corr_10: '10日量价相关', corr_5: '5日量价相关',
  min_60: '60日最低支撑', min_20: '20日最低支撑', min_10: '10日最低支撑', min_5: '5日最低支撑',
  max_60: '60日最高距离', max_20: '20日最高距离',
  vroc_60: '60日量比', vroc_20: '20日量比', vroc_10: '10日量比', vroc_5: '5日量比',
  turnover_rate_f: '换手率', industry_encoded: '行业编码',
  mkt_adr: '涨跌比', mkt_strong_count: '强势股数', mkt_breadth_score: '市场宽度分',
  mkt_regime_encoded: '市场环境', mkt_ud_ratio: '涨跌停比',
};

const fmt = (v: number | null | undefined, d = 2) => v != null ? Number(v).toFixed(d) : '--';
const pnlColor = (v: number | null | undefined) =>
  v == null ? '#8c909f' : v > 0 ? '#ff5451' : v < 0 ? '#22C55E' : '#8c909f';
const pnlText = (v: number | null | undefined) =>
  v != null ? (v > 0 ? '+' : '') + fmt(v) + '%' : '--';

function rankBg(rank: number): string | undefined {
  if (rank === 1) return 'rgba(255, 215, 0, 0.08)';
  if (rank === 2) return 'rgba(192, 192, 192, 0.06)';
  if (rank === 3) return 'rgba(205, 127, 50, 0.06)';
  return undefined;
}

function ConceptBadge({ concept }: { concept: string | null }) {
  if (!concept) return <span style={{ color: '#8c909f' }}>--</span>;
  return (
    <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '2px', padding: '2px 8px', fontSize: '12px', color: '#c2c6d6' }}>
      {concept}
    </span>
  );
}

function DailyStatusBadge({ stock }: { stock: MlSelectStock }) {
  if (stock.in_portfolio) return <span style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6', padding: '2px 8px', borderRadius: '2px', fontSize: '11px', fontWeight: 500 }}>持仓</span>;
  if (stock.in_ml_watch) return <span style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', padding: '2px 8px', borderRadius: '2px', fontSize: '11px', fontWeight: 500 }}>观察中</span>;
  if (stock.in_watchlist_strategy) return <span style={{ background: 'rgba(255,255,255,0.06)', color: '#c2c6d6', padding: '2px 8px', borderRadius: '2px', fontSize: '11px', fontWeight: 500 }}>{stock.in_watchlist_strategy}</span>;
  return null;
}

function ScoreBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = maxScore > 0 ? Math.max(0, Math.min(100, (score / maxScore) * 100)) : 0;
  return (
    <div style={{ position: 'relative', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'linear-gradient(90deg, rgba(59,130,246,0.2), transparent)', borderRadius: '1px' }} />
      <span style={{ position: 'relative', zIndex: 1 }}>{score.toFixed(4)}</span>
    </div>
  );
}

function openStock(ts_code: string, name: string, close: number | null, onOpen: (s: StockDetail) => void) {
  onOpen(getMockDetail(ts_code, name, ['ML智能选股'], close ?? 0, 0));
}

// ══════════════════════════════════════════
// Tab 1: 每日入选
// ══════════════════════════════════════════

function DailyTab({ selectedDate, onOpen }: { selectedDate: string; onOpen: (s: StockDetail) => void }) {
  const { data, loading, error, refetch } = useApiData<MlSelectResponse>(() => fetchMlSelect(selectedDate), [selectedDate]);
  const stocks = data?.stocks ?? [];
  const model = data?.model ?? null;
  const featImp = data?.feature_importance ?? [];
  const stats = data?.stats ?? null;
  const maxScore = stocks.length ? Math.max(...stocks.map(s => s.ml_score)) : 1;
  const maxImp = featImp.length ? Math.max(...featImp.map(f => f.importance)) : 1;

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>扫描股票数</div>
          <div className="stat-value c-blue">{loading ? '--' : (stats?.total_scored ?? '--')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>入选数</div>
          <div className="stat-value c-red">{loading ? '--' : (stats?.daily_count ?? '--')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>模型版本</div>
          <div className="stat-value" style={{ fontSize: '14px', color: '#c2c6d6' }}>{loading ? '--' : (model?.version ?? '--')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>Top3命中率</div>
          <div className="stat-value" style={{ color: model && Number(model.top3_hit_rate) > 0.5 ? 'var(--up)' : 'var(--text-muted)' }}>
            {loading ? '--' : (model ? (Number(model.top3_hit_rate) * 100).toFixed(1) + '%' : '--')}
          </div>
        </div>
      </div>

      {loading ? <div className="page-loading"><div className="spinner" />加载中...</div> : null}
      {!loading && error ? (
        <div className="page-error">
          <div className="page-error-msg">ML选股数据加载失败</div>
          <div className="page-error-detail">{error}</div>
          <button className="retry-btn" onClick={refetch}>重试</button>
        </div>
      ) : null}

      {!loading && !error ? (
        <div style={{ display: 'flex', gap: '12px' }}>
          <section className="card" style={{ flex: '3 1 0' }}>
            <div className="strategy-list-container">
              <div className="table-shell data-table-shell">
                <table className="data-table" style={{ tableLayout: 'auto' }}>
                  <thead>
                    <tr>
                      <th className="center" style={{ width: '48px' }}>排名</th>
                      <th>代码</th>
                      <th>名称</th>
                      <th className="right">ML分数</th>
                      <th className="right">连续天数</th>
                      <th className="right">涨跌幅</th>
                      <th className="right">收盘价</th>
                      <th className="right">PE</th>
                      <th className="right">换手率</th>
                      <th className="right">流通市值</th>
                      <th>行业</th>
                      <th>概念</th>
                      <th className="center">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stocks.length === 0 ? (
                      <tr><td colSpan={13}><div className="empty-state"><div className="empty-text">当前交易日没有ML选股数据</div></div></td></tr>
                    ) : stocks.map((s: MlSelectStock) => (
                      <tr key={s.ts_code} style={{ background: rankBg(s.ml_rank), cursor: 'pointer' }}
                        onClick={() => openStock(s.ts_code, s.name, s.close, onOpen)}>
                        <td className="center" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: s.ml_rank <= 3 ? 600 : 400 }}>{s.ml_rank}</td>
                        <td className="c-sec numeric-muted">{s.ts_code}</td>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td className="right" style={{ minWidth: '100px' }}><ScoreBar score={s.ml_score} maxScore={maxScore} /></td>
                        <td className="right numeric" style={{ color: s.consecutive_days >= 2 ? '#F59E0B' : undefined, fontWeight: s.consecutive_days >= 2 ? 600 : 400, fontFamily: "'JetBrains Mono', monospace" }}>{s.consecutive_days}</td>
                        <td className="right numeric" style={{ color: pnlColor(s.pct_chg), fontWeight: 500 }}>{pnlText(s.pct_chg)}</td>
                        <td className="right numeric">{fmt(s.close)}</td>
                        <td className="right numeric">{fmt(s.pe)}</td>
                        <td className="right numeric">{s.turnover_rate_f != null ? fmt(s.turnover_rate_f) + '%' : '--'}</td>
                        <td className="right numeric">{s.circ_mv_yi != null ? fmt(s.circ_mv_yi, 1) + '亿' : '--'}</td>
                        <td>{s.industry ?? '--'}</td>
                        <td><ConceptBadge concept={s.primary_concept} /></td>
                        <td className="center"><DailyStatusBadge stock={s} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="card" style={{ flex: '1 1 0', minWidth: '220px' }}>
            <div style={{ padding: '12px 16px 8px', fontWeight: 600, fontSize: '13px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
              模型特征重要性 Top 10
            </div>
            <div style={{ padding: '8px 16px 12px' }}>
              {featImp.map(f => (
                <div key={f.feature} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                  <span style={{ flex: '0 0 100px', fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.feature}>
                    {FEATURE_CN[f.feature] || f.feature}
                  </span>
                  <div style={{ flex: 1, height: '6px', background: 'var(--bg-hover)', borderRadius: '1px', overflow: 'hidden' }}>
                    <div style={{ width: `${(f.importance / maxImp) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #3B82F6, rgba(59,130,246,0.3))', borderRadius: '1px' }} />
                  </div>
                  <span style={{ flex: '0 0 36px', fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)', textAlign: 'right' }}>{f.importance}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {!loading && model ? (
        <div style={{ marginTop: '8px', padding: '8px 16px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '24px' }}>
          <span>训练样本: {Number(model.training_samples).toLocaleString()}</span>
          <span>特征数: {model.n_features}</span>
          <span>最佳迭代: {model.best_iteration}</span>
          <span>训练时间: {model.trained_at}</span>
        </div>
      ) : null}
    </>
  );
}

// ══════════════════════════════════════════
// Tab 2: 持续观察池
// ══════════════════════════════════════════

function WatchTab({ selectedDate, onOpen }: { selectedDate: string; onOpen: (s: StockDetail) => void }) {
  const { data, loading, error, refetch } = useApiData<MlSelectWatchResponse>(() => fetchMlSelectWatch(selectedDate), [selectedDate]);
  const stocks = data?.stocks ?? [];
  const stats = data?.stats ?? { active_count: 0, triggered_count: 0, expired_count: 0 };

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>观察中</div>
          <div className="stat-value c-gold">{loading ? '--' : stats.active_count}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>已触发</div>
          <div className="stat-value c-red">{loading ? '--' : stats.triggered_count}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>已淘汰</div>
          <div className="stat-value c-muted">{loading ? '--' : stats.expired_count}</div>
        </div>
      </div>

      {loading ? <div className="page-loading"><div className="spinner" />加载中...</div> : null}
      {!loading && error ? (
        <div className="page-error">
          <div className="page-error-msg">观察池数据加载失败</div>
          <div className="page-error-detail">{error}</div>
          <button className="retry-btn" onClick={refetch}>重试</button>
        </div>
      ) : null}

      {!loading && !error ? (
        <section className="card">
          <div className="strategy-list-container">
            <div className="table-shell data-table-shell">
              <table className="data-table" style={{ tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th>代码</th>
                    <th>名称</th>
                    <th>概念</th>
                    <th>入池日</th>
                    <th className="right">入池排名</th>
                    <th className="right">入池分数</th>
                    <th className="right">最新排名</th>
                    <th className="right">最新分数</th>
                    <th className="right">观察天数</th>
                    <th className="right">涨跌幅</th>
                    <th className="right">换手率</th>
                    <th className="right">流通市值</th>
                    <th>行业</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.length === 0 ? (
                    <tr><td colSpan={13}>
                      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                        暂无观察中的股票。需要连续2天进入每日入选Top 20才会进入观察池。
                      </div>
                    </td></tr>
                  ) : stocks.map((s: MlSelectWatchStock) => {
                    const rankDiff = s.latest_rank != null && s.entry_rank != null ? s.entry_rank - s.latest_rank : 0;
                    return (
                      <tr key={s.ts_code + s.entry_date} style={{ cursor: 'pointer' }}
                        onClick={() => openStock(s.ts_code, s.name, s.close, onOpen)}>
                        <td className="c-sec numeric-muted">{s.ts_code}</td>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td><ConceptBadge concept={s.primary_concept} /></td>
                        <td className="numeric-muted">{s.entry_date}</td>
                        <td className="right numeric">{s.entry_rank}</td>
                        <td className="right numeric" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>{fmt(s.entry_score, 4)}</td>
                        <td className="right numeric">
                          {s.latest_rank ?? '--'}
                          {rankDiff > 0 && <span style={{ color: '#22C55E', fontSize: '11px', marginLeft: '2px' }}>↑</span>}
                          {rankDiff < 0 && <span style={{ color: '#ff5451', fontSize: '11px', marginLeft: '2px' }}>↓</span>}
                        </td>
                        <td className="right numeric" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>{fmt(s.latest_score, 4)}</td>
                        <td className="right numeric">{s.watch_days}</td>
                        <td className="right numeric" style={{ color: pnlColor(s.pct_chg), fontWeight: 500 }}>{pnlText(s.pct_chg)}</td>
                        <td className="right numeric">{s.turnover_rate_f != null ? fmt(s.turnover_rate_f) + '%' : '--'}</td>
                        <td className="right numeric">{s.circ_mv_yi != null ? fmt(s.circ_mv_yi, 1) + '亿' : '--'}</td>
                        <td>{s.industry ?? '--'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

// ══════════════════════════════════════════
// Tab 3: 交易标的池
// ══════════════════════════════════════════

function TriggeredTab({ selectedDate, onOpen }: { selectedDate: string; onOpen: (s: StockDetail) => void }) {
  const { data, loading, error, refetch } = useApiData<MlSelectTriggeredResponse>(() => fetchMlSelectTriggered(selectedDate), [selectedDate]);
  const stocks = data?.stocks ?? [];

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>交易标的数</div>
          <div className="stat-value c-red">{loading ? '--' : stocks.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>数据来源</div>
          <div className="stat-value" style={{ fontSize: '14px', color: '#c2c6d6' }}>真实数据</div>
        </div>
      </div>

      {loading ? <div className="page-loading"><div className="spinner" />加载中...</div> : null}
      {!loading && error ? (
        <div className="page-error">
          <div className="page-error-msg">交易标的数据加载失败</div>
          <div className="page-error-detail">{error}</div>
          <button className="retry-btn" onClick={refetch}>重试</button>
        </div>
      ) : null}

      {!loading && !error ? (
        <section className="card">
          <div className="strategy-list-container">
            <div className="table-shell data-table-shell">
              <table className="data-table" style={{ tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th>代码</th>
                    <th>名称</th>
                    <th>概念</th>
                    <th>入池日</th>
                    <th className="right">涨跌幅</th>
                    <th className="right">收盘价</th>
                    <th className="right">换手率</th>
                    <th className="right">流通市值</th>
                    <th>行业</th>
                    <th className="center">买入信号</th>
                    <th className="center">卖出信号</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.length === 0 ? (
                    <tr><td colSpan={11}>
                      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                        暂无ML选股的交易标的。股票需经过每日入选→持续观察→触发确认三级流程才会进入此池。
                      </div>
                    </td></tr>
                  ) : stocks.map((s: MlSelectTriggeredStock) => (
                    <tr key={s.ts_code + s.entry_date} style={{ cursor: 'pointer' }}
                      onClick={() => openStock(s.ts_code, s.name, s.close, onOpen)}>
                      <td className="c-sec numeric-muted">{s.ts_code}</td>
                      <td style={{ fontWeight: 500 }}>{s.name}</td>
                      <td><ConceptBadge concept={s.primary_concept} /></td>
                      <td className="numeric-muted">{s.entry_date}</td>
                      <td className="right numeric" style={{ color: pnlColor(s.pct_chg), fontWeight: 500 }}>{pnlText(s.pct_chg)}</td>
                      <td className="right numeric">{fmt(s.close)}</td>
                      <td className="right numeric">{s.turnover_rate_f != null ? fmt(s.turnover_rate_f) + '%' : '--'}</td>
                      <td className="right numeric">{s.circ_mv_yi != null ? fmt(s.circ_mv_yi, 1) + '亿' : '--'}</td>
                      <td>{s.industry ?? '--'}</td>
                      <td className="center">{s.buy_signal ? <span className="status-badge source-badge source-badge-info">{s.buy_signal}</span> : '--'}</td>
                      <td className="center">{s.sell_signal ? <span className="status-badge source-badge source-badge-warning">{s.sell_signal}</span> : '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

// ══════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════

export default function MlSelectPage() {
  const { selectedDate } = useDate();
  const [mainTab, setMainTab] = useState<MainTab>('daily');
  const [selected, setSelected] = useState<StockDetail | null>(null);

  const onOpen = (stock: StockDetail) => setSelected(stock);

  return (
    <div>
      <div className="page-tabs">
        <button type="button" className={`page-tab-btn${mainTab === 'daily' ? ' active' : ''}`} onClick={() => setMainTab('daily')}>每日入选</button>
        <button type="button" className={`page-tab-btn${mainTab === 'watch' ? ' active' : ''}`} onClick={() => setMainTab('watch')}>持续观察池</button>
        <button type="button" className={`page-tab-btn${mainTab === 'triggered' ? ' active' : ''}`} onClick={() => setMainTab('triggered')}>交易标的池</button>
      </div>
      {mainTab === 'daily' && <DailyTab selectedDate={selectedDate} onOpen={onOpen} />}
      {mainTab === 'watch' && <WatchTab selectedDate={selectedDate} onOpen={onOpen} />}
      {mainTab === 'triggered' && <TriggeredTab selectedDate={selectedDate} onOpen={onOpen} />}
      <StockDrawer stock={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
