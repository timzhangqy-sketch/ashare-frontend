export function getStrategyDisplayName(value: string | null | undefined): string {
  if (!value) return '';
  const upper = value.toUpperCase();

  if (upper.includes('VOL_SURGE')) return '连续放量蓄势';
  if (upper.includes('RETOC2')) return '第4次异动';
  if (upper.includes('PATTERN_T2UP9')) return 'T-2大涨蓄势';
  if (upper.includes('WEAK_BUY')) return '弱市吸筹';
  if (upper.includes('GREEN10') || upper.includes('PATTERN_GREEN10')) return '形态策略';
  if (upper.includes('PATTERN')) return '形态策略';
  if (upper.includes('IGNITION') || upper.includes('STRICT3') || upper.includes('IGNITE') || upper.includes('VOL')) {
    return '能量蓄势';
  }
  return value;
}

export function getRouteDisplayName(value: string | null | undefined): string {
  if (!value) return '';
  const lower = value.toLowerCase();

  if (lower === 'holdings') return '持仓中心';
  if (lower === 'backtest') return '回测中心';
  return value;
}
