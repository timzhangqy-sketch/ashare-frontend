#!/opt/ashare_venv/bin/python
"""
sell_signal_engine.py — 持仓卖点信号引擎
对 ashare_portfolio 中 status='open' 的持仓扫描四类卖点信号，
触发后更新 action_signal / signal_reason / updated_at。

Pipeline 位置：POSITION_SIZE 之后、WATCHLIST_EXIT 之前
四类卖点（按优先级）：HARD_STOP > TRAILING_STOP > TREND_BREAK > TIME_DECAY
"""

import argparse
import logging
import os
import sys
import time
from collections import defaultdict
from datetime import datetime

import numpy as np
import psycopg2
sys.path.insert(0, '/opt')
from lib.state_machine import log_lifecycle_event

# ─── Thresholds ───────────────────────────────────────────────────────────────

HARD_STOP_PCT = -0.10          # 浮亏 >= 10%
TRAILING_STOP_DD = 0.15        # 从最高价回撤 >= 15%
TREND_BREAK_DAYS = 3           # 连续N日 close < MA20
TIME_DECAY_HOLD_DAYS = 30      # 持有交易日 >= 30
TIME_DECAY_GAIN_BAND = 0.05    # 收益在 [-5%, +5%] 之间


# ─── Infrastructure ──────────────────────────────────────────────────────────

def setup_logging():
    log_dir = '/var/log/ashare'
    os.makedirs(log_dir, exist_ok=True)
    fmt = '%(asctime)s [%(levelname)s] %(message)s'
    handlers = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(log_dir, 'sell_signal_engine.log'), encoding='utf-8'),
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
    parser = argparse.ArgumentParser(description='Sell signal engine for portfolio')
    parser.add_argument('--date', type=str, help='Trade date YYYYMMDD (default: today)')
    parser.add_argument('--dry_run', action='store_true', help='Scan only, no DB write')
    return parser.parse_args()


# ─── Data Fetch ───────────────────────────────────────────────────────────────

def fetch_data(conn, trade_date_sql):
    cur = conn.cursor()
    data = {}

    # (1) Open positions
    logging.info('Fetching open positions...')
    cur.execute("""
        SELECT id, ts_code, open_date, open_price, shares,
               max_price_since_open, latest_close
        FROM ashare_portfolio
        WHERE status = 'open'
    """)
    positions = []
    for row in cur.fetchall():
        positions.append({
            'id': row[0],
            'ts_code': row[1],
            'open_date': row[2],
            'open_price': float(row[3]) if row[3] is not None else None,
            'shares': int(row[4]),
            'max_price': float(row[5]) if row[5] is not None else None,
            'latest_close': float(row[6]) if row[6] is not None else None,
        })
    data['positions'] = positions
    ts_codes = [p['ts_code'] for p in positions]
    logging.info(f'Open positions: {len(positions)}')

    if not ts_codes:
        data['price'] = {}
        cur.close()
        return data

    # (2) 35-day daily price (enough for 30 trading days + buffer for MA20)
    logging.info('Fetching ~35-day price...')
    cur.execute("""
        SELECT ts_code, trade_date, open, close
        FROM ashare_daily_price
        WHERE ts_code = ANY(%s)
          AND trade_date >= (
              SELECT MIN(trade_date) FROM (
                  SELECT DISTINCT trade_date FROM ashare_daily_price
                  WHERE trade_date <= %s ORDER BY trade_date DESC LIMIT 35
              ) sub
          )
          AND trade_date <= %s
        ORDER BY ts_code, trade_date
    """, (ts_codes, trade_date_sql, trade_date_sql))
    price_map = defaultdict(list)
    for ts, td, opn, cls in cur.fetchall():
        price_map[ts].append({
            'trade_date': td,
            'open': float(opn) if opn is not None else None,
            'close': float(cls) if cls is not None else None,
        })
    data['price'] = dict(price_map)
    logging.info(f'Price data: {len(price_map)} stocks')

    cur.close()
    return data


# ─── Peak Maintenance ────────────────────────────────────────────────────────

