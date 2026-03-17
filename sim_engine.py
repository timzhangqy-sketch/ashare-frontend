#!/opt/ashare_venv/bin/python
"""
sim_engine.py — 模拟盘执行引擎
每日4步：撮合昨日委托 → 更新持仓 → 生成新委托 → 快照
Pipeline 位置：SELL_SIGNAL 之后、PORTFOLIO_TRACK 之前
"""

import argparse
import json
import logging
import math
import os
import sys
import time
from collections import defaultdict
from datetime import datetime

import numpy as np
import psycopg2
sys.path.insert(0, '/opt')
from lib.state_machine import log_lifecycle_event

# ─── Configuration ────────────────────────────────────────────────────────────

INIT_CAPITAL = 1_000_000
SLIPPAGE_BUY = 0.003
SLIPPAGE_SELL = 0.003
MIN_FILL_AMOUNT_K = 5000           # 千元 = 500万元

# Position sizing (simplified, mirrors position_sizer.py)
TOTAL_CAPITAL = 1_000_000
PER_STOCK_RISK_BUDGET = 0.02
MAX_SINGLE_STOCK_PCT = 0.15
MAX_POSITIONS = 15
MIN_CASH_PCT = 0.20
MIN_POSITION_AMOUNT = 10000


# ─── Infrastructure ──────────────────────────────────────────────────────────

def setup_logging():
    log_dir = '/var/log/ashare'
    os.makedirs(log_dir, exist_ok=True)
    fmt = '%(asctime)s [%(levelname)s] %(message)s'
    handlers = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(log_dir, 'sim_engine.log'), encoding='utf-8'),
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
    parser = argparse.ArgumentParser(description='Simulation engine')
    parser.add_argument('--date', type=str, help='Trade date YYYYMMDD (default: today)')
    parser.add_argument('--dry_run', action='store_true', help='Calculate only, no DB write')
    return parser.parse_args()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def get_cash(conn):
    """Get current cash from latest snapshot, or INIT_CAPITAL if first run."""
    cur = conn.cursor()
    cur.execute("""
        SELECT cash FROM ashare_sim_portfolio_snapshot
        ORDER BY snap_date DESC LIMIT 1
    """)
    row = cur.fetchone()
    cur.close()
    return float(row[0]) if row else float(INIT_CAPITAL)


def get_prev_nav(conn):
    """Get previous day's NAV for daily P&L calculation."""
    cur = conn.cursor()
    cur.execute("""
        SELECT total_nav FROM ashare_sim_portfolio_snapshot
        ORDER BY snap_date DESC LIMIT 1
    """)
    row = cur.fetchone()
    cur.close()
    return float(row[0]) if row else float(INIT_CAPITAL)


def fetch_today_prices(conn, ts_codes, trade_date_sql):
    """Fetch today's OHLC + amount for given stocks. Also fetch prev close."""
    if not ts_codes:
        return {}
    cur = conn.cursor()
    # Get today + previous day's close for pre_close calculation
    cur.execute("""
        SELECT ts_code, trade_date, open, high, low, close, amount
        FROM ashare_daily_price
        WHERE ts_code = ANY(%s)
          AND trade_date >= (
              SELECT MAX(trade_date) FROM ashare_daily_price
              WHERE trade_date < %s
          )
          AND trade_date <= %s
        ORDER BY ts_code, trade_date
    """, (ts_codes, trade_date_sql, trade_date_sql))

    raw = defaultdict(list)
    for ts, td, o, h, l, c, a in cur.fetchall():
        raw[ts].append({
            'trade_date': td,
            'open': float(o) if o is not None else None,
            'high': float(h) if h is not None else None,
            'low': float(l) if l is not None else None,
            'close': float(c) if c is not None else None,
            'amount': float(a) if a is not None else None,
        })
    cur.close()

    result = {}
    for ts, rows in raw.items():
        today = [r for r in rows if str(r['trade_date']) == trade_date_sql]
        prev = [r for r in rows if str(r['trade_date']) != trade_date_sql]
        if today:
            entry = today[-1]
            entry['pre_close'] = prev[-1]['close'] if prev else None
            result[ts] = entry
    return result


# ─── Step 1: Fill Pending Orders ─────────────────────────────────────────────

