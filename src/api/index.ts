import axios from 'axios';
import type { RawDashboardSummaryResponse } from '../types/dashboard';

// In dev, Vite proxies /api → backend (see vite.config.ts), so baseURL is '' (relative).
// In production, set VITE_API_BASE_URL if the frontend and backend are on different origins.
const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL as string) || '',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  res => res,
  err => {
    console.error('[API Error]', err.response?.status, err.message);
    return Promise.reject(err);
  },
);

// ── Types ────────────────────────────────────────────────────────────────

export interface IgniteItem {
  rank:          number;
  ts_code:       string;
  name:          string;
  ignite_score:  number;
  s_candidate:   number;  // VR量比 sub-score
  s_turn:        number;  // 换手率 sub-score
  s_ret20:       number;  // 20日收益 sub-score
  s_rs:          number;  // RS强度 sub-score
  s_ma5:         number;  // MA5斜率 sub-score
  vr:            number;  // actual VR value
  turnover_rate: number;
  close:         number;
  pct_chg:       number;
  amount_yi:     number;  // 成交额(亿)
}

export interface ContinuationItem {
  ts_code:       string;
  name:          string;
  cont_score:    number;
  pool_day:      number;
  buy_signal:    string | null;  // 'PULLBACK' | 'REHEAT' | null
  turnover_rate: number;
  vr:            number;
}

export interface PoolItem {
  ts_code:       string;
  name:          string;
  entry_rank:    number;
  entry_score:   number;
  turnover_rate: number;
  pct_chg:       number;
  amount_yi:     number;
  vol_wan:       number;  // 成交量(万手)
}

export interface Retoc2Item {
  ts_code:       string;
  name:          string;
  rank:          number;
  grade:         string;        // 'A' | 'B'
  total_bars_10: number;        // 10日bar数
  cnt_bars:      number;        // 当日bar数
  ret10_pct:     number | null; // 10日收益%
  turnover_rate: number | null;
  pct_chg:       number | null; // 今日涨幅%
  close:         number | null;
  ma20:          number | null;
  amount_yi:     number | null; // 成交额(亿)
  buy_signal?:   string | null;
  sell_signal?:  string | null;
}

export interface PipelineStepResp {
  step:        string;
  status:      'ok' | 'warn' | 'fail';
  duration_ms: number;
  message:     string;
  started_at:  string;  // ISO datetime or "HH:MM" string
}

// ── Response normalizer ───────────────────────────────────────────────────
// All list endpoints return { date: string, data: T[] } or a bare T[].
// This helper unwraps either shape and always returns a safe array.
function toArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data))  return obj.data  as T[];
    if (Array.isArray(obj.steps)) return obj.steps as T[];
    if (Array.isArray(obj.items)) return obj.items as T[];
  }
  return [];
}

// ── API functions ─────────────────────────────────────────────────────────

export async function fetchIgnite(date: string): Promise<IgniteItem[]> {
  const res = await api.get(`/api/ignite/v2/${date}`);
  return toArray<IgniteItem>(res.data);
}

export async function fetchContinuation(date: string): Promise<ContinuationItem[]> {
  const res = await api.get(`/api/continuation/v2/${date}`);
  return toArray<ContinuationItem>(res.data);
}

export async function fetchPool(date: string): Promise<PoolItem[]> {
  const res = await api.get(`/api/pool/${date}`);
  return toArray<PoolItem>(res.data);
}

export async function fetchRetoc2(date: string): Promise<Retoc2Item[]> {
  const res = await api.get(`/api/retoc2/${date}`);
  return toArray<Retoc2Item>(res.data);
}

export async function fetchPipeline(date: string): Promise<PipelineStepResp[]> {
  const res = await api.get(`/api/pipeline/${date}`);
  return toArray<PipelineStepResp>(res.data);
}

export async function fetchTradeDates(): Promise<string[]> {
  const res = await api.get<{ dates: string[] }>('/api/trade-dates');
  return res.data.dates;
}

export interface PatternT2up9Item {
  ts_code:         string;
  name:            string;
  ret_t2:          number;  // decimal, e.g. 0.095 = 9.5%
  ret_t1:          number;
  ret_t0:          number;
  ret_2d:          number;
  in_pool:         boolean;
  in_continuation: boolean;
  anchor_date?:    string | null;
  close?:          number | null;
  amount_yi?:      number | null;
  buy_signal?:     string | null;
  sell_signal?:    string | null;
}

export interface PatternGreen10Item {
  ts_code:         string;
  name:            string;
  green_days_10d:  number;
  red_days_10d:    number;
  flat_days_10d:   number;
  in_pool:         boolean;
  in_continuation: boolean;
}

