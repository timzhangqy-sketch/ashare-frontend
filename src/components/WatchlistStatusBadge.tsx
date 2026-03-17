import type { WatchlistLifecycleStatus } from '../types/watchlist';

const STATUS_LABEL: Record<WatchlistLifecycleStatus, string> = {
  candidate: '候选',
  signaled: '已出信号',
  handed_off: '已移交',
  blocked: '已阻断',
};

export default function WatchlistStatusBadge({
  status,
  label,
}: {
  status: WatchlistLifecycleStatus;
  label?: string;
}) {
  return (
    <span className={`watchlist-status-badge ${status}`}>
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
