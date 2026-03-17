import { CrossTags } from './CrossTags';
import WatchlistActionMenu from './WatchlistActionMenu';
import WatchlistStatusBadge from './WatchlistStatusBadge';
import type { WatchlistActionVm, WatchlistGroupVm, WatchlistRowVm } from '../types/watchlist';
import { displaySignalLabel, displayStrategyLabel } from '../utils/labelMaps';

const formatDay = (d: number | null | undefined): string => {
  if (d == null) return '--';
  return `${d}天`;
};

const formatPrice = (v: number | null | undefined): string => {
  if (v == null) return '--';
  return Number(v).toFixed(2);
};

const formatPct = (v: number | null | undefined): string => {
  if (v == null) return '--';
  const pct = (v * 100).toFixed(2);
  return v >= 0 ? `+${pct}%` : `${pct}%`;
};

const pctColor = (v: number | null | undefined): string => {
  if (v == null || v === 0) return 'var(--text-muted)';
  return v > 0 ? 'var(--up)' : 'var(--down)';
};

const formatVr = (v: number | null | undefined): string => {
  if (v == null) return '--';
  return Number(v).toFixed(2);
};

export default function WatchlistGroupView({
  groups,
  selectedCode,
  onSelect,
  onAction,
}: {
  groups: WatchlistGroupVm[];
  selectedCode: string | null;
  onSelect: (row: WatchlistRowVm) => void;
  onAction: (row: WatchlistRowVm, action: WatchlistActionVm) => void;
}) {
  return (
    <div className="watchlist-group-view">
      {groups.map((group) => (
        <section key={group.key} className="watchlist-group-card card">
          <div className="card-header watchlist-group-head">
            <div>
              <div className="watchlist-group-title">{group.label}</div>
              <div className="watchlist-group-helper">{group.helper}</div>
            </div>
            <div className="watchlist-group-count numeric">{group.count}</div>
          </div>
          {group.rows.length === 0 ? (
            <div className="watchlist-group-empty table-empty">当前分组没有候选标的。</div>
          ) : (
            <div className="watchlist-group-table">
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: 120, textAlign: 'left' }}>标的</th>
                    <th style={{ width: 90, textAlign: 'left' }}>策略</th>
                    <th style={{ width: 60, textAlign: 'center' }}>状态</th>
                    <th style={{ width: 55, textAlign: 'right' }}>天数</th>
                    <th style={{ width: 70, textAlign: 'right' }}>最新价</th>
                    <th style={{ width: 75, textAlign: 'right' }}>入池收益</th>
                    <th style={{ width: 65, textAlign: 'right' }}>回撤</th>
                    <th style={{ width: 55, textAlign: 'right' }}>量比</th>
                    <th style={{ width: 75, textAlign: 'center' }}>信号</th>
                    <th style={{ width: 100, textAlign: 'right' }}>动作</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr
                      key={row.id}
                      className={selectedCode === row.tsCode ? 'watchlist-table-row selected' : 'watchlist-table-row'}
                      data-watchlist-row={row.id}
                      onClick={() => onSelect(row)}
                    >
                      {/* 标的 */}
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>
                          {row.name}
                          <CrossTags tsCode={row.tsCode} currentStrategy={row.strategy} strategies={row.crossTags} />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.tsCode}</div>
                      </td>
                      {/* 策略 */}
                      <td>
                        <span className="watchlist-mini-pill active">
                          {displayStrategyLabel(row.strategy)}
                        </span>
                      </td>
                      {/* 状态 */}
                      <td style={{ textAlign: 'center' }}>
                        <WatchlistStatusBadge status={row.lifecycleStatus} />
                      </td>
                      {/* 天数 */}
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatDay(row.poolDay)}
                      </td>
                      {/* 最新价 */}
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatPrice(row.latestClose)}
                      </td>
                      {/* 入池收益 */}
                      <td
                        style={{
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: pctColor(row.gainSinceEntry),
                        }}
                      >
                        {formatPct(row.gainSinceEntry)}
                      </td>
                      {/* 回撤 */}
                      <td
                        style={{
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: row.drawdownFromPeak ? 'var(--down)' : 'var(--text-muted)',
                        }}
                      >
                        {row.drawdownFromPeak
                          ? `-${(row.drawdownFromPeak * 100).toFixed(2)}%`
                          : '--'}
                      </td>
                      {/* 量比 */}
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatVr(row.vrToday)}
                      </td>
                      {/* 信号 */}
                      <td style={{ textAlign: 'center' }}>
                        {row.buySignal && (
                          <span className="watchlist-signal-badge buy">
                            {displaySignalLabel(row.buySignal)}
                          </span>
                        )}
                        {row.sellSignal && (
                          <span className="watchlist-signal-badge sell" style={{ marginLeft: 4 }}>
                            {displaySignalLabel(row.sellSignal)}
                          </span>
                        )}
                        {!row.buySignal && !row.sellSignal && (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      {/* 动作 */}
                      <td style={{ textAlign: 'right' }} onClick={(event) => event.stopPropagation()}>
                        <WatchlistActionMenu
                          actions={row.availableActions}
                          onAction={(action) => onAction(row, action)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
