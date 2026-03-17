import DomainPlaceholder from './DomainPlaceholder';

export default function WatchlistPage() {
  return (
    <DomainPlaceholder
      routeKey="watchlist"
      phaseNote="本页为“交易标的池”工作域占位页。当前交易标的池能力仍保留在兼容入口策略页内。"
      modules={[
        '跨策略交易标的池总览',
        '买卖动作队列',
        '入池天数与收益跟踪',
        '共享筛选与视图切换',
      ]}
      handoffLinks={[
        { label: '前往能量蓄势交易标的池', to: '/ignition' },
        { label: '前往异动策略交易标的池', to: '/retoc2' },
        { label: '前往形态策略交易标的池', to: '/pattern' },
      ]}
    />
  );
}
