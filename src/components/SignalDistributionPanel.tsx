import { useEffect, useState } from 'react';
import { fetchSignalSummary } from '../api';

const BUY_TYPES = [
  { key: 'BREAKOUT', name: '放量突破' },
  { key: 'VOL_CONFIRM', name: '缩量确认' },
  { key: 'PULLBACK', name: '回踩支撑' },
  { key: 'REHEAT', name: '冷却再启' },
];
const WARN_TYPES = [
  { key: 'WARN_MA_BREAK', name: '破位预警' },
  { key: 'WARN_VR_FADE', name: '量能衰竭' },
  { key: 'WARN_DRAWDOWN', name: '回撤预警' },
  { key: 'TAKE_PROFIT_50', name: '止盈提示' },
];
const SELL_TYPES = [
  { key: 'HARD_STOP', name: '硬止损' },
  { key: 'TRAILING_STOP', name: '跟踪止损' },
  { key: 'REGIME_SHIFT', name: '环境恶化' },
  { key: 'SECTOR_RETREAT', name: '板块退潮' },
  { key: 'VOL_COLLAPSE', name: '量能萎缩' },
  { key: 'TREND_BREAK', name: '趋势破位' },
  { key: 'TIME_DECAY', name: '时间衰减' },
];

const STRATEGY_CN: Record<string, string> = {
  VOL_SURGE: '能量蓄势', RETOC2: '异动策略', PATTERN_T2UP9: '形态策略', WEAK_BUY: '弱市吸筹',
};
function strategyName(v: string | null | undefined) {
  if (!v) return '-';
  return STRATEGY_CN[v] ?? v;
}

function fmt(v: number | null | undefined, suffix = '') {
  if (v == null) return '-';
  return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%' + suffix;
}

interface CardProps {
  title: string;
  total: number;
  color: string;
  types: { key: string; name: string }[];
  counts: Record<string, number>;
  details: any[];
  detailCols: { key: string; label: string; render?: (v: any) => string }[];
  conditionMap: Record<string, string>;
}

function SignalCard({ title, total, color, types, counts, details, detailCols, conditionMap }: CardProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="sdp-card">
      <div className="sdp-card-header" style={{ borderLeftColor: color }}>
        <span className="sdp-card-title">{title}</span>
        <span className="sdp-card-count" style={{ color }}>{total}</span>
      </div>
      <div className="sdp-card-body">
        {types.map(t => {
          const cnt = counts[t.key] || 0;
          const isExpanded = expanded === t.key;
          const hasData = cnt > 0;
          return (
            <div key={t.key}>
              <div
                className={`sdp-row${hasData ? ' sdp-row-active' : ''}`}
                onClick={() => hasData && setExpanded(isExpanded ? null : t.key)}
                style={{ cursor: hasData ? 'pointer' : 'default' }}
              >
                <span className="sdp-row-name">
                  {t.name}
                  {conditionMap[t.key] && (
                    <span className="sdp-info-tip">
                      <span className="sdp-info-icon">ⓘ</span>
                      <span className="sdp-info-tooltip">{conditionMap[t.key]}</span>
                    </span>
                  )}
                </span>
                <span className="sdp-row-cnt" style={{ color: hasData ? color : 'var(--text-muted)' }}>
                  {cnt}只
                </span>
              </div>
              {isExpanded && (
                <div className="sdp-expand">
                  <div className="sdp-expand-header">
                    {detailCols.map(c => <span key={c.key} className="sdp-expand-th">{c.label}</span>)}
                  </div>
                  {details
                    .filter(d => {
                      const sig = d.buy_signal || d.sell_signal || d.action_signal || '';
                      return sig === t.key;
                    })
                    .map((d, i) => (
                      <div key={i} className="sdp-expand-row">
                        {detailCols.map(c => (
                          <span key={c.key} className="sdp-expand-td">
                            {c.render ? c.render(d[c.key]) : (d[c.key] ?? '-')}
                          </span>
                        ))}
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SignalDistributionPanel() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchSignalSummary().then(setData).catch(() => {});
  }, []);

  if (!data) return null;

  const rules = data.rules || {};
  const buildCondMap = (arr: { signal: string; condition: string }[] | undefined) => {
    const m: Record<string, string> = {};
    (arr || []).forEach(r => { m[r.signal] = r.condition; });
    return m;
  };
  const buyCondMap = buildCondMap(rules.buy);
  const warnCondMap = buildCondMap(rules.warn);
  const sellCondMap = buildCondMap(rules.sell);

  return (
    <div className="sdp-panel">
      <SignalCard
        title="买点信号"
        total={data.buy_signals?.total ?? 0}
        color="var(--accent)"
        types={BUY_TYPES}
        counts={data.buy_signals || {}}
        details={data.buy_details || []}
        conditionMap={buyCondMap}
        detailCols={[
          { key: 'ts_code', label: '代码' },
          { key: 'name', label: '名称' },
          { key: 'strategy', label: '策略', render: v => strategyName(v) },
          { key: 'gain_since_entry', label: '涨幅', render: v => fmt(v) },
          { key: 'vr_today', label: 'VR', render: v => v != null ? Number(v).toFixed(2) : '-' },
        ]}
      />
      <SignalCard
        title="观察预警"
        total={data.watchlist_warns?.total ?? 0}
        color="var(--warn)"
        types={WARN_TYPES}
        counts={data.watchlist_warns || {}}
        details={data.warn_details || []}
        conditionMap={warnCondMap}
        detailCols={[
          { key: 'ts_code', label: '代码' },
          { key: 'name', label: '名称' },
          { key: 'strategy', label: '策略', render: v => strategyName(v) },
          { key: 'gain_since_entry', label: '涨幅', render: v => fmt(v) },
          { key: 'drawdown_from_peak', label: '回撤', render: v => v != null ? (Number(v) * 100).toFixed(1) + '%' : '-' },
        ]}
      />
      <SignalCard
        title="卖出信号"
        total={data.sell_signals?.total ?? 0}
        color="var(--critical)"
        types={SELL_TYPES}
        counts={data.sell_signals || {}}
        details={data.sell_details || []}
        conditionMap={sellCondMap}
        detailCols={[
          { key: 'ts_code', label: '代码' },
          { key: 'name', label: '名称' },
          { key: 'source_strategy', label: '策略', render: v => strategyName(v) },
          { key: 'unrealized_pnl_pct', label: '浮盈', render: v => fmt(v) },
          { key: 'drawdown_from_peak', label: '回撤', render: v => v != null ? (Number(v) * 100).toFixed(1) + '%' : '-' },
          { key: 'hold_days', label: '天数' },
        ]}
      />
    </div>
  );
}
