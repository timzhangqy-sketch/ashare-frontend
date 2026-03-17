import type { RiskEventRow } from '../../types/risk';

interface RiskEventFlowPanelProps {
  rows: RiskEventRow[];
  selectedFocus: string | null;
  onSelect: (tsCode: string) => void;
  emptyTitle: string;
  emptyText: string;
}

export default function RiskEventFlowPanel({
  rows,
  selectedFocus,
  onSelect,
  emptyTitle,
  emptyText,
}: RiskEventFlowPanelProps) {
  if (rows.length === 0) {
    return (
      <div className="risk-breakdown-empty">
        <div className="risk-empty-title">{emptyTitle}</div>
        <div className="risk-empty-text">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="risk-event-flow">
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          className={`risk-event-card${selectedFocus === row.tsCode ? ' active' : ''}`}
          onClick={() => onSelect(row.tsCode)}
        >
          <div className="risk-event-time numeric">{row.eventTime}</div>
          <div className="risk-event-body">
            <div className="risk-event-title">{row.eventType}</div>
            <div className="risk-event-name">{row.name} / {row.tsCode}</div>
            <div className="risk-event-change">{row.changeLabel}</div>
            <div className="risk-event-meta">
              <span>{row.sourceDomainLabel}</span>
              <span>{row.statusLabel}</span>
            </div>
            <div className="risk-inline-meta">{row.followUp}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
