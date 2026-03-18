import { PieChart } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { RiskScoreRow } from '../../types/risk';

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

interface RiskScorePanelProps {
  rows: RiskScoreRow[];
  selectedFocus: string | null;
  onSelect: (tsCode: string) => void;
  onOpenBreakdown: (tsCode: string) => void;
  onOpenWatchlist: (href: string | null) => void;
  onOpenPortfolio: (href: string | null) => void;
  emptyTitle: string;
  emptyText: string;
}

export default function RiskScorePanel({
  rows,
  selectedFocus,
  onSelect,
  onOpenBreakdown,
  onOpenWatchlist,
  onOpenPortfolio,
  emptyTitle,
  emptyText,
}: RiskScorePanelProps) {
  return (
    <div className="risk-table-shell table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>标的</th>
            <th>总分</th>
            <th>分项</th>
            <th>维度上限</th>
            <th>仓位倍率</th>
            <th>风险等级</th>
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
                <td className="numeric">{row.riskScoreTotal}</td>
                <td className="risk-cell-wrap numeric">
                  财务 {row.riskScoreFinancial} / 市场 {row.riskScoreMarket} / 事件 {row.riskScoreEvent} / 合规 {row.riskScoreCompliance}
                </td>
                <td className="numeric">{row.dimCap.toFixed(2)}</td>
                <td className="numeric">
                  <div>{row.positionCapMultiplierFinal.toFixed(2)}</div>
                  <div className="risk-inline-meta">{row.recommendedPositionText}</div>
                </td>
                <td>
                  <div>{row.riskLevelLabel}</div>
                  <div className="risk-inline-actions" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button type="button" style={iconBtnStyle} onClick={(event) => { event.stopPropagation(); onOpenBreakdown(row.tsCode); }} title="查看拆解"><PieChart size={15} /></button>
                    <button type="button" className="risk-inline-link" onClick={(event) => { event.stopPropagation(); onOpenWatchlist(row.watchlistHref); }}>交易标的池</button>
                    <button type="button" className="risk-inline-link" onClick={(event) => { event.stopPropagation(); onOpenPortfolio(row.portfolioHref); }}>持仓</button>
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
