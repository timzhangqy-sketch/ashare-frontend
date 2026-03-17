import type { ContextPanelLoadStatus, StockContextLifecycleData } from '../../../types/contextPanel';

const POSITION_STATUS_MAP: Record<string, string> = {
  in_watchlist: '交易标的池中',
  held: '持仓中',
  candidate: '候选中',
  signaled: '已触发买点',
  exited: '已退出',
  closed: '已平仓',
  unknown: '未知',
};

interface StockContextLifecycleProps {
  status: ContextPanelLoadStatus;
  note: string;
  data: StockContextLifecycleData | null;
}

export default function StockContextLifecycle({ status, note, data }: StockContextLifecycleProps) {
  if (status === 'empty' && !data) return null;

  return (
    <section className="global-context-section">
      <div className="global-context-section-title">生命周期</div>
      {status === 'loading' ? (
        <div className="global-context-empty">正在加载生命周期...</div>
      ) : data ? (
        <div className="global-context-stat-grid">
          <div className="global-context-stat-card">
            <span>当前阶段</span>
            <strong>{data.lifecycleLabel}</strong>
          </div>
          <div className="global-context-stat-card">
            <span>入池日期</span>
            <strong>{data.entryDate ?? '--'}</strong>
          </div>
          <div className="global-context-stat-card">
            <span>观察天数</span>
            <strong>{data.poolDay != null ? `${data.poolDay}` : '--'}</strong>
          </div>
          <div className="global-context-stat-card">
            <span>入池后收益</span>
            <strong style={data.gainSinceEntry != null ? { color: data.gainSinceEntry > 0 ? 'var(--up)' : data.gainSinceEntry < 0 ? 'var(--down)' : undefined } : undefined}>{data.gainSinceEntry != null ? `${(data.gainSinceEntry * 100) > 0 ? '+' : ''}${(data.gainSinceEntry * 100).toFixed(2)}%` : '--'}</strong>
          </div>
          <div className="global-context-risk-copy">
            <span>持仓状态</span>
            <strong>{POSITION_STATUS_MAP[data.positionStatus ?? ''] ?? data.positionStatus ?? '--'}</strong>
          </div>
        </div>
      ) : (
        <div className="global-context-empty">当前没有可展示的生命周期信息。</div>
      )}
    </section>
  );
}
