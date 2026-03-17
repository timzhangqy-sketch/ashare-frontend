#!/opt/ashare_venv/bin/python
# -*- coding: utf-8 -*-
"""
weak_buy_scanner.py — 弱市吸筹策略
替代原 GREEN10

策略逻辑：
  在弱市(bearish/weak)中，找到过去60日内有聪明资金逆势放量吸筹的超跌票。
  1. 当日市场环境为 bearish 或 weak（ashare_market_breadth）
  2. 60日内弱市放量正收益天数 >= 3（放量=当日量>前20日均量排除近3天×1.5）
  3. 弱市放量日平均涨幅在 3%~5%
  4. 60日涨幅 < -10%（超跌）
  5. 日均60日成交额 >= 2000万
  6. 排除ST/北交所

回测表现：T+5 = +3.04%, 胜率67.8%, T+10 = +5.33%, 胜率68.1%
仅弱市天出信号，日均约10只

用法：
  source /opt/ashare_env.sh
  /opt/ashare_venv/bin/python /opt/weak_buy_scanner.py --date 20260314
  /opt/ashare_venv/bin/python /opt/weak_buy_scanner.py --date 20260314 --dry_run
"""

import os
import sys
import argparse
import datetime as dt
import psycopg2
from psycopg2.extras import RealDictCursor


def env(key, default=""):
    return os.environ.get(key, default) or default


def get_db_conn():
    host = env("ASHARE_DB_HOST", "localhost")
    dbname = env("ASHARE_DB_NAME", "ashare")
    user = env("ASHARE_DB_USER", "ashare_user")
    password = env("ASHARE_DB_PASS", "")
    if not password:
        raise RuntimeError("ASHARE_DB_PASS is empty. Please export it via /opt/ashare_env.sh")
    return psycopg2.connect(host=host, dbname=dbname, user=user, password=password)


def parse_date(s):
    s = s.replace("-", "")
    return dt.datetime.strptime(s, "%Y%m%d").date()


SCAN_SQL = """
WITH regime_check AS (
    SELECT market_regime
    FROM ashare_market_breadth
    WHERE trade_date = %(trade_date)s
),
base AS (
    SELECT
        p.ts_code,
        p.trade_date,
        p.close,
        p.vol,
        p.amount,
        p.close / NULLIF(LAG(p.close, 1) OVER w, 0) - 1 AS daily_ret,
        AVG(p.vol) OVER (PARTITION BY p.ts_code ORDER BY p.trade_date
            ROWS BETWEEN 22 PRECEDING AND 3 PRECEDING) AS vol_20_clean,
        mb.market_regime AS regime
    FROM ashare_daily_price p
    JOIN ashare_stock_basic s
        ON p.ts_code = s.ts_code
        AND s.status = 'L'
        AND p.ts_code NOT LIKE '%%.BJ'
        AND (s.is_st IS NULL OR s.is_st = false)
    LEFT JOIN ashare_market_breadth mb ON p.trade_date = mb.trade_date
    WHERE p.trade_date BETWEEN (%(trade_date)s::date - INTERVAL '90 days')::date
                          AND %(trade_date)s::date
        AND p.amount >= 5000
    WINDOW w AS (PARTITION BY p.ts_code ORDER BY p.trade_date)
),
factors AS (
    SELECT
        b.ts_code,
        b.trade_date,
        b.close,
        b.amount,
        SUM(CASE WHEN b.regime IN ('bearish','weak') AND b.daily_ret > 0
            AND b.vol_20_clean > 0 AND b.vol > b.vol_20_clean * 1.5
            THEN 1 ELSE 0 END) OVER w60 AS volup15_days,
        AVG(CASE WHEN b.regime IN ('bearish','weak') AND b.daily_ret > 0
            AND b.vol_20_clean > 0 AND b.vol > b.vol_20_clean * 1.5
            THEN b.daily_ret ELSE NULL END) OVER w60 AS volup15_avg_ret,
        SUM(CASE WHEN b.regime IN ('bearish','weak')
            THEN 1 ELSE 0 END) OVER w60 AS weak_days,
        b.close / NULLIF(LAG(b.close, 60) OVER w, 0) - 1 AS ret60,
        AVG(b.amount) OVER w60 AS avg_amount_60,
        b.vol_20_clean
    FROM base b
    WINDOW
        w   AS (PARTITION BY b.ts_code ORDER BY b.trade_date),
        w60 AS (PARTITION BY b.ts_code ORDER BY b.trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW)
)
SELECT
    f.ts_code,
    s.name,
    f.close,
    f.ret60,
    f.volup15_days,
    f.volup15_avg_ret,
    f.weak_days,
    ROUND(f.amount / 100000.0, 2) AS amount_yi,
    ROUND(f.vol_20_clean / 100.0, 2) AS baseline_vol_wan
FROM factors f
JOIN ashare_stock_basic s ON f.ts_code = s.ts_code
CROSS JOIN regime_check rc
WHERE f.trade_date = %(trade_date)s
    AND rc.market_regime IN ('bearish', 'weak')
    AND f.volup15_days >= 3
    AND f.volup15_avg_ret >= 0.03
    AND f.volup15_avg_ret < 0.05
    AND f.ret60 IS NOT NULL AND f.ret60 < -0.10
    AND f.avg_amount_60 >= 20000
ORDER BY f.ret60 ASC;
"""

