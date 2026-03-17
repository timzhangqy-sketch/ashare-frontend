#!/opt/ashare_venv/bin/python
# -*- coding: utf-8 -*-
"""
portfolio_tracker.py — 持仓追踪与操作建议引擎
每日更新 ashare_portfolio 中所有 status='open' 的持仓记录，
计算盈亏、回撤，并生成操作建议信号。

用法：
  source /opt/ashare_env.sh
  /opt/ashare_venv/bin/python /opt/portfolio_tracker.py --date 20260302
  /opt/ashare_venv/bin/python /opt/portfolio_tracker.py --date 20260302 --dry_run

操作建议信号：
  HOLD      — 趋势正常，维持仓位
  ADD       — watchlist有买点信号 + 当前仓位未满
  REDUCE    — 浮盈>=30% 或 WARN_DRAWDOWN 或 连续缩量跌
  CLOSE     — 触发退池规则 或 浮盈>=80%
  STOP_LOSS — 浮亏>=-10%，立即止损
"""

import argparse
import os
import logging
from datetime import datetime

import psycopg2
import psycopg2.extras

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("portfolio_tracker")

# ============================================================
# 操作建议参数
# ============================================================
SIGNAL_STOP_LOSS_PCT    = -0.10   # 浮亏10%止损
SIGNAL_CLOSE_GAIN_PCT   = 0.80    # 浮盈80%建议清仓
SIGNAL_REDUCE_GAIN_PCT  = 0.30    # 浮盈30%建议减仓
SIGNAL_REDUCE_DRAWDOWN  = 0.10    # 回撤10%建议减仓


def get_conn():
    return psycopg2.connect(
        host=os.environ["ASHARE_DB_HOST"],
        port=os.environ.get("ASHARE_DB_PORT", "5432"),
        dbname=os.environ["ASHARE_DB_NAME"],
        user=os.environ["ASHARE_DB_USER"],
        password=os.environ["ASHARE_DB_PASS"],
    )


def f(val):
    if val is None:
        return None
    return float(val)


def fetch_open_positions(conn):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, ts_code, open_price, shares, cost_amount,
               open_date, hold_days, max_price_since_open, watchlist_id
        FROM public.ashare_portfolio
        WHERE status = 'open'
    """)
    rows = cur.fetchall()
    cur.close()
    return rows


def fetch_daily_prices(conn, trade_date, ts_codes):
    """返回 {ts_code: close}"""
    if not ts_codes:
        return {}
    cur = conn.cursor()
    cur.execute("""
        SELECT ts_code, close
        FROM public.ashare_daily_price
        WHERE trade_date = %s AND ts_code = ANY(%s)
    """, (trade_date, list(ts_codes)))
    result = {row[0]: row[1] for row in cur.fetchall()}
    cur.close()
    return result


def fetch_watchlist_signals(conn, ts_codes):
    """获取 watchlist 中对应股票的买卖信号"""
    if not ts_codes:
        return {}
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT ts_code, buy_signal, sell_signal
        FROM public.ashare_watchlist
        WHERE status = 'active' AND ts_code = ANY(%s)
          AND (buy_signal IS NOT NULL OR sell_signal IS NOT NULL)
    """, (list(ts_codes),))
    result = {}
    for row in cur.fetchall():
        tc = row["ts_code"]
        if tc not in result:
            result[tc] = {"buy_signal": row["buy_signal"], "sell_signal": row["sell_signal"]}
        else:
            # 同一股票可能在多个策略中，取最强信号
            if row["buy_signal"] and not result[tc]["buy_signal"]:
                result[tc]["buy_signal"] = row["buy_signal"]
            if row["sell_signal"] and not result[tc]["sell_signal"]:
                result[tc]["sell_signal"] = row["sell_signal"]
    cur.close()
    return result


def compute_action_signal(pnl_pct, drawdown, watchlist_sig):
    """
    根据盈亏和信号生成操作建议。
    按优先级：STOP_LOSS > CLOSE > REDUCE > ADD > HOLD
    """
    reasons = []

    # 1. STOP_LOSS
    if pnl_pct is not None and pnl_pct <= SIGNAL_STOP_LOSS_PCT:
        return "STOP_LOSS", f"浮亏{pnl_pct*100:.1f}%，触发止损线({SIGNAL_STOP_LOSS_PCT*100:.0f}%)"

    # 2. CLOSE
    if pnl_pct is not None and pnl_pct >= SIGNAL_CLOSE_GAIN_PCT:
        return "CLOSE", f"浮盈{pnl_pct*100:.1f}%，达到清仓线({SIGNAL_CLOSE_GAIN_PCT*100:.0f}%)"

    # watchlist 退池信号 → CLOSE
    if watchlist_sig and watchlist_sig.get("sell_signal") in ("WARN_MA_BREAK",):
        # MA_BREAK 只是警告，不直接触发 CLOSE，放到 REDUCE
        pass

    # 3. REDUCE
    reduce_reasons = []
    if pnl_pct is not None and pnl_pct >= SIGNAL_REDUCE_GAIN_PCT:
        reduce_reasons.append(f"浮盈{pnl_pct*100:.1f}%")
    if drawdown is not None and drawdown >= SIGNAL_REDUCE_DRAWDOWN:
        reduce_reasons.append(f"回撤{drawdown*100:.1f}%")
    if watchlist_sig and watchlist_sig.get("sell_signal") in ("WARN_DRAWDOWN", "WARN_VR_FADE", "WARN_MA_BREAK"):
        reduce_reasons.append(f"卖出信号:{watchlist_sig['sell_signal']}")

    if reduce_reasons:
        return "REDUCE", "；".join(reduce_reasons)

    # 4. ADD
    if watchlist_sig and watchlist_sig.get("buy_signal") in ("BREAKOUT", "VOL_CONFIRM"):
        return "ADD", f"买点信号:{watchlist_sig['buy_signal']}"

    # 5. HOLD
    return "HOLD", "趋势正常"