/** 弱市吸筹接口：API 返回字段 */
export interface PatternWeakBuyItem {
  ts_code:         string;
  name:            string;
  close?:          number | null;
  ret60_pct:       number;   // 60日涨跌幅，如 -0.125 表示 -12.5%
  volup15_days:    number;   // 弱市放量正收益天数
  avg_ret_pct:     number;   // 平均涨幅
  weak_days:       number;
  amount_yi:       number;   // 成交额(亿)
  status?:         string | null;
  in_pool:         boolean;
  in_continuation: boolean;
  triggered_date?: string | null;
  expire_date?:    string | null;
  in_watchlist?:   boolean;
}

export async function fetchPatternT2up9(date: string): Promise<PatternT2up9Item[]> {
  const res = await api.get(`/api/pattern/t2up9/${date}`);
  return toArray<PatternT2up9Item>(res.data);
}

export async function fetchPatternGreen10(date: string): Promise<PatternGreen10Item[]> {
  const res = await api.get(`/api/pattern/green10/${date}`);
  return toArray<PatternGreen10Item>(res.data);
}

export async function fetchPatternWeakBuy(date: string): Promise<PatternWeakBuyItem[]> {
  const res = await api.get(`/api/pattern/weak_buy/${date}`);
  return toArray<PatternWeakBuyItem>(res.data);
}

// ── Portfolio ─────────────────────────────────────────────────────────────

export interface PortfolioItem {
  id:                            number;
  ts_code:                       string;
  name:                          string;
  source_strategy:               string;
  open_date:                     string;
  open_price:                    number;
  shares:                        number;
  cost_amount:                   number | null;
  latest_close:                  number | null;
  market_value:                  number | null;
  unrealized_pnl:                number | null;
  unrealized_pnl_pct:            number | null;
  hold_days:                     number | null;
  action_signal:                 string | null;
  signal_reason:                 string | null;
  close_date:                    string | null;
  close_price:                   number | null;
  realized_pnl:                  number | null;
  realized_pnl_pct:              number | null;
  status:                        string;
  today_pnl:                     number | null;
  today_pnl_pct:                 number | null;
  drawdown_from_peak?:           number | null;
  position_cap_multiplier_final?: number | null;
  primary_concept?:              string | null;
  is_leader?:                    boolean;
  leader_reason?:                string | null;
}

export interface PortfolioResponse {
  data:          PortfolioItem[];
  total_cost:    number;
  total_value:   number;
  total_pnl:     number;
  total_pnl_pct: number;
  count:         number;
}

export interface PortfolioSummaryApi {
  total_nav:             number | null;
  initial_capital?:     number | null;
  cumulative_pnl_pct:   number | null;
  running_days?:        number | null;
  total_market_value:   number | null;
  cash:                 number | null;
  total_unrealized_pnl: number | null;
  start_date?:          string | null;
  position_count:       number | null;
  cash_ratio:           number | null;
  max_drawdown_pct?:    number | null;
  benchmark_pct?:       number | null;
}

export interface PortfolioAddPayload {
  ts_code:         string;
  name:            string;
  open_price:      number;
  shares:          number;
  open_date:       string;
  source_strategy: string;
}

export interface TransactionItem {
  id?:             number;
  ts_code:         string;
  name?:           string;
  trade_date:      string;
  trade_type:      string;   // 'BUY' | 'SELL'
  price:           number;
  shares:          number;
  amount:          number;
  trigger_source:  string | null;
  signal_type?:    string | null;
  notes?:          string | null;
}

/** Response of GET /api/portfolio/transactions */
export interface PortfolioTransactionsResponse {
  total: number;
  data:  TransactionItem[];
}

export async function fetchPortfolio(status: 'open' | 'closed' = 'open', tradeDate?: string): Promise<PortfolioResponse> {
  const params: Record<string, string> = { status };
  if (tradeDate) params.trade_date = tradeDate;
  const res = await api.get('/api/portfolio', { params });
  const raw = res.data;
  return {
    data:          toArray<PortfolioItem>(raw),
    total_cost:    raw.total_cost    ?? 0,
    total_value:   raw.total_value   ?? 0,
    total_pnl:     raw.total_pnl     ?? 0,
    total_pnl_pct: raw.total_pnl_pct ?? 0,
    count:         raw.count         ?? 0,
  };
}

