#!/opt/ashare_venv/bin/python
# -*- coding: utf-8 -*-
"""
watchlist_signal.py — 统一候选池买卖点信号引擎
对 ashare_watchlist 中所有 status='active' 记录检测买点和卖出信号。

用法：
  source /opt/ashare_env.sh
  /opt/ashare_venv/bin/python /opt/watchlist_signal.py --date 20260302
  /opt/ashare_venv/bin/python /opt/watchlist_signal.py --date 20260302 --dry_run

买点信号（优先级从高到低，同一天最多1个）：
  1. BREAKOUT     — 突破近N日最高价 + 放量 + 站上MA20
  2. VOL_CONFIRM  — 缩量蓄力后放量确认
  3. PULLBACK     — 回踩均线后企稳收阳
  4. REHEAT       — 冷却后再次放量启动

卖出软信号（可与买点同时存在）：
  1. WARN_MA_BREAK   — 首次跌破MA20
  2. WARN_VR_FADE    — 连续2日量比<0.6
  3. WARN_DRAWDOWN   — 从高点回撤>=10%
  4. TAKE_PROFIT_50  — 浮盈>=50%

注意：必须在 watchlist_tracker.py 之后运行（依赖更新后的追踪字段）。
      信号每日重新计算，先清除再写入。
"""

import argparse
import os
import logging
from datetime import datetime
from collections import defaultdict

import psycopg2
import psycopg2.extras
import sys; sys.path.insert(0, '/opt')
from lib.state_machine import log_lifecycle_event

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("watchlist_signal")

# ============================================================
# 买点参数
# ============================================================
# BREAKOUT
BUY_BREAKOUT_LOOKBACK = 10      # 突破近N日最高价
BUY_BREAKOUT_VR_MIN = 1.5       # 最低量比
BUY_BREAKOUT_MA20_DAYS_MIN = 3  # 至少连续3日站上MA20

# VOL_CONFIRM
BUY_VOLCONF_SHRINK_VR = 0.8     # 前2日缩量门槛
BUY_VOLCONF_EXPAND_VR = 1.5     # 当日放量门槛

# PULLBACK
BUY_PULLBACK_VR_LOW = 0.6       # 量比下限
BUY_PULLBACK_VR_HIGH = 1.2      # 量比上限

# REHEAT
BUY_REHEAT_POOL_DAY_MIN = 5     # 最少在池天数
BUY_REHEAT_COLD_VR = 0.9        # 冷却期量比上限
BUY_REHEAT_HOT_VR = 1.3         # 再热量比下限

# ============================================================
# 卖出信号参数
# ============================================================
SELL_DRAWDOWN_WARN = 0.10        # 回撤>=10%触发警告
SELL_TAKE_PROFIT = 0.50          # 浮盈>=50%建议止盈
SELL_VR_FADE_THRESHOLD = 0.6     # 量萎缩门槛
SELL_VR_FADE_DAYS = 2            # 连续天数


def get_conn():
    return psycopg2.connect(
        host=os.environ["ASHARE_DB_HOST"],
        port=os.environ.get("ASHARE_DB_PORT", "5432"),
        dbname=os.environ["ASHARE_DB_NAME"],
        user=os.environ["ASHARE_DB_USER"],
        password=os.environ["ASHARE_DB_PASS"],
    )


def f(val):
    """安全地将 Decimal/None 转为 float"""
    if val is None:
        return None
    return float(val)


def fetch_active_records(conn):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, ts_code, strategy, entry_date, entry_price,
               pool_day, latest_close, gain_since_entry, max_gain,
               drawdown_from_peak, vr_today, turnover_rate,
               ma5, ma10, ma20, above_ma20_days, baseline_vol_wan
        FROM public.ashare_watchlist
        WHERE status = 'active'
    """)
    rows = cur.fetchall()
    cur.close()
    return rows


def fetch_recent_prices(conn, trade_date, ts_codes, lookback=10):
    """
    获取每只股票最近 lookback 个交易日的 close, high, low, open, vol
    返回 {ts_code: [{close, high, low, open, vol, trade_date}, ...]}  按日期降序
    """
    if not ts_codes:
        return {}
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT ts_code, trade_date, close, high, low, open, vol
        FROM (
            SELECT ts_code, trade_date, close, high, low, open, vol,
                   ROW_NUMBER() OVER (PARTITION BY ts_code ORDER BY trade_date DESC) AS rn
            FROM public.ashare_daily_price
            WHERE trade_date <= %s AND ts_code = ANY(%s)
        ) sub
        WHERE rn <= %s
        ORDER BY ts_code, rn
    """, (trade_date, list(ts_codes), lookback))

    result = defaultdict(list)
    for row in cur.fetchall():
        result[row["ts_code"]].append(row)
    cur.close()
    return result


