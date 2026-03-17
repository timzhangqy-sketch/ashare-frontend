import type { GateBlockRow } from '../../types/risk';
import { ArrowLeft, PieChart } from 'lucide-react';

interface GateBlockPanelProps {
  rows: GateBlockRow[];
  selectedFocus: string | null;
  onSelect: (tsCode: string) => void;
  onOpenBreakdown: (tsCode: string) => void;
  onOpenSource: (href: string | null) => void;
  emptyTitle: string;
  emptyText: string;
}

export default function GateBlockPanel({
  rows,
  selectedFocus,
  onSelect,
  onOpenBreakdown,
  onOpenSource,
  emptyTitle,
  emptyText,
}: GateBlockPanelProps) {
  return (
    <div className="risk-table-shell table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>标的</th>
            <th>来源域</th>
            <th>交易结论</th>
            <th>拦截原因</th>
            <th>拦截来源</th>
            <th>建议动作</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="risk-table-empty-row">
              <td colSpan={6}>
                <div className="risk-empty-state table-empty">
                  <div className="risk-empty-title">{emptyTitle}</div>
                  <div className="risk-empty-text">{emptyText}</div>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className={selectedFocus === row.tsCode ? 'risk-table-row selected' : 'risk-table-row'}
                onClick={() => onSelect(row.tsCode)}
              >
                <td>
                  <div className="risk-cell-title">{row.name}</div>
                  <div className="risk-inline-meta numeric-muted">{row.tsCode}</div>
                </td>
                <td>{row.sourceDomainLabel}</td>
                <td>
                  <span className={`risk-status-pill ${row.tradeAllowed ? 'allow' : 'block'}`}>{row.tradeAllowedLabel}</span>
                </td>
                <td>{row.blockReason}</td>
                <td>{row.blockSource}</td>
                <td>
                  <div>{row.suggestion}</div>
                  <div className="risk-inline-actions">
                    <button
                      type="button"
                      title="查看拆解"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
                      onClick={(event) => { event.stopPropagation(); onOpenBreakdown(row.tsCode); }}
                    >
                      <PieChart size={16} />
                    </button>
                    <button
                      type="button"
                      title="返回来源"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
                      onClick={(event) => { event.stopPropagation(); onOpenSource(row.sourceHref); }}
                    >
                      <ArrowLeft size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