export async function fetchPortfolioSummary(): Promise<PortfolioSummaryApi> {
  try {
    const res = await api.get<Record<string, unknown>>('/api/portfolio/summary');
    const raw = res.data as Record<string, unknown> | null | undefined;
    const data = (raw?.data ?? raw) as Record<string, unknown> | undefined;
    const snapshot = (data?.snapshot ?? {}) as Record<string, unknown>;
    return {
      total_nav:             (snapshot.total_nav as number) ?? (data?.total_nav as number) ?? 0,
      initial_capital:      (data?.initial_capital as number) ?? 1_000_000,
      cumulative_pnl_pct:   (snapshot.cumulative_pnl_pct as number) ?? (data?.cumulative_pnl_pct as number) ?? 0,
      running_days:         (data?.running_days as number) ?? undefined,
      total_market_value:   (data?.total_market_value as number) ?? 0,
      cash:                 (snapshot.cash as number) ?? (data?.cash as number) ?? 0,
      total_unrealized_pnl: (data?.total_unrealized_pnl as number) ?? 0,
      start_date:           (data?.start_date as string) ?? '',
      position_count:      (data?.position_count as number) ?? 0,
      cash_ratio:           (data?.cash_ratio as number) ?? 0,
      max_drawdown_pct:     (data?.max_drawdown_pct as number) ?? undefined,
      benchmark_pct:        (data?.benchmark_pct as number) ?? undefined,
    };
  } catch {
    return {
      total_nav:            0,
      initial_capital:      1_000_000,
      cumulative_pnl_pct:   0,
      total_market_value:   0,
      cash:                 0,
      total_unrealized_pnl: 0,
      start_date:           '',
      position_count:       0,
      cash_ratio:           0,
    };
  }
}

export async function addPortfolio(payload: PortfolioAddPayload): Promise<void> {
  await api.post('/api/portfolio/add', payload);
}

export async function closePortfolio(id: number, close_price: number): Promise<void> {
  const close_date = new Date().toISOString().split('T')[0];
  await api.post(`/api/portfolio/${id}/close`, { close_price, close_date });
}

export async function addPosition(id: number, price: number, shares: number, date: string): Promise<void> {
  await api.post(`/api/portfolio/${id}/add_position`, { price, shares, date });
}

export async function fetchTransactions(portfolio_id: number): Promise<TransactionItem[]> {
  const res = await api.get(`/api/portfolio/transactions/${portfolio_id}`);
  return toArray<TransactionItem>(res.data);
}

/** GET /api/portfolio/transactions — list all transactions. Table data must come from response.data.data (the array), not response.data. No date param by default so backend returns all dates. */
export async function fetchPortfolioTransactions(): Promise<PortfolioTransactionsResponse> {
  const res = await api.get<PortfolioTransactionsResponse>('/api/portfolio/transactions');
  const raw = res.data;
  // Backend returns { data: [...], total: N }. Use .data for the list so we get the full array (e.g. 25 items), not the wrapper.
  const list = raw && typeof raw === 'object' && Array.isArray((raw as PortfolioTransactionsResponse).data)
    ? (raw as PortfolioTransactionsResponse).data
    : Array.isArray(raw)
      ? (raw as TransactionItem[])
      : [];
  const total = typeof (raw as PortfolioTransactionsResponse)?.total === 'number'
    ? (raw as PortfolioTransactionsResponse).total
    : list.length;
  return { total, data: list };
}

/** GET /api/portfolio/concentration — raw strategy/industry concentration */
export async function fetchPortfolioConcentration(): Promise<Record<string, unknown>> {
  const res = await api.get('/api/portfolio/concentration');
  return (res.data && typeof res.data === 'object' ? res.data : {}) as Record<string, unknown>;
}

// ── Vol Surge ─────────────────────────────────────────────────────────────

export interface VolSurgeItem {
  ts_code:       string;
  name:          string;
  entry_rank:    number;
  close:         number;
  vr_t0:         number;  // 今日量比
  vr_t1:         number;
  vr_t2:         number;
  avg_vr3:       number;  // 3日均量比
  turnover_rate: number;
  amount_yi:     number;  // 成交额(亿)
  ret5:          number;  // 5日涨幅, decimal e.g. 0.05 = 5%
  ret20:         number;  // 20日涨幅
  ma20:          number;
}

export async function fetchVolSurge(date: string): Promise<VolSurgeItem[]> {
  const res = await api.get(`/api/vol_surge/${date}`);
  return toArray<VolSurgeItem>(res.data);
}

// ── Watchlist ─────────────────────────────────────────────────────────────

