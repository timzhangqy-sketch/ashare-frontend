#!/opt/ashare_venv/bin/python
"""
position_sizer.py — 仓位计算器
根据 watchlist 买入信号 + risk_score 风控评分，计算建议仓位大小
Pipeline 位置：WATCHLIST_SIGNAL 之后、WATCHLIST_EXIT 之前
"""

import argparse
import logging
import math
import os
import sys
import time
from collections import defaultdict
from datetime import datetime

import numpy as np
import psycopg2

# ─── Configuration ────────────────────────────────────────────────────────────

TOTAL_CAPITAL = 1_000_000
PER_STOCK_RISK_BUDGET = 0.02
MAX_SINGLE_STOCK_PCT = 0.15
MAX_INDUSTRY_PCT = 0.30
MAX_POSITIONS = 15
MIN_CASH_PCT = 0.20
EFF_RISK_W_VOL = 0.60
EFF_RISK_W_LIQ = 0.25
EFF_RISK_W_GAP = 0.15


# ─── Infrastructure ──────────────────────────────────────────────────────────

def setup_logging():
    log_dir = '/var/log/ashare'
    os.makedirs(log_dir, exist_ok=True)
    fmt = '%(asctime)s [%(levelname)s] %(message)s'
    handlers = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(log_dir, 'position_sizer.log'), encoding='utf-8'),
    ]
    logging.basicConfig(level=logging.INFO, format=fmt, handlers=handlers)


def get_db_conn():
    return psycopg2.connect(
        host=os.environ.get('ASHARE_DB_HOST', 'localhost'),
        dbname=os.environ.get('ASHARE_DB_NAME', 'ashare'),
        user=os.environ.get('ASHARE_DB_USER', 'ashare_user'),
        password=os.environ.get('ASHARE_DB_PASS', ''),
    )


def parse_args():
    parser = argparse.ArgumentParser(description='Position sizer for watchlist signals')
    parser.add_argument('--date', type=str, help='Trade date YYYYMMDD (default: today)')
    parser.add_argument('--dry_run', action='store_true', help='Calculate only, no DB write')
    return parser.parse_args()


# ─── Data Fetch ───────────────────────────────────────────────────────────────

def fetch_data(conn, trade_date_sql):
    cur = conn.cursor()
    data = {}

    # (1) Candidate stocks: watchlist active with buy_signal
    logging.info('Fetching signal candidates...')
    cur.execute("""
        SELECT ts_code, strategy, buy_signal, latest_close
        FROM ashare_watchlist
        WHERE status = 'active' AND buy_signal IS NOT NULL
    """)
    candidates = []
    for ts, strat, sig, close in cur.fetchall():
        candidates.append({
            'ts_code': ts,
            'strategy': strat,
            'buy_signal': sig,
            'latest_close': float(close) if close is not None else None,
        })
    data['candidates'] = candidates
    ts_codes = [c['ts_code'] for c in candidates]
    logging.info(f'Signal candidates: {len(candidates)}')

    if not ts_codes:
        data['risk'] = {}
        data['price'] = {}
        data['industry'] = {}
        data['held'] = []
        cur.close()
        return data

    # (2) Risk scores for these stocks (latest date)
    logging.info('Fetching risk scores...')
    cur.execute("""
        SELECT DISTINCT ON (ts_code)
            ts_code, position_cap_multiplier_final, trade_allowed, risk_score_total
        FROM ashare_risk_score
        WHERE ts_code = ANY(%s)
        ORDER BY ts_code, trade_date DESC
    """, (ts_codes,))
    risk_map = {}
    for ts, cap, allowed, total in cur.fetchall():
        risk_map[ts] = {
            'cap_multiplier': float(cap) if cap is not None else 1.0,
            'trade_allowed': allowed,
            'risk_score_total': float(total) if total is not None else None,
        }
    data['risk'] = risk_map
    logging.info(f'Risk scores: {len(risk_map)} stocks')

    # (3) 20-day daily price for these stocks
    logging.info('Fetching 20-day price...')
    cur.execute("""
        SELECT ts_code, trade_date, open, close, amount
        FROM ashare_daily_price
        WHERE ts_code = ANY(%s)
          AND trade_date >= (
              SELECT MIN(trade_date) FROM (
                  SELECT DISTINCT trade_date FROM ashare_daily_price
                  WHERE trade_date <= %s ORDER BY trade_date DESC LIMIT 22
              ) sub
          )
          AND trade_date <= %s
        ORDER BY ts_code, trade_date
    """, (ts_codes, trade_date_sql, trade_date_sql))
    price_map = defaultdict(list)
    for ts, td, opn, cls, amt in cur.fetchall():
        price_map[ts].append({
            'open': float(opn) if opn is not None else None,
            'close': float(cls) if cls is not None else None,
            'amount': float(amt) if amt is not None else None,
        })
    data['price'] = dict(price_map)
    logging.info(f'Price data: {len(price_map)} stocks')

    # (4) Industry
    cur.execute("""
        SELECT ts_code, industry FROM ashare_stock_basic WHERE ts_code = ANY(%s)
    """, (ts_codes,))
    data['industry'] = {ts: ind for ts, ind in cur.fetchall()}

    # (5) Current held positions
    cur.execute("""
        SELECT ts_code, shares, cost_amount, source_strategy
        FROM ashare_portfolio WHERE status = 'held'
    """)
    data['held'] = [
        {'ts_code': ts, 'shares': int(sh), 'cost_amount': float(ca), 'strategy': strat}
        for ts, sh, ca, strat in cur.fetchall()
    ]
    logging.info(f'Current held: {len(data["held"])} positions')

    cur.close()
    return data


