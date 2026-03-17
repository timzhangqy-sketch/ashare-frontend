export function formatSignalReason(reason: string | null | undefined): string {
  if (!reason) return '--'
  return reason
    .replace(/peak=/g, '峰值：')
    .replace(/close=/g, '收盘：')
    .replace(/stop=/g, '止损价：')
    .replace(/loss=/g, '亏损：')
}

export type SafeNumberKind = 'missing' | 'zero' | 'nan' | 'value';

export interface SafeNumberResult {
  kind: SafeNumberKind;
  value: number | null;
}

export function inspectNumber(input: unknown): SafeNumberResult {
  if (input == null) return { kind: 'missing', value: null };
  if (typeof input !== 'number') return { kind: 'nan', value: null };
  if (Number.isNaN(input)) return { kind: 'nan', value: null };
  if (input === 0) return { kind: 'zero', value: 0 };
  return { kind: 'value', value: input };
}

export function formatFixedSafe(input: unknown, digits = 2, empty = '—'): string {
  const inspected = inspectNumber(input);
  if (inspected.kind === 'missing' || inspected.kind === 'nan' || inspected.value == null) return empty;
  return inspected.value.toFixed(digits);
}

export function formatPercentSafe(input: unknown, digits = 1, scale = 100, empty = '—'): string {
  const inspected = inspectNumber(input);
  if (inspected.kind === 'missing' || inspected.kind === 'nan' || inspected.value == null) return empty;
  return `${(inspected.value * scale).toFixed(digits)}%`;
}

export function formatSignedPercentSafe(input: unknown, digits = 2, scale = 100, empty = '—'): string {
  const inspected = inspectNumber(input);
  if (inspected.kind === 'missing' || inspected.kind === 'nan' || inspected.value == null) return empty;
  const pct = inspected.value * scale;
  return `${pct > 0 ? '+' : pct < 0 ? '-' : ''}${Math.abs(pct).toFixed(digits)}%`;
}

export function formatCompactMoneySafe(input: unknown, empty = '—'): string {
  const inspected = inspectNumber(input);
  if (inspected.kind === 'missing' || inspected.kind === 'nan' || inspected.value == null) return empty;
  const value = inspected.value;
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return value.toFixed(0);
}

export function formatSignedCompactMoneySafe(input: unknown, empty = '—'): string {
  const inspected = inspectNumber(input);
  if (inspected.kind === 'missing' || inspected.kind === 'nan' || inspected.value == null) return empty;
  const sign = inspected.value > 0 ? '+' : inspected.value < 0 ? '-' : '';
  return `${sign}${formatCompactMoneySafe(Math.abs(inspected.value), empty)}`;
}

export function formatCountSafe(input: unknown, empty = '—'): string {
  const inspected = inspectNumber(input);
  if (inspected.kind === 'missing' || inspected.kind === 'nan' || inspected.value == null) return empty;
  return `${inspected.value}`;
}
