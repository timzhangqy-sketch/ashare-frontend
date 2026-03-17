import { Link } from 'react-router-dom';
import type { RiskSectionVm } from '../../types/dashboard';
import SourceBadge from '../data-source/SourceBadge';
import SourceNotice from '../data-source/SourceNotice';
import MetricStrip from './MetricStrip';
import SectionCard from './SectionCard';
import StatusState from './StatusState';

interface RiskSectionProps {
  data?: RiskSectionVm;
  status: 'loading' | 'empty' | 'error' | 'normal';
  onRetry: () => void;
}

export default function RiskSection({ data, status, onRetry }: RiskSectionProps) {
  return (
    <SectionCard
      title="风控"
      badge="风险域"
      actions={<SourceBadge meta={data?.dataSource} />}
    >
      <SourceNotice meta={data?.dataSource} />
      {status === 'loading' ? (
        <StatusState
          type="loading"
          title="风控模块加载中"
          description="正在汇总风控拦截和风险事件。"
          compact
        />
      ) : null}
      {status === 'error' ? (
        <StatusState
          type="error"
          title="风控模块加载失败"
          description="当前无法生成风险概览，请稍后重试。"
          actionLabel="重新加载"
          onAction={onRetry}
          compact
        />
      ) : null}
      {status === 'empty' ? (
        <StatusState
          type="empty"
          title="当前无新增风险提示"
          description="今天暂无新的风险事件，但仍建议检查组合与系统状态。"
          compact
        />
      ) : null}
      {status === 'normal' && data ? (
        <div className="dashboard-section-layout">
          <MetricStrip items={data.metrics} />
          <div className="dashboard-list-card">
            <div className="dashboard-list-title">重点风险事件</div>
            <div className="dashboard-list-items">
              {data.events.map(item => (
                <Link key={item.name} className="dashboard-list-item" to={item.href}>
                  <div>
                    <div className="dashboard-item-title">{item.name}</div>
                    <div className="dashboard-item-sub">{item.summary}</div>
                  </div>
                  <div className="dashboard-item-side">
                    <span className="dashboard-risk-score">{item.scoreLabel}</span>
                    <span className="dashboard-item-hint">{item.helperText}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
