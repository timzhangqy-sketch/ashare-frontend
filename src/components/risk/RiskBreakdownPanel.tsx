import type { RiskBreakdownRow } from '../../types/risk';

interface RiskBreakdownPanelProps {
  row: RiskBreakdownRow | null;
  emptyTitle: string;
  emptyText: string;
}

export default function RiskBreakdownPanel({ row, emptyTitle, emptyText }: RiskBreakdownPanelProps) {
  if (!row) {
    return (
      <div className="risk-breakdown-empty">
        <div className="risk-empty-title">{emptyTitle}</div>
        <div className="risk-empty-text">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="risk-breakdown-shell">
      <div className="risk-breakdown-head">
        <div className="risk-cell-title">{row.name}</div>
        <div className="risk-inline-meta numeric-muted">{row.tsCode}</div>
      </div>

      <div className="risk-breakdown-grid">
        <div className="risk-breakdown-card">
          <div className="risk-breakdown-title">交易结论</div>
          <div className="risk-breakdown-value">{row.tradeAllowedLabel}</div>
          <div className="risk-breakdown-sub">{row.blockReason}</div>
        </div>
        <div className="risk-breakdown-card">
          <div className="risk-breakdown-title">风险总分</div>
          <div className="risk-breakdown-value numeric">{row.riskScoreTotal}</div>
          <div className="risk-breakdown-sub">策略来源 {row.sourceStrategy ?? '--'}</div>
        </div>
        <div className="risk-breakdown-card">
          <div className="risk-breakdown-title">仓位倍率</div>
          <div className="risk-breakdown-value numeric">{row.positionCapMultiplierFinal.toFixed(2)}</div>
          <div className="risk-breakdown-sub">{row.recommendedPositionText}</div>
        </div>
      </div>

      <div className="risk-breakdown-dimension">
        <div className="risk-breakdown-section-title">分项得分</div>
        <div className="risk-breakdown-list numeric">
          <div>财务 {row.riskScoreFinancial}</div>
          <div>市场 {row.riskScoreMarket}</div>
          <div>事件 {row.riskScoreEvent}</div>
          <div>合规 {row.riskScoreCompliance}</div>
        </div>
      </div>

      <div className="risk-breakdown-dimension">
        <div className="risk-breakdown-section-title">分项上限</div>
        <div className="risk-breakdown-list numeric">
          <div>财务上限 {row.capFinancial.toFixed(2)}</div>
          <div>市场上限 {row.capMarket.toFixed(2)}</div>
          <div>事件上限 {row.capEvent.toFixed(2)}</div>
          <div>合规上限 {row.capCompliance.toFixed(2)}</div>
          <div>维度上限 {row.dimCap.toFixed(2)}</div>
        </div>
      </div>

      <div className="risk-breakdown-dimension">
        <div className="risk-breakdown-section-title">说明</div>
        <div className="risk-empty-text">{row.explanation}</div>
      </div>
    </div>
  );
}