export interface WatchlistItem {
  ts_code:          string;
  name:             string;
  strategy:         string;   // e.g. 'VOL_SURGE' | 'RETOC2' | 'PATTERN_T2UP9' | 'PATTERN_GREEN10'
  entry_date:       string;   // YYYY-MM-DD
  pool_day:         number;
  latest_pct_chg:   number;   // today's pct change (%)
  gain_since_entry: number;   // cumulative gain since entry (%)
  buy_signal:       string | null;
  sell_signal:      string | null;
  // optional, 后端可能返回
  id?:              number;
  entry_price?:     number;
  latest_close?:    number;
  status?:          string;   // 'active' | 'exited'
  anom_trigger?:    number;    // 3|4|5 异动次数
  turnover_rate?:   number;   // 换手率(%)
  vr_today?:        number;   // 量比
  max_gain?:        number;   // 入池以来最大涨幅
  drawdown_from_peak?: number; // 从高点回撤
  above_ma20_days?: number;   // 站上 MA20 天数
  ret10?:           number;   // 10日涨幅，小数或百分比视后端
  entry_pct_chg?:   number;   // 入池当日涨跌(%)
  entry_rank?:      number;   // 入池排名
  avg_vr3?:         number;   // 3日均量比
  ret5_pct?:        number;   // 5日涨幅(小数)
  ret20_pct?:       number;   // 20日涨幅(小数)
  amount_yi?:       number;   // 成交额(亿)
  retoc_cnt?:       number;   // 10日异动bar数
  ret_t2?:          number;   // T-2日涨幅(%)
  ret_2d_cum?:      number;   // 两日累计涨幅(%)
  primary_concept?: string | null;
  is_leader?:       boolean;
  leader_reason?:   string | null;
}

export async function fetchWatchlist(params?: { include_exited?: boolean }): Promise<WatchlistItem[]> {
  // 使用 active 视图以获取扩展字段（如 max_gain、drawdown_from_peak、vr_today 等）
  const res = await api.get('/api/watchlist/active', { params });
  return toArray<WatchlistItem>(res.data);
}

/** GET /api/watchlist/pre_check/{ts_code} — raw pre-check response for accept handoff */
export async function fetchPreCheck(ts_code: string): Promise<Record<string, unknown>> {
  const res = await api.get(`/api/watchlist/pre_check/${encodeURIComponent(ts_code)}`);
  return (res.data && typeof res.data === 'object' ? res.data : {}) as Record<string, unknown>;
}

// ── Stock Detail ──────────────────────────────────────────────────────────

export interface FinancialYear {
  year:             number;
  revenue_yi:       number | null;
  total_profit_yi:  number | null;
  net_income_yi:    number | null;
}

export interface StockDetailResp {
  ts_code:       string;
  name:          string;
  industry:      string | null;
  is_st:         boolean;
  list_date:     string | null;
  market_cap_yi: number | null;
  pe_ttm:        number | null;
  pb:            number | null;
  turnover_rate: number | null;
  close:         number | null;
  open:          number | null;
  high:          number | null;
  low:           number | null;
  pct_chg:       number | null;
  amount_yi:     number | null;
  ma5:           number | null;
  ma10:          number | null;
  ma20:          number | null;
  vr:            number | null;
  above_ma20_days: number;
  in_watchlist:  boolean;
  watchlist_strategy?:         string;
  watchlist_entry_date?:       string;
  watchlist_entry_price?:      number;
  watchlist_pool_day?:         number;
  watchlist_gain_since_entry?: number;
  watchlist_max_gain?:         number;
  watchlist_buy_signal?:       string | null;
  watchlist_sell_signal?:      string | null;
  financials: FinancialYear[];
  primary_concept?: string | null;
  is_leader?: boolean;
  leader_reason?: string | null;
  pct_chg_5d?: number | null;
  pct_chg_10d?: number | null;
  pct_chg_20d?: number | null;
  high_60d?: number | null;
  low_60d?: number | null;
  close_vs_ma20_pct?: number | null;
  error?: string;
}

export async function fetchStockDetail(ts_code: string, date: string): Promise<StockDetailResp> {
  const res = await api.get(`/api/stock_detail/${ts_code}/${date}`);
  return res.data as StockDetailResp;
}

// ── AI Analysis ───────────────────────────────────────────────────────────

export interface AIAnalysisResp {
  bull_factors: string[];
  bear_factors: string[];
  advice:       '买入' | '持有' | '卖出';
  confidence:   number;
  stop_loss:    string;
  target:       string;
  error?:       string;
}

export async function fetchAIAnalysis(ts_code: string, date: string): Promise<AIAnalysisResp> {
  const res = await api.get(`/api/ai_analysis/${ts_code}/${date}`);
  return res.data as AIAnalysisResp;
}