UPSERT_SQL = """
INSERT INTO public.ashare_weak_buy_pool (
    trade_date, ts_code, name, close, ret60,
    volup15_days, volup15_avg_ret, weak_days, amount_yi,
    status, updated_at
) VALUES (
    %(trade_date)s, %(ts_code)s, %(name)s, %(close)s, %(ret60)s,
    %(volup15_days)s, %(volup15_avg_ret)s, %(weak_days)s, %(amount_yi)s,
    'active', NOW()
)
ON CONFLICT (trade_date, ts_code) DO UPDATE SET
    name = EXCLUDED.name,
    close = EXCLUDED.close,
    ret60 = EXCLUDED.ret60,
    volup15_days = EXCLUDED.volup15_days,
    volup15_avg_ret = EXCLUDED.volup15_avg_ret,
    weak_days = EXCLUDED.weak_days,
    amount_yi = EXCLUDED.amount_yi,
    updated_at = NOW();
"""


EXPIRE_DATE_SQL = """
SELECT cal_date FROM ashare_trade_calendar
WHERE cal_date > %s AND is_open = true
ORDER BY cal_date LIMIT 1 OFFSET 19;
"""

UPSERT_WATCH_SQL = """
INSERT INTO public.ashare_weak_buy_watch (
    trade_date, ts_code, name, close, ret60,
    volup15_days, volup15_avg_ret, weak_days, amount_yi,
    baseline_vol_wan, expire_date, status, updated_at
) VALUES (
    %(trade_date)s, %(ts_code)s, %(name)s, %(close)s, %(ret60)s,
    %(volup15_days)s, %(volup15_avg_ret)s, %(weak_days)s, %(amount_yi)s,
    %(baseline_vol_wan)s, %(expire_date)s, 'active', NOW()
)
ON CONFLICT (trade_date, ts_code) DO UPDATE SET
    name = EXCLUDED.name,
    close = EXCLUDED.close,
    ret60 = EXCLUDED.ret60,
    volup15_days = EXCLUDED.volup15_days,
    volup15_avg_ret = EXCLUDED.volup15_avg_ret,
    weak_days = EXCLUDED.weak_days,
    amount_yi = EXCLUDED.amount_yi,
    baseline_vol_wan = EXCLUDED.baseline_vol_wan,
    expire_date = EXCLUDED.expire_date,
    updated_at = NOW();
"""