# ─── Effective Risk Calculation ───────────────────────────────────────────────

def compute_effective_risk(candidates, data):
    """Compute effective_risk for each candidate. Returns list of enriched dicts."""
    # First pass: compute raw factors for all candidates
    raw = []
    for c in candidates:
        ts = c['ts_code']
        prices = data['price'].get(ts, [])

        # pct_chg from close sequence
        pct_chgs = []
        for i in range(1, len(prices)):
            prev_c = prices[i - 1]['close']
            cur_c = prices[i]['close']
            if prev_c and cur_c and prev_c > 0:
                pct_chgs.append((cur_c - prev_c) / prev_c)

        # (1) vol_20d: annualized volatility
        if len(pct_chgs) >= 5:
            vol_20d = max(float(np.std(pct_chgs, ddof=1)) * math.sqrt(252), 0.10)
        else:
            vol_20d = 0.30  # default high if insufficient data

        # (2) liq_factor raw: 1 / (avg_amount_k / 10000)
        amounts = [p['amount'] for p in prices if p['amount'] is not None]
        avg_amount_k = sum(amounts) / len(amounts) if amounts else 5000
        liq_raw = 1.0 / (avg_amount_k / 10000) if avg_amount_k > 0 else 10.0

        # (3) gap_factor raw: std of abs(open/prev_close - 1)
        gaps = []
        for i in range(1, len(prices)):
            prev_c = prices[i - 1]['close']
            cur_o = prices[i]['open']
            if prev_c and cur_o and prev_c > 0:
                gaps.append(abs(cur_o / prev_c - 1))
        gap_raw = float(np.std(gaps, ddof=1)) if len(gaps) >= 5 else 0.02

        raw.append({
            **c,
            'vol_20d': vol_20d,
            'liq_raw': liq_raw,
            'gap_raw': gap_raw,
        })

    # Second pass: min-max normalize liq and gap across all candidates
    if len(raw) <= 1:
        for r in raw:
            r['liq_norm'] = 0.5
            r['gap_norm'] = 0.5
    else:
        liq_vals = [r['liq_raw'] for r in raw]
        gap_vals = [r['gap_raw'] for r in raw]
        liq_min, liq_max = min(liq_vals), max(liq_vals)
        gap_min, gap_max = min(gap_vals), max(gap_vals)
        for r in raw:
            r['liq_norm'] = (r['liq_raw'] - liq_min) / (liq_max - liq_min) if liq_max > liq_min else 0.5
            r['gap_norm'] = (r['gap_raw'] - gap_min) / (gap_max - gap_min) if gap_max > gap_min else 0.5

    # Compute effective_risk
    for r in raw:
        eff = (r['vol_20d'] * EFF_RISK_W_VOL +
               r['liq_norm'] * r['vol_20d'] * EFF_RISK_W_LIQ +
               r['gap_norm'] * r['vol_20d'] * EFF_RISK_W_GAP)
        r['effective_risk'] = max(eff, 0.10)

    return raw