// ── Backtest ──────────────────────────────────────────────────────────────

export interface BacktestSummaryItem {
  strategy:       string;
  sample_t5:      number;
  sample_t10:     number;
  sample_t20:     number;
  avg_ret_t5:     number | null;
  avg_ret_t10:    number | null;
  avg_ret_t20:    number | null;
  win_rate_t5:    number | null;
  win_rate_t10:   number | null;
  win_rate_t20:   number | null;
  median_ret_t5:  number | null;
  median_ret_t10: number | null;
  median_ret_t20: number | null;
}

export interface BacktestDetailItem {
  ts_code:     string;
  name:        string;
  strategy:    string;
  entry_date:  string;
  entry_price: number;
  ret_t5:      number | null;
  ret_t10:     number | null;
  ret_t20:     number | null;
  result_t5:   'win' | 'loss' | 'pending';
}

export async function fetchBacktestSummary(): Promise<BacktestSummaryItem[]> {
  const res = await api.get('/api/backtest/summary');
  return toArray<BacktestSummaryItem>(res.data);
}

export async function fetchBacktestDetail(strategy: string, limit = 200): Promise<BacktestDetailItem[]> {
  const res = await api.get('/api/backtest/detail', { params: { strategy, limit } });
  return toArray<BacktestDetailItem>(res.data);
}

export interface ResearchFactorIcItem {
  factor_name: string;
  horizon: 'T1' | 'T3' | 'T5' | 'T10' | 'T20';
  ic: number;
  icir: number;
  bucket: string;
  corr_placeholder?: string | null;
}

export interface ResearchAttributionItem {
  group_type: 'strategy' | 'market' | 'style';
  group_key: string;
  sample_n: number;
  avg_return: number;
  win_rate: number;
  drawdown: number;
}

export interface ResearchResonanceItem {
  ts_code: string;
  name: string;
  strategies: string[];
  strategy_count: number;
  avg_score: number;
}

