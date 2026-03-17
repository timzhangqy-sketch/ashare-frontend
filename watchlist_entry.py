#!/opt/ashare_venv/bin/python
# -*- coding: utf-8 -*-
"""
watchlist_entry.py — 统一候选池入池脚本
从4个策略结果读取当日筛选结果，写入 ashare_watchlist。

用法：
  source /opt/ashare_env.sh
  /opt/ashare_venv/bin/python /opt/watchlist_entry.py --date 20260303
  /opt/ashare_venv/bin/python /opt/watchlist_entry.py --date 20260303 --dry_run

策略来源：
  1. IGNITE     — ashare_ignite_strict3_daily（落地表）→ fallback 调函数
  2. RETOC2     — ashare_retoc2_v3_trigger
  3. PATTERN_T2UP9   — ashare_pattern_t2up9_2dup_lt5_candidates
  4. WEAK_BUY — ashare_weak_buy_trigger（两级触发第二级）

逻辑：
  - 同一策略同一股票若已有 active 记录，跳过（不重复入池）
  - entry_price = 当日收盘价（从 ashare_daily_price 获取）
  - baseline_vol_wan = 入池前20日均量（万股）
  - ON CONFLICT DO NOTHING（兜底防重复）
"""

import argparse
import os
import sys
import logging
from datetime import datetime

import psycopg2
import psycopg2.extras
sys.path.insert(0, '/opt')
from lib.state_machine import log_lifecycle_event

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("watchlist_entry")


# ============================================================
# DB connection
# ============================================================
def get_conn():
    return psycopg2.connect(
        host=os.environ["ASHARE_DB_HOST"],
        port=os.environ.get("ASHARE_DB_PORT", "5432"),
        dbname=os.environ["ASHARE_DB_NAME"],
        user=os.environ["ASHARE_DB_USER"],
        password=os.environ["ASHARE_DB_PASS"],
    )


# ============================================================
# 获取当日收盘价 + 前20日均量（批量）
# ============================================================
def fetch_price_and_baseline(conn, trade_date, ts_codes):
    """返回 {ts_code: (close, baseline_vol_wan)}"""
    if not ts_codes:
        return {}
    cur = conn.cursor()

    # 当日收盘价
    cur.execute("""
        SELECT ts_code, close, vol
        FROM public.ashare_daily_price
        WHERE trade_date = %s AND ts_code = ANY(%s)
    """, (trade_date, list(ts_codes)))
    price_map = {}
    for row in cur.fetchall():
        price_map[row[0]] = {"close": row[1], "vol": row[2]}

    # 前20日均量（不含当日）
    cur.execute("""
        SELECT ts_code, AVG(vol) / 100.0 AS avg_vol_wan
        FROM (
            SELECT ts_code, vol,
                   ROW_NUMBER() OVER (PARTITION BY ts_code ORDER BY trade_date DESC) AS rn
            FROM public.ashare_daily_price
            WHERE trade_date < %s AND ts_code = ANY(%s)
        ) sub
        WHERE rn <= 20
        GROUP BY ts_code
        HAVING COUNT(*) >= 10
    """, (trade_date, list(ts_codes)))
    baseline_map = {row[0]: row[1] for row in cur.fetchall()}

    result = {}
    for tc in ts_codes:
        close = price_map.get(tc, {}).get("close")
        baseline = baseline_map.get(tc)
        result[tc] = (close, round(baseline, 2) if baseline else None)

    cur.close()
    return result


# ============================================================
# 获取已有 active 记录（避免重复入池）
# ============================================================
def fetch_active_set(conn, strategy):
    """返回该策略下所有 active 的 ts_code 集合"""
    cur = conn.cursor()
    cur.execute("""
        SELECT ts_code FROM public.ashare_watchlist
        WHERE strategy = %s AND status = 'active'
    """, (strategy,))
    result = {row[0] for row in cur.fetchall()}
    cur.close()
    return result


# ============================================================
# 策略1：点火榜 IGNITE

# 策略0：连续放量蓄势 VOL_SURGE
def load_vol_surge(conn, trade_date):
    """从 ashare_vol_surge_pool 加载当日候选"""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT ts_code, entry_rank AS rank, entry_rank AS score
        FROM public.ashare_vol_surge_pool
        WHERE trade_date = %s
        ORDER BY entry_rank
    """, (trade_date,))
    rows = cur.fetchall()
    cur.close()
    return [{"ts_code": r["ts_code"], "score": r["score"], "rank": r["rank"]} for r in rows]

# ============================================================
def load_ignite(conn, trade_date):
    """从落地表读取点火榜 Top20，fallback 不做（依赖 pipeline 已落地）"""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT
            ts_code,
            (payload->>'ignite_score')::float8 AS score,
            (payload->>'candidate_rank')::int AS rank
        FROM public.ashare_ignite_strict3_daily
        WHERE trade_date = %s
        ORDER BY score DESC NULLS LAST
    """, (trade_date,))
    rows = cur.fetchall()
    cur.close()
    return [{"ts_code": r["ts_code"], "score": r["score"], "rank": r["rank"]} for r in rows]


# ============================================================
# 策略2：Retoc2 异动榜
# ============================================================
def load_retoc2(conn, trade_date):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT ts_code,
               turnover_rate AS score,
               ROW_NUMBER() OVER (ORDER BY turnover_rate DESC) AS rank
        FROM public.ashare_retoc2_v3_trigger
        WHERE trade_date = %s
        ORDER BY turnover_rate DESC
    """, (trade_date,))
    rows = cur.fetchall()
    cur.close()
    return [{"ts_code": r["ts_code"], "score": r["score"], "rank": r["rank"]} for r in rows]


# ============================================================
# 策略3：形态 T-2大涨蓄势
# ============================================================
def load_pattern_t2up9(conn, trade_date):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT ts_code, ret_t2 AS score,
               ROW_NUMBER() OVER (ORDER BY ret_t2 DESC) AS rank
        FROM public.ashare_pattern_t2up9_2dup_lt5_candidates
        WHERE anchor_date = %s
    """, (trade_date,))
    rows = cur.fetchall()
    cur.close()
    return [{"ts_code": r["ts_code"], "score": r["score"], "rank": r["rank"]} for r in rows]


