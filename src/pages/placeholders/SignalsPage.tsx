import DomainPlaceholder from './DomainPlaceholder';

export default function SignalsPage() {
  return (
    <DomainPlaceholder
      routeKey="signals"
      phaseNote="本页为“信号”工作域占位页。当前可通过兼容入口继续访问能量蓄势、异动策略与形态策略页面。"
      modules={[
        '机会摘要',
        '按策略聚合的信号队列',
        '信号强弱与时效标记',
        '下钻到旧策略页的快捷入口',
      ]}
      handoffLinks={[
        { label: '前往能量蓄势', to: '/ignition' },
        { label: '前往异动策略', to: '/retoc2' },
        { label: '前往形态策略', to: '/pattern' },
      ]}
    />
  );
}