async function tryResearchGet<T>(paths: string[], params?: Record<string, string | number | undefined>): Promise<T> {
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

export interface FactorMetaItem {
  cn: string;
  formula: string;
  group: string;
  applied: boolean;
  note: string;
}

export async function fetchFactorMeta(): Promise<Record<string, FactorMetaItem>> {
  try {
    const res = await api.get('/api/research/factor_meta');
    return (res.data as { factors: Record<string, FactorMetaItem> }).factors ?? {};
  } catch {
    return {};
  }
}

export async function fetchResearchFactorIc(
  strategy?: string,
): Promise<ResearchFactorIcItem[]> {
  const raw = await tryResearchGet<unknown>(
    ['/api/research/factor_ic', '/api/research/factor-ic', '/api/factor_ic', '/api/factor/ic'],
    { strategy },
  );
  return toArray<ResearchFactorIcItem>(raw);
}

export async function fetchResearchAttribution(
  strategy?: string,
): Promise<ResearchAttributionItem[]> {
  const raw = await tryResearchGet<unknown>(
    ['/api/research/strategy_attribution', '/api/research/attribution', '/api/attribution'],
    { strategy },
  );
  return toArray<ResearchAttributionItem>(raw);
}

export async function fetchResearchResonance(
  strategy?: string,
): Promise<ResearchResonanceItem[]> {
  const raw = await tryResearchGet<unknown>(
    ['/api/research/resonance_analysis', '/api/research/resonance', '/api/resonance'],
    { strategy },
  );
  return toArray<ResearchResonanceItem>(raw);
}

// ── Latest Data Date ─────────────────────────────────────────────────────

export async function fetchLatestDataDate(): Promise<string | null> {
  try {
    const res = await api.get('/api/latest-data-date');
    return res.data?.trade_date ?? null;
  } catch {
    return null;
  }
}

// ── K-line ─────────────────────────────────────────────────────────────────

export interface KlineItem {
  date:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
  ma5:    number | null;
  ma10:   number | null;
  ma20:   number | null;
}

export async function fetchKline(tsCode: string, days = 60): Promise<KlineItem[]> {
  const res = await api.get(`/api/kline/${tsCode}`, { params: { days } });
  return toArray<KlineItem>(res.data);
}

// ── Cross-strategy ─────────────────────────────────────────────────────────

export async function fetchCrossStrategies(): Promise<Record<string, string[]>> {
  const res = await api.get('/api/watchlist/cross_strategies');
  return (res.data?.data ?? {}) as Record<string, string[]>;
}

export interface RiskApiItem {
  ts_code: string;
  name?: string | null;
  trade_date?: string | null;
  source_domain?: 'watchlist' | 'portfolio' | null;
  source_strategy?: string | null;
  in_watchlist?: boolean | null;
  in_portfolio?: boolean | null;
  trade_allowed?: boolean | null;
  block_reason?: string | null;
  block_source?: string | null;
  risk_score_total?: number | null;
  risk_score_financial?: number | null;
  risk_score_market?: number | null;
  risk_score_event?: number | null;
  risk_score_compliance?: number | null;
  cap_financial?: number | null;
  cap_market?: number | null;
  cap_event?: number | null;
  cap_compliance?: number | null;
  position_cap_multiplier_final?: number | null;
  risk_level?: string | null;
  detail_json?: Record<string, unknown> | null;
}

export interface SimOrderApiItem {
  id?: string | number | null;
  order_id?: string | number | null;
  ts_code?: string | null;
  name?: string | null;
  source_domain?: string | null;
  source_strategy?: string | null;
  order_type?: string | null;
  side?: string | null;
  qty?: number | null;
  shares?: number | null;
  price?: number | null;
  submit_time?: string | null;
  trade_date?: string | null;
  status?: string | null;
  fill_status?: string | null;
  trade_allowed?: boolean | null;
  block_reason?: string | null;
  block_source?: string | null;
  risk_level?: string | null;
  position_cap_multiplier_final?: number | null;
  related_fill_ids?: Array<string | number> | null;
  related_position_id?: string | number | null;
}

export interface SimPositionApiItem {
  id?: string | number | null;
  position_id?: string | number | null;
  ts_code?: string | null;
  name?: string | null;
  source_domain?: string | null;
  source_strategy?: string | null;
  trade_date?: string | null;
  entry_time?: string | null;
  entry_price?: number | null;
  shares?: number | null;
  market_value?: number | null;
  unrealized_pnl?: number | null;
  unrealized_pnl_pct?: number | null;
  status?: string | null;
  trade_allowed?: boolean | null;
  block_reason?: string | null;
  block_source?: string | null;
  risk_level?: string | null;
  position_cap_multiplier_final?: number | null;
  related_order_id?: string | number | null;
  related_fill_ids?: Array<string | number> | null;
}

export interface SimFillApiItem {
  id?: string | number | null;
  fill_id?: string | number | null;
  order_id?: string | number | null;
  position_id?: string | number | null;
  ts_code?: string | null;
  name?: string | null;
  source_domain?: string | null;
  source_strategy?: string | null;
  trade_date?: string | null;
  side?: string | null;
  fill_time?: string | null;
  fill_price?: number | null;
  fill_qty?: number | null;
  fill_status?: string | null;
  order_status?: string | null;
  trade_allowed?: boolean | null;
  block_reason?: string | null;
  block_source?: string | null;
  risk_level?: string | null;
  position_cap_multiplier_final?: number | null;
}

async function tryRiskGet<T>(paths: string[], params?: Record<string, string | undefined>): Promise<T> {
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

async function tryExecutionGet<T>(
  paths: string[],
  params?: Record<string, string | number | undefined>,
): Promise<T> {
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

export async function fetchSimOrders(tradeDate?: string, strategy?: string): Promise<SimOrderApiItem[]> {
  const raw = await tryExecutionGet<unknown>(
    ['/api/sim/orders', '/api/execution/orders', '/api/sim_orders'],
    { trade_date: tradeDate, strategy },
  );
  return toArray<SimOrderApiItem>(raw);
}

export async function fetchSimPositions(tradeDate?: string, strategy?: string): Promise<SimPositionApiItem[]> {
  const raw = await tryExecutionGet<unknown>(
    ['/api/sim/positions', '/api/execution/positions', '/api/sim_positions'],
    { trade_date: tradeDate, strategy },
  );
  return toArray<SimPositionApiItem>(raw);
}

export async function fetchSimFills(tradeDate?: string, strategy?: string): Promise<SimFillApiItem[]> {
  const raw = await tryExecutionGet<unknown>(
    ['/api/sim/fills', '/api/execution/fills', '/api/sim/trades', '/api/execution/trades'],
    { trade_date: tradeDate, strategy },
  );
  return toArray<SimFillApiItem>(raw);
}

export async function fetchExecutionChecks(
  tradeDate?: string,
  strategy?: string,
): Promise<RiskApiItem[]> {
  const raw = await tryExecutionGet<unknown>(
    ['/api/execution/constraints', '/api/sim/constraints', '/api/execution/checks', '/api/sim/checks'],
    { trade_date: tradeDate, strategy },
  );
  return toArray<RiskApiItem>(raw);
}

export async function fetchRiskGateBlocks(tradeDate?: string, scope?: 'all' | 'watchlist' | 'portfolio'): Promise<RiskApiItem[]> {
  const raw = await tryRiskGet<unknown>(
    ['/api/risk/gate_blocks', '/api/risk/gates', '/api/risk/gate-blocks'],
    { trade_date: tradeDate, scope },
  );
  return toArray<RiskApiItem>(raw);
}

export async function fetchRiskTopScores(tradeDate?: string, scope?: 'all' | 'watchlist' | 'portfolio'): Promise<RiskApiItem[]> {
  const raw = await tryRiskGet<unknown>(
    ['/api/risk/top_scores', '/api/risk/top-scores'],
    { trade_date: tradeDate, scope },
  );
  return toArray<RiskApiItem>(raw);
}

export async function fetchRiskDetail(tsCode: string, tradeDate: string): Promise<RiskApiItem | null> {
  const raw = await tryRiskGet<unknown>(
    [`/api/risk/${tsCode}/${tradeDate}`, `/api/risk/detail/${tsCode}/${tradeDate}`],
  );
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw as Record<string, unknown>;
  if (payload.data && typeof payload.data === 'object') return payload.data as unknown as RiskApiItem;
  return payload as unknown as RiskApiItem;
}

export async function getDashboardSummary(tradeDate?: string): Promise<RawDashboardSummaryResponse> {
  const res = await api.get('/api/dashboard/summary', {
    params: tradeDate ? { trade_date: tradeDate } : undefined,
  });
  return (res.data ?? {}) as RawDashboardSummaryResponse;
}

// ── Dashboard action list ─────────────────────────────────────────────────

export interface ActionListSellItem {
  ts_code?: string;
  name?: string;
  strategy?: string;
  signal?: string;
  gain_pct?: number | null;
  reason_cn?: string;
  [key: string]: unknown;
}

export interface ActionListBuyItem {
  ts_code?: string;
  name?: string;
  strategy?: string;
  signal?: string;
  reason?: string;
  risk_score?: number | null;
  [key: string]: unknown;
}

export interface ActionListWatchItem {
  ts_code?: string;
  name?: string;
  reason?: string;
  risk_score?: number | null;
  [key: string]: unknown;
}

/** Backend response: { trade_date, actions: { sell, buy, watch }, summary: { sell_count, buy_count, watch_count } } */
interface ActionListRawResponse {
  trade_date?: string;
  actions?: {
    sell?: ActionListSellItem[];
    buy?: ActionListBuyItem[];
    watch?: ActionListWatchItem[];
    fills?: ActionListFillItem[];
  };
  summary?: {
    sell_count?: number;
    buy_count?: number;
    watch_count?: number;
  };
}

export interface ActionListFillItem {
  direction: string;
  ts_code: string;
  name: string;
  fill_price: number | null;
  fill_shares: number | null;
  fill_amount: number | null;
  strategy: string;
  signal_type: string;
  pnl_pct: number | null;
}

export interface ActionListResponse {
  sell_count: number;
  buy_count: number;
  watch_count: number;
  sell: ActionListSellItem[];
  buy: ActionListBuyItem[];
  watch: ActionListWatchItem[];
  fills: ActionListFillItem[];
}

export async function fetchActionList(date?: string): Promise<ActionListResponse> {
  const res = await api.get<ActionListRawResponse>('/api/dashboard/action_list', { params: date ? { date } : {} });
  const raw = res.data ?? {};
  const actions = raw.actions ?? {};
  const summary = raw.summary ?? {};
  return {
    sell: Array.isArray(actions.sell) ? actions.sell : [],
    buy: Array.isArray(actions.buy) ? actions.buy : [],
    watch: Array.isArray(actions.watch) ? actions.watch : [],
    fills: Array.isArray(actions.fills) ? actions.fills : [],
    sell_count: summary.sell_count ?? 0,
    buy_count: summary.buy_count ?? 0,
    watch_count: summary.watch_count ?? 0,
  };
}

// ── Market regime ─────────────────────────────────────────────────────────

export interface MarketRegimeResp {
  trade_date: string;
  regime:     string;
  label:      string;
  level:      'positive' | 'mild' | 'warning' | 'danger' | 'unknown';
}

export async function fetchMarketRegime(): Promise<MarketRegimeResp | null> {
  const res = await api.get<MarketRegimeResp>('/api/market/regime');
  const payload = res.data;
  if (!payload || typeof payload !== 'object') return null;
  return payload as MarketRegimeResp;
}

// ── Concept Stats ─────────────────────────────────────────────────────────

import type {
  ConceptMomentum,
  ConceptSurge,
  ConceptRetreat,
  ConceptResonance,
  MarketDistribution,
} from '../types/dashboard';

export async function fetchConceptMomentum(date: string): Promise<ConceptMomentum[]> {
  try {
    const res = await api.get('/api/concept-stats/top-momentum', { params: { date } });
    return toArray<ConceptMomentum>(res.data);
  } catch { return []; }
}

export async function fetchConceptSurge(date: string): Promise<ConceptSurge[]> {
  try {
    const res = await api.get('/api/concept-stats/surge', { params: { date } });
    return toArray<ConceptSurge>(res.data);
  } catch { return []; }
}

export async function fetchConceptRetreat(date: string): Promise<ConceptRetreat[]> {
  try {
    const res = await api.get('/api/concept-stats/retreat', { params: { date } });
    return toArray<ConceptRetreat>(res.data);
  } catch { return []; }
}

export async function fetchConceptResonance(date: string): Promise<ConceptResonance> {
  try {
    const res = await api.get('/api/concept-stats/resonance', { params: { date } });
    return (res.data ?? { resonance_hits: [], retreat_warnings: [] }) as ConceptResonance;
  } catch { return { resonance_hits: [], retreat_warnings: [] }; }
}

export async function fetchMarketDistribution(date: string): Promise<MarketDistribution | null> {
  try {
    const res = await api.get(`/api/market-distribution/${date}`);
    return (res.data ?? null) as MarketDistribution | null;
  } catch { return null; }
}

export async function fetchMarketDistributionHistory(days: number = 60): Promise<MarketDistribution[]> {
  try {
    const res = await api.get('/api/market-distribution/history', { params: { days } });
    return toArray<MarketDistribution>(res.data);
  } catch { return []; }
}

// ── Portfolio Stats ────────────────────────────────────────────────────────

export interface StrategyStatRow {
  source_strategy: string; total_trades: number; win_count: number; win_rate: number;
  avg_return_pct: number; total_pnl: number; avg_hold_days: number;
  best_return_pct: number; worst_return_pct: number; profit_loss_ratio: number | null;
}

export interface TradeRankRow {
  ts_code: string; name: string; source_strategy: string;
  hold_days: number; realized_pnl: number; return_pct: number;
}

export interface PortfolioStatsResp {
  strategy_summary: StrategyStatRow[]; top_winners: TradeRankRow[]; top_losers: TradeRankRow[];
}

export async function fetchPortfolioStats(): Promise<PortfolioStatsResp> {
  const res = await api.get('/api/portfolio/stats');
  return res.data as PortfolioStatsResp;
}

// ─── Risk Overview API ───────────────────────────────────────────────────────

export async function fetchRiskOverview(tradeDate?: string) {
  const res = await api.get('/api/risk/overview', { params: { trade_date: tradeDate } });
  return res.data as Record<string, unknown>;
}

// ─── Approval API (L3 Decision Layer) ────────────────────────────────────────

export async function fetchPendingApprovals() {
  const res = await api.get('/api/sim/pending-approvals');
  return res.data as {
    orders: Array<Record<string, unknown>>;
    config: { mode: string; rules: Record<string, unknown> };
  };
}

export async function approveOrders(orderIds: number[], reason?: string) {
  const res = await api.post('/api/sim/approve', {
    order_ids: orderIds,
    reason: reason || '手动批准',
  });
  return res.data as { updated: number; approved_ids: number[]; reason: string };
}

export async function rejectOrders(orderIds: number[], reason: string) {
  const res = await api.post('/api/sim/reject', {
    order_ids: orderIds,
    reason,
  });
  return res.data as { updated: number; rejected_ids: number[]; reason: string };
}

export async function fetchSimConfig() {
  const res = await api.get('/api/sim/config');
  return res.data as Record<string, { value: unknown; description: string; updated_at: string | null }>;
}

export async function updateSimConfig(config: Record<string, unknown>) {
  const res = await api.put('/api/sim/config', config);
  return res.data as { updated: string[] };
}

// ── Signal Summary ──────────────────────────────────────────────────────────

export async function fetchSignalSummary() {
  const res = await api.get('/api/signals/summary');
  return res.data;
}

export async function fetchDailyReview(date?: string): Promise<any> {
  const params = date ? { date } : {};
  const res = await api.get('/api/review', { params });
  return res.data;
}

export default api;