def step1_fill_orders(conn, trade_date_sql, cash, dry_run):
    """Fill yesterday's pending orders using today's market data."""
    cur = conn.cursor()
    cur.execute("""
        SELECT id, ts_code, direction, order_shares, order_amount, strategy, signal_type
        FROM ashare_sim_orders WHERE status = 'pending'
    """)
    pending = cur.fetchall()
    cur.close()

    if not pending:
        logging.info('[Step1] No pending orders to fill.')
        return cash, []

    ts_codes = list({r[1] for r in pending})
    prices = fetch_today_prices(conn, ts_codes, trade_date_sql)

    fills = []
    cur = conn.cursor()

    for order_id, ts_code, direction, order_shares, order_amount, strategy, signal_type in pending:
        px = prices.get(ts_code)

        # No data → rejected
        if px is None or px['open'] is None:
            logging.info(f'  [Fill] {ts_code} {direction} → REJECTED: 停牌或无数据')
            if not dry_run:
                cur.execute("""
                    UPDATE ashare_sim_orders
                    SET status='rejected', reject_reason='停牌或无数据', updated_at=NOW()
                    WHERE id=%s
                """, (order_id,))
                log_lifecycle_event(conn, ts_code=ts_code, event_type='order_rejected',
                    from_status='pending', to_status='rejected', event_source='sim_engine',
                    trade_date=trade_date_sql,
                    event_payload_json={'reason': '停牌或无数据', 'order_id': order_id})
            continue

        opn, high, low, pre_close, amount = px['open'], px['high'], px['low'], px['pre_close'], px['amount']

        # Liquidity check
        if amount is not None and amount < MIN_FILL_AMOUNT_K:
            logging.info(f'  [Fill] {ts_code} {direction} → REJECTED: 流动性不足 (amount={amount:.0f}千元)')
            if not dry_run:
                cur.execute("""
                    UPDATE ashare_sim_orders
                    SET status='rejected', reject_reason='流动性不足', updated_at=NOW()
                    WHERE id=%s
                """, (order_id,))
                log_lifecycle_event(conn, ts_code=ts_code, event_type='order_rejected',
                    from_status='pending', to_status='rejected', event_source='sim_engine',
                    trade_date=trade_date_sql,
                    event_payload_json={'reason': '流动性不足', 'order_id': order_id})
            continue

        if direction == 'BUY':
            # Limit-up check: open==high and (high-pre_close)/pre_close >= 0.095
            if pre_close and high and opn == high and (high - pre_close) / pre_close >= 0.095:
                logging.info(f'  [Fill] {ts_code} BUY → REJECTED: 一字涨停')
                if not dry_run:
                    cur.execute("""
                        UPDATE ashare_sim_orders
                        SET status='rejected', reject_reason='一字涨停', updated_at=NOW()
                        WHERE id=%s
                    """, (order_id,))
                    log_lifecycle_event(conn, ts_code=ts_code, event_type='order_rejected',
                        from_status='pending', to_status='rejected', event_source='sim_engine',
                        trade_date=trade_date_sql,
                        event_payload_json={'reason': '一字涨停', 'order_id': order_id})
                continue

            fill_price = round(opn * (1 + SLIPPAGE_BUY), 4)
            fill_shares = order_shares
            fill_amount = round(fill_price * fill_shares, 2)
            slip = SLIPPAGE_BUY

            # Cash check
            if fill_amount > cash:
                logging.info(f'  [Fill] {ts_code} BUY → REJECTED: 现金不足 '
                             f'(need={fill_amount:.0f} cash={cash:.0f})')
                if not dry_run:
                    cur.execute("""
                        UPDATE ashare_sim_orders
                        SET status='rejected', reject_reason='现金不足', updated_at=NOW()
                        WHERE id=%s
                    """, (order_id,))
                    log_lifecycle_event(conn, ts_code=ts_code, event_type='order_rejected',
                        from_status='pending', to_status='rejected', event_source='sim_engine',
                        trade_date=trade_date_sql,
                        event_payload_json={'reason': '现金不足', 'order_id': order_id})
                continue

            cash -= fill_amount
            logging.info(f'  [Fill] {ts_code} BUY {fill_shares}股 @ {fill_price:.4f} '
                         f'= {fill_amount:.2f} | cash={cash:.0f}')

        else:  # SELL
            # Limit-down check: open==low and (low-pre_close)/pre_close <= -0.095
            if pre_close and low and opn == low and (low - pre_close) / pre_close <= -0.095:
                logging.info(f'  [Fill] {ts_code} SELL → REJECTED: 一字跌停')
                if not dry_run:
                    cur.execute("""
                        UPDATE ashare_sim_orders
                        SET status='rejected', reject_reason='一字跌停', updated_at=NOW()
                        WHERE id=%s
                    """, (order_id,))
                    log_lifecycle_event(conn, ts_code=ts_code, event_type='order_rejected',
                        from_status='pending', to_status='rejected', event_source='sim_engine',
                        trade_date=trade_date_sql,
                        event_payload_json={'reason': '一字跌停', 'order_id': order_id})
                continue

            fill_price = round(opn * (1 - SLIPPAGE_SELL), 4)
            fill_shares = order_shares
            fill_amount = round(fill_price * fill_shares, 2)
            slip = SLIPPAGE_SELL

            cash += fill_amount
            logging.info(f'  [Fill] {ts_code} SELL {fill_shares}股 @ {fill_price:.4f} '
                         f'= {fill_amount:.2f} | cash={cash:.0f}')

        fills.append({
            'order_id': order_id, 'ts_code': ts_code, 'direction': direction,
            'fill_price': fill_price, 'fill_shares': fill_shares,
            'fill_amount': fill_amount, 'strategy': strategy,
            'signal_type': signal_type,
        })

        if not dry_run:
            cur.execute("""
                UPDATE ashare_sim_orders
                SET status='filled', fill_date=%s, fill_price=%s, fill_shares=%s,
                    fill_amount=%s, slippage=%s, updated_at=NOW()
                WHERE id=%s
            """, (trade_date_sql, fill_price, fill_shares, fill_amount, slip, order_id))
            log_lifecycle_event(conn, ts_code=ts_code, event_type='order_filled',
                from_status='pending', to_status='filled', event_source='sim_engine',
                trade_date=trade_date_sql,
                event_payload_json={'fill_price': fill_price, 'fill_amount': fill_amount,
                    'direction': direction, 'order_id': order_id})

    if not dry_run:
        conn.commit()
    cur.close()

    logging.info(f'[Step1] Filled {len(fills)}/{len(pending)} orders | cash={cash:.0f}')
    return cash, fills


