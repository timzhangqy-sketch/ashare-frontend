import { useEffect, useState } from 'react';
import { fetchSignalSummary } from '../api';
import SignalRulesModal from './SignalRulesModal';

const WARN_CN: Record<string, string> = {
  WARN_MA_BREAK: '破位', WARN_VR_FADE: '量衰', WARN_DRAWDOWN: '回撤', TAKE_PROFIT_50: '止盈',
};
const BUY_CN: Record<string, string> = {
  BREAKOUT: '突破', VOL_CONFIRM: '确认', PULLBACK: '回踩', REHEAT: '再启',
};
const SELL_CN: Record<string, string> = {
  HARD_STOP: '止损', TRAILING_STOP: '回撤止损', REGIME_SHIFT: '环境',
  SECTOR_RETREAT: '板块', VOL_COLLAPSE: '缩量', TREND_BREAK: '破位', TIME_DECAY: '衰减',
};
const STRATEGY_CN: Record<string, string> = {
  VOL_SURGE: '能量蓄势', RETOC2: '异动策略', PATTERN_T2UP9: '形态策略', WEAK_BUY: '弱市吸筹',
};

function topNonZero(counts: Record<string, number>, cnMap: Record<string, string>, n = 3): string {
  return Object.entries(counts)
    .filter(([k, v]) => v > 0 && k !== 'total' && cnMap[k])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${cnMap[k]}${v}`)
    .join(' ');
}

function pnlColor(v: number | null | undefined) {
  if (v == null || v === 0) return 'var(--text-secondary)';
  return v > 0 ? 'var(--up)' : 'var(--down)';
}
function fmtPct(v: number | null | undefined) {
  if (v == null) return '-';
  return (v >= 0 ? '+' : '') + (Number(v) * 100).toFixed(1) + '%';
}
function strat(v: string | null | undefined) {
  return v ? (STRATEGY_CN[v] ?? v) : '-';
}

type PanelKey = 'buy' | 'warn' | 'sell';

export default function SignalSummaryBar() {
  const [data, setData] = useState<any>(null);
  const [showRules, setShowRules] = useState(false);
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);

  useEffect(() => {
    fetchSignalSummary().then(setData).catch(() => {});
  }, []);

  if (!data) return null;

  const buyTotal = data.buy_signals?.total ?? 0;
  const warnTotal = data.watchlist_warns?.total ?? 0;
  const sellTotal = data.sell_signals?.total ?? 0;

  const buyDetail = topNonZero(data.buy_signals || {}, BUY_CN);
  const warnDetail = topNonZero(data.watchlist_warns || {}, WARN_CN);
  const sellDetail = topNonZero(data.sell_signals || {}, SELL_CN);

  const toggle = (key: PanelKey, total: number) => {
    if (total <= 0) return;
    setOpenPanel(prev => prev === key ? null : key);
  };

  const renderPanel = () => {
    if (!openPanel) return null;

    if (openPanel === 'warn') {
      const rows = data.warn_details || [];
      return (
        <div className="ssb-dropdown">
          <div className="ssb-dd-header">
            <span className="ssb-dd-th" style={{ flex: 1 }}>代码</span>
            <span className="ssb-dd-th" style={{ flex: 1.2 }}>名称</span>
            <span className="ssb-dd-th" style={{ flex: 1 }}>策略</span>
            <span className="ssb-dd-th" style={{ flex: 0.8 }}>预警类型</span>
            <span className="ssb-dd-th" style={{ flex: 0.7 }}>涨幅</span>
            <span className="ssb-dd-th" style={{ flex: 0.7 }}>回撤</span>
          </div>
          {rows.map((r: any, i: number) => (
            <div key={i} className="ssb-dd-row">
              <span className="ssb-dd-td" style={{ flex: 1 }}>{r.ts_code ?? '-'}</span>
              <span className="ssb-dd-td" style={{ flex: 1.2 }}>{r.name ?? '-'}</span>
              <span className="ssb-dd-td" style={{ flex: 1 }}>{strat(r.strategy)}</span>
              <span className="ssb-dd-td" style={{ flex: 0.8, color: 'var(--warn)' }}>{WARN_CN[r.sell_signal] ?? r.sell_signal ?? '-'}</span>
              <span className="ssb-dd-td" style={{ flex: 0.7, color: pnlColor(r.gain_since_entry) }}>{fmtPct(r.gain_since_entry)}</span>
              <span className="ssb-dd-td" style={{ flex: 0.7 }}>{r.drawdown_from_peak != null ? (Number(r.drawdown_from_peak) * 100).toFixed(1) + '%' : '-'}</span>
            </div>
          ))}
          {rows.length === 0 && <div className="ssb-dd-empty">暂无数据</div>}
        </div>
      );
    }

    if (openPanel === 'buy') {
      const rows = data.buy_details || [];
      return (
        <div className="ssb-dropdown">
          <div className="ssb-dd-header">
            <span className="ssb-dd-th" style={{ flex: 1 }}>代码</span>
            <span className="ssb-dd-th" style={{ flex: 1.2 }}>名称</span>
            <span className="ssb-dd-th" style={{ flex: 1 }}>策略</span>
            <span className="ssb-dd-th" style={{ flex: 0.8 }}>信号类型</span>
            <span className="ssb-dd-th" style={{ flex: 0.7 }}>涨幅</span>
            <span className="ssb-dd-th" style={{ flex: 0.6 }}>VR</span>
          </div>
          {rows.map((r: any, i: number) => (
            <div key={i} className="ssb-dd-row">
              <span className="ssb-dd-td" style={{ flex: 1 }}>{r.ts_code ?? '-'}</span>
              <span className="ssb-dd-td" style={{ flex: 1.2 }}>{r.name ?? '-'}</span>
              <span className="ssb-dd-td" style={{ flex: 1 }}>{strat(r.strategy)}</span>
              <span className="ssb-dd-td" style={{ flex: 0.8, color: 'var(--accent)' }}>{BUY_CN[r.buy_signal] ?? r.buy_signal ?? '-'}</span>
              <span className="ssb-dd-td" style={{ flex: 0.7, color: pnlColor(r.gain_since_entry) }}>{fmtPct(r.gain_since_entry)}</span>
              <span className="ssb-dd-td" style={{ flex: 0.6 }}>{r.vr_today != null ? Number(r.vr_today).toFixed(2) : '-'}</span>
            </div>
          ))}
          {rows.length === 0 && <div className="ssb-dd-empty">暂无数据</div>}
        </div>
      );
    }

    if (openPanel === 'sell') {
      const rows = data.sell_details || [];
      return (
        <div className="ssb-dropdown">
          <div className="ssb-dd-header">
            <span className="ssb-dd-th" style={{ flex: 1 }}>代码</span>
            <span className="ssb-dd-th" style={{ flex: 1.1 }}>名称</span>
            <span className="ssb-dd-th" style={{ flex: 0.9 }}>策略</span>
            <span className="ssb-dd-th" style={{ flex: 0.8 }}>信号类型</span>
            <span className="ssb-dd-th" style={{ flex: 0.7 }}>浮盈</span>
            <span className="ssb-dd-th" style={{ flex: 0.6 }}>回撤</span>
            <span className="ssb-dd-th" style={{ flex: 0.5 }}>天数</span>
          </div>
          {rows.map((r: any, i: number) => (
            <div key={i} className="ssb-dd-row">
              <span className="ssb-dd-td" style={{ flex: 1 }}>{r.ts_code ?? '-'}</span>
              <span className="ssb-dd-td" style={{ flex: 1.1 }}>{r.name ?? '-'}</span>
              <span className="ssb-dd-td" style={{ flex: 0.9 }}>{strat(r.source_strategy)}</span>
              <span className="ssb-dd-td" style={{ flex: 0.8, color: 'var(--critical)' }}>{SELL_CN[r.action_signal] ?? r.action_signal ?? '-'}</span>
              <span className="ssb-dd-td" style={{ flex: 0.7, color: pnlColor(r.unrealized_pnl_pct) }}>{fmtPct(r.unrealized_pnl_pct)}</span>
              <span className="ssb-dd-td" style={{ flex: 0.6 }}>{r.drawdown_from_peak != null ? (Number(r.drawdown_from_peak) * 100).toFixed(1) + '%' : '-'}</span>
              <span className="ssb-dd-td" style={{ flex: 0.5 }}>{r.hold_days ?? '-'}</span>
            </div>
          ))}
          {rows.length === 0 && <div className="ssb-dd-empty">暂无数据</div>}
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div className={`signal-summary-bar${openPanel ? ' ssb-expanded' : ''}`}>
        <div
          className={`ssb-group${buyTotal > 0 ? ' ssb-clickable' : ''}${openPanel === 'buy' ? ' ssb-active' : ''}`}
          onClick={() => toggle('buy', buyTotal)}
        >
          <span className="ssb-label" style={{ color: buyTotal > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
            买点 {buyTotal}只
          </span>
          {buyDetail && <span className="ssb-detail" style={{ color: 'var(--accent)' }}>({buyDetail})</span>}
          {openPanel === 'buy' && <span className="ssb-arrow">▾</span>}
        </div>
        <span className="ssb-sep">|</span>
        <div
          className={`ssb-group${warnTotal > 0 ? ' ssb-clickable' : ''}${openPanel === 'warn' ? ' ssb-active' : ''}`}
          onClick={() => toggle('warn', warnTotal)}
        >
          <span className="ssb-label" style={{ color: warnTotal > 0 ? 'var(--warn)' : 'var(--text-muted)' }}>
            预警 {warnTotal}只
          </span>
          {warnDetail && <span className="ssb-detail" style={{ color: 'var(--warn)' }}>({warnDetail})</span>}
          {openPanel === 'warn' && <span className="ssb-arrow">▾</span>}
        </div>
        <span className="ssb-sep">|</span>
        <div
          className={`ssb-group${sellTotal > 0 ? ' ssb-clickable' : ''}${openPanel === 'sell' ? ' ssb-active' : ''}`}
          onClick={() => toggle('sell', sellTotal)}
        >
          <span className="ssb-label" style={{ color: sellTotal > 0 ? 'var(--critical)' : 'var(--text-muted)' }}>
            卖点 {sellTotal}只
          </span>
          {sellDetail && <span className="ssb-detail" style={{ color: 'var(--critical)' }}>({sellDetail})</span>}
          {openPanel === 'sell' && <span className="ssb-arrow">▾</span>}
        </div>
        <button className="ssb-rules-btn" onClick={() => setShowRules(true)}>📋规则</button>
      </div>
      {renderPanel()}
      {showRules && data.rules && (
        <SignalRulesModal rules={data.rules} onClose={() => setShowRules(false)} />
      )}
    </>
  );
}
