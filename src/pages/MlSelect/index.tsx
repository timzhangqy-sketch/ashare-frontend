import { useState } from 'react';
import StockDrawer from '../../components/Drawer/StockDrawer';
import WatchlistTab from '../../components/WatchlistTab';
import { useDate } from '../../context/useDate';
import { useApiData } from '../../hooks/useApiData';
import { fetchMlSelect, type MlSelectResponse, type MlSelectStock } from '../../api';
import { getMockDetail } from '../../utils/score';
import type { StockDetail } from '../../types/stock';

type MainTab = 'today' | 'watchlist';

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

function rankBg(rank: number): string | undefined {
  if (rank === 1) return 'rgba(255, 215, 0, 0.08)';
  if (rank === 2) return 'rgba(192, 192, 192, 0.06)';
  if (rank === 3) return 'rgba(205, 127, 50, 0.06)';
  return undefined;
}

function StatusBadge({ stock }: { stock: MlSelectStock }) {
  if (stock.in_portfolio) return <span style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6', padding: '2px 8px', borderRadius: '2px', fontSize: '11px', fontWeight: 500 }}>持仓</span>;
  if (stock.in_watchlist_strategy) return <span style={{ background: 'rgba(255,255,255,0.06)', color: '#c2c6d6', padding: '2px 8px', borderRadius: '2px', fontSize: '11px', fontWeight: 500 }}>{stock.in_watchlist_strategy}</span>;
  return <span style={{ background: 'rgba(168,85,247,0.15)', color: '#A855F7', padding: '2px 8px', borderRadius: '2px', fontSize: '11px', fontWeight: 500 }}>ML发现</span>;
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

function MlSelectContent({ selectedDate, onOpen }: { selectedDate: string; onOpen: (stock: StockDetail) => void }) {
  const { data, loading, error, refetch } = useApiData<MlSelectResponse>(() => fetchMlSelect(selectedDate), [selectedDate]);
  const stocks = data?.stocks ?? [];
  const model = data?.model ?? null;
  const featImp = data?.feature_importance ?? [];
  const stats = data?.stats ?? null;
  const maxScore = stocks.length ? Math.max(...stocks.map(s => s.ml_score)) : 1;
  const maxImp = featImp.length ? Math.max(...featImp.map(f => f.importance)) : 1;

  return (
    <>
      {/* KPI Strip */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>扫描股票数</div>
          <div className="stat-value c-blue">{loading ? '--' : (stats?.total_scored ?? '--')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>模型版本</div>
          <div className="stat-value" style={{ fontSize: '14px', color: '#c2c6d6' }}>{loading ? '--' : (model?.version ?? '--')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: '#c2c6d6' }}>NDCG@5</div>
          <div className="stat-value c-cyan">{loading ? '--' : (model ? (Number(model.ndcg_at_5) * 100).toFixed(1) + '%' : '--')}</div>
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
          {/* Main Table */}
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
                      <th className="right">涨跌幅</th>
                      <th className="right">收盘价</th>
                      <th className="right">PE</th>
                      <th className="right">PB</th>
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
                        onClick={() => onOpen(getMockDetail(s.ts_code, s.name, ['ML智能选股'], s.close ?? 0, 0))}>
                        <td className="center" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: s.ml_rank <= 3 ? 600 : 400 }}>{s.ml_rank}</td>
                        <td className="c-sec numeric-muted">{s.ts_code}</td>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td className="right" style={{ minWidth: '100px' }}><ScoreBar score={s.ml_score} maxScore={maxScore} /></td>
                        <td className="right numeric" style={{ color: pnlColor(s.pct_chg), fontWeight: 500 }}>{s.pct_chg != null ? (s.pct_chg > 0 ? '+' : '') + fmt(s.pct_chg) + '%' : '--'}</td>
                        <td className="right numeric">{fmt(s.close)}</td>
                        <td className="right numeric">{fmt(s.pe)}</td>
                        <td className="right numeric">{fmt(s.pb)}</td>
                        <td className="right numeric">{s.turnover_rate_f != null ? fmt(s.turnover_rate_f) + '%' : '--'}</td>
                        <td className="right numeric">{s.circ_mv_yi != null ? fmt(s.circ_mv_yi, 1) + '亿' : '--'}</td>
                        <td>{s.industry ?? '--'}</td>
                        <td>
                          {s.primary_concept ? (
                            <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '2px', padding: '2px 8px', fontSize: '12px', color: '#c2c6d6' }}>
                              {s.primary_concept}
                            </span>
                          ) : <span style={{ color: '#8c909f' }}>--</span>}
                        </td>
                        <td className="center"><StatusBadge stock={s} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Feature Importance Panel */}
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

      {/* Model Info Footer */}
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

export default function MlSelectPage() {
  const { selectedDate } = useDate();
  const [mainTab, setMainTab] = useState<MainTab>('today');
  const [selected, setSelected] = useState<StockDetail | null>(null);
  const [buyMode, setBuyMode] = useState(false);

  return (
    <div>
      <div className="page-tabs">
        <button type="button" className={`page-tab-btn${mainTab === 'today' ? ' active' : ''}`} onClick={() => setMainTab('today')}>ML选股排行</button>
        <button type="button" className={`page-tab-btn${mainTab === 'watchlist' ? ' active' : ''}`} onClick={() => setMainTab('watchlist')}>持续观察池</button>
      </div>
      {mainTab === 'watchlist' ? (
        <WatchlistTab strategy="ML_SELECT" onOpen={(stock) => { setBuyMode(false); setSelected(stock); }} onBuy={(stock) => { setBuyMode(true); setSelected(stock); }} />
      ) : (
        <MlSelectContent selectedDate={selectedDate} onOpen={(stock) => { setBuyMode(false); setSelected(stock); }} />
      )}
      <StockDrawer stock={selected} autoOpenBuyForm={buyMode} onClose={() => { setSelected(null); setBuyMode(false); }} />
    </div>
  );
}