# ─── Step 2: Update Portfolio ─────────────────────────────────────────────────

def step2_update_portfolio(conn, fills, trade_date_sql, dry_run):
    """Insert new positions (BUY fills) / close positions (SELL fills)."""
    cur = conn.cursor()
    buys = [f for f in fills if f['direction'] == 'BUY']
    sells = [f for f in fills if f['direction'] == 'SELL']

    for f in buys:
        # Get stock name
        cur.execute("SELECT name FROM ashare_stock_basic WHERE ts_code=%s", (f['ts_code'],))
        name_row = cur.fetchone()
        name = name_row[0] if name_row else ''

        logging.info(f'  [Portfolio] 开仓 {f["ts_code"]} {name} '
                     f'{f["fill_shares"]}股 @ {f["fill_price"]:.4f}')
        if not dry_run:
            cur.execute("""
                INSERT INTO ashare_portfolio
                (ts_code, name, position_type, open_date, open_price, shares, cost_amount,
                 source_strategy, status, latest_close, market_value, created_at, updated_at)
                VALUES (%s, %s, 'PAPER', %s, %s, %s, %s, %s, 'open', %s, %s, NOW(), NOW())
            """, (f['ts_code'], name, trade_date_sql, f['fill_price'],
                  f['fill_shares'], f['fill_amount'], f['strategy'],
                  f['fill_price'], f['fill_amount']))
            log_lifecycle_event(conn, ts_code=f['ts_code'], event_type='position_opened',
                from_status=None, to_status='open', event_source='sim_engine',
                trade_date=trade_date_sql,
                event_payload_json={'open_price': f['fill_price'], 'shares': f['fill_shares'],
                    'strategy': f['strategy']})

    for f in sells:
        logging.info(f'  [Portfolio] 平仓 {f["ts_code"]} {f["fill_shares"]}股 '
                     f'@ {f["fill_price"]:.4f}')
        if not dry_run:
            # Find the open PAPER position for this stock
            cur.execute("""
                SELECT id, open_price, shares FROM ashare_portfolio
                WHERE ts_code=%s AND position_type='PAPER' AND status='open'
                ORDER BY open_date LIMIT 1
            """, (f['ts_code'],))
            pos_row = cur.fetchone()
            if pos_row:
                pos_id, open_price, shares = pos_row[0], float(pos_row[1]), pos_row[2]
                realized_pnl = round((f['fill_price'] - open_price) * shares, 2)
                realized_pnl_pct = round((f['fill_price'] / open_price - 1), 4) if open_price > 0 else 0
                cur.execute("""
                    UPDATE ashare_portfolio
                    SET status='closed', close_date=%s, close_price=%s,
                        realized_pnl=%s, realized_pnl_pct=%s, updated_at=NOW()
                    WHERE id=%s
                """, (trade_date_sql, f['fill_price'], realized_pnl, realized_pnl_pct, pos_id))
                log_lifecycle_event(conn, ts_code=f['ts_code'], event_type='position_closed',
                    from_status='open', to_status='closed', event_source='sim_engine',
                    portfolio_id=pos_id, trade_date=trade_date_sql,
                    event_payload_json={'close_price': f['fill_price'],
                        'realized_pnl': realized_pnl, 'realized_pnl_pct': realized_pnl_pct})

    if not dry_run:
        conn.commit()
    cur.close()
    logging.info(f'[Step2] Portfolio updated: {len(buys)} opens, {len(sells)} closes')