def run(trade_date, dry_run=False):
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT market_regime FROM ashare_market_breadth
                WHERE trade_date = %s
            """, (trade_date,))
            regime_row = cur.fetchone()

            if not regime_row:
                msg = "WEAK_BUY: no market_breadth data date=%s, skip" % trade_date
                print(msg)
                print("WEAK_BUY DONE | date=%s | regime=unknown | candidates=0 | inserted=0" % trade_date)
                return 0

            regime = regime_row['market_regime']
            print("WEAK_BUY: date=%s regime=%s" % (trade_date, regime))

            if regime not in ('bearish', 'weak'):
                print("WEAK_BUY: not weak market (%s), skip scan" % regime)
                print("WEAK_BUY DONE | date=%s | regime=%s | candidates=0 | inserted=0" % (trade_date, regime))
                return 0

            cur.execute(SCAN_SQL, dict(trade_date=trade_date))
            candidates = cur.fetchall()
            n = len(candidates)
            print("WEAK_BUY scan: date=%s regime=%s candidates=%d" % (trade_date, regime, n))

            if n == 0:
                print("WEAK_BUY DONE | date=%s | regime=%s | candidates=0 | inserted=0" % (trade_date, regime))
                return 0

            for c in candidates:
                ret_pct = float(c['ret60']) * 100
                avg_pct = float(c['volup15_avg_ret']) * 100
                print("  %s  %-6s  ret60=%.1f%%  volup=%s  avg_ret=%.2f%%  amt=%syi" % (
                    c['ts_code'], c['name'], ret_pct, c['volup15_days'], avg_pct, c['amount_yi']))

            if dry_run:
                print("WEAK_BUY DRY_RUN | date=%s | regime=%s | candidates=%d" % (trade_date, regime, n))
                print("WEAK_BUY DONE | date=%s | regime=%s | candidates=%d | inserted=0 (dry_run)" % (trade_date, regime, n))
                return 0

            cur.execute("DELETE FROM public.ashare_weak_buy_pool WHERE trade_date = %s", (trade_date,))

            inserted = 0
            for c in candidates:
                row = dict(c)
                row['trade_date'] = trade_date
                cur.execute(UPSERT_SQL, row)
                inserted += 1

            # --- 同步写入 watch 表 ---
            cur.execute(EXPIRE_DATE_SQL, (trade_date,))
            expire_row = cur.fetchone()
            expire_date = expire_row['cal_date'] if expire_row else None

            watch_inserted = 0
            if expire_date:
                for c in candidates:
                    row = dict(c)
                    row['trade_date'] = trade_date
                    row['expire_date'] = expire_date
                    cur.execute(UPSERT_WATCH_SQL, row)
                    watch_inserted += 1
                print("WEAK_BUY: wrote %d records to watch table (expire=%s)" % (watch_inserted, expire_date))
            else:
                print("WEAK_BUY: skip watch write — no expire_date found")

            conn.commit()
            print("WEAK_BUY DONE | date=%s | regime=%s | candidates=%d | pool=%d | watch=%d" % (trade_date, regime, n, inserted, watch_inserted))
            return inserted

    except Exception as e:
        conn.rollback()
        print("WEAK_BUY ERROR: %s" % e, file=sys.stderr)
        raise
    finally:
        conn.close()


def main():
    ap = argparse.ArgumentParser(description="Weak buy scanner")
    ap.add_argument("--date", type=str, default=None, help="Trade date YYYYMMDD")
    ap.add_argument("--dry_run", action="store_true", help="Scan only, no DB write")
    args = ap.parse_args()

    if args.date:
        trade_date = parse_date(args.date)
    elif os.environ.get("PIPELINE_TRADE_DATE"):
        trade_date = parse_date(os.environ["PIPELINE_TRADE_DATE"])
    else:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT MAX(trade_date) FROM public.ashare_daily_price;")
            trade_date = cur.fetchone()[0]
        conn.close()
        if not trade_date:
            print("ERROR: cannot determine trade date", file=sys.stderr)
            sys.exit(1)

    print("=" * 60)
    print("WEAK_BUY SCANNER | date=%s | dry_run=%s" % (trade_date, args.dry_run))
    print("  vol>=1.5x(clean) | volup>=3d | avg_ret 3-5%%")
    print("  ret60<-10%% | bearish/weak only | amount>=2000wan")
    print("=" * 60)

    run(trade_date, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
