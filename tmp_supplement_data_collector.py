#!/opt/ashare_venv/bin/python
"""supplement_data_collector.py — 补充数据采集：解禁/回购/龙虎榜。

增量模式(--date): 采集当日数据
全量模式(--full): 回填历史（龙虎榜60日 + 回购2年 + 解禁watchlist+portfolio股票）
"""

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timedelta

import pandas as pd
import psycopg2
import tushare as ts


# ─── Logging ─────────────────────────────────────────────────────────────────

def setup_logging():
    log_dir = '/var/log/ashare'
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, 'supplement_data.log')
    fmt = '%(asctime)s %(levelname)s %(message)s'
    handlers = [logging.StreamHandler(sys.stdout),
                logging.FileHandler(log_file, encoding='utf-8')]
    logging.basicConfig(level=logging.INFO, format=fmt, handlers=handlers)


# ─── DB ──────────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(
        host=os.environ['ASHARE_DB_HOST'],
        port=os.environ.get('ASHARE_DB_PORT', '5432'),
        dbname=os.environ['ASHARE_DB_NAME'],
        user=os.environ['ASHARE_DB_USER'],
        password=os.environ['ASHARE_DB_PASS'],
    )


def to_date(s):
    """Convert YYYYMMDD string to YYYY-MM-DD, or return None."""
    if s is None or (isinstance(s, float) and pd.isna(s)) or s == '':
        return None
    s = str(s)
    if len(s) == 8:
        return f'{s[:4]}-{s[4:6]}-{s[6:8]}'
    return s