# ─── Step 3: Generate New Orders ─────────────────────────────────────────────

def step3_generate_orders(conn, trade_date_sql, cash, dry_run):
    """Generate BUY orders from watchlist signals + SELL orders from sell signals."""
    cur = conn.cursor()

    # ── SELL orders: portfolio with sell signals ──
    cur.execute("""
        SELECT id, ts_code, shares, source_strategy, action_signal
        FROM ashare_portfolio
        WHERE position_type = 'PAPER' AND status = 'open'
          AND action_signal IN ('STOP_LOSS','HARD_STOP','TRAILING_STOP','TREND_BREAK','TIME_DECAY')
    """)
    sell_candidates = cur.fetchall()
    sell_orders = []

    for pos_id, ts_code, shares, strategy, signal in sell_candidates:
        # Check no pending sell already
        cur.execute("""
            SELECT COUNT(*) FROM ashare_sim_orders
            WHERE ts_code=%s AND direction='SELL' AND status='pending'
        """, (ts_code,))
        if cur.fetchone()[0] > 0:
            continue
        sell_orders.append({
            'ts_code': ts_code, 'shares': shares,
            'strategy': strategy, 'signal_type': signal,
        })

    for so in sell_orders:
        logging.info(f'  [Order] SELL {so["ts_code"]} {so["shares"]}股 signal={so["signal_type"]}')
        if not dry_run:
            cur.execute("""
                INSERT INTO ashare_sim_orders
                (order_date, ts_code, direction, order_shares, strategy, signal_type, status)
                VALUES (%s, %s, 'SELL', %s, %s, %s, 'pending')
            """, (trade_date_sql, so['ts_code'], so['shares'],
                  so['strategy'], so['signal_type']))
            log_lifecycle_event(conn, ts_code=so['ts_code'], event_type='order_created',
                from_status=None, to_status='pending', event_source='sim_engine',
                trade_date=trade_date_sql,
                event_payload_json={'direction': 'SELL', 'shares': so['shares'],
                    'signal_type': so['signal_type']})

    # ── BUY orders: watchlist signals ──
    # Get candidates
    cur.execute("""
        SELECT w.id, w.ts_code, w.strategy, w.buy_signal, w.latest_close
        FROM ashare_watchlist w
        WHERE w.status = 'active' AND w.buy_signal IS NOT NULL
    """)
    buy_candidates_raw = cur.fetchall()

    # Exclude risk-blocked
    if buy_candidates_raw:
        cand_codes = list({r[1] for r in buy_candidates_raw})
        cur.execute("""
            SELECT DISTINCT ON (ts_code) ts_code, trade_allowed,
                   position_cap_multiplier_final, risk_score_total
            FROM ashare_risk_score
            WHERE ts_code = ANY(%s)
            ORDER BY ts_code, trade_date DESC
        """, (cand_codes,))
        risk_map = {}
        for ts, allowed, cap, total in cur.fetchall():
            risk_map[ts] = {
                'allowed': allowed, 'cap': float(cap) if cap is not None else 1.0,
                'total': float(total) if total is not None else 50.0,
            }
    else:
        risk_map = {}

    # Exclude already-open PAPER positions
    cur.execute("""
        SELECT ts_code FROM ashare_portfolio
        WHERE position_type='PAPER' AND status='open'
    """)
    open_paper = {r[0] for r in cur.fetchall()}

    # Exclude pending BUY orders
    cur.execute("""
        SELECT ts_code FROM ashare_sim_orders
        WHERE direction='BUY' AND status='pending'
    """)
    pending_buy = {r[0] for r in cur.fetchall()}

    # Get 20-day price for vol calculation
    filtered_codes = []
    for wl_id, ts, strat, sig, close in buy_candidates_raw:
        risk = risk_map.get(ts, {})
        if risk.get('allowed') is False:
            continue
        if ts in open_paper or ts in pending_buy:
            continue
        if close is None or float(close) <= 0:
            continue
        filtered_codes.append((wl_id, ts, strat, sig, float(close), risk))

    if not filtered_codes:
        logging.info(f'[Step3] No buy candidates after filtering.')
        if not dry_run:
            conn.commit()
        cur.close()
        return sell_orders, []

    # Fetch 22-day prices for vol
    fc_ts = list({r[1] for r in filtered_codes})
    cur.execute("""
        SELECT ts_code, trade_date, close
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
    """, (fc_ts, trade_date_sql, trade_date_sql))
    price_map = defaultdict(list)
    for ts, td, c in cur.fetchall():
        price_map[ts].append(float(c) if c is not None else None)

    # Size and sort by risk_score_total desc
    buy_sized = []
    for wl_id, ts, strat, sig, close, risk in filtered_codes:
        closes = [c for c in price_map.get(ts, []) if c is not None]
        if len(closes) >= 6:
            rets = [(closes[i] - closes[i-1]) / closes[i-1] for i in range(1, len(closes))]
            vol_20d = max(float(np.std(rets, ddof=1)) * math.sqrt(252), 0.10)
        else:
            vol_20d = 0.30

        cap_mult = risk.get('cap', 1.0)
        base_pos = TOTAL_CAPITAL * PER_STOCK_RISK_BUDGET / vol_20d
        capped_pos = base_pos * cap_mult
        max_single = TOTAL_CAPITAL * MAX_SINGLE_STOCK_PCT
        final_amt = min(capped_pos, max_single)
        shares = int(final_amt / close / 100) * 100
        if shares <= 0:
            continue
        final_amt = shares * close
        if final_amt < MIN_POSITION_AMOUNT:
            logging.info(f'  [Order] skip {ts}: position {final_amt:.0f} < MIN {MIN_POSITION_AMOUNT}')
            continue

        buy_sized.append({
            'wl_id': wl_id, 'ts_code': ts, 'strategy': strat,
            'signal_type': sig, 'close': close, 'shares': shares,
            'amount': final_amt, 'vol_20d': vol_20d, 'cap_mult': cap_mult,
            'risk_total': risk.get('total', 50.0),
        })

    # Sort by risk_score_total desc, take top MAX_POSITIONS
    buy_sized.sort(key=lambda x: x['risk_total'], reverse=True)

    # Count current open PAPER positions
    cur.execute("""
        SELECT COUNT(*) FROM ashare_portfolio
        WHERE position_type='PAPER' AND status='open'
    """)
    open_count = cur.fetchone()[0]
    slots = max(0, MAX_POSITIONS - open_count)

    buy_sized = buy_sized[:slots]

    # Cash + reserve constraint
    available = cash - TOTAL_CAPITAL * MIN_CASH_PCT
    buy_orders = []
    for b in buy_sized:
        if b['amount'] > available:
            # Try partial
            partial_shares = int(available / b['close'] / 100) * 100
            if partial_shares <= 0:
                continue
            b['shares'] = partial_shares
            b['amount'] = partial_shares * b['close']
        available -= b['amount']
        buy_orders.append(b)
        logging.info(f'  [Order] BUY {b["ts_code"]} {b["shares"]}股 '
                     f'~{b["amount"]:.0f}元 vol={b["vol_20d"]:.3f} cap={b["cap_mult"]:.2f} '
                     f'signal={b["signal_type"]} strategy={b["strategy"]}')
        if not dry_run:
            cur.execute("""
                INSERT INTO ashare_sim_orders
                (order_date, ts_code, direction, order_shares, order_amount,
                 strategy, signal_type, watchlist_id, status)
                VALUES (%s, %s, 'BUY', %s, %s, %s, %s, %s, 'pending')
            """, (trade_date_sql, b['ts_code'], b['shares'], round(b['amount'], 2),
                  b['strategy'], b['signal_type'], b['wl_id']))
            log_lifecycle_event(conn, ts_code=b['ts_code'], event_type='order_created',
                from_status=None, to_status='pending', event_source='sim_engine',
                trade_date=trade_date_sql,
                event_payload_json={'direction': 'BUY', 'shares': b['shares'],
                    'amount': round(b['amount'], 2), 'signal_type': b['signal_type']})

    if not dry_run:
        conn.commit()
    cur.close()

    logging.info(f'[Step3] Generated {len(sell_orders)} SELL + {len(buy_orders)} BUY orders')
    return sell_orders, buy_orders


