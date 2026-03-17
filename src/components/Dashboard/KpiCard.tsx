import { Link } from 'react-router-dom';
import type { DashboardKpiVm } from '../../types/dashboard';

interface KpiCardProps {
  item: DashboardKpiVm;
}

function getKpiColor(item: DashboardKpiVm): string | undefined {
  const zeroLike = item.value === '—' || item.value === '0' || item.value === '+0';

  switch (item.id) {
    // 买点机会：>0 使用主文本色，0 时弱化
    case 'buySignalsCount':
      return zeroLike ? 'var(--text-muted)' : 'var(--text-primary)';
    // 共振信号：>0 使用 info 色，0 时弱化
    case 'resonanceCount':
      return zeroLike ? 'var(--text-muted)' : 'var(--info)';
    // 交易标的精选（观察池候选）：始终使用主文本色
    case 'watchlistCandidates':
      return 'var(--text-primary)';
    // 风控拦截：>0 使用 warn，0 时弱化
    case 'gateBlockedCount':
      return zeroLike ? 'var(--text-muted)' : 'var(--warn)';
    // 高风险持仓：>0 使用 critical，0 时弱化
    case 'highRiskPositionsCount':
      return zeroLike ? 'var(--text-muted)' : 'var(--critical)';
    // 持仓数量：始终使用主文本色
    case 'positionsCount':
      return 'var(--text-primary)';
    // 卖出提示：>0 使用 up 色，0 时弱化
    case 'sellSignalsCount':
      return zeroLike ? 'var(--text-muted)' : 'var(--up)';
    // 灭火步骤（pipeline 状态）：正常为 source-real，异常为 critical
    case 'failedStepsCount':
      return zeroLike ? 'var(--source-real)' : 'var(--critical)';
    // 版本快照：主文本色
    case 'versionLabel':
      return 'var(--text-primary)';
    default:
      return undefined;
  }
}

export default function KpiCard({ item }: KpiCardProps) {
  const color = getKpiColor(item);

  return (
    <Link className="dashboard-kpi-card stat-card" to={item.href}>
      <div className="dashboard-kpi-label">{item.label}</div>
      <div
        className={`dashboard-kpi-value numeric tone-${item.tone}`}
        style={color ? { color } : undefined}
      >
        {item.value}
      </div>
      <div className="dashboard-kpi-meta">
        <span>{item.helperText}</span>
        <span className="dashboard-kpi-link">查看</span>
      </div>
    </Link>
  );
}
