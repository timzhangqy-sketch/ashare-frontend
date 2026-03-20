import { ArrowLeft, PieChart } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { GateBlockRow } from '../../types/risk';

const iconBtnStyle: CSSProperties = {
  background: 'rgba(59,130,246,0.10)',
  color: '#3B82F6',
  border: 'none',
  borderRadius: 4,
  padding: '4px 6px',
  cursor: 'pointer',
  marginRight: 4,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

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
                <td><span style={{fontWeight:600}}>{row.name}</span> <span className="numeric-muted" style={{fontSize:'11px'}}>{row.tsCode}</span></td>
                <td>{row.sourceDomainLabel}</td>
                <td>
                  <span className={`risk-status-pill ${row.tradeAllowed ? 'allow' : 'block'}`}>{row.tradeAllowedLabel}</span>
                </td>
                <td>{row.blockReason}</td>
                <td>{row.blockSource}</td>
                <td><div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'nowrap'}}><span>{row.suggestion}</span>
                    <button type="button" style={iconBtnStyle} onClick={(event) => { event.stopPropagation(); onOpenBreakdown(row.tsCode); }} title="查看拆解"><PieChart size={14} /></button>
                    <button type="button" style={iconBtnStyle} onClick={(event) => { event.stopPropagation(); onOpenSource(row.sourceHref); }} title="返回来源"><ArrowLeft size={14} /></button>
                </div></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
