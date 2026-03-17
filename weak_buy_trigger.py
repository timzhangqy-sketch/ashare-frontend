#!/opt/ashare_venv/bin/python
# -*- coding: utf-8 -*-
"""
weak_buy_trigger.py — WEAK_BUY 第二级触发脚本
每日扫描 ashare_weak_buy_watch 中 status='active' 且未过期的记录，
检查当日是否出现放量收阳（vol > baseline × 1.5 且 close > open），
若满足则写入 ashare_weak_buy_trigger 并更新 watch 状态为 triggered。
同时将过期记录标记为 expired。

Pipeline 位置：在 weak_buy_scanner 之后执行
依赖：ashare_weak_buy_watch 已有数据

用法：
  source /opt/ashare_env.sh
  /opt/ashare_venv/bin/python /opt/weak_buy_trigger.py --date 20260315
  /opt/ashare_venv/bin/python /opt/weak_buy_trigger.py --date 20260315 --dry_run
"""

import os
import sys
import argparse
import datetime as dt
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("weak_buy_trigger")


def env(key, default=""):
    return os.environ.get(key, default) or default


def get_db_conn():
    return psycopg2.connect(
        host=env("ASHARE_DB_HOST", "localhost"),
        dbname=env("ASHARE_DB_NAME", "ashare"),
        user=env("ASHARE_DB_USER", "ashare_user"),
        password=env("ASHARE_DB_PASS", ""),
    )


def parse_date(s):
    s = s.replace("-", "")
    return dt.datetime.strptime(s, "%Y%m%d").date()


def run(trade_date, dry_run=False):
    conn = get_db_conn()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # 1) 过期处理：将 expire_date < trade_date 的 active 记录标记 expired
        cur.execute("""
            UPDATE ashare_weak_buy_watch
            SET status = 'expired', updated_at = NOW()
            WHERE status = 'active' AND expire_date < %s
        """, (trade_date,))
        expired_cnt = cur.rowcount
        if expired_cnt > 0:
            log.info("  expired %d watch records (expire_date < %s)", expired_cnt, trade_date)

        # 2) 获取所有 active 且未过期的 watch 记录
        cur.execute("""
            SELECT w.id, w.trade_date AS watch_date, w.ts_code, w.name,
                   w.close AS watch_close, w.baseline_vol_wan,
                   w.ret60, w.volup15_days, w.volup15_avg_ret
            FROM ashare_weak_buy_watch w
            WHERE w.status = 'active'
              AND w.expire_date >= %s
        """, (trade_date,))
        active_watches = cur.fetchall()
        log.info("  active watch records: %d", len(active_watches))

        if not active_watches:
            if not dry_run:
                conn.commit()
            print("WEAK_BUY_TRIGGER DONE | date=%s | active=0 | triggered=0 | expired=%d" % (trade_date, expired_cnt))
            return 0

        # 3) 批量获取当日行情
        ts_codes = list({w["ts_code"] for w in active_watches})
        cur.execute("""
            SELECT ts_code, open, close, vol
            FROM ashare_daily_price
            WHERE trade_date = %s AND ts_code = ANY(%s)
        """, (trade_date, ts_codes))
        price_map = {}
        for r in cur.fetchall():
            price_map[r["ts_code"]] = r

        # 4) 逐条检查触发条件：放量收阳
        triggered = []
        for w in active_watches:
            tc = w["ts_code"]
            p = price_map.get(tc)
            if not p or not p["open"] or not p["close"] or not p["vol"]:
                continue

            today_open = float(p["open"])
            today_close = float(p["close"])
            today_vol_wan = float(p["vol"]) / 100.0
            baseline = float(w["baseline_vol_wan"]) if w["baseline_vol_wan"] else 0

            if baseline <= 0:
                continue

            # 触发条件：放量(vol > baseline * 1.5) 且 收阳(close > open)
            if today_vol_wan > baseline * 1.5 and today_close > today_open:
                days_since = (trade_date - w["watch_date"]).days
                triggered.append({
                    "watch_id": w["id"],
                    "watch_date": w["watch_date"],
                    "trigger_date": trade_date,
                    "ts_code": tc,
                    "name": w["name"],
                    "watch_close": w["watch_close"],
                    "trigger_close": today_close,
                    "trigger_vol_wan": round(today_vol_wan, 2),
                    "baseline_vol_wan": baseline,
                    "days_since_watch": days_since,
                    "ret60": w["ret60"],
                    "volup15_days": w["volup15_days"],
                    "volup15_avg_ret": w["volup15_avg_ret"],
                })

        log.info("  triggered: %d / %d", len(triggered), len(active_watches))
        for t in triggered:
            log.info("    %s %-6s watch=%s trigger=%s days=%d vol_wan=%.1f baseline=%.1f",
                     t["ts_code"], t["name"], t["watch_date"], t["trigger_date"],
                     t["days_since_watch"], t["trigger_vol_wan"], t["baseline_vol_wan"])

        if dry_run:
            print("WEAK_BUY_TRIGGER DRY_RUN | date=%s | active=%d | triggered=%d | expired=%d" % (
                trade_date, len(active_watches), len(triggered), expired_cnt))
            return 0

        # 5) 写入 trigger 表 + 更新 watch 状态
        trigger_inserted = 0
        for t in triggered:
            cur.execute("""
                INSERT INTO ashare_weak_buy_trigger (
                    watch_id, watch_date, trigger_date, ts_code, name,
                    watch_close, trigger_close, trigger_vol_wan, baseline_vol_wan,
                    days_since_watch, ret60, volup15_days, volup15_avg_ret, status
                ) VALUES (
                    %(watch_id)s, %(watch_date)s, %(trigger_date)s, %(ts_code)s, %(name)s,
                    %(watch_close)s, %(trigger_close)s, %(trigger_vol_wan)s, %(baseline_vol_wan)s,
                    %(days_since_watch)s, %(ret60)s, %(volup15_days)s, %(volup15_avg_ret)s, 'active'
                )
                ON CONFLICT (watch_id) DO NOTHING
            """, t)
            if cur.rowcount > 0:
                trigger_inserted += 1
                # 更新 watch 状态
                cur.execute("""
                    UPDATE ashare_weak_buy_watch
                    SET status = 'triggered', triggered_date = %s, updated_at = NOW()
                    WHERE id = %s
                """, (trade_date, t["watch_id"]))

        conn.commit()
        print("WEAK_BUY_TRIGGER DONE | date=%s | active=%d | triggered=%d | expired=%d" % (
            trade_date, len(active_watches), trigger_inserted, expired_cnt))
        return trigger_inserted

    except Exception as e:
        conn.rollback()
        log.error("WEAK_BUY_TRIGGER ERROR: %s", e)
        raise
    finally:
        conn.close()


def main():
    ap = argparse.ArgumentParser(description="WEAK_BUY trigger checker")
    ap.add_argument("--date", type=str, default=None, help="Trade date YYYYMMDD")
    ap.add_argument("--dry_run", action="store_true", help="Check only, no DB write")
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

    log.info("=== WEAK_BUY_TRIGGER | date=%s | dry_run=%s ===", trade_date, args.dry_run)
    run(trade_date, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