def update_peaks(conn, positions, data, trade_date_sql, dry_run):
    """Update max_price_since_open and drawdown_from_peak for each position."""
    cur = conn.cursor()
    updated = 0

    for pos in positions:
        ts = pos['ts_code']
        prices = data['price'].get(ts, [])
        if not prices:
            continue

        # Current close = last available close
        current_close = prices[-1]['close']
        if current_close is None:
            continue

        # Initialize or update max_price
        max_price = pos['max_price']
        if max_price is None:
            max_price = max(pos['open_price'] or 0, current_close)
        else:
            max_price = max(max_price, current_close)

        drawdown = (max_price - current_close) / max_price if max_price > 0 else 0

        # Update position dict for downstream use
        pos['max_price'] = max_price
        pos['current_close'] = current_close
        pos['drawdown'] = drawdown

        if not dry_run:
            cur.execute("""
                UPDATE ashare_portfolio
                SET max_price_since_open = %s,
                    drawdown_from_peak = %s,
                    latest_close = %s,
                    updated_at = NOW()
                WHERE id = %s
            """, (round(max_price, 4), round(drawdown, 4), round(current_close, 4), pos['id']))
            updated += 1

    if not dry_run:
        conn.commit()
    logging.info(f'Peak maintenance: {updated} positions updated'
                 f'{" (dry_run)" if dry_run else ""}')
    cur.close()


# ─── Sell Signal Checks ──────────────────────────────────────────────────────

def check_hard_stop(pos):
    """HARD_STOP: close / open_price - 1 <= -10%"""
    close = pos.get('current_close')
    open_price = pos.get('open_price')
    if close is None or open_price is None or open_price <= 0:
        return None
    pnl_pct = close / open_price - 1
    if pnl_pct <= HARD_STOP_PCT:
        return {
            'signal': 'HARD_STOP',
            'reason': f'浮亏{pnl_pct*100:.1f}% (close={close:.2f} open={open_price:.2f})',
        }
    return None


def check_trailing_stop(pos):
    """TRAILING_STOP: drawdown from peak >= 15%"""
    dd = pos.get('drawdown', 0)
    max_p = pos.get('max_price')
    close = pos.get('current_close')
    if dd >= TRAILING_STOP_DD:
        return {
            'signal': 'TRAILING_STOP',
            'reason': f'回撤{dd*100:.1f}% (peak={max_p:.2f} close={close:.2f})',
        }
    return None


def check_trend_break(pos, data):
    """TREND_BREAK: last 3 trading days close < MA20"""
    prices = data['price'].get(pos['ts_code'], [])
    closes = [p['close'] for p in prices if p['close'] is not None]

    if len(closes) < 20:
        return None

    ma20 = sum(closes[-20:]) / 20

    # Check last 3 days all below MA20
    recent_3 = closes[-TREND_BREAK_DAYS:]
    if len(recent_3) < TREND_BREAK_DAYS:
        return None

    if all(c < ma20 for c in recent_3):
        # Count consecutive days below MA20
        consec = 0
        for c in reversed(closes):
            # Recompute rolling MA20 is complex; use final MA20 as proxy for v1
            if c < ma20:
                consec += 1
            else:
                break
        return {
            'signal': 'TREND_BREAK',
            'reason': f'连续{consec}日破MA20 (MA20={ma20:.2f} close={closes[-1]:.2f})',
        }
    return None


def check_time_decay(pos, data, trade_date_sql):
    """TIME_DECAY: hold >= 30 trading days and gain in [-5%, +5%]"""
    prices = data['price'].get(pos['ts_code'], [])
    open_date = pos['open_date']
    open_price = pos['open_price']
    close = pos.get('current_close')

    if open_date is None or open_price is None or open_price <= 0 or close is None:
        return None

    # Count trading days since open_date
    trade_dates = [p['trade_date'] for p in prices]
    hold_days = sum(1 for td in trade_dates if td > open_date)

    if hold_days < TIME_DECAY_HOLD_DAYS:
        return None

    gain = close / open_price - 1
    if -TIME_DECAY_GAIN_BAND <= gain <= TIME_DECAY_GAIN_BAND:
        return {
            'signal': 'TIME_DECAY',
            'reason': f'持有{hold_days}交易日 收益{gain*100:.1f}% (close={close:.2f} open={open_price:.2f})',
        }
    return None


