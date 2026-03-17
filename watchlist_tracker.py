#!/opt/ashare_venv/bin/python
# -*- coding: utf-8 -*-
"""
watchlist_tracker.py — 统一候选池追踪引擎
每日更新 ashare_watchlist 中所有 status='active' 记录的追踪字段。

用法：
  source /opt/ashare_env.sh
  /opt/ashare_venv/bin/python /opt/watchlist_tracker.py --date 20260302
  /opt/ashare_venv/bin/python /opt/watchlist_tracker.py --date 20260302 --dry_run

更新字段：
  pool_day, latest_close, latest_pct_chg, gain_since_entry,
  max_gain, drawdown_from_peak, vr_today, turnover_rate,
  ma5, ma10, ma20, above_ma20_days, updated_at
"""

import argparse
import os
import sys
import logging
from datetime import datetime

import psycopg2
import psycopg2.extras

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("watchlist_tracker")


def get_conn():
    return psycopg2.connect(
        host=os.environ["ASHARE_DB_HOST"],
        port=os.environ.get("ASHARE_DB_PORT", "5432"),
        dbname=os.environ["ASHARE_DB_NAME"],
        user=os.environ["ASHARE_DB_USER"],
        password=os.environ["ASHARE_DB_PASS"],
    )


def fetch_active_records(conn):
    """获取所有 active 记录的关键字段"""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, ts_code, entry_date, entry_price, baseline_vol_wan,
               pool_day, max_gain, above_ma20_days
        FROM public.ashare_watchlist
        WHERE status = 'active'
    """)
    rows = cur.fetchall()
    cur.close()
    return rows


def fetch_daily_data(conn, trade_date, ts_codes):
    """获取当日行情 + 基本面数据，返回 {ts_code: {close, open, vol, amount, turnover_rate, pct_chg}}"""
    if not ts_codes:
        return {}
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT
            dp.ts_code,
            dp.close,
            dp.open,
            dp.vol,          -- 手
            dp.amount,       -- 千元
            db.turnover_rate,
            (SELECT p2.close FROM public.ashare_daily_price p2
             WHERE p2.ts_code = dp.ts_code AND p2.trade_date < dp.trade_date
             ORDER BY p2.trade_date DESC LIMIT 1) AS prev_close
        FROM public.ashare_daily_price dp
        LEFT JOIN public.ashare_daily_basic db
            ON dp.ts_code = db.ts_code AND dp.trade_date = db.trade_date
        WHERE dp.trade_date = %s AND dp.ts_code = ANY(%s)
    """, (trade_date, list(ts_codes)))
    result = {}
    for row in cur.fetchall():
        # 计算当日涨跌幅（(close - 昨收) / 昨收，A股标准）
        pct_chg = None
        prev = row.get("prev_close")
        if row["close"] and prev and prev > 0:
            pct_chg = round((row["close"] - prev) / prev * 100, 4)
        row["pct_chg"] = pct_chg
        result[row["ts_code"]] = row
    cur.close()
    return result



def fetch_pool_days(conn, trade_date, active_records):
    """基于交易日历批量计算每条记录的 pool_day = entry_date 到 trade_date 之间的交易日数"""
    if not active_records:
        return {}
    cur = conn.cursor()
    result = {}
    for rec in active_records:
        entry_date = rec["entry_date"]
        if entry_date:
            cur.execute("""
                SELECT COUNT(*) FROM public.ashare_trade_calendar
                WHERE is_open = TRUE
                  AND cal_date > %s
                  AND cal_date <= %s
            """, (entry_date, trade_date))
            result[rec["id"]] = cur.fetchone()[0] or 0
        else:
            result[rec["id"]] = 0
    cur.close()
    return result


def fetch_ma_data(conn, trade_date, ts_codes):
    """
    计算 MA5/MA10/MA20 和 above_ma20 连续天数。
    返回 {ts_code: {ma5, ma10, ma20, close_vs_ma20}}
    close_vs_ma20: True=当日收盘在MA20上方, False=下方
    """
    if not ts_codes:
        return {}
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # 获取每只股票最近20个交易日的收盘价
    cur.execute("""
        SELECT ts_code, trade_date, close
        FROM (
            SELECT ts_code, trade_date, close,
                   ROW_NUMBER() OVER (PARTITION BY ts_code ORDER BY trade_date DESC) AS rn
            FROM public.ashare_daily_price
            WHERE trade_date <= %s AND ts_code = ANY(%s)
        ) sub
        WHERE rn <= 20
        ORDER BY ts_code, trade_date DESC
    """, (trade_date, list(ts_codes)))

    # 按 ts_code 分组
    from collections import defaultdict
    prices = defaultdict(list)
    for row in cur.fetchall():
        prices[row["ts_code"]].append(row["close"])  # 已按 trade_date DESC 排序

    result = {}
    for tc, closes in prices.items():
        # closes[0] = 最新, closes[1] = 前一天, ...
        ma5 = round(sum(closes[:5]) / len(closes[:5]), 4) if len(closes) >= 5 else None
        ma10 = round(sum(closes[:10]) / len(closes[:10]), 4) if len(closes) >= 10 else None
        ma20 = round(sum(closes[:20]) / len(closes[:20]), 4) if len(closes) >= 20 else None

        close_above_ma20 = None
        if ma20 is not None and closes:
            close_above_ma20 = closes[0] >= ma20

        result[tc] = {
            "ma5": ma5,
            "ma10": ma10,
            "ma20": ma20,
            "close_above_ma20": close_above_ma20,
        }

    cur.close()
    return result


