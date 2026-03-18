import type { RiskOverviewMetric } from '../../types/risk';

export default function RiskOverviewStrip({ metrics }: { metrics: RiskOverviewMetric[] }) {
  return (
    <section className="card">
      <div className="risk-summary-strip">
        {metrics.map(metric => (
          <div key={metric.label} className="stat-card risk-summary-card">
            <div className="stat-label" style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>{metric.label}</div>
            <div className="stat-value risk-summary-value">{metric.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
