import type { RiskOverviewMetric } from '../../types/risk';

export default function RiskOverviewStrip({ metrics }: { metrics: RiskOverviewMetric[] }) {
  const KPI_LABEL_SET = new Set([
    '当前阻断数量',
    '高风险股票',
    '交易标的池关联',
    '持仓关联',
  ]);

  return (
    <section className="card">
      <div className="risk-summary-strip">
        {metrics.map(metric => (
          <div key={metric.label} className="stat-card risk-summary-card">
            <div
              className="stat-label"
              style={
                KPI_LABEL_SET.has(metric.label)
                  ? { fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }
                  : undefined
              }
            >
              {metric.label}
            </div>
            <div className="stat-value risk-summary-value">{metric.value}</div>
            {KPI_LABEL_SET.has(metric.label) ? null : <div className="stat-sub">{metric.helper}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
