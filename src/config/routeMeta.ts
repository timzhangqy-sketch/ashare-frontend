import {
  appRouteDefinitions,
  type AppRouteDefinition,
  type AppRouteKey,
} from './navigation';

const FALLBACK_ROUTE_META: AppRouteDefinition = {
  key: 'dashboard',
  path: '/dashboard',
  label: '工作台',
  title: '工作台',
  description: '系统共享工作区域。',
  showInMainNav: false,
  isLegacy: false,
};

function normalizePath(pathname: string): string {
  if (!pathname) return '/';
  if (pathname === '/') return '/';
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

const routeMetaByKey = new Map<AppRouteKey, AppRouteDefinition>(
  appRouteDefinitions.map(route => [route.key, route]),
);

const routeMetaByPath = new Map<string, AppRouteDefinition>(
  appRouteDefinitions.map(route => [normalizePath(route.path), route]),
);

const compatibilityRouteMetaByPath = new Map<string, AppRouteDefinition>([
  ['/holdings', getRouteMetaByKey('portfolio')],
  ['/backtest', getRouteMetaByKey('research')],
]);

export function getRouteMeta(pathname: string): AppRouteDefinition {
  const normalizedPath = normalizePath(pathname);
  return (
    compatibilityRouteMetaByPath.get(normalizedPath)
    ?? routeMetaByPath.get(normalizedPath)
    ?? FALLBACK_ROUTE_META
  );
}

export function getRouteMetaByKey(key: AppRouteKey): AppRouteDefinition {
  return routeMetaByKey.get(key) ?? FALLBACK_ROUTE_META;
}