# ============================================================
# 策略4：形态 近10日阳线最多
# ============================================================
def load_weak_buy(conn, trade_date):
    """弱市吸筹策略 - 从 ashare_weak_buy_trigger 加载当日触发信号"""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT ts_code,
               volup15_days AS score,
               ROW_NUMBER() OVER (ORDER BY ret60 ASC) AS rank
        FROM public.ashare_weak_buy_trigger
        WHERE trigger_date = %s AND status = 'active'
        ORDER BY ret60 ASC
    """, (trade_date,))
    rows = cur.fetchall()
    cur.close()
    return [{"ts_code": r["ts_code"], "score": r["score"], "rank": r["rank"]} for r in rows]


# ============================================================
# 写入 watchlist
# ============================================================
def upsert_watchlist(conn, trade_date, strategy, candidates, dry_run=False):
    """
    candidates: list of {"ts_code", "score", "rank"}
    返回 (inserted, skipped)
    """
    if not candidates:
        log.info(f"  [{strategy}] 当日无候选，跳过")
        return 0, 0

    # 获取已有 active
    active_set = fetch_active_set(conn, strategy)

    # 过滤已 active 的
    new_candidates = [c for c in candidates if c["ts_code"] not in active_set]
    skipped = len(candidates) - len(new_candidates)

    if not new_candidates:
        log.info(f"  [{strategy}] 全部 {len(candidates)} 只已在 active 池中，跳过")
        return 0, skipped

    # 获取价格和基准量
    ts_codes = {c["ts_code"] for c in new_candidates}
    price_baseline = fetch_price_and_baseline(conn, trade_date, ts_codes)

    # 构造 INSERT 数据
    insert_rows = []
    for c in new_candidates:
        close, baseline = price_baseline.get(c["ts_code"], (None, None))
        if close is None:
            log.warning(f"  [{strategy}] {c['ts_code']} 无当日收盘价，跳过")
            skipped += 1
            continue
        insert_rows.append((
            c["ts_code"],
            strategy,
            trade_date,
            close,              # entry_price
            c["score"],         # entry_score
            c["rank"],          # entry_rank
            baseline,           # baseline_vol_wan
        ))

    if dry_run:
        log.info(f"  [{strategy}] DRY_RUN: 将写入 {len(insert_rows)} 只，跳过 {skipped} 只")
        for r in insert_rows[:5]:
            log.info(f"    {r[0]} price={r[3]} score={r[4]} rank={r[5]} baseline_wan={r[6]}")
        if len(insert_rows) > 5:
            log.info(f"    ... 共 {len(insert_rows)} 只")
        return len(insert_rows), skipped

    cur = conn.cursor()
    sql = """
        INSERT INTO public.ashare_watchlist
            (ts_code, strategy, entry_date, entry_price, entry_score,
             entry_rank, baseline_vol_wan, lifecycle_status, lifecycle_updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'candidate', NOW())
        ON CONFLICT (ts_code, strategy, entry_date) DO NOTHING
    """
    inserted = 0
    for r in insert_rows:
        cur.execute(sql, r)
        inserted += cur.rowcount
        if cur.rowcount > 0:
            log_lifecycle_event(conn, ts_code=r[0], event_type='watchlist_entry',
                from_status=None, to_status='active', event_source='watchlist_entry',
                trade_date=str(trade_date),
                event_payload_json={'strategy': r[1], 'entry_price': float(r[3]) if r[3] else None})

    conn.commit()
    cur.close()
    log.info(f"  [{strategy}] 写入 {inserted} 只，跳过 {skipped} 只（已active或无价格）")
    return inserted, skipped


# ============================================================
# MAIN
# ============================================================
def main():
    parser = argparse.ArgumentParser(description="统一候选池入池脚本")
    parser.add_argument("--date", required=True, help="交易日期 YYYYMMDD")
    parser.add_argument("--dry_run", action="store_true", help="只打印不写入")
    args = parser.parse_args()

    trade_date_str = args.date.replace("-", "")
    trade_date = datetime.strptime(trade_date_str, "%Y%m%d").date()

    log.info(f"=== watchlist_entry START | date={trade_date} dry_run={args.dry_run} ===")

    conn = get_conn()

    # 依次加载4个策略
    loaders = [
        ("VOL_SURGE",       load_vol_surge),
        ("RETOC2",          load_retoc2),
        ("PATTERN_T2UP9",   load_pattern_t2up9),
        ("WEAK_BUY", load_weak_buy),
    ]

    total_inserted = 0
    total_skipped = 0

    for strategy, loader in loaders:
        try:
            candidates = loader(conn, trade_date)
            log.info(f"  [{strategy}] 加载 {len(candidates)} 只候选")
            ins, skip = upsert_watchlist(conn, trade_date, strategy, candidates, dry_run=args.dry_run)
            total_inserted += ins
            total_skipped += skip
        except Exception as e:
            log.error(f"  [{strategy}] 异常: {e}")
            conn.rollback()

    conn.close()

    summary = f"WATCHLIST_ENTRY DONE | date={trade_date} | inserted={total_inserted} | skipped={total_skipped}"
    log.info(f"=== {summary} ===")
    print(summary)


if __name__ == "__main__":
    main()
