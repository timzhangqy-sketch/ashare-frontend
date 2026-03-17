import type { OpportunitySectionVm } from '../../types/dashboard';
import SourceBadge from '../data-source/SourceBadge';
import SourceNotice from '../data-source/SourceNotice';
import MetricStrip from './MetricStrip';
import SectionCard from './SectionCard';
import StatusState from './StatusState';
import { useContextPanel } from '../../context/useContextPanel';
import { useDate } from '../../context/useDate';

const STRATEGY_LABEL_MAP: Record<string, string> = {
  VOL_SURGE: '连续放量蓄势',
  RETOC2: '第4次异动',
  PATTERN_T2UP9: 'T-2大涨蓄势',
  WEAK_BUY: '弱市吸筹',
  PATTERN_GREEN10: '形态策略',
  GREEN10: '形态策略',
};

interface OpportunitySectionProps {
  data?: OpportunitySectionVm;
  status: 'loading' | 'empty' | 'error' | 'normal';
  onRetry: () => void;
}

export default function OpportunitySection({
  data,
  status,
  onRetry,
}: OpportunitySectionProps) {
  const { selectedDate } = useDate();
  const { openPanel, closePanel } = useContextPanel();
  return (
    <SectionCard
      title="机会"
      badge="信号"
      actions={<SourceBadge meta={data?.dataSource} />}
    >
      <SourceNotice meta={data?.dataSource} />
      {status === 'loading' ? (
        <StatusState
          type="loading"
          title="机会模块加载中"
          description="正在整理信号和候选列表。"
          compact
        />
      ) : null}
      {status === 'error' ? (
        <StatusState
          type="error"
          title="机会模块加载失败"
          description="当前无法生成机会摘要，请稍后重试。"
          actionLabel="重新加载"
          onAction={onRetry}
          compact
        />
      ) : null}
      {status === 'empty' ? (
        <StatusState
          type="empty"
          title="当前无新增机会"
          description="今天暂无新的机会摘要，可继续查看兼容策略页。"
          compact
        />
      ) : null}
      {status === 'normal' && data ? (
        <div className="dashboard-section-layout">
          <MetricStrip items={data.metrics} />
          <div className="dashboard-list-card">
            <div className="dashboard-list-title">重点机会</div>
            <div className="dashboard-list-items">
              {data.topOpportunities.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="dashboard-list-item"
                  onClick={() => {
                    if (!item.id) {
                      closePanel();
                      return;
                    }

                    openPanel({
                      entityType: 'stock',
                      entityKey: item.id,
                      sourcePage: 'dashboard',
                      tradeDate: selectedDate,
                      focus: item.id,
                      activeTab: 'overview',
                      payloadVersion: 'v1',
                      payload: {
                        title: item.name,
                        name: item.name,
                        tsCode: item.id,
                        sourceStrategy: item.strategyLabel,
                      },
                    });
                  }}
                >
                  <div>
                    <div className="dashboard-item-title">{item.name}</div>
                    <div className="dashboard-item-sub">{STRATEGY_LABEL_MAP[item.strategy_label ?? ''] ?? STRATEGY_LABEL_MAP[item.strategy ?? ''] ?? item.strategy_label ?? item.strategy ?? item.strategyLabel}</div>
                  </div>
                  <div className="dashboard-item-side">
                    <span className={`page-badge badge-${item.tone === 'danger' ? 'gold' : 'blue'}`}>
                      {item.scoreLabel}
                    </span>
                    <span className="dashboard-item-hint">{item.helperText}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