def detect_buy_signal(rec, recent):
    """
    检测买点信号，按优先级返回第一个触发的信号。
    recent: 该股票最近N日行情列表（降序，[0]=最新）
    返回: signal_name 或 None
    """
    close = f(rec["latest_close"])
    vr = f(rec["vr_today"])
    ma5 = f(rec["ma5"])
    ma10 = f(rec["ma10"])
    ma20 = f(rec["ma20"])
    above_ma20 = rec["above_ma20_days"] or 0
    pool_day = rec["pool_day"] or 0
    baseline_wan = f(rec["baseline_vol_wan"])

    if close is None or vr is None:
        return None

    # 需要至少3天数据
    if len(recent) < 3:
        return None

    # --- 1. BREAKOUT: 突破近N日最高价 + 放量 + 站上MA20 ---
    if len(recent) >= BUY_BREAKOUT_LOOKBACK:
        # 近N日最高价（不含当日）
        prev_highs = [f(r["high"]) for r in recent[1:BUY_BREAKOUT_LOOKBACK] if r["high"]]
        if prev_highs:
            max_high = max(prev_highs)
            if (close > max_high
                    and vr >= BUY_BREAKOUT_VR_MIN
                    and above_ma20 >= BUY_BREAKOUT_MA20_DAYS_MIN):
                return "BREAKOUT"

    # --- 2. VOL_CONFIRM: 前2日缩量 + 当日放量 + close > ma5 ---
    if baseline_wan and baseline_wan > 0 and len(recent) >= 3:
        vr_1 = f(recent[1]["vol"]) / 100.0 / baseline_wan if recent[1]["vol"] else None
        vr_2 = f(recent[2]["vol"]) / 100.0 / baseline_wan if recent[2]["vol"] else None

        if (vr_1 is not None and vr_2 is not None
                and vr_1 < BUY_VOLCONF_SHRINK_VR
                and vr_2 < BUY_VOLCONF_SHRINK_VR
                and vr >= BUY_VOLCONF_EXPAND_VR
                and ma5 is not None and close > ma5):
            return "VOL_CONFIRM"

    # --- 3. PULLBACK: 近3日最低触及MA10/MA20 + 当日收阳 + 温和量比 ---
    if ma10 is not None or ma20 is not None:
        recent_lows = [f(r["low"]) for r in recent[:3] if r["low"]]
        if recent_lows:
            min_low = min(recent_lows)
            today_open = f(recent[0]["open"])

            touched_ma = False
            if ma10 and min_low <= ma10 * 1.01:  # 允许1%误差
                touched_ma = True
            if ma20 and min_low <= ma20 * 1.01:
                touched_ma = True

            if (touched_ma
                    and today_open is not None
                    and close > today_open  # 收阳
                    and BUY_PULLBACK_VR_LOW <= vr <= BUY_PULLBACK_VR_HIGH):
                return "PULLBACK"

    # --- 4. REHEAT: 冷却后再次放量 ---
    if pool_day >= BUY_REHEAT_POOL_DAY_MIN and baseline_wan and baseline_wan > 0:
        if len(recent) >= 4:
            cold_days = 0
            for r in recent[1:4]:  # 前3日
                rv = f(r["vol"]) / 100.0 / baseline_wan if r["vol"] else None
                if rv is not None and rv < BUY_REHEAT_COLD_VR:
                    cold_days += 1

            if (cold_days >= 3
                    and vr >= BUY_REHEAT_HOT_VR
                    and ma10 is not None and close > ma10):
                return "REHEAT"

    return None


def detect_sell_signal(rec, recent, baseline_wan):
    """
    检测卖出软信号。可多个同时触发，返回优先级最高的一个。
    返回: signal_name 或 None
    """
    gain = f(rec["gain_since_entry"])
    drawdown = f(rec["drawdown_from_peak"])
    vr = f(rec["vr_today"])
    above_ma20 = rec["above_ma20_days"] or 0

    # --- 1. WARN_MA_BREAK: 首次跌破MA20 ---
    if above_ma20 == -1:  # 恰好第一天跌破
        return "WARN_MA_BREAK"

    # --- 2. WARN_VR_FADE: 连续2日量比 < 0.6 ---
    if vr is not None and vr < SELL_VR_FADE_THRESHOLD and baseline_wan and baseline_wan > 0:
        if len(recent) >= 2:
            vr_prev = f(recent[1]["vol"]) / 100.0 / baseline_wan if recent[1]["vol"] else None
            if vr_prev is not None and vr_prev < SELL_VR_FADE_THRESHOLD:
                return "WARN_VR_FADE"

    # --- 3. WARN_DRAWDOWN: 回撤 >= 10% ---
    if drawdown is not None and drawdown >= SELL_DRAWDOWN_WARN:
        return "WARN_DRAWDOWN"

    # --- 4. TAKE_PROFIT_50: 浮盈 >= 50% ---
    if gain is not None and gain >= SELL_TAKE_PROFIT:
        return "TAKE_PROFIT_50"

    return None


