import DomainPlaceholder from './DomainPlaceholder';

export default function SystemPage() {
  return (
    <DomainPlaceholder
      routeKey="system"
      phaseNote="本页为“系统”工作域占位页。Round 1 先完成系统级入口与壳层预留，后续将在此承接运行健康、交易日状态与运维诊断。当前 Pipeline 细节仍保留在顶部全局条中。"
      modules={[
        'Pipeline 健康看板',
        '交易日与刷新状态',
        '任务运行诊断',
        '运行通知与告警',
      ]}
      handoffLinks={[
        { label: '前往仪表盘', to: '/dashboard' },
        { label: '前往研究域', to: '/research' },
      ]}
    />
  );
}
