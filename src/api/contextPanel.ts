import api, {
  fetchKline,
  fetchRiskDetail,
  fetchStockDetail,
  type KlineItem,
  type RiskApiItem,
  type StockDetailResp,
} from './index';

async function tryContextGet<T>(paths: string[], params?: Record<string, string | number | undefined>): Promise<T> {
  let lastError: unknown;
  for (const path of paths) {
    try {
      const res = await api.get(path, { params });
      return res.data as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export interface StockContextLifecycleResp {
  ts_code: string;
  entry_date?: string | null;
  pool_day?: number | null;
  gain_since_entry?: number | null;
  position_status?: string | null;
  lifecycle_label?: string | null;
}

interface ContextStockResp {
  data?: {
    basic?: { name?: string; industry?: string; is_st?: boolean; list_date?: string };
    quote?: {
      close?: number; open?: number; high?: number; low?: number;
      pct_chg?: number; turnover_rate?: number; amount_yi?: number;
      ma5?: number; ma10?: number; ma20?: number; vr?: number;
      pe_ttm?: number; pb?: number; total_mv_yi?: number;
      vol?: number; amount?: number;
    };
    watchlist_context?: {
      in_watchlist?: boolean; buy_signal?: string | null; sell_signal?: string | null;
      pool_day?: number; gain_since_entry?: number;
    };
    strategies?: { source_strategy_primary?: string };
    lifecycle?: { entry_date?: string };
  };
}

function mapContextToDetail(raw: ContextStockResp, tsCode: string): StockDetailResp | null {
  const d = raw?.data;
  if (!d?.basic && !d?.quote) return null;
  const b = d.basic ?? {};
  const q = d.quote ?? {};
  const w = d.watchlist_context ?? {};
  return {
    ts_code: tsCode,
    name: b.name ?? tsCode,
    industry: b.industry ?? null,
    is_st: b.is_st ?? false,
    list_date: b.list_date ?? null,
    market_cap_yi: q.total_mv_yi ?? null,
    pe_ttm: q.pe_ttm ?? null,
    pb: q.pb ?? null,
    turnover_rate: q.turnover_rate ?? null,
    close: q.close ?? null,
    open: q.open ?? null,
    high: q.high ?? null,
    low: q.low ?? null,
    pct_chg: q.pct_chg != null ? q.pct_chg * 100 : null,
    amount_yi: q.amount_yi ?? null,
    ma5: q.ma5 ?? null,
    ma10: q.ma10 ?? null,
    ma20: q.ma20 ?? null,
    vr: q.vr ?? null,
    above_ma20_days: 0,
    in_watchlist: w.in_watchlist ?? false,
    watchlist_strategy: d.strategies?.source_strategy_primary,
    watchlist_entry_date: d.lifecycle?.entry_date,
    watchlist_pool_day: w.pool_day,
    watchlist_gain_since_entry: w.gain_since_entry,
    watchlist_buy_signal: w.buy_signal ?? null,
    watchlist_sell_signal: w.sell_signal ?? null,
    financials: [],
  };
}

export async function fetchStockContext(tsCode: string, tradeDate: string): Promise<StockDetailResp> {
  try {
    const raw = await tryContextGet<ContextStockResp>([
      `/api/context/stock/${tsCode}`,
    ], { trade_date: tradeDate });
    const mapped = mapContextToDetail(raw, tsCode);
    if (mapped) return mapped;
    return fetchStockDetail(tsCode, tradeDate);
  } catch {
    return fetchStockDetail(tsCode, tradeDate);
  }
}

export async function fetchStockContextKline(tsCode: string): Promise<KlineItem[]> {
  try {
    const raw = await tryContextGet<unknown>([
      `/api/context/stock/${tsCode}/kline`,
    ]);
    if (Array.isArray(raw)) return raw as KlineItem[];
    if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)) {
      return (raw as { data: KlineItem[] }).data;
    }
    return [];
  } catch {
    return fetchKline(tsCode, 60);
  }
}

export async function fetchStockContextRisk(tsCode: string, tradeDate: string): Promise<RiskApiItem | null> {
  try {
    const raw = await tryContextGet<unknown>([
      `/api/context/stock/${tsCode}/risk`,
    ], { trade_date: tradeDate });
    if (!raw || typeof raw !== 'object') return null;
    if ('data' in (raw as Record<string, unknown>) && (raw as { data?: unknown }).data && typeof (raw as { data?: unknown }).data === 'object') {
      return (raw as { data: RiskApiItem }).data;
    }
    return raw as RiskApiItem;
  } catch {
    return fetchRiskDetail(tsCode, tradeDate);
  }
}

export async function fetchStockContextLifecycle(tsCode: string, tradeDate: string): Promise<StockContextLifecycleResp | null> {
  try {
    const raw = await tryContextGet<unknown>([
      `/api/context/stock/${tsCode}/lifecycle`,
    ], { trade_date: tradeDate });
    if (!raw || typeof raw !== 'object') return null;
    if ('data' in (raw as Record<string, unknown>) && (raw as { data?: unknown }).data && typeof (raw as { data?: unknown }).data === 'object') {
      return (raw as { data: StockContextLifecycleResp }).data;
    }
    return raw as StockContextLifecycleResp;
  } catch {
    const detail = await fetchStockDetail(tsCode, tradeDate);
    return {
      ts_code: tsCode,
      entry_date: detail.watchlist_entry_date ?? null,
      pool_day: detail.watchlist_pool_day ?? null,
      gain_since_entry: detail.watchlist_gain_since_entry ?? null,
      position_status: detail.in_watchlist ? 'in_watchlist' : null,
      lifecycle_label: detail.in_watchlist ? '观察中' : '未接入生命周期',
    };
  }
}
