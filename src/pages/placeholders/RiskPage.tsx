import DomainPlaceholder from './DomainPlaceholder';

export default function RiskPage() {
  return (
    <DomainPlaceholder
      routeKey="risk"
      phaseNote="本页为“风控”工作域占位页，当前通过正式风控中心承接，不改兼容路径语义。"
      modules={[
        '组合风险总览',
        '止损与减仓压力',
        '系统预警汇总',
        '供仪表盘与上下文区使用的风控快照',
      ]}
      handoffLinks={[
        { label: '前往组合域', to: '/portfolio' },
        { label: '前往持仓中心', to: '/holdings' },
        { label: '前往研究域', to: '/research' },
      ]}
    />
  );
}