def main():
    parser = argparse.ArgumentParser(description="统一候选池买卖点信号引擎")
    parser.add_argument("--date", required=True, help="交易日期 YYYYMMDD")
    parser.add_argument("--dry_run", action="store_true", help="只打印不写入")
    args = parser.parse_args()

    trade_date_str = args.date.replace("-", "")
    trade_date = datetime.strptime(trade_date_str, "%Y%m%d").date()

    log.info(f"=== watchlist_signal START | date={trade_date} dry_run={args.dry_run} ===")

    conn = get_conn()

    # 1. 获取 active 记录
    active_records = fetch_active_records(conn)
    if not active_records:
        log.info("无 active 记录")
        conn.close()
        print(f"WATCHLIST_SIGNAL DONE | date={trade_date} | buy=0 | sell=0")
        return

    log.info(f"  active 记录数: {len(active_records)}")

    # 2. 批量获取近期行情
    ts_codes = list({r["ts_code"] for r in active_records})
    recent_prices = fetch_recent_prices(conn, trade_date, ts_codes, lookback=12)

    # 3. 先清除旧信号
    if not args.dry_run:
        cur = conn.cursor()
        cur.execute("""
            UPDATE public.ashare_watchlist
            SET buy_signal = NULL, sell_signal = NULL
            WHERE status = 'active'
              AND (buy_signal IS NOT NULL OR sell_signal IS NOT NULL)
        """)
        cleared = cur.rowcount
        conn.commit()
        cur.close()
        if cleared > 0:
            log.info(f"  清除旧信号: {cleared} 条")

    # 4. 逐条检测信号
    buy_signals = {}   # {signal_name: count}
    sell_signals = {}
    updates = []

    for rec in active_records:
        tc = rec["ts_code"]
        recent = recent_prices.get(tc, [])
        baseline_wan = f(rec["baseline_vol_wan"])

        buy = detect_buy_signal(rec, recent)
        sell = detect_sell_signal(rec, recent, baseline_wan)

        if buy or sell:
            updates.append({
                "id": rec["id"],
                "ts_code": tc,
                "strategy": rec["strategy"],
                "buy_signal": buy,
                "sell_signal": sell,
            })

            if buy:
                buy_signals[buy] = buy_signals.get(buy, 0) + 1
            if sell:
                sell_signals[sell] = sell_signals.get(sell, 0) + 1

    # 5. 汇总
    total_buy = sum(buy_signals.values())
    total_sell = sum(sell_signals.values())

    log.info(f"  买点信号: {total_buy} 只")
    for sig, cnt in sorted(buy_signals.items(), key=lambda x: -x[1]):
        log.info(f"    {sig}: {cnt}")

    log.info(f"  卖出信号: {total_sell} 只")
    for sig, cnt in sorted(sell_signals.items(), key=lambda x: -x[1]):
        log.info(f"    {sig}: {cnt}")

    # 6. 写入或打印
    if args.dry_run:
        log.info(f"  DRY_RUN 详情（前10条）:")
        for u in updates[:10]:
            log.info(f"    {u['ts_code']} [{u['strategy']}] buy={u['buy_signal']} sell={u['sell_signal']}")
        if len(updates) > 10:
            log.info(f"    ... 共 {len(updates)} 条")
    else:
        cur = conn.cursor()
        for u in updates:
            cur.execute("""
                UPDATE public.ashare_watchlist SET
                    buy_signal = %s,
                    sell_signal = %s,
                    signal_date = %s,
                    lifecycle_status = CASE WHEN %s IS NOT NULL THEN 'signaled' ELSE lifecycle_status END,
                    lifecycle_updated_at = CASE WHEN %s IS NOT NULL THEN NOW() ELSE lifecycle_updated_at END,
                    updated_at = now()
                WHERE id = %s
            """, (u["buy_signal"], u["sell_signal"], trade_date, u["buy_signal"], u["buy_signal"], u["id"]))
            if u["buy_signal"]:
                log_lifecycle_event(conn, ts_code=u['ts_code'], event_type='signal_fired',
                    from_status='active', to_status='active', event_source='watchlist_signal',
                    trade_date=str(trade_date),
                    event_payload_json={'buy_signal': u['buy_signal'], 'signal_date': str(trade_date)})
        conn.commit()
        cur.close()
        log.info(f"  已写入 {len(updates)} 条信号")

    conn.close()

    summary = (f"WATCHLIST_SIGNAL DONE | date={trade_date} | "
               f"buy={total_buy} | sell={total_sell}")
    log.info(f"=== {summary} ===")
    print(summary)


if __name__ == "__main__":
    main()