# ─── Position Sizing ─────────────────────────────────────────────────────────

def size_positions(enriched, data):
    """Calculate position sizes for each candidate."""
    max_single = TOTAL_CAPITAL * MAX_SINGLE_STOCK_PCT

    results = []
    for s in enriched:
        ts = s['ts_code']
        risk_info = data['risk'].get(ts, {})
        cap_mult = risk_info.get('cap_multiplier', 1.0)
        risk_total = risk_info.get('risk_score_total')

        base_pos = TOTAL_CAPITAL * PER_STOCK_RISK_BUDGET / s['effective_risk']
        capped_pos = base_pos * cap_mult
        final_amt = min(capped_pos, max_single)

        close = s['latest_close']
        if close and close > 0:
            shares = int(final_amt / close / 100) * 100
            final_amt = shares * close
        else:
            shares = 0
            final_amt = 0

        industry = data['industry'].get(ts, '未知')

        results.append({
            **s,
            'cap_mult': cap_mult,
            'risk_score_total': risk_total,
            'base_pos': round(base_pos, 0),
            'final_amt': round(final_amt, 2),
            'shares': shares,
            'industry': industry,
        })

    return results


# ─── Portfolio Constraints ────────────────────────────────────────────────────

def apply_constraints(results, data):
    """Apply MAX_POSITIONS, cash reserve, and industry limits."""
    # Sort by risk_score_total descending (higher score = better)
    results.sort(key=lambda x: x.get('risk_score_total') or 0, reverse=True)

    # 1) MAX_POSITIONS: trim to top N
    trimmed = []
    dropped_max_pos = []
    if len(results) > MAX_POSITIONS:
        trimmed_out = results[MAX_POSITIONS:]
        results = results[:MAX_POSITIONS]
        dropped_max_pos = [r['ts_code'] for r in trimmed_out]

    # Available capital = total - held - cash reserve
    held_amount = sum(h['cost_amount'] for h in data['held'])
    available = TOTAL_CAPITAL * (1 - MIN_CASH_PCT) - held_amount

    # 2) Industry limits
    # Count held industry amounts first
    held_industry = defaultdict(float)
    held_codes = {h['ts_code'] for h in data['held']}
    for h in data['held']:
        ind = data['industry'].get(h['ts_code'], '未知')
        held_industry[ind] += h['cost_amount']

    max_ind = TOTAL_CAPITAL * MAX_INDUSTRY_PCT
    cumulative = 0.0
    industry_alloc = defaultdict(float)
    final = []
    dropped_reasons = {}

    for r in results:
        ind = r['industry']
        amt = r['final_amt']

        # Skip if already held
        if r['ts_code'] in held_codes:
            dropped_reasons[r['ts_code']] = 'already_held'
            continue

        # Check cumulative cap
        if cumulative + amt > available:
            remaining = available - cumulative
            if remaining >= r['latest_close'] * 100 if r['latest_close'] else False:
                # Partial: fit what we can
                shares = int(remaining / r['latest_close'] / 100) * 100
                amt = shares * r['latest_close']
                r['shares'] = shares
                r['final_amt'] = round(amt, 2)
                if shares == 0:
                    dropped_reasons[r['ts_code']] = 'cash_limit'
                    continue
            else:
                dropped_reasons[r['ts_code']] = 'cash_limit'
                continue

        # Check industry limit
        if held_industry[ind] + industry_alloc[ind] + amt > max_ind:
            remaining_ind = max_ind - held_industry[ind] - industry_alloc[ind]
            if remaining_ind >= r['latest_close'] * 100 if r['latest_close'] else False:
                shares = int(remaining_ind / r['latest_close'] / 100) * 100
                amt = shares * r['latest_close']
                r['shares'] = shares
                r['final_amt'] = round(amt, 2)
                if shares == 0:
                    dropped_reasons[r['ts_code']] = 'industry_limit'
                    continue
            else:
                dropped_reasons[r['ts_code']] = 'industry_limit'
                continue

        cumulative += amt
        industry_alloc[ind] += amt
        final.append(r)

    return final, dropped_max_pos, dropped_reasons, cumulative, held_amount, industry_alloc


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    setup_logging()
    args = parse_args()
    t0 = time.time()

    if args.date:
        trade_date = args.date
    else:
        trade_date = datetime.now().strftime('%Y%m%d')
    td_sql = f'{trade_date[:4]}-{trade_date[4:6]}-{trade_date[6:8]}'

    logging.info(f'=== Position Sizer start | date={trade_date} dry_run={args.dry_run} ===')

    conn = get_db_conn()
    data = fetch_data(conn, td_sql)
    candidates = data['candidates']

    if not candidates:
        logging.info('=== 仓位计算 === 信号股:0只 — 无需计算 ===')
        conn.close()
        return

    # Filter out blocked stocks
    blocked = []
    passed = []
    for c in candidates:
        ts = c['ts_code']
        risk_info = data['risk'].get(ts, {})
        if risk_info.get('trade_allowed') is False:
            blocked.append(ts)
        else:
            passed.append(c)

    logging.info(f'=== 仓位计算 === 信号股:{len(candidates)}只 '
                 f'通过风控:{len(passed)}只 被拦截:{len(blocked)}只')
    if blocked:
        logging.info(f'被拦截: {blocked}')

    if not passed:
        logging.info('通过风控0只 — 无需计算')
        conn.close()
        return

    # Compute effective risk
    enriched = compute_effective_risk(passed, data)

    # Size positions
    sized = size_positions(enriched, data)

    # Apply constraints
    final, dropped_max, dropped_reasons, total_alloc, held_amount, ind_alloc = \
        apply_constraints(sized, data)

    # ── Log results ──
    logging.info(f'=== 仓位计算 === 信号股:{len(candidates)}只 通过风控:{len(passed)}只 '
                 f'最终建仓:{len(final)}只')

    if dropped_max:
        logging.info(f'超MAX_POSITIONS砍掉: {dropped_max}')
    if dropped_reasons:
        for ts, reason in dropped_reasons.items():
            logging.info(f'  约束砍掉: {ts} → {reason}')

    # Effective risk distribution (all sized stocks, before constraints)
    eff_risks = [s['effective_risk'] for s in sized]
    if eff_risks:
        arr = np.array(eff_risks)
        logging.info(f'=== eff_risk 分布 === count={len(arr)} '
                     f'min={arr.min():.4f} max={arr.max():.4f} '
                     f'median={float(np.median(arr)):.4f} mean={arr.mean():.4f}')

    # Detail table
    header = (f'{"ts_code":>10} | {"strategy":>16} | {"signal":>12} | '
              f'{"vol_20d":>7} | {"liq_raw":>8} | {"gap_raw":>8} | '
              f'{"eff_risk":>8} | {"cap_m":>5} | '
              f'{"base_pos":>9} | {"final_amt":>10} | {"shares":>6} | {"industry"}')
    logging.info(f'--- 建仓明细 ---')
    logging.info(header)
    logging.info('-' * len(header))
    for r in final:
        logging.info(
            f'{r["ts_code"]:>10} | {r["strategy"]:>16} | {r["buy_signal"]:>12} | '
            f'{r["vol_20d"]:>7.4f} | {r["liq_raw"]:>8.4f} | {r["gap_raw"]:>8.6f} | '
            f'{r["effective_risk"]:>8.4f} | {r["cap_mult"]:>5.2f} | '
            f'{r["base_pos"]:>9.0f} | {r["final_amt"]:>10.2f} | {r["shares"]:>6} | '
            f'{r["industry"]}'
        )

    # Portfolio summary
    available = TOTAL_CAPITAL * (1 - MIN_CASH_PCT) - held_amount
    cash_after = TOTAL_CAPITAL - held_amount - total_alloc
    logging.info(f'=== 组合约束 ===')
    logging.info(f'总资金: {TOTAL_CAPITAL:,.0f}  已持仓: {held_amount:,.0f}  '
                 f'可用额度: {available:,.0f}')
    logging.info(f'本次建仓: {total_alloc:,.0f}  建仓后现金: {cash_after:,.0f} '
                 f'({cash_after/TOTAL_CAPITAL*100:.1f}%)')
    logging.info(f'行业分布:')
    for ind, amt in sorted(ind_alloc.items(), key=lambda x: -x[1]):
        logging.info(f'  {ind}: {amt:,.0f} ({amt/TOTAL_CAPITAL*100:.1f}%)')

    conn.close()
    elapsed = time.time() - t0
    logging.info(f'=== Position Sizer done in {elapsed:.1f}s ===')


if __name__ == '__main__':
    main()
