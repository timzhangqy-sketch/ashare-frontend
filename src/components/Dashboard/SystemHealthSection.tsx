import type { SystemHealthSectionVm } from '../../types/dashboard';
import SourceBadge from '../data-source/SourceBadge';
import SourceNotice from '../data-source/SourceNotice';
import MetricStrip from './MetricStrip';
import SectionCard from './SectionCard';
import StatusState from './StatusState';

interface SystemHealthSectionProps {
  data?: SystemHealthSectionVm;
  status: 'loading' | 'empty' | 'error' | 'normal';
  onRetry: () => void;
}

export default function SystemHealthSection({
  data,
  status,
  onRetry,
}: SystemHealthSectionProps) {
  return (
    <SectionCard
      title="系统健康"
      badge="系统"
      actions={<SourceBadge meta={data?.dataSource} />}
    >
      <SourceNotice meta={data?.dataSource} />
      {status === 'loading' ? (
        <StatusState
          type="loading"
          title="系统摘要加载中"
          description="正在整理系统健康和运行诊断。"
          compact
        />
      ) : null}
      {status === 'error' ? (
        <StatusState
          type="error"
          title="系统摘要加载失败"
          description="当前无法生成系统健康摘要，请稍后重试。"
          actionLabel="重新加载"
          onAction={onRetry}
          compact
        />
      ) : null}
      {status === 'empty' ? (
        <StatusState
          type="empty"
          title="当前无系统摘要"
          description="今天暂未收到系统状态更新。"
          compact
        />
      ) : null}
      {status === 'normal' && data ? (
        <div className="dashboard-section-layout">
          <MetricStrip items={data.metrics} />
          <div className="dashboard-section-divider" />
          {data.issues.length === 0 ? (
            <div className="dashboard-system-normal">
              系统运行正常，无异常
            </div>
          ) : (
            <div className="dashboard-system-issues">
              {data.issues.map((item) => (
                <div key={item.name} className="dashboard-system-issue-row">
                  <div className="dashboard-system-issue-main">
                    <div className="dashboard-item-title">{item.name}</div>
                    <div className="dashboard-item-sub">{item.summary}</div>
                  </div>
                  <div className="dashboard-system-issue-side">
                    <span className={`page-badge badge-${item.tone === 'danger' ? 'gold' : 'blue'}`}>
                      {item.statusLabel}
                    </span>
                    <span className="dashboard-item-hint">{item.helperText}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}
