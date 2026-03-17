#!/opt/ashare_venv/bin/python
# -*- coding: utf-8 -*-
"""
watchlist_exit.py — 统一候选池退池引擎
对 ashare_watchlist 中所有 status='active' 记录检查退池规则，
满足条件的自动设为 exited 并记录退池信息。

用法：
  source /opt/ashare_env.sh
  /opt/ashare_venv/bin/python /opt/watchlist_exit.py --date 20260302
  /opt/ashare_venv/bin/python /opt/watchlist_exit.py --date 20260302 --dry_run

退池规则（6条，按优先级顺序）：
  1. STOP_LOSS      — gain_since_entry <= -15%
  2. DRAWDOWN_MAX   — drawdown_from_peak >= 25%
  3. MA20_BREAK     — above_ma20_days <= -5（连续5日跌破MA20）
  4. VR_FADE        — 连续5日 vr < 0.5（需历史数据辅助）
  5. GAIN_MAX       — gain_since_entry >= 80%
  6. TIME_DECAY     — pool_day >= 30 且 gain_since_entry < 10%

注意：必须在 watchlist_tracker.py 之后运行（依赖更新后的追踪字段）。
"""

import argparse
import os
import logging
from datetime import datetime
from decimal import Decimal

import psycopg2
import psycopg2.extras
import sys; sys.path.insert(0, '/opt')
from lib.state_machine import log_lifecycle_event

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("watchlist_exit")

# ============================================================
# 退池参数（后续可迁移到 pool_strategy_config.py）
# ============================================================
EXIT_STOP_LOSS_PCT      = -0.15   # 止损线：入池价下跌15%
EXIT_DRAWDOWN_MAX_PCT   = 0.25    # 最大回撤：从高点回撤25%
EXIT_MA20_BREAK_DAYS    = -5      # MA20连续跌破天数（负数）
EXIT_VR_FADE_THRESHOLD  = 0.5     # 量枯竭门槛
EXIT_VR_FADE_DAYS       = 5       # 量枯竭连续天数
EXIT_GAIN_MAX_PCT       = 0.80    # 止盈退池：涨80%
EXIT_TIME_DECAY_DAYS    = 30      # 时间衰减天数
EXIT_TIME_DECAY_MIN_GAIN = 0.10   # 时间衰减保底涨幅


def get_conn():
    return psycopg2.connect(
        host=os.environ["ASHARE_DB_HOST"],
        port=os.environ.get("ASHARE_DB_PORT", "5432"),
        dbname=os.environ["ASHARE_DB_NAME"],
        user=os.environ["ASHARE_DB_USER"],
        password=os.environ["ASHARE_DB_PASS"],
    )


def to_float(val):
    """安全地将 Decimal/None 转为 float"""
    if val is None:
        return None
    return float(val)


