import type { DashboardMetricVm } from '../../types/dashboard';

interface MetricStripProps {
  items: DashboardMetricVm[];
}

export default function MetricStrip({ items }: MetricStripProps) {
  return (
    <div className="dashboard-metric-strip">
      {items.map(item => (
        <div key={item.label} className="dashboard-metric-card">
          <div className="dashboard-metric-label">{item.label}</div>
          <div className={`dashboard-metric-value tone-${item.tone}`}>{item.value}</div>
          <div className="dashboard-metric-helper">{item.helperText}</div>
        </div>
      ))}
    </div>
  );
}
