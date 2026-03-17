import type { ContextPanelLoadStatus, StockContextRiskData } from '../../../types/contextPanel';

const RISK_LEVEL_MAP: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '极高风险',
};

interface StockContextRiskProps {
  status: ContextPanelLoadStatus;
  note: string;
  data: StockContextRiskData | null;
}

export default function StockContextRisk({ status, note, data }: StockContextRiskProps) {
  if (status === 'empty' && !data) return null;

  return (
    <section className="global-context-section">
      <div className="global-context-section-title">风险拆解</div>
      {status === 'loading' ? (
        <div className="global-context-empty">正在加载风险信息...</div>
      ) : data ? (
        <div className="global-context-stat-grid">
          <div className="global-context-stat-card">
            <span>执行结论</span>
            <strong>{data.tradeAllowed == null ? '--' : data.tradeAllowed ? '允许执行' : '限制执行'}</strong>
          </div>
          <div className="global-context-stat-card">
            <span>风险等级</span>
            <strong>{RISK_LEVEL_MAP[data.riskLevel ?? ''] ?? data.riskLevel ?? '--'}</strong>
          </div>
          <div className="global-context-stat-card">
            <span>风险分</span>
            <strong>{data.riskScoreTotal != null ? data.riskScoreTotal.toFixed(1) : '--'}</strong>
          </div>
          <div className="global-context-stat-card">
            <span>仓位上限</span>
            <strong>{data.capMultiplier != null ? `${data.capMultiplier.toFixed(2)}x` : '--'}</strong>
          </div>
          <div className="global-context-risk-copy">
            <span>阻断来源</span>
            <strong>{data.blockSource ?? '--'}</strong>
            <small>{data.blockReason ?? '当前没有明确阻断原因。'}</small>
          </div>
        </div>
      ) : (
        <div className="global-context-empty">当前没有可展示的风险拆解。</div>
      )}
    </section>
  );
}