def fetch_active_records(conn):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, ts_code, strategy, entry_date, entry_price,
               pool_day, latest_close, gain_since_entry, max_gain,
               drawdown_from_peak, vr_today, above_ma20_days
        FROM public.ashare_watchlist
        WHERE status = 'active'
    """)
    rows = cur.fetchall()
    cur.close()
    return rows


def fetch_recent_vr(conn, trade_date, ts_code, n_days=5):
    """获取最近N个交易日的 vr_today（从 daily_price + baseline 计算太复杂，
    这里简化：直接读 watchlist 不够（只有最新一天），
    所以从 daily_price 和 watchlist 的 baseline_vol_wan 计算）。
    
    但更简单的做法：只检查当前 vr_today，配合一个 vr_fade_streak 字段。
    为简化第一版，我们用一个近似方案：
    如果当日 vr < 阈值，检查该股票近N日在 daily_price 中的量是否持续低于 baseline。
    """
    cur = conn.cursor()
    cur.execute("""
        SELECT w.baseline_vol_wan, array_agg(dp.vol ORDER BY dp.trade_date DESC) AS vols
        FROM public.ashare_watchlist w
        JOIN (
            SELECT ts_code, trade_date, vol
            FROM (
                SELECT ts_code, trade_date, vol,
                       ROW_NUMBER() OVER (ORDER BY trade_date DESC) AS rn
                FROM public.ashare_daily_price
                WHERE ts_code = %s AND trade_date <= %s
            ) sub
            WHERE rn <= %s
        ) dp ON dp.ts_code = w.ts_code
        WHERE w.ts_code = %s AND w.status = 'active'
        GROUP BY w.id, w.baseline_vol_wan
        LIMIT 1
    """, (ts_code, trade_date, n_days, ts_code))
    row = cur.fetchone()
    cur.close()

    if not row or not row[0] or not row[1]:
        return False

    baseline_wan = float(row[0])
    if baseline_wan <= 0:
        return False

    vols = row[1]  # 最近N日 vol（手），按日期降序
    if len(vols) < n_days:
        return False

    # 检查每一天的 vr 是否都低于阈值
    for vol in vols[:n_days]:
        vol_wan = float(vol) / 100.0
        vr = vol_wan / baseline_wan
        if vr >= EXIT_VR_FADE_THRESHOLD:
            return False

    return True  # 连续N日 vr < 阈值


def check_exit_rules(rec, conn, trade_date):
    """
    检查一条 active 记录是否触发退池规则。
    返回 (should_exit: bool, exit_reason: str or None)
    按优先级检查，首个触发即返回。
    """
    gain = to_float(rec["gain_since_entry"])
    drawdown = to_float(rec["drawdown_from_peak"])
    above_ma20 = rec["above_ma20_days"]
    pool_day = rec["pool_day"] or 0

    # 1. STOP_LOSS — 止损
    if gain is not None and gain <= EXIT_STOP_LOSS_PCT:
        return True, "STOP_LOSS"

    # 2. DRAWDOWN_MAX — 最大回撤
    if drawdown is not None and drawdown >= EXIT_DRAWDOWN_MAX_PCT:
        return True, "DRAWDOWN_MAX"

    # 3. MA20_BREAK — 趋势破位
    if above_ma20 is not None and above_ma20 <= EXIT_MA20_BREAK_DAYS:
        return True, "MA20_BREAK"

    # 4. VR_FADE — 量能枯竭（需查历史，较重，仅在前3条未触发时检查）
    vr = to_float(rec["vr_today"])
    if vr is not None and vr < EXIT_VR_FADE_THRESHOLD:
        # 当日已低于阈值，进一步检查连续天数
        if fetch_recent_vr(conn, trade_date, rec["ts_code"], EXIT_VR_FADE_DAYS):
            return True, "VR_FADE"

    # 5. GAIN_MAX — 止盈
    if gain is not None and gain >= EXIT_GAIN_MAX_PCT:
        return True, "GAIN_MAX"

    # 6. TIME_DECAY — 时间衰减
    if pool_day >= EXIT_TIME_DECAY_DAYS:
        if gain is None or gain < EXIT_TIME_DECAY_MIN_GAIN:
            return True, "TIME_DECAY"

    return False, None


def apply_exit(conn, rec_id, trade_date, exit_reason, latest_close, entry_price):
    """将记录标记为 exited"""
    pnl_pct = None
    if entry_price and float(entry_price) > 0 and latest_close:
        pnl_pct = round((float(latest_close) - float(entry_price)) / float(entry_price), 6)

    cur = conn.cursor()
    cur.execute("""
        UPDATE public.ashare_watchlist SET
            status = 'exited',
            exit_date = %s,
            exit_reason = %s,
            exit_price = %s,
            pnl_pct = %s,
            lifecycle_status = 'retired',
            retired_reason = %s,
            lifecycle_updated_at = NOW(),
            updated_at = now()
        WHERE id = %s
    """, (trade_date, exit_reason, latest_close, pnl_pct, exit_reason, rec_id))
    cur.close()


def main():
    parser = argparse.ArgumentParser(description="统一候选池退池引擎")
    parser.add_argument("--date", required=True, help="交易日期 YYYYMMDD")
    parser.add_argument("--dry_run", action="store_true", help="只打印不退池")
    args = parser.parse_args()

    trade_date_str = args.date.replace("-", "")
    trade_date = datetime.strptime(trade_date_str, "%Y%m%d").date()

    log.info(f"=== watchlist_exit START | date={trade_date} dry_run={args.dry_run} ===")
    log.info(f"  参数: STOP_LOSS={EXIT_STOP_LOSS_PCT} DRAWDOWN_MAX={EXIT_DRAWDOWN_MAX_PCT} "
             f"MA20_BREAK={EXIT_MA20_BREAK_DAYS}d VR_FADE=<{EXIT_VR_FADE_THRESHOLD}×{EXIT_VR_FADE_DAYS}d "
             f"GAIN_MAX={EXIT_GAIN_MAX_PCT} TIME_DECAY={EXIT_TIME_DECAY_DAYS}d/<{EXIT_TIME_DECAY_MIN_GAIN}")

    conn = get_conn()
    active_records = fetch_active_records(conn)

    if not active_records:
        log.info("无 active 记录，退出")
        conn.close()
        print(f"WATCHLIST_EXIT DONE | date={trade_date} | exited=0 | active_remain=0")
        return

    log.info(f"  检查 {len(active_records)} 条 active 记录")

    exit_list = []
    for rec in active_records:
        should_exit, reason = check_exit_rules(rec, conn, trade_date)
        if should_exit:
            exit_list.append({
                "id": rec["id"],
                "ts_code": rec["ts_code"],
                "strategy": rec["strategy"],
                "reason": reason,
                "latest_close": rec["latest_close"],
                "entry_price": rec["entry_price"],
                "gain": to_float(rec["gain_since_entry"]),
                "pool_day": rec["pool_day"],
            })

    if not exit_list:
        log.info("  无触发退池的记录")
    else:
        # 按退池原因统计
        reason_counts = {}
        for e in exit_list:
            reason_counts[e["reason"]] = reason_counts.get(e["reason"], 0) + 1

        log.info(f"  触发退池: {len(exit_list)} 只")
        for reason, cnt in sorted(reason_counts.items()):
            log.info(f"    {reason}: {cnt} 只")

        if args.dry_run:
            log.info("  DRY_RUN 详情:")
            for e in exit_list:
                gain_str = f"{e['gain']*100:.1f}%" if e['gain'] is not None else "N/A"
                log.info(f"    {e['ts_code']} [{e['strategy']}] reason={e['reason']} "
                         f"gain={gain_str} pool_day={e['pool_day']}")
        else:
            for e in exit_list:
                apply_exit(conn, e["id"], trade_date, e["reason"],
                           e["latest_close"], e["entry_price"])
                log_lifecycle_event(conn, ts_code=e['ts_code'], event_type='watchlist_exit',
                    from_status='active', to_status='exited', event_source='watchlist_exit',
                    watchlist_id=e['id'], trade_date=str(trade_date),
                    event_payload_json={'exit_reason': e['reason'],
                        'exit_price': float(e['latest_close']) if e['latest_close'] else None,
                        'pnl_pct': e['gain']})
            conn.commit()
            log.info(f"  已退池 {len(exit_list)} 条")

    active_remain = len(active_records) - len(exit_list)
    conn.close()

    summary = (f"WATCHLIST_EXIT DONE | date={trade_date} | "
               f"exited={len(exit_list)} | active_remain={active_remain}")
    log.info(f"=== {summary} ===")
    print(summary)


if __name__ == "__main__":
    main()
