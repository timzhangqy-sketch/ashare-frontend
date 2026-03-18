import type { RiskContextModel } from '../../types/risk';

interface RiskContextAction {
  key: string;
  label: string;
  enabled: boolean;
  note: string;
  href: string | null;
}

interface RiskContextPanelProps {
  context: RiskContextModel | null;
  actions: RiskContextAction[];
  onAction: (action: RiskContextAction) => void;
  noFocusTitle: string;
  noFocusText: string;
}

export default function RiskContextPanel({
  context,
  actions,
  onAction,
  noFocusTitle,
  noFocusText,
}: RiskContextPanelProps) {
  return (
    <section className="card risk-context-card">
      <div className="risk-context-body">
        {context ? (
          <>
            <div className="risk-context-title">{context.title}</div>
            <div className="risk-context-code numeric-muted">{context.tsCode}</div>
            <div className="risk-context-status">{context.sourceDomainLabel}</div>

            <div className="risk-context-section">
              <div className="risk-context-section-title">来源信息</div>
              <div className="risk-context-grid">
                <div>
                  <div className="risk-context-label">来源域</div>
                  <div className="risk-context-value">{context.sourceLabel}</div>
                </div>
                <div>
                  <div className="risk-context-label">来源策略</div>
                  <div className="risk-context-value">{context.sourceStrategyLabel}</div>
                </div>
              </div>
            </div>

            <div className="risk-context-section">
              <div className="risk-context-section-title">Gate 结论</div>
              <div className="risk-context-list">
                {context.gateConclusion.map((item) => (
                  <div key={item.label} className="risk-context-list-row">
                    <span className="risk-context-label">{item.label}</span>
                    <span className="risk-context-list-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="risk-context-section">
              <div className="risk-context-section-title">得分摘要</div>
              <div className="risk-context-list">
                {context.scoreSummary.map((item) => (
                  <div key={item.label} className="risk-context-list-row">
                    <span className="risk-context-label">{item.label}</span>
                    <span className="risk-context-list-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="risk-context-section">
              <div className="risk-context-section-title">仓位建议</div>
              <div className="risk-context-list">
                {context.positionSummary.map((item) => (
                  <div key={item.label} className="risk-context-list-row">
                    <span className="risk-context-label">{item.label}</span>
                    <span className="risk-context-list-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="risk-context-section">
              <div className="risk-context-section-title">下一步动作</div>
              <div className="risk-context-list">
                <div className="risk-context-list-row">
                  <span className="risk-context-label">交易结论</span>
                  <span className="risk-context-list-value">{context.tradeAllowedLabel}</span>
                </div>
                <div className="risk-context-list-row">
                  <span className="risk-context-label">推荐动作</span>
                  <span className="risk-context-list-value">{context.recommendedNextStep}</span>
                </div>
              </div>
              <div className="risk-context-actions">
                {actions.map((action) => {
                  const alwaysShow = action.key === 'back' || action.key === 'system';
                  if (!action.enabled && !alwaysShow) return null;
                  return (
                    <button
                      key={action.key}
                      type="button"
                      className={`risk-context-action${action.enabled ? '' : ' is-disabled'}`}
                      onClick={() => onAction(action)}
                      disabled={!action.enabled}
                      title={action.note}
                    >
                      {action.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="risk-context-empty">
            <div className="risk-empty-title">{noFocusTitle}</div>
            <div className="risk-empty-text">{noFocusText}</div>
          </div>
        )}
      </div>
    </section>
  );
}
