#!/opt/ashare_venv/bin/python
"""
market_regime.py — 市场环境标签生成器
基于创业板指(399006.SZ)的20日涨幅，将每个交易日映射为4类市场环境。
"""

import argparse
import logging
import os
import sys
import time
from datetime import datetime

import psycopg2

INDEX_CODE = '399006.SZ'


def setup_logging():
    log_dir = '/var/log/ashare'
    os.makedirs(log_dir, exist_ok=True)
    fmt = '%(asctime)s [%(levelname)s] %(message)s'
    handlers = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(log_dir, 'market_regime.log'), encoding='utf-8'),
    ]
    logging.basicConfig(level=logging.INFO, format=fmt, handlers=handlers)


def get_db_conn():
    return psycopg2.connect(
        host=os.environ.get('ASHARE_DB_HOST', 'localhost'),
        dbname=os.environ.get('ASHARE_DB_NAME', 'ashare'),
        user=os.environ.get('ASHARE_DB_USER', 'ashare_user'),
        password=os.environ.get('ASHARE_DB_PASS', ''),
    )


def classify_regime(ret_20d):
    if ret_20d > 0.08:
        return 'trend_up'
    elif ret_20d > 0.03:
        return 'range_up'
    elif ret_20d >= -0.03:
        return 'range_choppy'
    else:
        return 'down_weak'


def compute_and_upsert(conn, trade_dates_with_close, dry_run):
    """Given a list of (trade_date, close) ordered by date, compute regime for each
    that has a 20-day-ago reference, then upsert."""
    if len(trade_dates_with_close) < 21:
        logging.warning('Not enough data to compute regime (need >= 21 rows)')
        return 0

    results = []
    for i in range(20, len(trade_dates_with_close)):
        td, close = trade_dates_with_close[i]
        _, close_20ago = trade_dates_with_close[i - 20]
        if close_20ago and close_20ago > 0:
            ret_20d = round(close / close_20ago - 1, 4)
        else:
            ret_20d = 0.0
        regime = classify_regime(ret_20d)
        results.append((td, close, ret_20d, regime))

    if dry_run:
        for td, close, ret, reg in results[-10:]:
            logging.info(f'  {td} close={close:.2f} ret_20d={ret:+.4f} → {reg}')
        logging.info(f'DRY RUN: would upsert {len(results)} rows — skipped.')
        return len(results)

    cur = conn.cursor()
    for td, close, ret_20d, regime in results:
        cur.execute("""
            INSERT INTO ashare_market_regime (trade_date, index_code, index_close, ret_20d, regime)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (trade_date) DO UPDATE SET
                index_close = EXCLUDED.index_close,
                ret_20d = EXCLUDED.ret_20d,
                regime = EXCLUDED.regime
        """, (td, INDEX_CODE, round(close, 2), ret_20d, regime))
    conn.commit()
    cur.close()
    logging.info(f'Upserted {len(results)} regime labels.')
    return len(results)


def main():
    setup_logging()
    parser = argparse.ArgumentParser(description='Market regime label generator')
    parser.add_argument('--date', type=str, help='Trade date YYYYMMDD')
    parser.add_argument('--backfill', action='store_true', help='Backfill last 120 trading days')
    parser.add_argument('--dry_run', action='store_true', help='No DB write')
    args = parser.parse_args()
    t0 = time.time()

    logging.info(f'=== Market Regime start | backfill={args.backfill} '
                 f'date={args.date} dry_run={args.dry_run} ===')

    conn = get_db_conn()
    cur = conn.cursor()

    if args.backfill:
        # Get last 140 trading days (120 + 20 for lookback)
        cur.execute("""
            SELECT trade_date, close FROM ashare_index_daily_price
            WHERE ts_code = %s
            ORDER BY trade_date DESC LIMIT 140
        """, (INDEX_CODE,))
        rows = [(r[0], float(r[1])) for r in cur.fetchall()]
        rows.reverse()  # oldest first
        logging.info(f'Backfill mode: fetched {len(rows)} trading days')
    else:
        if args.date:
            td_sql = f'{args.date[:4]}-{args.date[4:6]}-{args.date[6:8]}'
        else:
            td_sql = datetime.now().strftime('%Y-%m-%d')
        # Get 25 trading days up to date (20 lookback + a few buffer)
        cur.execute("""
            SELECT trade_date, close FROM ashare_index_daily_price
            WHERE ts_code = %s AND trade_date <= %s
            ORDER BY trade_date DESC LIMIT 25
        """, (INDEX_CODE, td_sql))
        rows = [(r[0], float(r[1])) for r in cur.fetchall()]
        rows.reverse()
        logging.info(f'Incremental mode: fetched {len(rows)} trading days up to {td_sql}')

    cur.close()

    count = compute_and_upsert(conn, rows, args.dry_run)

    conn.close()
    elapsed = time.time() - t0
    logging.info(f'=== Market Regime done in {elapsed:.1f}s | {count} labels ===')


if __name__ == '__main__':
    main()