def scan_signals(positions, data, trade_date_sql):
    """Scan all positions for sell signals. Returns list of (pos, signal_dict)."""
    triggered = []
    hold_count = 0

    for pos in positions:
        ts = pos['ts_code']
        if pos.get('current_close') is None:
            continue

        close = pos['current_close']
        open_price = pos['open_price']
        pnl_pct = (close / open_price - 1) if open_price and open_price > 0 else 0
        dd = pos.get('drawdown', 0)
        max_p = pos.get('max_price', 0)

        # Trend break diagnostics
        prices = data['price'].get(ts, [])
        closes = [p['close'] for p in prices if p['close'] is not None]
        if len(closes) >= 20:
            ma20 = sum(closes[-20:]) / 20
            recent_3 = closes[-TREND_BREAK_DAYS:]
            below_ma20 = sum(1 for c in reversed(closes) if c < ma20)
            # Count only consecutive
            consec_below = 0
            for c in reversed(closes):
                if c < ma20:
                    consec_below += 1
                else:
                    break
        else:
            ma20 = None
            consec_below = 0

        # Time decay diagnostics
        trade_dates = [p['trade_date'] for p in prices]
        hold_days = sum(1 for td in trade_dates if td > pos['open_date']) if pos['open_date'] else 0

        # Log all four checks per stock
        hs_tag = f'触发({pnl_pct*100:.1f}%<={HARD_STOP_PCT*100:.0f}%)' if pnl_pct <= HARD_STOP_PCT else f'未触发({pnl_pct*100:.1f}%)'
        ts_tag = f'触发(dd={dd*100:.1f}%>={TRAILING_STOP_DD*100:.0f}%)' if dd >= TRAILING_STOP_DD else f'未触发(peak={max_p:.2f} dd={dd*100:.1f}%)'
        tb_tag = f'触发(连续{consec_below}日<MA20)' if ma20 and consec_below >= TREND_BREAK_DAYS else (f'未触发({consec_below}日<MA20={ma20:.2f})' if ma20 else '未触发(数据不足)')
        td_in_band = -TIME_DECAY_GAIN_BAND <= pnl_pct <= TIME_DECAY_GAIN_BAND
        td_tag = (f'触发({hold_days}日 收益{pnl_pct*100:.1f}%)' if hold_days >= TIME_DECAY_HOLD_DAYS and td_in_band
                  else f'未触发({hold_days}日 收益{pnl_pct*100:.1f}%)')

        logging.info(f'  [{ts}] hard_stop:{hs_tag} | trail_stop:{ts_tag} | '
                     f'trend_break:{tb_tag} | time_decay:{td_tag}')

        # Priority order: HARD_STOP > TRAILING_STOP > TREND_BREAK > TIME_DECAY
        result = check_hard_stop(pos)
        if result is None:
            result = check_trailing_stop(pos)
        if result is None:
            result = check_trend_break(pos, data)
        if result is None:
            result = check_time_decay(pos, data, trade_date_sql)

        if result is not None:
            triggered.append((pos, result))
        else:
            hold_count += 1

    return triggered, hold_count


# ─── DB Update ────────────────────────────────────────────────────────────────

def apply_signals(conn, triggered, dry_run, trade_date=None):
    """Update action_signal and signal_reason for triggered positions."""
    if not triggered:
        return
    cur = conn.cursor()
    for pos, sig in triggered:
        if not dry_run:
            cur.execute("""
                UPDATE ashare_portfolio
                SET action_signal = %s,
                    signal_reason = %s,
                    updated_at = NOW()
                WHERE id = %s
            """, (sig['signal'], sig['reason'], pos['id']))
            log_lifecycle_event(conn, ts_code=pos['ts_code'], event_type='sell_signal',
                from_status='open', to_status='open', event_source='sell_signal_engine',
                portfolio_id=pos['id'], trade_date=trade_date,
                event_payload_json={'signal': sig['signal'], 'reason': sig['reason']})
    if not dry_run:
        conn.commit()
    cur.close()


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

    logging.info(f'=== Sell Signal Engine start | date={trade_date} dry_run={args.dry_run} ===')

    conn = get_db_conn()
    data = fetch_data(conn, td_sql)
    positions = data['positions']

    if not positions:
        logging.info('No open positions — nothing to scan.')
        conn.close()
        return

    # Peak maintenance
    update_peaks(conn, positions, data, td_sql, args.dry_run)

    # Scan signals
    triggered, hold_count = scan_signals(positions, data, td_sql)

    # Log results
    logging.info(f'=== 卖点扫描 === 持仓:{len(positions)}只 '
                 f'触发:{len(triggered)}只 持有:{hold_count}只')

    for pos, sig in triggered:
        logging.info(f'  {pos["ts_code"]} → {sig["signal"]}: {sig["reason"]}')

    if hold_count > 0:
        hold_list = [p['ts_code'] for p in positions
                     if p.get('current_close') is not None
                     and not any(t[0]['id'] == p['id'] for t in triggered)]
        logging.info(f'  HOLD: {hold_list}')

    # Apply to DB
    if args.dry_run:
        logging.info(f'DRY RUN: would update {len(triggered)} signals — skipped.')
    else:
        apply_signals(conn, triggered, dry_run=False, trade_date=td_sql)
        logging.info(f'Updated {len(triggered)} signals to DB.')

    conn.close()
    elapsed = time.time() - t0
    logging.info(f'=== Sell Signal Engine done in {elapsed:.1f}s ===')


if __name__ == '__main__':
    main()
