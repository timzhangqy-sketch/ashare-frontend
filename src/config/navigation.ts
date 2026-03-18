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
    description: '',
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
    description: '',
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
    description: '',
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
    description: '',
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
    description: '',
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
    description: '',
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
    description: '',
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
    description: '',
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
    description: '',
    showInMainNav: false,
    isLegacy: true,
    icon: 'legacy',
  },
  {
    key: 'retoc2',
    path: '/retoc2',
    label: '异动策略',
    title: '异动策略',
    description: '',
    showInMainNav: false,
    isLegacy: true,
    icon: 'legacy',
  },
  {
    key: 'pattern',
    path: '/pattern',
    label: '形态策略',
    title: '形态策略',
    description: '',
    showInMainNav: false,
    isLegacy: true,
    icon: 'legacy',
  },
  {
    key: 'holdings',
    path: '/holdings',
    label: '持仓中心',
    title: '持仓中心',
    description: '',
    showInMainNav: false,
    isLegacy: true,
    icon: 'legacy',
  },
  {
    key: 'backtest',
    path: '/backtest',
    label: '回测中心',
    title: '回测中心',
    description: '',
    showInMainNav: false,
    isLegacy: true,
    icon: 'legacy',
  },
];

export const mainNavigation = appRouteDefinitions.filter(route => route.showInMainNav);
export const legacyNavigation = appRouteDefinitions.filter(route => route.isLegacy);
