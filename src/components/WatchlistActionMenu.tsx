import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { CandlestickChart, ArrowRight, FileText } from 'lucide-react';
import type { WatchlistActionVm } from '../types/watchlist';

export default function WatchlistActionMenu({
  actions,
  onAction,
}: {
  actions: WatchlistActionVm[];
  onAction: (action: WatchlistActionVm) => void;
}): ReactElement {
  const detail = actions.find(action => action.kind === 'detail');
  const handoff = actions.find(action => action.kind === 'portfolio');
  const strategy = actions.find(action => action.kind === 'strategy');
  useEffect(() => {
    return () => undefined;
  }, []);

  return (
    <div className="watchlist-action-menu">
      {detail ? (
        <button
          key={detail.key}
          type="button"
          className="action-icon-btn"
          title="查看详情"
          onClick={event => {
            event.stopPropagation();
            onAction(detail);
          }}
          disabled={detail.disabled}
        >
          <CandlestickChart size={14} />
        </button>
      ) : null}
      {handoff ? (
        <button
          key={handoff.key}
          type="button"
          className="action-icon-btn"
          title="承接"
          onClick={event => {
            event.stopPropagation();
            onAction(handoff);
          }}
          disabled={handoff.disabled}
        >
          <ArrowRight size={14} />
        </button>
      ) : null}
      {strategy ? (
        <button
          key={strategy.key}
          type="button"
          className="action-icon-btn"
          title="策略页"
          onClick={event => {
            event.stopPropagation();
            onAction(strategy);
          }}
          disabled={strategy.disabled}
        >
          <FileText size={14} />
        </button>
      ) : null}
    </div>
  );
}