def to_float(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    return float(v)


# ─── 1. Share Float (解禁) ───────────────────────────────────────────────────

def collect_share_float(pro, conn, codes, dry_run=False):
    """Collect float data for given stock codes (future 90 days)."""
    cur = conn.cursor()
    today = datetime.now().strftime('%Y%m%d')
    end = (datetime.now() + timedelta(days=90)).strftime('%Y%m%d')
    total_rows = 0
    float_stocks = set()

    for i, code in enumerate(codes):
        try:
            df = pro.share_float(ts_code=code, start_date=today, end_date=end)
        except Exception as e:
            logging.warning(f'  share_float {code} failed: {e}')
            time.sleep(1)
            continue

        if df is not None and len(df) > 0:
            for _, row in df.iterrows():
                if dry_run:
                    total_rows += 1
                    float_stocks.add(code)
                    continue
                cur.execute("""
                    INSERT INTO ashare_share_float
                        (ts_code, ann_date, float_date, float_share, float_ratio, holder_name, share_type)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (ts_code, float_date, holder_name) DO UPDATE SET
                        ann_date = EXCLUDED.ann_date,
                        float_share = EXCLUDED.float_share,
                        float_ratio = EXCLUDED.float_ratio,
                        share_type = EXCLUDED.share_type,
                        created_at = NOW()
                """, (code, to_date(row.get('ann_date')), to_date(row.get('float_date')),
                      to_float(row.get('float_share')), to_float(row.get('float_ratio')),
                      row.get('holder_name', ''), row.get('share_type', '')))
                total_rows += 1
                float_stocks.add(code)

        if (i + 1) % 50 == 0:
            if not dry_run:
                conn.commit()
            logging.info(f'  解禁进度: {i+1}/{len(codes)}')
        time.sleep(0.3)

    if not dry_run:
        conn.commit()
    logging.info(f'=== 解禁数据 === 采集{len(codes)}只股票, 写入{total_rows}条, '
                 f'未来90天有解禁的{len(float_stocks)}只')
    return total_rows


def collect_share_float_full(pro, conn, dry_run=False):
    """Full mode: collect float for watchlist + portfolio stocks."""
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT ts_code FROM ashare_watchlist WHERE status='active'")
    codes = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT DISTINCT ts_code FROM ashare_portfolio WHERE status='held'")
    codes |= {r[0] for r in cur.fetchall()}
    codes = sorted(codes)
    logging.info(f'解禁全量: watchlist+portfolio {len(codes)}只')
    return collect_share_float(pro, conn, codes, dry_run)


# ─── 2. Repurchase (回购) ────────────────────────────────────────────────────

def collect_repurchase_day(pro, conn, ann_date, dry_run=False):
    """Collect repurchase announcements for one day."""
    cur = conn.cursor()
    try:
        df = pro.repurchase(ann_date=ann_date)
    except Exception as e:
        logging.warning(f'  repurchase {ann_date} failed: {e}')
        return 0

    if df is None or len(df) == 0:
        return 0

    count = 0
    for _, row in df.iterrows():
        if dry_run:
            count += 1
            continue
        cur.execute("""
            INSERT INTO ashare_repurchase
                (ts_code, ann_date, end_date, proc, exp_date, vol, amount, high_limit, low_limit)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (ts_code, ann_date) DO UPDATE SET
                end_date = EXCLUDED.end_date,
                proc = EXCLUDED.proc,
                exp_date = EXCLUDED.exp_date,
                vol = EXCLUDED.vol,
                amount = EXCLUDED.amount,
                high_limit = EXCLUDED.high_limit,
                low_limit = EXCLUDED.low_limit,
                created_at = NOW()
        """, (row['ts_code'], to_date(row.get('ann_date')), to_date(row.get('end_date')),
              row.get('proc', ''), to_date(row.get('exp_date')),
              to_float(row.get('vol')), to_float(row.get('amount')),
              to_float(row.get('high_limit')), to_float(row.get('low_limit'))))
        count += 1

    if not dry_run:
        conn.commit()
    return count


def collect_repurchase_full(pro, conn, dry_run=False):
    """Full mode: backfill repurchase for past 2 years."""
    cur = conn.cursor()
    cur.execute("""
        SELECT DISTINCT trade_date FROM ashare_daily_price
        ORDER BY trade_date DESC LIMIT 490
    """)
    dates = [str(r[0]).replace('-', '') for r in cur.fetchall()]
    dates.reverse()
    logging.info(f'回购全量回填: {len(dates)}天')

    total = 0
    for i, d in enumerate(dates):
        # Skip if already has data
        cur.execute("SELECT COUNT(*) FROM ashare_repurchase WHERE ann_date=%s", (to_date(d),))
        if cur.fetchone()[0] > 0:
            continue
        n = collect_repurchase_day(pro, conn, d, dry_run)
        total += n
        time.sleep(1)
        if (i + 1) % 50 == 0:
            logging.info(f'  回购进度: {i+1}/{len(dates)} 累计{total}条')
    logging.info(f'=== 回购全量 === {len(dates)}天, 写入{total}条')
    return total


# ─── 3. Top List + Top Inst (龙虎榜) ─────────────────────────────────────────

def collect_top_list_day(pro, conn, trade_date, dry_run=False):
    """Collect top_list + top_inst for one trading day."""
    cur = conn.cursor()
    td_sql = to_date(trade_date)

    # top_list
    try:
        df = pro.top_list(trade_date=trade_date)
    except Exception as e:
        logging.warning(f'  top_list {trade_date} failed: {e}')
        return 0, 0

    list_count = 0
    if df is not None and len(df) > 0:
        for _, row in df.iterrows():
            if dry_run:
                list_count += 1
                continue
            cur.execute("""
                INSERT INTO ashare_top_list
                    (trade_date, ts_code, name, close, pct_change, turnover_rate,
                     amount, l_sell, l_buy, l_amount, net_amount, net_rate, reason)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (trade_date, ts_code) DO UPDATE SET
                    name = EXCLUDED.name, close = EXCLUDED.close,
                    pct_change = EXCLUDED.pct_change, turnover_rate = EXCLUDED.turnover_rate,
                    amount = EXCLUDED.amount, l_sell = EXCLUDED.l_sell, l_buy = EXCLUDED.l_buy,
                    l_amount = EXCLUDED.l_amount, net_amount = EXCLUDED.net_amount,
                    net_rate = EXCLUDED.net_rate, reason = EXCLUDED.reason,
                    created_at = NOW()
            """, (td_sql, row['ts_code'], row.get('name', ''),
                  to_float(row.get('close')), to_float(row.get('pct_change')),
                  to_float(row.get('turnover_rate')), to_float(row.get('amount')),
                  to_float(row.get('l_sell')), to_float(row.get('l_buy')),
                  to_float(row.get('l_amount')), to_float(row.get('net_amount')),
                  to_float(row.get('net_rate')), row.get('reason', '')))
            list_count += 1

    if not dry_run:
        conn.commit()
    time.sleep(1)

    # top_inst
    try:
        df2 = pro.top_inst(trade_date=trade_date)
    except Exception as e:
        logging.warning(f'  top_inst {trade_date} failed: {e}')
        return list_count, 0

    inst_count = 0
    if df2 is not None and len(df2) > 0:
        for _, row in df2.iterrows():
            if dry_run:
                inst_count += 1
                continue
            side_val = str(row.get('side', '')) if row.get('side') is not None else ''
            cur.execute("""
                INSERT INTO ashare_top_inst
                    (trade_date, ts_code, exalter, side, buy, buy_rate, sell, sell_rate, net_buy, reason)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (trade_date, ts_code, exalter, side) DO UPDATE SET
                    buy = EXCLUDED.buy, buy_rate = EXCLUDED.buy_rate,
                    sell = EXCLUDED.sell, sell_rate = EXCLUDED.sell_rate,
                    net_buy = EXCLUDED.net_buy, reason = EXCLUDED.reason,
                    created_at = NOW()
            """, (td_sql, row['ts_code'], row.get('exalter', ''), side_val,
                  to_float(row.get('buy')), to_float(row.get('buy_rate')),
                  to_float(row.get('sell')), to_float(row.get('sell_rate')),
                  to_float(row.get('net_buy')), row.get('reason', '')))
            inst_count += 1

    if not dry_run:
        conn.commit()
    return list_count, inst_count


def collect_top_list_full(pro, conn, dry_run=False):
    """Full mode: backfill top_list + top_inst for past 60 trading days."""
    cur = conn.cursor()
    cur.execute("""
        SELECT DISTINCT trade_date FROM ashare_daily_price
        ORDER BY trade_date DESC LIMIT 60
    """)
    dates = [str(r[0]).replace('-', '') for r in cur.fetchall()]
    dates.reverse()
    logging.info(f'龙虎榜全量回填: {len(dates)}天')

    total_list = 0
    total_inst = 0
    for i, d in enumerate(dates):
        # Skip if already has data
        cur.execute("SELECT COUNT(*) FROM ashare_top_list WHERE trade_date=%s", (to_date(d),))
        if cur.fetchone()[0] > 0:
            continue
        lc, ic = collect_top_list_day(pro, conn, d, dry_run)
        total_list += lc
        total_inst += ic
        time.sleep(1)
        if (i + 1) % 10 == 0:
            logging.info(f'  龙虎榜进度: {i+1}/{len(dates)} list={total_list} inst={total_inst}')
    logging.info(f'=== 龙虎榜全量 === {len(dates)}天, list={total_list} inst={total_inst}')
    return total_list, total_inst


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='补充数据采集：解禁/回购/龙虎榜')
    parser.add_argument('--date', type=str, default=None, help='YYYYMMDD')
    parser.add_argument('--full', action='store_true', help='全量回填模式')
    parser.add_argument('--dry_run', action='store_true', help='不写DB')
    args = parser.parse_args()

    setup_logging()
    logging.info('=== supplement_data_collector start ===')

    pro = ts.pro_api(os.environ['TUSHARE_TOKEN'])
    conn = get_conn()

    try:
        cur = conn.cursor()

        if args.full:
            # Full backfill mode
            logging.info('=== 全量回填模式 ===')

            # 1. Float: watchlist + portfolio
            collect_share_float_full(pro, conn, args.dry_run)

            # 2. Repurchase: 2 years
            collect_repurchase_full(pro, conn, args.dry_run)

            # 3. Top list: 60 days
            collect_top_list_full(pro, conn, args.dry_run)

        else:
            # Incremental mode
            if args.date:
                trade_date = args.date
            else:
                cur.execute("SELECT MAX(trade_date) FROM ashare_daily_price")
                trade_date = str(cur.fetchone()[0]).replace('-', '')

            logging.info(f'=== 增量模式 === 日期:{trade_date}')

            # 1. Float: watchlist + portfolio
            cur.execute("SELECT DISTINCT ts_code FROM ashare_watchlist WHERE status='active'")
            codes = {r[0] for r in cur.fetchall()}
            cur.execute("SELECT DISTINCT ts_code FROM ashare_portfolio WHERE status='held'")
            codes |= {r[0] for r in cur.fetchall()}
            codes = sorted(codes)
            collect_share_float(pro, conn, codes, args.dry_run)

            # 2. Repurchase
            n = collect_repurchase_day(pro, conn, trade_date, args.dry_run)
            logging.info(f'=== 回购数据 === 当日公告{n}条')

            # 3. Top list + inst
            lc, ic = collect_top_list_day(pro, conn, trade_date, args.dry_run)
            logging.info(f'=== 龙虎榜 === 上榜{lc}只, 机构明细{ic}条')

    finally:
        conn.close()

    logging.info('=== supplement_data_collector done ===')


if __name__ == '__main__':
    main()