def main():
    parser = argparse.ArgumentParser(description="持仓追踪与操作建议引擎")
    parser.add_argument("--date", required=True, help="交易日期 YYYYMMDD")
    parser.add_argument("--dry_run", action="store_true", help="只打印不更新")
    args = parser.parse_args()

    trade_date_str = args.date.replace("-", "")
    trade_date = datetime.strptime(trade_date_str, "%Y%m%d").date()

    log.info(f"=== portfolio_tracker START | date={trade_date} dry_run={args.dry_run} ===")

    conn = get_conn()

    # 1. 获取所有 open 持仓
    positions = fetch_open_positions(conn)
    if not positions:
        log.info("无 open 持仓，退出")
        conn.close()
        print(f"PORTFOLIO_TRACK DONE | date={trade_date} | updated=0")
        return

    log.info(f"  open 持仓数: {len(positions)}")
    ts_codes = list({p["ts_code"] for p in positions})

    # 2. 获取当日价格
    prices = fetch_daily_prices(conn, trade_date, ts_codes)
    log.info(f"  当日价格匹配: {len(prices)}/{len(ts_codes)}")

    # 3. 获取 watchlist 信号
    wl_signals = fetch_watchlist_signals(conn, ts_codes)

    # 4. 逐条计算
    updates = []
    no_price = 0

    for pos in positions:
        tc = pos["ts_code"]
        close = f(prices.get(tc))
        if close is None:
            no_price += 1
            continue

        open_price = f(pos["open_price"])
        shares = pos["shares"]
        cost = f(pos["cost_amount"]) or (open_price * shares if open_price else 0)
        old_max_price = f(pos["max_price_since_open"]) or open_price or 0

        # 从交易日历动态计算持仓天数
        open_date_val = pos.get("open_date")
        if open_date_val:
            cur_cal = conn.cursor()
            cur_cal.execute("""
                SELECT COUNT(*) FROM ashare_trade_calendar
                WHERE is_open = TRUE
                  AND cal_date > %s
                  AND cal_date <= %s
            """, (open_date_val, trade_date))
            hold_days = cur_cal.fetchone()[0] or 1
            cur_cal.close()
        else:
            old_hold_days = pos["hold_days"] or 0
            hold_days = old_hold_days + 1
        market_value = round(close * shares, 2)
        unrealized_pnl = round(market_value - cost, 2) if cost else None
        unrealized_pnl_pct = round((close - open_price) / open_price, 6) if open_price and open_price > 0 else None
        max_price = max(old_max_price, close)
        drawdown = round((max_price - close) / max_price, 6) if max_price and max_price > 0 else 0

        # 操作建议
        wl_sig = wl_signals.get(tc)
        action, reason = compute_action_signal(unrealized_pnl_pct, drawdown, wl_sig)

        updates.append({
            "id": pos["id"],
            "ts_code": tc,
            "latest_close": close,
            "market_value": market_value,
            "unrealized_pnl": unrealized_pnl,
            "unrealized_pnl_pct": unrealized_pnl_pct,
            "max_price_since_open": max_price,
            "drawdown_from_peak": drawdown,
            "hold_days": hold_days,
            "action_signal": action,
            "signal_reason": reason,
        })

    if no_price > 0:
        log.info(f"  无当日价格跳过: {no_price}")

    # 汇总信号
    signal_counts = {}
    for u in updates:
        sig = u["action_signal"]
        signal_counts[sig] = signal_counts.get(sig, 0) + 1

    log.info(f"  操作建议分布:")
    for sig, cnt in sorted(signal_counts.items()):
        log.info(f"    {sig}: {cnt}")

    # 5. 写入或打印
    if args.dry_run:
        log.info(f"  DRY_RUN 详情:")
        for u in updates:
            pnl_str = f"{u['unrealized_pnl_pct']*100:.1f}%" if u["unrealized_pnl_pct"] is not None else "N/A"
            log.info(f"    {u['ts_code']} close={u['latest_close']} pnl={pnl_str} "
                     f"action={u['action_signal']} reason={u['signal_reason']}")
    else:
        cur = conn.cursor()
        for u in updates:
            cur.execute("""
                UPDATE public.ashare_portfolio SET
                    latest_close = %(latest_close)s,
                    market_value = %(market_value)s,
                    unrealized_pnl = %(unrealized_pnl)s,
                    unrealized_pnl_pct = %(unrealized_pnl_pct)s,
                    max_price_since_open = %(max_price_since_open)s,
                    drawdown_from_peak = %(drawdown_from_peak)s,
                    hold_days = %(hold_days)s,
                    action_signal = %(action_signal)s,
                    signal_reason = %(signal_reason)s,
                    updated_at = now()
                WHERE id = %(id)s
            """, u)
        conn.commit()
        cur.close()
        log.info(f"  已更新 {len(updates)} 条")

    conn.close()

    summary = f"PORTFOLIO_TRACK DONE | date={trade_date} | updated={len(updates)} | no_price={no_price}"
    log.info(f"=== {summary} ===")
    print(summary)


if __name__ == "__main__":
    main()