def compute_above_ma20_days(old_days, close_above_ma20):
    """
    更新 above_ma20_days 连续天数。
    正数=连续站上，负数=连续跌破。
    """
    if close_above_ma20 is None:
        return old_days  # 无法判断，保持不变

    old_days = old_days or 0

    if close_above_ma20:
        # 当日在上方
        if old_days >= 0:
            return old_days + 1  # 继续连续站上
        else:
            return 1            # 从跌破转为站上，重新计数
    else:
        # 当日在下方
        if old_days <= 0:
            return old_days - 1  # 继续连续跌破
        else:
            return -1           # 从站上转为跌破，重新计数


def main():
    parser = argparse.ArgumentParser(description="统一候选池追踪引擎")
    parser.add_argument("--date", required=True, help="交易日期 YYYYMMDD")
    parser.add_argument("--dry_run", action="store_true", help="只打印不更新")
    args = parser.parse_args()

    trade_date_str = args.date.replace("-", "")
    trade_date = datetime.strptime(trade_date_str, "%Y%m%d").date()

    log.info(f"=== watchlist_tracker START | date={trade_date} dry_run={args.dry_run} ===")

    conn = get_conn()

    # 1. 获取所有 active 记录
    active_records = fetch_active_records(conn)
    if not active_records:
        log.info("无 active 记录，退出")
        conn.close()
        print(f"WATCHLIST_TRACK DONE | date={trade_date} | updated=0")
        return

    log.info(f"  active 记录数: {len(active_records)}")
    ts_codes = list({r["ts_code"] for r in active_records})

    # 2. 获取当日行情
    daily_data = fetch_daily_data(conn, trade_date, ts_codes)
    log.info(f"  当日行情匹配: {len(daily_data)}/{len(ts_codes)}")

    # 3. 获取均线数据
    ma_data = fetch_ma_data(conn, trade_date, ts_codes)

    # 3.5 基于交易日历计算 pool_day
    pool_day_map = fetch_pool_days(conn, trade_date, active_records)

    # 4. 逐条计算并更新
    updates = []
    no_data_count = 0

    for rec in active_records:
        tc = rec["ts_code"]
        dd = daily_data.get(tc)
        if not dd or dd["close"] is None:
            no_data_count += 1
            continue

        entry_price = rec["entry_price"]
        baseline_wan = rec["baseline_vol_wan"]
        old_max_gain = rec["max_gain"] or 0.0
        old_above_ma20 = rec["above_ma20_days"]

        # 基础追踪（pool_day 基于交易日历计算，幂等安全）
        new_pool_day = pool_day_map.get(rec["id"], 0)
        latest_close = dd["close"]
        latest_pct_chg = dd["pct_chg"]

        # 累计收益
        gain_since_entry = None
        if entry_price and entry_price > 0:
            gain_since_entry = round((latest_close - entry_price) / entry_price, 6)

        # 高水位 & 回撤
        max_gain = old_max_gain
        if gain_since_entry is not None:
            max_gain = max(old_max_gain, gain_since_entry)
        drawdown = round(max_gain - (gain_since_entry or 0), 6) if max_gain else 0.0

        # 量比
        vr_today = None
        if baseline_wan and baseline_wan > 0:
            vol_wan = float(dd["vol"]) / 100.0  # 手 → 万股
            vr_today = round(vol_wan / float(baseline_wan), 4)

        turnover_rate = dd.get("turnover_rate")

        # 均线
        ma = ma_data.get(tc, {})
        ma5 = ma.get("ma5")
        ma10 = ma.get("ma10")
        ma20 = ma.get("ma20")
        above_ma20_days = compute_above_ma20_days(old_above_ma20, ma.get("close_above_ma20"))

        updates.append({
            "id": rec["id"],
            "pool_day": new_pool_day,
            "latest_close": latest_close,
            "latest_pct_chg": latest_pct_chg,
            "gain_since_entry": gain_since_entry,
            "max_gain": max_gain,
            "drawdown_from_peak": drawdown,
            "vr_today": vr_today,
            "turnover_rate": turnover_rate,
            "ma5": ma5,
            "ma10": ma10,
            "ma20": ma20,
            "above_ma20_days": above_ma20_days,
        })

    if no_data_count > 0:
        log.info(f"  无当日行情跳过: {no_data_count} 只")

    # 5. 打印或写入
    if args.dry_run:
        log.info(f"  DRY_RUN: 将更新 {len(updates)} 条")
        for u in updates[:5]:
            log.info(f"    id={u['id']} pool_day={u['pool_day']} close={u['latest_close']} "
                     f"gain={u['gain_since_entry']} vr={u['vr_today']} ma20={u['ma20']} "
                     f"above_ma20={u['above_ma20_days']}")
        if len(updates) > 5:
            log.info(f"    ... 共 {len(updates)} 条")
    else:
        cur = conn.cursor()
        sql = """
            UPDATE public.ashare_watchlist SET
                pool_day = %(pool_day)s,
                latest_close = %(latest_close)s,
                latest_pct_chg = %(latest_pct_chg)s,
                gain_since_entry = %(gain_since_entry)s,
                max_gain = %(max_gain)s,
                drawdown_from_peak = %(drawdown_from_peak)s,
                vr_today = %(vr_today)s,
                turnover_rate = %(turnover_rate)s,
                ma5 = %(ma5)s,
                ma10 = %(ma10)s,
                ma20 = %(ma20)s,
                above_ma20_days = %(above_ma20_days)s,
                updated_at = now()
            WHERE id = %(id)s
        """
        for u in updates:
            cur.execute(sql, u)
        conn.commit()
        cur.close()
        log.info(f"  已更新 {len(updates)} 条")

    conn.close()

    summary = f"WATCHLIST_TRACK DONE | date={trade_date} | updated={len(updates)} | no_data={no_data_count}"
    log.info(f"=== {summary} ===")
    print(summary)


if __name__ == "__main__":
    main()
