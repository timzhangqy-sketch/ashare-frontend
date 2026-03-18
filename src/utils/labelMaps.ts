export const SIGNAL_LABEL_MAP: Record<string, string> = {
  BREAKOUT: '突破信号',
  PULLBACK: '回踩确认',
  HOLD: '持有',
  VOL_CONFIRM: '放量确认',
  REHEAT: '冷却回暖',
  WARN_VR_FADE: '量能衰退',
  WARN_MA_BREAK: '跌破均线',
  WARN_DRAWDOWN: '回撤预警',
  WARN_VOLUME_DIE: '量能衰竭',
  EXIT_HARD_STOP: '硬止损',
  EXIT_TREND_BREAK: '趋势破位',
  EXIT_TIME_STOP: '到期退出',
};

export const STRATEGY_LABEL_MAP: Record<string, string> = {
  VOL_SURGE: '连续放量蓄势',
  RETOC2: '第4次异动',
  PATTERN_T2UP9: 'T-2大涨蓄势',
  PATTERN_GREEN10: '近10日阳线',
  WEAK_BUY: '弱市吸筹',
  BREAKOUT: '突破策略',
  PORTFOLIO_REDUCE: '组合减仓',
  RESONANCE_PLUS: '多策略共振',
};

export const ACTION_SIGNAL_MAP: Record<string, string> = {
  HOLD: '持有',
  ADD: '加仓',
  REDUCE: '减仓',
  CLOSE: '清仓',
  STOP_LOSS: '止损',
  BUY: '买入',
  SELL: '卖出',
};

export const SOURCE_LABEL_MAP: Record<string, string> = {
  'Portfolio 持仓复核': '持仓复核',
  Portfolio: '持仓中心',
  Watchlist: '交易标的池',
  watchlist: '交易标的池',
};

export const STATUS_LABEL_MAP: Record<string, string> = {
  active: '活跃',
  exited: '已退出',
  pending: '待定',
  signaled: '已触发',
  candidate: '候选',
  blocked: '拦截',
  retired: '已退池',
  handed_off: '已移交',
  open: '持仓中',
  closed: '已平仓',
};

export function displayStrategyLabel(raw: string | null | undefined): string {
  if (!raw) return '--';
  return STRATEGY_LABEL_MAP[raw] ?? raw;
}

export function displaySignalLabel(raw: string | null | undefined): string {
  if (!raw) return '--';
  return SIGNAL_LABEL_MAP[raw] ?? raw;
}

export function displayActionSignal(raw: string | null | undefined): string {
  if (!raw) return '--';
  return ACTION_SIGNAL_MAP[raw] ?? raw;
}

export function displaySourceLabel(raw: string | null | undefined): string {
  if (!raw) return '--';
  let value = raw.trim();

  // 统一处理 "兼容: xxx" / "兼容：xxx" 前缀
  const compatiblePrefix = /^兼容[:：]\s*/;
  const isCompatible = compatiblePrefix.test(value);
  value = value.replace(compatiblePrefix, '');

  // 去掉 Portfolio 及大小写变体
  value = value.replace(/Portfolio\s*/gi, '').trim();

  // 直接映射剩余内容
  const mappedCore = SOURCE_LABEL_MAP[value] ?? (value || raw);

  return isCompatible ? `兼容: ${mappedCore}` : mappedCore;
}
