import type { TodaySummaryViewModel } from '../../types/dashboard';
import SourceBadge from '../data-source/SourceBadge';
import SourceNotice from '../data-source/SourceNotice';
import MetricStrip from './MetricStrip';
import SectionCard from './SectionCard';
import StatusState from './StatusState';

interface TodaySummarySectionProps {
  data?: TodaySummaryViewModel;
  status: 'loading' | 'empty' | 'error' | 'normal';
  onRetry: () => void;
}

export default function TodaySummarySection({
  data,
  status,
  onRetry,
}: TodaySummarySectionProps) {
  return (
    <SectionCard
      title="今日摘要"
      actions={<SourceBadge meta={data?.dataSource} />}
    >
      <SourceNotice meta={data?.dataSource} />
      {status === 'loading' ? (
        <StatusState
          type="loading"
          title="正在整理今日摘要"
          description="Dashboard 正在装载摘要结构。"
        />
      ) : null}
      {status === 'error' ? (
        <StatusState
          type="error"
          title="今日摘要加载失败"
          description="当前无法生成今日变化概览，请重试。"
          actionLabel="重新加载"
          onAction={onRetry}
        />
      ) : null}
      {status === 'empty' ? (
        <StatusState
          type="empty"
          title="今日暂无摘要数据"
          description="当前交易日尚未生成摘要，或暂时没有需要提示的变化。"
          actionLabel="重新加载"
          onAction={onRetry}
        />
      ) : null}
      {status === 'normal' && data ? (
        <div className="dashboard-summary-layout">
          <MetricStrip items={data.metrics} />
        </div>
      ) : null}
    </SectionCard>
  );
}
