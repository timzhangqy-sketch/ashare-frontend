import type { PortfolioSectionVm } from '../../types/dashboard';
import SourceBadge from '../data-source/SourceBadge';
import SourceNotice from '../data-source/SourceNotice';
import MetricStrip from './MetricStrip';
import SectionCard from './SectionCard';
import StatusState from './StatusState';

interface PortfolioSectionProps {
  data?: PortfolioSectionVm;
  status: 'loading' | 'empty' | 'error' | 'normal';
  onRetry: () => void;
}

export default function PortfolioSection({
  data,
  status,
  onRetry,
}: PortfolioSectionProps) {
  return (
    <SectionCard
      title="组合"
      badge="组合"
      actions={<SourceBadge meta={data?.dataSource} />}
    >
      <SourceNotice meta={data?.dataSource} />
      {status === 'loading' ? (
        <StatusState
          type="loading"
          title="组合模块加载中"
          description="正在汇总持仓和动作提示。"
          compact
        />
      ) : null}
      {status === 'error' ? (
        <StatusState
          type="error"
          title="组合模块加载失败"
          description="当前无法生成组合摘要，请稍后重试。"
          actionLabel="重新加载"
          onAction={onRetry}
          compact
        />
      ) : null}
      {status === 'empty' ? (
        <StatusState
          type="empty"
          title="当前无组合摘要"
          description="尚未获取持仓数据，或今天没有新的组合变化。"
          compact
        />
      ) : null}
      {status === 'normal' && data ? (
        <div className="dashboard-section-layout">
          <MetricStrip items={data.metrics} />
          <div className="dashboard-section-divider" />
          <div className="dashboard-portfolio-action">
            动作：
            <span className="dashboard-portfolio-action-text">
              {data.actionHint || '暂无'}
            </span>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
