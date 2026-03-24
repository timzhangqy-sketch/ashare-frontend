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

function topNonZero(counts: Record<string, number>, cnMap: Record<string, string>, n = 3): string {
  return Object.entries(counts)
    .filter(([k, v]) => v > 0 && k !== 'total' && cnMap[k])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${cnMap[k]}${v}`)
    .join(' ');
}

export default function SignalSummaryBar() {
  const [data, setData] = useState<any>(null);
  const [showRules, setShowRules] = useState(false);

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

  return (
    <>
      <div className="signal-summary-bar">
        <div className="ssb-group">
          <span className="ssb-label" style={{ color: buyTotal > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
            买点 {buyTotal}只
          </span>
          {buyDetail && <span className="ssb-detail" style={{ color: 'var(--accent)' }}>({buyDetail})</span>}
        </div>
        <span className="ssb-sep">|</span>
        <div className="ssb-group">
          <span className="ssb-label" style={{ color: warnTotal > 0 ? 'var(--warn)' : 'var(--text-muted)' }}>
            预警 {warnTotal}只
          </span>
          {warnDetail && <span className="ssb-detail" style={{ color: 'var(--warn)' }}>({warnDetail})</span>}
        </div>
        <span className="ssb-sep">|</span>
        <div className="ssb-group">
          <span className="ssb-label" style={{ color: sellTotal > 0 ? 'var(--critical)' : 'var(--text-muted)' }}>
            卖点 {sellTotal}只
          </span>
          {sellDetail && <span className="ssb-detail" style={{ color: 'var(--critical)' }}>({sellDetail})</span>}
        </div>
        <button className="ssb-rules-btn" onClick={() => setShowRules(true)}>📋规则</button>
      </div>
      {showRules && data.rules && (
        <SignalRulesModal rules={data.rules} onClose={() => setShowRules(false)} />
      )}
    </>
  );
}
