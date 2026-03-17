export type AppRouteKey =
  | 'dashboard'
  | 'signals'
  | 'watchlist'
  | 'portfolio'
  | 'execution'
  | 'risk'
  | 'research'
  | 'system'
  | 'ignition'
  | 'retoc2'
  | 'pattern'
  | 'holdings'
  | 'backtest';

export type NavIconKey =
  | 'dashboard'
  | 'signals'
  | 'watchlist'
  | 'portfolio'
  | 'execution'
  | 'risk'
  | 'research'
  | 'system'
  | 'legacy';

export interface AppRouteDefinition {
  key: AppRouteKey;
  path: string;
  label: string;
  title: string;
  description: string;
  showInMainNav: boolean;
  isLegacy: boolean;
  icon?: NavIconKey;
  handoffPaths?: string[];
}

export const appRouteDefinitions: AppRouteDefinition[] = [
  {
    key: 'dashboard',
    path: '/dashboard',
    label: '工作台',
    title: '工作台',
    description: '全局总览、状态摘要与主要工作流分发。',
    showInMainNav: true,
    isLegacy: false,
    icon: 'dashboard',
    handoffPaths: ['/ignition', '/holdings', '/backtest'],
  },
  {
    key: 'signals',
    path: '/signals',
    label: '信号中心',
    title: '信号中心',
    description: '信号列表、筛选与样本上下文。',
    showInMainNav: true,
    isLegacy: false,
    icon: 'signals',
    handoffPaths: ['/ignition', '/retoc2', '/pattern'],
  },
  {
    key: 'watchlist',
    path: '/watchlist',
    label: '交易标的池',
    title: '交易标的池',
    description: '关注分组、焦点样本与热度视图。',
    showInMainNav: true,
    isLegacy: false,
    icon: 'watchlist',
    handoffPaths: ['/ignition', '/retoc2', '/pattern'],
  },
  {
    key: 'portfolio',
    path: '/portfolio',
    label: '持仓中心',
    title: '持仓中心',
    description: '组合总览、持仓明细与分段视图。',
    showInMainNav: true,
    isLegacy: false,
    icon: 'portfolio',
    handoffPaths: ['/holdings'],
  },
  {
    key: 'execution',
    path: '/execution',
    label: '模拟执行',
    title: '模拟执行',
    description: '执行状态、异常与策略链路联动。',
    showInMainNav: true,
    isLegacy: false,
    icon: 'execution',
    handoffPaths: ['/portfolio', '/watchlist', '/signals', '/risk'],
  },
  {
    key: 'risk',
    path: '/risk',
    label: '风控中心',
    title: '风控中心',
    description: '风险视图、范围切换与研究联动。',
    showInMainNav: true,
    isLegacy: false,
    icon: 'risk',
    handoffPaths: ['/holdings', '/backtest'],
  },
  {
    key: 'research',
    path: '/research',
    label: '研究中心',
    title: '研究中心',
    description: '回测摘要、因子IC、归因与共振分析。',
    showInMainNav: true,
    isLegacy: false,
    icon: 'research',
    handoffPaths: ['/backtest'],
  },
  {
    key: 'system',
    path: '/system',
    label: '系统监控',
    title: '系统监控',
    description: 'API 健康、数据覆盖与流水线状态。',
    showInMainNav: true,
    isLegacy: false,
    icon: 'system',
    handoffPaths: ['/dashboard'],
  },
  {
    key: 'ignition',
    path: '/ignition',
    label: '能量蓄势',
    title: '能量蓄势',
    description: '连续放量蓄势策略榜单',
    showInMainNav: false,
    isLegacy: true,
    icon: 'legacy',
  },
  {
    key: 'retoc2',
    path: '/retoc2',
    label: '异动策略',
    title: '异动策略',
    description: '第4次异动策略榜单',
    showInMainNav: false,
    isLegacy: true,
    icon: 'legacy',
  },
  {
    key: 'pattern',
    path: '/pattern',
    label: '形态策略',
    title: '形态策略',
    description: 'T-2大涨蓄势策略榜单',
    showInMainNav: false,
    isLegacy: true,
    icon: 'legacy',
  },
  {
    key: 'holdings',
    path: '/holdings',
    label: '持仓中心',
    title: '持仓中心',
    description: '旧 /holdings 路由仅保留兼容跳转语义，正式持仓入口为持仓中心。',
    showInMainNav: false,
    isLegacy: true,
    icon: 'legacy',
  },
  {
    key: 'backtest',
    path: '/backtest',
    label: '回测中心',
    title: '回测中心',
    description: '旧 /backtest 路由仅保留兼容跳转语义，正式研究入口为回测中心所在研究域。',
    showInMainNav: false,
    isLegacy: true,
    icon: 'legacy',
  },
];

export const mainNavigation = appRouteDefinitions.filter(route => route.showInMainNav);
export const legacyNavigation = appRouteDefinitions.filter(route => route.isLegacy);