# ─── Step 4: Daily Snapshot ───────────────────────────────────────────────────

def step4_snapshot(conn, trade_date_sql, cash, dry_run):
    """Compute and save daily portfolio snapshot."""
    cur = conn.cursor()

    # Get all open PAPER positions
    cur.execute("""
        SELECT ts_code, shares, open_price FROM ashare_portfolio
        WHERE position_type='PAPER' AND status='open'
    """)
    positions = [(ts, int(sh), float(op)) for ts, sh, op in cur.fetchall()]

    ts_codes = [p[0] for p in positions]
    prices = fetch_today_prices(conn, ts_codes, trade_date_sql) if ts_codes else {}

    positions_detail = []
    market_value = 0.0
    for ts, shares, open_price in positions:
        px = prices.get(ts)
        close = px['close'] if px and px['close'] else open_price
        mv = shares * close
        pnl_pct = round(close / open_price - 1, 4) if open_price > 0 else 0
        market_value += mv
        positions_detail.append({
            'ts_code': ts, 'shares': shares, 'close': close,
            'market_value': round(mv, 2), 'pnl_pct': pnl_pct,
        })

    total_nav = cash + market_value
    prev_nav = get_prev_nav(conn)
    daily_pnl = total_nav - prev_nav
    daily_pnl_pct = round(daily_pnl / prev_nav, 4) if prev_nav > 0 else 0
    cum_pnl_pct = round(total_nav / INIT_CAPITAL - 1, 4)

    logging.info(f'[Step4] NAV={total_nav:,.0f} cash={cash:,.0f} '
                 f'mkt_val={market_value:,.0f} positions={len(positions)}')
    logging.info(f'  daily_pnl={daily_pnl:,.0f} ({daily_pnl_pct*100:.2f}%) '
                 f'cum_pnl={cum_pnl_pct*100:.2f}%')

    if not dry_run:
        cur.execute("""
            INSERT INTO ashare_sim_portfolio_snapshot
            (snap_date, total_nav, cash, market_value, position_count,
             daily_pnl, daily_pnl_pct, cumulative_pnl_pct, positions_json)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (snap_date) DO UPDATE SET
                total_nav=EXCLUDED.total_nav, cash=EXCLUDED.cash,
                market_value=EXCLUDED.market_value, position_count=EXCLUDED.position_count,
                daily_pnl=EXCLUDED.daily_pnl, daily_pnl_pct=EXCLUDED.daily_pnl_pct,
                cumulative_pnl_pct=EXCLUDED.cumulative_pnl_pct,
                positions_json=EXCLUDED.positions_json
        """, (trade_date_sql, round(total_nav, 2), round(cash, 2),
              round(market_value, 2), len(positions),
              round(daily_pnl, 2), daily_pnl_pct, cum_pnl_pct,
              json.dumps(positions_detail, ensure_ascii=False)))
        conn.commit()

    cur.close()
    return total_nav


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

    logging.info(f'=== Sim Engine start | date={trade_date} dry_run={args.dry_run} ===')

    conn = get_db_conn()
    cash = get_cash(conn)
    logging.info(f'Initial cash: {cash:,.0f}')

    # Step 1: Fill pending orders
    logging.info('--- Step 1: Fill Pending Orders ---')
    cash, fills = step1_fill_orders(conn, td_sql, cash, args.dry_run)

    # Step 2: Update portfolio from fills
    logging.info('--- Step 2: Update Portfolio ---')
    step2_update_portfolio(conn, fills, td_sql, args.dry_run)

    # Step 3: Generate new orders
    logging.info('--- Step 3: Generate New Orders ---')
    sell_orders, buy_orders = step3_generate_orders(conn, td_sql, cash, args.dry_run)

    # Step 4: Daily snapshot
    logging.info('--- Step 4: Daily Snapshot ---')
    step4_snapshot(conn, td_sql, cash, args.dry_run)

    conn.close()
    elapsed = time.time() - t0
    logging.info(f'=== Sim Engine done in {elapsed:.1f}s ===')


if __name__ == '__main__':
    main()
