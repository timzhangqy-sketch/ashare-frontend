from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import psycopg2, psycopg2.extras, os

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def get_db(timeout=30):
    conn = psycopg2.connect(
        host=os.environ.get("ASHARE_DB_HOST","localhost"),
        dbname=os.environ.get("ASHARE_DB_NAME","ashare"),
        user=os.environ.get("ASHARE_DB_USER","ashare_user"),
        password=os.environ.get("ASHARE_DB_PASS",""),
        options=f'-c statement_timeout=120000'
    )
    return conn

@app.get("/api/health")
def health():
    try:
        conn = get_db()
        conn.close()
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return {"status": "error", "db": str(e)}

@app.get("/api/ignite/{date}")
def get_ignite(date: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT d.ts_code, s.name,
            (d.payload->>'candidate_rank')::int AS rank,
            (d.payload->>'ignite_score')::float AS ignite_score,
            (d.payload->>'s_candidate')::float AS s_candidate,
            (d.payload->>'s_turn')::float AS s_turn,
            (d.payload->>'s_ret20')::float AS s_ret20,
            (d.payload->>'s_rs')::float AS s_rs,
            (d.payload->>'s_ma5')::float AS s_ma5,
            (d.payload->>'vr')::float AS vr,
            (d.payload->>'turnover_rate')::float AS turnover_rate,
            pr.close AS close,
            ROUND((pr.close - (SELECT p2.close FROM public.ashare_daily_price p2 WHERE p2.ts_code=pr.ts_code AND p2.trade_date<pr.trade_date ORDER BY p2.trade_date DESC LIMIT 1)) / NULLIF((SELECT p2.close FROM public.ashare_daily_price p2 WHERE p2.ts_code=pr.ts_code AND p2.trade_date<pr.trade_date ORDER BY p2.trade_date DESC LIMIT 1), 0) * 100, 2) AS pct_chg,
            (d.payload->>'amount_yi')::float AS amount_yi
        FROM public.ashare_ignite_strict3_daily d
        LEFT JOIN public.ashare_stock_basic s ON s.ts_code = d.ts_code
        LEFT JOIN public.ashare_daily_price pr ON pr.ts_code = d.ts_code AND pr.trade_date = d.trade_date
        WHERE d.trade_date = %s::date ORDER BY rank LIMIT 20
    """, (date,))
    rows = cur.fetchall()
    conn.close()
    return {"date": date, "data": [dict(r) for r in rows]}

@app.get("/api/continuation/{date}")
def get_continuation(date: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT d.ts_code, s.name,
            (d.payload->>'cont_score')::float AS cont_score,
            (d.payload->>'pool_day')::int AS pool_day,
            d.payload->>'buy_signal' AS buy_signal,
            (d.payload->>'turnover_rate')::float AS turnover_rate,
            (d.payload->>'vr')::float AS vr
        FROM public.ashare_continuation_v1_daily d
        LEFT JOIN public.ashare_stock_basic s ON s.ts_code = d.ts_code
        WHERE d.trade_date = %s::date ORDER BY cont_score DESC NULLS LAST LIMIT 20
    """, (date,))
    rows = cur.fetchall()
    conn.close()
    return {"date": date, "data": [dict(r) for r in rows]}

@app.get("/api/pool/{date}")
def get_pool(date: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT p.ts_code, s.name, p.entry_rank, p.entry_score,
            b.turnover_rate, ROUND((pr.close - (SELECT p2.close FROM public.ashare_daily_price p2 WHERE p2.ts_code=pr.ts_code AND p2.trade_date<pr.trade_date ORDER BY p2.trade_date DESC LIMIT 1)) / NULLIF((SELECT p2.close FROM public.ashare_daily_price p2 WHERE p2.ts_code=pr.ts_code AND p2.trade_date<pr.trade_date ORDER BY p2.trade_date DESC LIMIT 1), 0) * 100, 2) AS pct_chg,
            pr.amount/100000 AS amount_yi,
            pr.vol/100 AS vol_wan
        FROM public.ashare_pool p
        LEFT JOIN public.ashare_stock_basic s ON s.ts_code=p.ts_code
        LEFT JOIN public.ashare_daily_basic b ON b.ts_code=p.ts_code AND b.trade_date=%s::date
        LEFT JOIN public.ashare_daily_price pr ON pr.ts_code=p.ts_code AND pr.trade_date=%s::date
        WHERE p.entry_date=%s::date AND p.status='active'
        ORDER BY p.entry_rank LIMIT 50
    """, (date, date, date))
    rows = cur.fetchall()
    conn.close()
    return {"date": date, "data": [dict(r) for r in rows]}

@app.get("/api/retoc2/{date}")
def get_retoc2(date: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT
            ts_code, name, grade, total_bars_10, cnt_bars,
            ROUND(ret10 * 100, 2)        AS ret10_pct,
            ROUND(turnover_rate, 2)      AS turnover_rate,
            ROUND(pct_chg * 100, 2)      AS pct_chg,
            close,
            ROUND(ma20::numeric, 2)      AS ma20,
            ROUND(amount_yi::numeric, 2) AS amount_yi,
            ROW_NUMBER() OVER (ORDER BY amount_yi DESC NULLS LAST) AS rank
        FROM public.ashare_retoc2_v3_trigger
        WHERE trade_date = %s::date
        ORDER BY amount_yi DESC NULLS LAST
    """, (date,))
    rows = cur.fetchall()
    conn.close()
    return {"date": date, "data": [dict(r) for r in rows]}

@app.get("/api/pipeline/{date}")
def get_pipeline(date: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT step, status, duration_ms, message,
            started_at::text AS started_at
        FROM public.ashare_pipeline_runs
        WHERE trade_date=%s::date ORDER BY started_at
    """, (date,))
    rows = cur.fetchall()
    conn.close()
    return {"date": date, "data": [dict(r) for r in rows]}

@app.get("/api/trade-dates")
def get_trade_dates():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT cal_date::text AS date FROM public.ashare_trade_calendar
        WHERE is_open=true AND cal_date<=CURRENT_DATE
        ORDER BY cal_date DESC LIMIT 60
    """)
    rows = cur.fetchall()
    conn.close()
    return {"dates": [r["date"] for r in rows]}
@app.get("/api/pattern/t2up9/{date}")
def get_pattern_t2up9(date: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT p.ts_code, s.name, p.anchor_date::text,
            p.ret_t2, p.ret_t1, p.ret_t0, p.ret_2d,
            p.in_pool, p.in_continuation
        FROM public.ashare_pattern_t2up9_2dup_lt5_candidates p
        LEFT JOIN public.ashare_stock_basic s ON s.ts_code = p.ts_code
        WHERE p.anchor_date = %s::date
        ORDER BY p.ret_t2 DESC
    """, (date,))
    rows = cur.fetchall()
    conn.close()
    return {"date": date, "data": [dict(r) for r in rows]}

@app.get("/api/pattern/green10/{date}")
def get_pattern_green10(date: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT p.ts_code, s.name, p.anchor_date::text,
            p.green_days_10d, p.red_days_10d, p.flat_days_10d,
            p.in_pool, p.in_continuation
        FROM public.ashare_pattern_top10_green_10d_candidates p
        LEFT JOIN public.ashare_stock_basic s ON s.ts_code = p.ts_code
        WHERE p.anchor_date = %s::date
        ORDER BY p.green_days_10d DESC
    """, (date,))
    rows = cur.fetchall()
    conn.close()
    return {"date": date, "data": [dict(r) for r in rows]}

@app.get("/api/pattern/weak_buy/{date}")
def get_pattern_weak_buy(date: str):
    """弱市吸筹策略页：优先从 watch 表读取（两级触发），fallback 到 pool 表"""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        # 优先从 watch 表读取（两级触发模式）
        cur.execute("""
            SELECT w.ts_code, w.name,
                   ROUND(w.close::numeric, 2) AS close,
                   ROUND(w.ret60::numeric * 100, 2) AS ret60_pct,
                   w.volup15_days,
                   ROUND(w.volup15_avg_ret::numeric * 100, 2) AS avg_ret_pct,
                   w.weak_days,
                   ROUND(w.amount_yi::numeric, 2) AS amount_yi,
                   w.status,
                   w.expire_date::text AS expire_date,
                   w.triggered_date::text AS triggered_date,
                   CASE WHEN wl.id IS NOT NULL THEN true ELSE false END AS in_watchlist
            FROM public.ashare_weak_buy_watch w
            LEFT JOIN public.ashare_watchlist wl
                ON wl.ts_code = w.ts_code AND wl.strategy = 'WEAK_BUY' AND wl.status = 'active'
            WHERE w.trade_date = %s
            ORDER BY w.ret60 ASC
        """, (date,))
        rows = cur.fetchall()
        if rows:
            return {"date": date, "source": "watch", "data": [dict(r) for r in rows]}

        # Fallback: 从 pool 表读取（旧数据兼容）
        cur.execute("""
            SELECT ts_code, name,
                   ROUND(close::numeric, 2) AS close,
                   ROUND(ret60::numeric * 100, 2) AS ret60_pct,
                   volup15_days,
                   ROUND(volup15_avg_ret::numeric * 100, 2) AS avg_ret_pct,
                   weak_days,
                   ROUND(amount_yi::numeric, 2) AS amount_yi,
                   status,
                   NULL AS expire_date,
                   NULL AS triggered_date,
                   false AS in_watchlist
            FROM public.ashare_weak_buy_pool
            WHERE trade_date = %s
            ORDER BY ret60 ASC
        """, (date,))
        rows = cur.fetchall()
        return {"date": date, "source": "pool", "data": [dict(r) for r in rows]}
    finally:
        cur.close()
        conn.close()

@app.get("/api/ignite/v2/{date}")
def get_ignite_v2(date: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    # 先查落地表
    cur.execute("""
        SELECT d.ts_code, s.name,
            (d.payload->>'candidate_rank')::int AS rank,
            (d.payload->>'ignite_score')::float AS ignite_score,
            (d.payload->>'s_candidate')::float AS s_candidate,
            (d.payload->>'s_turn')::float AS s_turn,
            (d.payload->>'s_ret20')::float AS s_ret20,
            (d.payload->>'s_rs')::float AS s_rs,
            (d.payload->>'s_ma5')::float AS s_ma5,
            (d.payload->>'vr')::float AS vr,
            (d.payload->>'turnover_rate')::float AS turnover_rate,
            pr.close AS close,
            ROUND((pr.close - (SELECT p2.close FROM public.ashare_daily_price p2 WHERE p2.ts_code=pr.ts_code AND p2.trade_date<pr.trade_date ORDER BY p2.trade_date DESC LIMIT 1)) / NULLIF((SELECT p2.close FROM public.ashare_daily_price p2 WHERE p2.ts_code=pr.ts_code AND p2.trade_date<pr.trade_date ORDER BY p2.trade_date DESC LIMIT 1), 0) * 100, 2) AS pct_chg,
            ROUND(pr.amount / 100000, 2) AS amount_yi
        FROM public.ashare_ignite_strict3_daily d
        LEFT JOIN public.ashare_stock_basic s ON s.ts_code = d.ts_code
        LEFT JOIN public.ashare_daily_price pr ON pr.ts_code = d.ts_code AND pr.trade_date = d.trade_date
        WHERE d.trade_date = %s::date ORDER BY rank LIMIT 20
    """, (date,))
    rows = cur.fetchall()
    if not rows:
        # fallback 调用函数
        cur.execute("""
            SELECT r.candidate_rank AS rank, r.ts_code, s.name,
                r.ignite_score, r.s_candidate, r.s_turn, r.s_ret20, r.s_rs, r.s_ma5,
                r.vr, r.turnover_rate,
                pr.close,
                ROUND((pr.close - (SELECT p2.close FROM public.ashare_daily_price p2 WHERE p2.ts_code=pr.ts_code AND p2.trade_date<pr.trade_date ORDER BY p2.trade_date DESC LIMIT 1)) / NULLIF((SELECT p2.close FROM public.ashare_daily_price p2 WHERE p2.ts_code=pr.ts_code AND p2.trade_date<pr.trade_date ORDER BY p2.trade_date DESC LIMIT 1), 0) * 100, 2) AS pct_chg,
                ROUND(pr.amount / 100000, 2) AS amount_yi
            FROM public.ashare_ignite_rank_v3_strict3(%s::date) r
            LEFT JOIN public.ashare_stock_basic s ON s.ts_code = r.ts_code
            LEFT JOIN public.ashare_daily_price pr ON pr.ts_code = r.ts_code AND pr.trade_date = %s::date
            ORDER BY rank LIMIT 20
        """, (date, date))
        rows = cur.fetchall()
    conn.close()
    return {"date": date, "data": [dict(r) for r in rows]}

@app.get("/api/continuation/v2/{date}")
def get_continuation_v2(date: str):
    from datetime import datetime, timedelta
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT d.ts_code, s.name,
            (d.payload->>'cont_score')::float AS cont_score,
            (d.payload->>'pool_day')::int AS pool_day,
            d.payload->>'buy_signal' AS buy_signal,
            (d.payload->>'turnover_rate')::float AS turnover_rate,
            (d.payload->>'vr')::float AS vr
        FROM public.ashare_continuation_v1_daily d
        LEFT JOIN public.ashare_stock_basic s ON s.ts_code = d.ts_code
        WHERE d.trade_date = %s::date ORDER BY cont_score DESC NULLS LAST LIMIT 20
    """, (date,))
    rows = cur.fetchall()
    if not rows:
        # 只对最近3天fallback调用函数，更早的历史直接返回空
        d = datetime.strptime(date, "%Y-%m-%d")
        if (datetime.now() - d).days <= 30:
            cur.execute("""
                SELECT r.ts_code, s.name,
                    r.cont_score, r.pool_day, r.buy_signal,
                    r.turnover_rate, r.vr_now AS vr
                FROM public.ashare_continuation_rank_v1(%s::date) r
                LEFT JOIN public.ashare_stock_basic s ON s.ts_code = r.ts_code
                WHERE r.exit_flag = false
                ORDER BY r.cont_score DESC NULLS LAST LIMIT 20
            """, (date,))
            rows = cur.fetchall()
    conn.close()
    return {"date": date, "data": [dict(r) for r in rows]}


# ============================================================
# Watchlist & Portfolio APIs — 2026-03-03
# ============================================================

@app.get("/api/watchlist/active")
def get_watchlist_active(strategy: str = None):
    """活跃候选池：可按策略过滤"""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    if strategy:
        cur.execute("""
            SELECT id, ts_code, name, strategy, entry_date, entry_price, entry_score,
                   entry_rank, pool_day, latest_close, gain_since_entry, max_gain,
                   drawdown_from_peak, vr_today, turnover_rate, ma5, ma10, ma20,
                   above_ma20_days, buy_signal, sell_signal, tags
            FROM public.v_watchlist_active
            WHERE strategy = %s
        """, (strategy.upper(),))
    else:
        cur.execute("""
            SELECT id, ts_code, name, strategy, entry_date, entry_price, entry_score,
                   entry_rank, pool_day, latest_close, gain_since_entry, max_gain,
                   drawdown_from_peak, vr_today, turnover_rate, ma5, ma10, ma20,
                   above_ma20_days, buy_signal, sell_signal, tags
            FROM public.v_watchlist_active
        """)
    rows = cur.fetchall()
    conn.close()
    return {"count": len(rows), "data": [dict(r) for r in rows]}

@app.get("/api/watchlist/signals")
def get_watchlist_signals():
    """今日信号：有买点或卖点信号的标的"""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, ts_code, name, strategy, entry_date, pool_day,
               latest_close, gain_since_entry, vr_today,
               buy_signal, sell_signal, signal_date
        FROM public.v_watchlist_signals_today
    """)
    rows = cur.fetchall()
    conn.close()
    buy_count = sum(1 for r in rows if r.get("buy_signal"))
    sell_count = sum(1 for r in rows if r.get("sell_signal"))
    return {"buy_count": buy_count, "sell_count": sell_count, "data": [dict(r) for r in rows]}

@app.get("/api/watchlist/stats")
def get_watchlist_stats():
    """候选池统计概览"""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT
            count(*) FILTER (WHERE status = 'active') AS active_total,
            count(*) FILTER (WHERE status = 'exited') AS exited_total,
            count(*) FILTER (WHERE status = 'active' AND strategy = 'IGNITE') AS active_ignite,
            count(*) FILTER (WHERE status = 'active' AND strategy = 'RETOC2') AS active_retoc2,
            count(*) FILTER (WHERE status = 'active' AND strategy = 'PATTERN_T2UP9') AS active_t2up9,
            count(*) FILTER (WHERE status = 'active' AND strategy = 'PATTERN_GREEN10') AS active_green10,
            count(*) FILTER (WHERE status = 'active' AND buy_signal IS NOT NULL) AS with_buy_signal,
            count(*) FILTER (WHERE status = 'active' AND sell_signal IS NOT NULL) AS with_sell_signal,
            ROUND(AVG(gain_since_entry) FILTER (WHERE status = 'active')::numeric, 4) AS avg_gain_active,
            ROUND(AVG(pnl_pct) FILTER (WHERE status = 'exited')::numeric, 4) AS avg_pnl_exited
        FROM public.ashare_watchlist
    """)
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else {}

@app.get("/api/watchlist/exited")
def get_watchlist_exited(limit: int = 50):
    """已退池记录"""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT w.id, w.ts_code, s.name, w.strategy, w.entry_date, w.entry_price,
               w.exit_date, w.exit_reason, w.exit_price, w.pnl_pct, w.pool_day
        FROM public.ashare_watchlist w
        LEFT JOIN public.ashare_stock_basic s ON s.ts_code = w.ts_code
        WHERE w.status = 'exited'
        ORDER BY w.exit_date DESC, w.pnl_pct DESC NULLS LAST
        LIMIT %s
    """, (limit,))
    rows = cur.fetchall()
    conn.close()
    return {"count": len(rows), "data": [dict(r) for r in rows]}

@app.get("/api/portfolio")
def get_portfolio(status: str = "open", trade_date: str = None):
    """持仓列表"""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT v.id, v.ts_code, v.name, v.position_type, v.open_date, v.open_price, v.shares,
               v.cost_amount, v.source_strategy, v.status, v.latest_close, v.market_value,
               v.unrealized_pnl, v.unrealized_pnl_pct, v.max_price_since_open,
               v.drawdown_from_peak, v.hold_days, v.action_signal, v.signal_reason,
               v.close_date, v.close_price, v.realized_pnl, v.realized_pnl_pct, v.notes,
               ap.watchlist_id,
               r.position_cap_multiplier_final
        FROM public.v_portfolio_dashboard v
        LEFT JOIN public.ashare_portfolio ap ON ap.id = v.id
        LEFT JOIN (
            SELECT DISTINCT ON (ts_code) ts_code, position_cap_multiplier_final
            FROM public.ashare_risk_score
            ORDER BY ts_code, trade_date DESC
        ) r ON r.ts_code = v.ts_code
        WHERE v.status = %s OR %s = 'all'
    """, (status, status))
    rows = cur.fetchall()

    # today_pnl: batch query prev close for all stocks in result
    ts_codes = list({r["ts_code"] for r in rows if r.get("latest_close") is not None})
    prev_map = {}
    if ts_codes:
        cur.execute("""
            SELECT DISTINCT ON (ts_code) ts_code, close
            FROM public.ashare_daily_price
            WHERE ts_code = ANY(%s)
              AND trade_date < COALESCE(%s::date, CURRENT_DATE)
            ORDER BY ts_code, trade_date DESC
        """, (ts_codes, trade_date))
        for pc in cur.fetchall():
            prev_map[pc["ts_code"]] = float(pc["close"])
    conn.close()

    # 批量查询 closed 记录的 hold_days（用交易日历实时计算，覆盖历史脏数据）
    closed_codes_dates = [
        (str(r["ts_code"]), str(r["open_date"]), str(r["close_date"]))
        for r in rows if r.get("status") == "closed" and r.get("open_date") and r.get("close_date")
    ]
    conn2 = get_db()
    cur2 = conn2.cursor()
    hold_days_map = {}
    for ts_code, open_date, close_date in closed_codes_dates:
        if open_date > close_date:
            hold_days_map[(ts_code, open_date)] = 0
            continue
        cur2.execute("""
            SELECT COUNT(*) FROM ashare_trade_calendar
            WHERE cal_date BETWEEN %s AND %s AND is_open = TRUE
        """, (open_date, close_date))
        row2 = cur2.fetchone()
        hold_days_map[(ts_code, open_date)] = int(row2[0]) if row2 else 0
    cur2.close()
    conn2.close()

    rows_out = []
    for r in rows:
        d = dict(r)
        lc = float(r["latest_close"]) if r.get("latest_close") is not None else None
        pc = prev_map.get(r["ts_code"])
        if lc is not None and pc and pc > 0 and r.get("shares"):
            d["today_pnl"]     = round((lc - pc) * int(r["shares"]), 2)
            d["today_pnl_pct"] = round((lc - pc) / pc * 100, 2)
        else:
            d["today_pnl"]     = None
            d["today_pnl_pct"] = None
        # 覆盖 closed 记录的 hold_days
        if d.get("status") == "closed" and d.get("open_date") and d.get("close_date"):
            key = (str(d["ts_code"]), str(d["open_date"]))
            if key in hold_days_map:
                d["hold_days"] = hold_days_map[key]
        rows_out.append(d)

    total_cost  = sum(float(r["cost_amount"]  or 0) for r in rows_out)
    total_value = sum(float(r["market_value"] or 0) for r in rows_out)
    total_pnl   = total_value - total_cost

    return {
        "count":         len(rows_out),
        "total_cost":    round(total_cost, 2),
        "total_value":   round(total_value, 2),
        "total_pnl":     round(total_pnl, 2),
        "total_pnl_pct": round(total_pnl / total_cost, 4) if total_cost > 0 else 0,
        "data":          rows_out,
    }

@app.post("/api/portfolio/add")
def add_portfolio(item: dict):
    """手工添加持仓"""
    required = ["ts_code", "open_date", "open_price", "shares"]
    for k in required:
        if k not in item:
            return {"error": f"缺少必填字段: {k}"}

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # 查股票名称
    cur.execute("SELECT name FROM public.ashare_stock_basic WHERE ts_code = %s", (item["ts_code"],))
    name_row = cur.fetchone()
    name = name_row["name"] if name_row else None

    open_price = float(item["open_price"])
    shares = int(item["shares"])
    cost = round(open_price * shares, 2)

    cur.execute("""
        INSERT INTO public.ashare_portfolio
            (ts_code, name, position_type, open_date, open_price, shares,
             cost_amount, source_strategy, watchlist_id, notes)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """, (
        item["ts_code"],
        name,
        item.get("position_type", "PAPER"),
        item["open_date"],
        open_price,
        shares,
        cost,
        item.get("source_strategy", "MANUAL"),
        item.get("watchlist_id"),
        item.get("notes"),
    ))
    new_id = cur.fetchone()["id"]
    conn.commit()
    conn.close()
    return {"id": new_id, "ts_code": item["ts_code"], "name": name, "status": "created"}

@app.post("/api/portfolio/{portfolio_id}/close")
def close_portfolio(portfolio_id: int, item: dict):
    """平仓"""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # 查原始持仓
    cur.execute("SELECT open_price, shares, cost_amount FROM public.ashare_portfolio WHERE id = %s", (portfolio_id,))
    pos = cur.fetchone()
    if not pos:
        conn.close()
        return {"error": "持仓不存在"}

    close_price = float(item.get("close_price", 0))
    close_date = item.get("close_date")
    open_price = float(pos["open_price"])
    shares = pos["shares"]
    cost = float(pos["cost_amount"] or open_price * shares)

    realized_pnl = round(close_price * shares - cost, 2)
    realized_pnl_pct = round((close_price - open_price) / open_price, 6) if open_price > 0 else 0

    cur.execute("""
        UPDATE public.ashare_portfolio SET
            status = 'closed',
            close_date = %s,
            close_price = %s,
            realized_pnl = %s,
            realized_pnl_pct = %s,
            updated_at = now()
        WHERE id = %s
    """, (close_date, close_price, realized_pnl, realized_pnl_pct, portfolio_id))

    # 记录交易
    cur.execute("""
        INSERT INTO public.ashare_portfolio_transactions
            (portfolio_id, ts_code, trade_date, trade_type, price, shares, amount,
             trigger_source, notes)
        VALUES (%s, %s, %s, 'SELL', %s, %s, %s, 'manual', %s)
    """, (portfolio_id, item.get("ts_code", ""), close_date, close_price, shares,
          round(close_price * shares, 2), item.get("notes")))

    conn.commit()
    conn.close()
    return {"id": portfolio_id, "status": "closed", "realized_pnl": realized_pnl,
            "realized_pnl_pct": realized_pnl_pct}

@app.get("/api/portfolio/transactions/{portfolio_id}")
def get_transactions(portfolio_id: int):
    """查看某持仓的交易记录"""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, ts_code, trade_date, trade_type, price, shares, amount,
               trigger_signal, trigger_source, notes, created_at
        FROM public.ashare_portfolio_transactions
        WHERE portfolio_id = %s
        ORDER BY trade_date, created_at
    """, (portfolio_id,))
    rows = cur.fetchall()
    conn.close()
    return {"portfolio_id": portfolio_id, "data": [dict(r) for r in rows]}


@app.post("/api/portfolio/{portfolio_id}/add_position")
def add_position_to_holding(portfolio_id: int, item: dict):
    """加仓 – 按加权均价更新持仓成本"""
    import datetime as _dt
    conn = get_db()
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT ts_code, open_price, shares, cost_amount "
        "FROM public.ashare_portfolio WHERE id = %s AND status = 'open'",
        (portfolio_id,)
    )
    pos = cur.fetchone()
    if not pos:
        conn.close()
        return {"error": "持仓不存在或已平仓"}

    new_price  = float(item.get("price",  0))
    new_shares = int(item.get("shares",   0))
    trade_date = item.get("date", str(_dt.date.today()))

    if new_price <= 0 or new_shares <= 0:
        conn.close()
        return {"error": "价格和数量必须大于0"}

    old_shares   = int(pos["shares"])
    old_cost     = float(pos["cost_amount"] or float(pos["open_price"]) * old_shares)
    add_cost     = round(new_price * new_shares, 2)
    total_shares = old_shares + new_shares
    total_cost   = old_cost + add_cost
    avg_price    = round(total_cost / total_shares, 4)

    cur.execute("""
        UPDATE public.ashare_portfolio
        SET open_price  = %s,
            shares      = %s,
            cost_amount = %s,
            updated_at  = now()
        WHERE id = %s
    """, (avg_price, total_shares, round(total_cost, 2), portfolio_id))

    cur.execute("""
        INSERT INTO public.ashare_portfolio_transactions
            (portfolio_id, ts_code, trade_date, trade_type, price, shares, amount, trigger_source)
        VALUES (%s, %s, %s, 'BUY', %s, %s, %s, 'manual')
    """, (portfolio_id, pos["ts_code"], trade_date, new_price, new_shares, add_cost))

    conn.commit()
    conn.close()
    return {
        "id":           portfolio_id,
        "avg_price":    avg_price,
        "total_shares": total_shares,
        "total_cost":   round(total_cost, 2),
    }

# ── 持仓管理 API ──────────────────────────────────────────

@app.get("/api/portfolio")
def get_portfolio():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT p.id, p.ts_code, p.name, p.position_type, p.open_date::text, p.open_price,
               p.shares, p.cost_amount, p.source_strategy, p.status,
               p.latest_close, p.market_value, p.unrealized_pnl, p.unrealized_pnl_pct,
               p.max_price_since_open, p.drawdown_from_peak, p.hold_days,
               p.action_signal, p.signal_reason, p.notes, p.created_at::text,
               p.watchlist_id,
               r.position_cap_multiplier_final
        FROM ashare_portfolio p
        LEFT JOIN (
            SELECT DISTINCT ON (ts_code) ts_code, position_cap_multiplier_final
            FROM ashare_risk_score
            ORDER BY ts_code, trade_date DESC
        ) r ON r.ts_code = p.ts_code
        WHERE p.status = 'open'
        ORDER BY p.created_at DESC
    """)
    rows = cur.fetchall()
    conn.close()
    return {"data": [dict(r) for r in rows]}

@app.post("/api/portfolio/add")
def add_portfolio(body: dict):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ts_code = body.get("ts_code", "").strip()
    shares = int(body.get("shares", 0))
    open_price = float(body.get("open_price", 0))
    cost_amount = round(open_price * shares, 2)
    cur.execute("""
        INSERT INTO ashare_portfolio
            (ts_code, name, position_type, open_date, open_price, shares,
             cost_amount, source_strategy, status, hold_days)
        VALUES (%s, %s, 'PAPER', %s::date, %s, %s, %s, %s, 'open', 0)
        RETURNING id
    """, (
        ts_code,
        body.get("name", ""),
        body.get("open_date"),
        open_price,
        shares,
        cost_amount,
        body.get("source_strategy", ""),
    ))
    new_id = cur.fetchone()["id"]
    conn.commit()
    conn.close()
    return {"success": True, "id": new_id}

@app.delete("/api/portfolio/{portfolio_id}")
def close_portfolio(portfolio_id: int, body: dict = {}):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE ashare_portfolio
        SET status = 'closed', close_date = CURRENT_DATE,
            close_price = %s, updated_at = now()
        WHERE id = %s
    """, (body.get("close_price"), portfolio_id))
    conn.commit()
    conn.close()
    return {"success": True}

# ── VOL_SURGE 放量蓄势 API ────────────────────────────────

@app.get("/api/vol_surge/{date}")
def get_vol_surge(date: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT ts_code, name, entry_rank, close, buy_price,
               vr_t0, vr_t1, vr_t2, avg_vr3,
               turnover_rate, amount_yi, ret5, ret20,
               ma20, status, trade_date::text
        FROM ashare_vol_surge_pool
        WHERE trade_date = %s::date
        ORDER BY entry_rank
    """, (date,))
    rows = cur.fetchall()
    conn.close()
    return {"date": date, "data": [dict(r) for r in rows]}

# ── 持续观察池 API ────────────────────────────────────────

@app.get("/api/watchlist")
def get_watchlist(include_exited: bool = False):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    if include_exited:
        status_clause = "w.status IN ('active', 'exited')"
    else:
        status_clause = "w.status = 'active'"
    cur.execute(f"""
        SELECT w.id, w.ts_code, s.name, w.strategy,
               w.entry_date::text, w.entry_price, w.entry_rank,
               w.status, w.pool_day,
               COALESCE(lp.close, w.latest_close) AS latest_close,
               w.latest_pct_chg,
               CASE WHEN w.entry_price > 0
                    THEN ROUND(((COALESCE(lp.close, w.latest_close) - w.entry_price) / w.entry_price)::numeric, 6)
                    ELSE w.gain_since_entry
               END AS gain_since_entry,
               w.vr_today, COALESCE(w.turnover_rate, sig.turnover_rate) AS turnover_rate,
               w.ma5, w.ma10, w.ma20, w.above_ma20_days,
               w.buy_signal, w.sell_signal, w.drawdown_from_peak,
               sig.anom_trigger, sig.ret10
        FROM ashare_watchlist w
        LEFT JOIN ashare_stock_basic s ON s.ts_code = w.ts_code
        LEFT JOIN LATERAL (
            SELECT close FROM ashare_daily_price
            WHERE ts_code = w.ts_code ORDER BY trade_date DESC LIMIT 1
        ) lp ON true
        LEFT JOIN ashare_retoc2_v3_trigger sig
            ON w.ts_code = sig.ts_code AND w.entry_date = sig.trade_date AND w.strategy = 'RETOC2'
        WHERE {status_clause}
        ORDER BY w.entry_date DESC, w.entry_rank
    """)
    rows = cur.fetchall()
    conn.close()
    return {"data": [dict(r) for r in rows]}



@app.get("/api/watchlist/cross_strategies")
def get_cross_strategies():
    conn = get_db()
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT ts_code,
               array_agg(DISTINCT strategy ORDER BY strategy) AS strategies,
               count(DISTINCT strategy) AS strategy_count
        FROM ashare_watchlist
        WHERE status = 'active'
        GROUP BY ts_code
        HAVING count(DISTINCT strategy) >= 2
    """)
    rows = cur.fetchall()
    conn.close()
    result = {r['ts_code']: list(r['strategies']) for r in rows}
    return {"data": result}


@app.get("/api/stock_detail/{ts_code}/{date}")
def get_stock_detail(ts_code: str, date: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # 1. 基本信息 + ST状态
    cur.execute("""
        SELECT ts_code, name, industry, is_st, list_date::text AS list_date
        FROM public.ashare_stock_basic WHERE ts_code = %s
    """, (ts_code,))
    basic = cur.fetchone()
    if not basic:
        conn.close()
        return {"error": "股票不存在", "ts_code": ts_code}
    result = dict(basic)

    # 2. 当日行情 + 基本面
    cur.execute("""
        SELECT dp.close, dp.open, dp.high, dp.low, dp.vol, dp.amount,
               db.turnover_rate, db.pe AS pe_ttm, db.pb,
               ROUND(db.total_mv / 10000, 2) AS market_cap_yi,
               ROUND((dp.close - (SELECT p2.close FROM public.ashare_daily_price p2 WHERE p2.ts_code=dp.ts_code AND p2.trade_date<dp.trade_date ORDER BY p2.trade_date DESC LIMIT 1)) / NULLIF((SELECT p2.close FROM public.ashare_daily_price p2 WHERE p2.ts_code=dp.ts_code AND p2.trade_date<dp.trade_date ORDER BY p2.trade_date DESC LIMIT 1), 0) * 100, 2) AS pct_chg,
               ROUND(dp.amount / 100000, 2) AS amount_yi
        FROM public.ashare_daily_price dp
        LEFT JOIN public.ashare_daily_basic db
            ON dp.ts_code = db.ts_code AND dp.trade_date = db.trade_date
        WHERE dp.ts_code = %s AND dp.trade_date = %s::date
    """, (ts_code, date))
    price_row = cur.fetchone()
    if price_row:
        result.update(dict(price_row))

    # 3. MA + VR 计算（最近25日数据）
    cur.execute("""
        WITH recent AS (
            SELECT close, vol,
                   ROW_NUMBER() OVER (ORDER BY trade_date DESC) AS rn
            FROM public.ashare_daily_price
            WHERE ts_code = %s AND trade_date <= %s::date
            ORDER BY trade_date DESC
            LIMIT 25
        )
        SELECT
            ROUND(AVG(close) FILTER (WHERE rn <= 5)::numeric, 3)  AS ma5,
            ROUND(AVG(close) FILTER (WHERE rn <= 10)::numeric, 3) AS ma10,
            ROUND(AVG(close) FILTER (WHERE rn <= 20)::numeric, 3) AS ma20,
            ROUND((MAX(vol) FILTER (WHERE rn = 1) /
                   NULLIF(AVG(vol) FILTER (WHERE rn BETWEEN 2 AND 21), 0))::numeric, 2) AS vr
        FROM recent
    """, (ts_code, date))
    ma_row = cur.fetchone()
    if ma_row:
        result.update({k: v for k, v in dict(ma_row).items() if v is not None})

    # 4. 连续站上MA20天数
    cur.execute("""
        WITH daily_ma AS (
            SELECT trade_date, close,
                   AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20_val
            FROM public.ashare_daily_price
            WHERE ts_code = %s AND trade_date <= %s::date
            ORDER BY trade_date
            LIMIT 60
        ),
        flagged AS (
            SELECT trade_date,
                   CASE WHEN close > ma20_val THEN 1 ELSE 0 END AS above,
                   ROW_NUMBER() OVER (ORDER BY trade_date DESC) AS rn
            FROM daily_ma
        )
        SELECT COUNT(*) AS above_ma20_days
        FROM flagged
        WHERE rn <= COALESCE(
            (SELECT MIN(rn) - 1 FROM flagged WHERE above = 0),
            (SELECT COUNT(*) FROM flagged)
        ) AND above = 1
    """, (ts_code, date))
    ma20_row = cur.fetchone()
    result["above_ma20_days"] = int(ma20_row["above_ma20_days"]) if ma20_row else 0

    # 5. watchlist 状态
    cur.execute("""
        SELECT strategy, entry_date::text AS entry_date, entry_price,
               pool_day, gain_since_entry, max_gain,
               buy_signal, sell_signal
        FROM public.ashare_watchlist
        WHERE ts_code = %s AND status = 'active'
        ORDER BY entry_date DESC LIMIT 1
    """, (ts_code,))
    wl_row = cur.fetchone()
    if wl_row:
        result["in_watchlist"] = True
        for k, v in dict(wl_row).items():
            result[f"watchlist_{k}"] = v
    else:
        result["in_watchlist"] = False


    # 6. 最近3年年报财务数据（归母净利润 = eps_basic × 总股本，与同花顺口径一致）
    cur.execute(
        """
        WITH latest_shares AS (
            SELECT ROUND(db.total_mv * 10000 / NULLIF(dp.close, 0)) AS total_shares
            FROM public.ashare_daily_basic db
            JOIN public.ashare_daily_price dp USING (ts_code, trade_date)
            WHERE db.ts_code = %s
            ORDER BY db.trade_date DESC LIMIT 1
        )
        SELECT
            EXTRACT(YEAR FROM end_date)::int                                          AS year,
            ROUND(revenue      / 100000000, 2)                                        AS revenue_yi,
            ROUND(total_profit / 100000000, 2)                                        AS total_profit_yi,
            ROUND(eps_basic * (SELECT total_shares FROM latest_shares) / 100000000, 2) AS net_income_yi
        FROM public.ashare_fin_income_core
        WHERE ts_code = %s
          AND TO_CHAR(end_date, 'MMDD') = '1231'
          AND report_type = '1'
        ORDER BY end_date DESC
        LIMIT 3
        """,
        (ts_code, ts_code),
    )
    fin_rows = cur.fetchall()
    result["financials"] = [dict(r) for r in fin_rows]

    conn.close()
    return result


@app.get("/api/kline/{ts_code}")
def get_kline(ts_code: str, days: int = 60):
    buf  = days + 25   # warmup rows for MA20 calculation
    conn = get_db()
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        WITH recent AS (
            SELECT trade_date, open, high, low, close, vol,
                   ROW_NUMBER() OVER (ORDER BY trade_date DESC) AS rn
            FROM public.ashare_daily_price
            WHERE ts_code = %s
        ),
        with_ma AS (
            SELECT
                trade_date,
                ROUND(open::numeric,  2) AS open,
                ROUND(high::numeric,  2) AS high,
                ROUND(low::numeric,   2) AS low,
                ROUND(close::numeric, 2) AS close,
                vol::bigint              AS volume,
                rn,
                ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN  4 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma5,
                ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN  9 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma10,
                ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma20
            FROM recent
            WHERE rn <= %s
        )
        SELECT TO_CHAR(trade_date, 'YYYY-MM-DD') AS date,
               open, high, low, close, volume, ma5, ma10, ma20
        FROM with_ma
        WHERE rn <= %s
        ORDER BY trade_date ASC
    """, (ts_code, buf, days))
    rows = cur.fetchall()
    conn.close()
    return {"data": [dict(r) for r in rows]}


@app.get("/api/ai_analysis/{ts_code}/{date}")
def get_ai_analysis(ts_code: str, date: str):
    import anthropic as _anthropic, json as _json

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {"error": "ANTHROPIC_API_KEY not configured"}

    conn = get_db()
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # 1. 基本信息
    cur.execute("""
        SELECT name, industry, is_st
        FROM public.ashare_stock_basic WHERE ts_code = %s
    """, (ts_code,))
    basic = cur.fetchone()
    if not basic:
        conn.close()
        return {"error": "股票不存在"}

    # 2. 当日行情 + 基本面
    cur.execute("""
        SELECT dp.close, dp.open, dp.high, dp.low,
               db.turnover_rate, db.pe AS pe_ttm, db.pb,
               ROUND(db.total_mv / 10000, 2)                               AS market_cap_yi,
               ROUND((dp.close - (SELECT p2.close FROM public.ashare_daily_price p2 WHERE p2.ts_code=dp.ts_code AND p2.trade_date<dp.trade_date ORDER BY p2.trade_date DESC LIMIT 1)) / NULLIF((SELECT p2.close FROM public.ashare_daily_price p2 WHERE p2.ts_code=dp.ts_code AND p2.trade_date<dp.trade_date ORDER BY p2.trade_date DESC LIMIT 1), 0) * 100, 2) AS pct_chg,
               ROUND(dp.amount / 100000, 2)                                AS amount_yi
        FROM public.ashare_daily_price dp
        LEFT JOIN public.ashare_daily_basic db
            ON dp.ts_code = db.ts_code AND dp.trade_date = db.trade_date
        WHERE dp.ts_code = %s AND dp.trade_date = %s::date
    """, (ts_code, date))
    price = cur.fetchone()

    # 3. MA + VR
    cur.execute("""
        WITH recent AS (
            SELECT close, vol,
                   ROW_NUMBER() OVER (ORDER BY trade_date DESC) AS rn
            FROM public.ashare_daily_price
            WHERE ts_code = %s AND trade_date <= %s::date
            LIMIT 25
        )
        SELECT
            ROUND(AVG(close) FILTER (WHERE rn <= 5)::numeric,  2) AS ma5,
            ROUND(AVG(close) FILTER (WHERE rn <= 10)::numeric, 2) AS ma10,
            ROUND(AVG(close) FILTER (WHERE rn <= 20)::numeric, 2) AS ma20,
            ROUND((MAX(vol) FILTER (WHERE rn = 1) /
                   NULLIF(AVG(vol) FILTER (WHERE rn BETWEEN 2 AND 21), 0))::numeric, 2) AS vr
        FROM recent
    """, (ts_code, date))
    ma = cur.fetchone()

    # 4. 观察池状态
    cur.execute("""
        SELECT strategy, pool_day, gain_since_entry, max_gain,
               buy_signal, sell_signal, above_ma20_days
        FROM public.ashare_watchlist
        WHERE ts_code = %s AND status = 'active'
        ORDER BY entry_date DESC LIMIT 1
    """, (ts_code,))
    wl = cur.fetchone()
    conn.close()

    # ── 构造数据摘要 ──
    p = dict(price) if price else {}
    m = dict(ma)    if ma    else {}
    w = dict(wl)    if wl    else {}
    b = dict(basic)

    def fmt(v, dec=2, suffix=''):
        return f"{round(float(v), dec)}{suffix}" if v is not None else 'N/A'

    context = f"""股票：{b['name']}（{ts_code}）
日期：{date}
行业：{b.get('industry') or '未知'}
ST状态：{'是' if b['is_st'] else '否'}

【当日行情】
收盘价：{fmt(p.get('close'))}元，今日涨跌：{fmt(p.get('pct_chg'))}%
开盘：{fmt(p.get('open'))}，最高：{fmt(p.get('high'))}，最低：{fmt(p.get('low'))}
换手率：{fmt(p.get('turnover_rate'))}%，成交额：{fmt(p.get('amount_yi'))}亿
市值：{fmt(p.get('market_cap_yi'), 1)}亿，PE(TTM)：{fmt(p.get('pe_ttm'), 1) if p.get('pe_ttm') else '亏损'}，PB：{fmt(p.get('pb'))}

【均线 & 量比】
MA5：{fmt(m.get('ma5'))}，MA10：{fmt(m.get('ma10'))}，MA20：{fmt(m.get('ma20'))}
VR量比：{fmt(m.get('vr'))}x

【观察池状态】
{'在池 | 策略：' + str(w.get('strategy')) + ' | 入池天数：' + str(w.get('pool_day')) + '天' + ' | 累计涨幅：' + fmt(float(w['gain_since_entry'])*100 if w.get('gain_since_entry') else None) + '%' + ' | 买点信号：' + str(w.get('buy_signal') or '无') + ' | 卖出信号：' + str(w.get('sell_signal') or '无') if wl else '未在观察池中'}"""

    prompt = f"""{context}

请基于以上量化数据，以专业A股分析师视角给出简洁分析。
必须严格返回如下JSON格式，不要添加任何其他文字：

{{
  "bull_factors": ["看多因素1（15字以内）", "看多因素2", "看多因素3"],
  "bear_factors": ["看空因素1（15字以内）", "看空因素2"],
  "advice": "买入或持有或卖出（三选一）",
  "confidence": 75,
  "stop_loss": "5.2",
  "target": "12.3"
}}

要求：
- bull_factors 2-3条，每条15字以内，基于真实数据
- bear_factors 1-2条，每条15字以内
- advice 必须是"买入"、"持有"、"卖出"之一
- confidence 为0-100整数，反映数据支撑的置信度
- stop_loss 为建议止损幅度（%，纯数字如"5.2"）
- target 为目标涨幅（%，纯数字如"12.3"）
- 只输出JSON，不要markdown代码块"""

    try:
        client = _anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        # 提取 JSON（防止模型多输出文字）
        start = raw.find('{')
        end   = raw.rfind('}') + 1
        parsed = _json.loads(raw[start:end])
        return {
            "bull_factors": parsed.get("bull_factors", []),
            "bear_factors": parsed.get("bear_factors", []),
            "advice":       parsed.get("advice", "持有"),
            "confidence":   int(parsed.get("confidence", 60)),
            "stop_loss":    str(parsed.get("stop_loss", "5.0")),
            "target":       str(parsed.get("target", "10.0")),
        }
    except Exception as e:
        return {"error": str(e)}


# ── Backtest ───────────────────────────────────────────────────────────────

@app.get("/api/backtest/summary")
def get_backtest_summary(strategy: str = None):
    conn = get_db()
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        WITH future AS (
            SELECT
                w.id, w.ts_code, w.strategy, w.entry_price,
                dp.close AS fut_close,
                ROW_NUMBER() OVER (PARTITION BY w.id ORDER BY dp.trade_date) AS day_n
            FROM public.ashare_watchlist w
            JOIN public.ashare_daily_price dp
                ON dp.ts_code = w.ts_code
                AND dp.trade_date >  w.entry_date
                AND dp.trade_date <= w.entry_date + INTERVAL '60 days'
            WHERE w.entry_price > 0
              AND w.strategy != 'IGNITE'
        ),
        pivoted AS (
            SELECT
                id, strategy, entry_price,
                MAX(fut_close) FILTER (WHERE day_n = 5)  AS c5,
                MAX(fut_close) FILTER (WHERE day_n = 10) AS c10,
                MAX(fut_close) FILTER (WHERE day_n = 20) AS c20
            FROM future
            WHERE day_n <= 20
            GROUP BY id, strategy, entry_price
        ),
        calcs AS (
            SELECT strategy,
                ROUND((c5  - entry_price) / NULLIF(entry_price,0)*100, 2) AS r5,
                ROUND((c10 - entry_price) / NULLIF(entry_price,0)*100, 2) AS r10,
                ROUND((c20 - entry_price) / NULLIF(entry_price,0)*100, 2) AS r20
            FROM pivoted
        )
        SELECT
            strategy,
            COUNT(r5)  AS sample_t5,
            COUNT(r10) AS sample_t10,
            COUNT(r20) AS sample_t20,
            ROUND(AVG(r5),  2) AS avg_ret_t5,
            ROUND(AVG(r10), 2) AS avg_ret_t10,
            ROUND(AVG(r20), 2) AS avg_ret_t20,
            ROUND(COUNT(*) FILTER (WHERE r5  > 0)::numeric / NULLIF(COUNT(r5),  0)*100, 1) AS win_rate_t5,
            ROUND(COUNT(*) FILTER (WHERE r10 > 0)::numeric / NULLIF(COUNT(r10), 0)*100, 1) AS win_rate_t10,
            ROUND(COUNT(*) FILTER (WHERE r20 > 0)::numeric / NULLIF(COUNT(r20), 0)*100, 1) AS win_rate_t20,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY r5)  FILTER (WHERE r5  IS NOT NULL)::numeric, 2) AS median_ret_t5,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY r10) FILTER (WHERE r10 IS NOT NULL)::numeric, 2) AS median_ret_t10,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY r20) FILTER (WHERE r20 IS NOT NULL)::numeric, 2) AS median_ret_t20
        FROM calcs
        GROUP BY strategy
        ORDER BY strategy
    """)
    rows = cur.fetchall()
    conn.close()
    result = [dict(r) for r in rows]
    if strategy:
        result = [r for r in result if r["strategy"] == strategy]
    return {"data": result}


@app.get("/api/backtest/detail")
def get_backtest_detail(strategy: str = None, limit: int = 200):
    conn = get_db()
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    params = []
    strategy_filter = ""
    if strategy:
        strategy_filter = "AND w.strategy = %s"
        params.append(strategy)
    params.append(limit)
    cur.execute(f"""
        WITH future AS (
            SELECT
                w.id, w.ts_code, s.name, w.strategy,
                w.entry_date, w.entry_price,
                dp.close AS fut_close,
                ROW_NUMBER() OVER (PARTITION BY w.id ORDER BY dp.trade_date) AS day_n
            FROM public.ashare_watchlist w
            JOIN public.ashare_stock_basic s ON s.ts_code = w.ts_code
            JOIN public.ashare_daily_price dp
                ON dp.ts_code = w.ts_code
                AND dp.trade_date >  w.entry_date
                AND dp.trade_date <= w.entry_date + INTERVAL '60 days'
            WHERE w.entry_price > 0
              AND w.strategy != 'IGNITE'
            {strategy_filter}
        )
        SELECT
            ts_code, name, strategy, entry_date::text, entry_price,
            ROUND((MAX(fut_close) FILTER (WHERE day_n=5)  - entry_price) / NULLIF(entry_price,0)*100, 2) AS ret_t5,
            ROUND((MAX(fut_close) FILTER (WHERE day_n=10) - entry_price) / NULLIF(entry_price,0)*100, 2) AS ret_t10,
            ROUND((MAX(fut_close) FILTER (WHERE day_n=20) - entry_price) / NULLIF(entry_price,0)*100, 2) AS ret_t20,
            CASE
                WHEN MAX(fut_close) FILTER (WHERE day_n=5) IS NULL THEN 'pending'
                WHEN MAX(fut_close) FILTER (WHERE day_n=5) > entry_price THEN 'win'
                ELSE 'loss'
            END AS result_t5
        FROM future
        WHERE day_n <= 20
        GROUP BY id, ts_code, name, strategy, entry_date, entry_price
        ORDER BY entry_date DESC
        LIMIT %s
    """, params)
    rows = cur.fetchall()
    conn.close()
    return {"data": [dict(r) for r in rows]}




# ════════════════════════════════════════════════════════════════
# Signal & Portfolio Summary APIs
# ════════════════════════════════════════════════════════════════
import decimal as _dec_signals

@app.get("/api/signals/buy")
def get_signals_buy():
    """Buy signals: watchlist entries with active buy signals, enriched with risk & valuation."""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT MAX(trade_date) AS td FROM ashare_daily_basic")
        td_row = cur.fetchone()
        trade_date = str(td_row["td"]) if td_row and td_row["td"] else None

        cur.execute("""
            SELECT w.id, w.ts_code, s.name, w.strategy, w.entry_date, w.entry_price,
                   w.entry_score, w.entry_rank, w.pool_day, w.latest_close,
                   w.latest_pct_chg, w.gain_since_entry, w.max_gain,
                   w.drawdown_from_peak, w.vr_today, w.turnover_rate,
                   w.ma5, w.ma10, w.ma20, w.above_ma20_days,
                   w.buy_signal, w.signal_date,
                   r.risk_score_total, r.trade_allowed, r.block_reason,
                   r.position_cap_multiplier_final,
                   db.total_mv, db.circ_mv, db.pe, db.pb,
                   s.industry
            FROM public.ashare_watchlist w
            LEFT JOIN public.ashare_stock_basic s ON s.ts_code = w.ts_code
            LEFT JOIN public.ashare_risk_score r
                   ON r.ts_code = w.ts_code AND r.trade_date = w.signal_date
            LEFT JOIN public.ashare_daily_basic db
                   ON db.ts_code = w.ts_code AND db.trade_date = w.signal_date
            WHERE w.status = 'active'
              AND w.buy_signal IS NOT NULL
            ORDER BY w.entry_score DESC NULLS LAST, w.gain_since_entry DESC NULLS LAST
        """)
        rows = cur.fetchall()
    finally:
        conn.close()

    data = []
    for r in rows:
        d = {}
        for k, v in dict(r).items():
            d[k] = float(v) if isinstance(v, _dec_signals.Decimal) else v
        data.append(d)

    return {"trade_date": trade_date, "count": len(data), "data": data}


@app.get("/api/signals/sell")
def get_signals_sell():
    """Sell/action signals: open portfolio positions with action signals."""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT MAX(trade_date) AS td FROM ashare_daily_basic")
        td_row = cur.fetchone()
        trade_date = str(td_row["td"]) if td_row and td_row["td"] else None

        cur.execute("""
            SELECT p.id, p.ts_code, p.name, p.position_type, p.open_date,
                   p.open_price, p.shares, p.cost_amount, p.source_strategy,
                   p.latest_close, p.market_value,
                   p.unrealized_pnl, p.unrealized_pnl_pct,
                   p.max_price_since_open, p.drawdown_from_peak,
                   p.hold_days, p.action_signal, p.signal_reason,
                   r.risk_score_total, r.trade_allowed, r.block_reason,
                   s.industry
            FROM public.ashare_portfolio p
            LEFT JOIN public.ashare_stock_basic s ON s.ts_code = p.ts_code
            LEFT JOIN LATERAL (
                SELECT risk_score_total, trade_allowed, block_reason
                FROM public.ashare_risk_score
                WHERE ts_code = p.ts_code
                ORDER BY trade_date DESC
                LIMIT 1
            ) r ON true
            WHERE p.status = 'open'
              AND p.action_signal IS NOT NULL
            ORDER BY p.unrealized_pnl_pct ASC NULLS LAST
        """)
        rows = cur.fetchall()
    finally:
        conn.close()

    data = []
    for r in rows:
        d = {}
        for k, v in dict(r).items():
            d[k] = float(v) if isinstance(v, _dec_signals.Decimal) else v
        data.append(d)

    return {"trade_date": trade_date, "count": len(data), "data": data}


@app.get("/api/portfolio/summary")
def get_portfolio_summary():
    """Portfolio summary: totals, PnL, industry & strategy breakdown."""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT COUNT(*) AS position_count,
                   COALESCE(SUM(cost_amount), 0) AS total_cost,
                   COALESCE(SUM(market_value), 0) AS total_market_value,
                   COALESCE(SUM(unrealized_pnl), 0) AS total_unrealized_pnl,
                   COUNT(*) FILTER (WHERE action_signal IS NOT NULL) AS signal_count,
                   COUNT(*) FILTER (WHERE unrealized_pnl > 0) AS winning_count,
                   COUNT(*) FILTER (WHERE unrealized_pnl <= 0) AS losing_count,
                   ROUND(AVG(unrealized_pnl_pct)::numeric, 4) AS avg_pnl_pct,
                   ROUND(AVG(hold_days)::numeric, 1) AS avg_hold_days
            FROM public.ashare_portfolio
            WHERE status = 'open'
        """)
        agg = cur.fetchone()

        cur.execute("""
            SELECT snap_date, total_nav, cash, market_value AS snap_market_value,
                   position_count AS snap_position_count,
                   daily_pnl, daily_pnl_pct, cumulative_pnl_pct
            FROM public.ashare_sim_portfolio_snapshot
            ORDER BY snap_date DESC
            LIMIT 1
        """)
        snap = cur.fetchone()

        cur.execute("""
            SELECT COALESCE(s.industry, '未知') AS industry,
                   COUNT(*) AS count,
                   COALESCE(SUM(p.market_value), 0) AS market_value
            FROM public.ashare_portfolio p
            LEFT JOIN public.ashare_stock_basic s ON s.ts_code = p.ts_code
            WHERE p.status = 'open'
            GROUP BY s.industry
            ORDER BY market_value DESC
        """)
        industries = cur.fetchall()

        cur.execute("""
            SELECT COALESCE(source_strategy, 'UNKNOWN') AS strategy,
                   COUNT(*) AS count,
                   COALESCE(SUM(market_value), 0) AS market_value
            FROM public.ashare_portfolio
            WHERE status = 'open'
            GROUP BY source_strategy
            ORDER BY market_value DESC
        """)
        strategies = cur.fetchall()

        # 开始日期
        cur.execute("SELECT MIN(fill_date) FROM ashare_sim_orders WHERE status='filled'")
        row = cur.fetchone()
        start_date = str(row["min"]) if row and row["min"] else "2026-03-04"

        cur.execute("""
            SELECT
                (SELECT close FROM ashare_index_daily_price
                 WHERE ts_code='399006.SZ' AND trade_date >= %s
                 ORDER BY trade_date ASC LIMIT 1) AS base_close,
                (SELECT close FROM ashare_index_daily_price
                 WHERE ts_code='399006.SZ'
                 ORDER BY trade_date DESC LIMIT 1) AS latest_close
        """, (start_date,))
        row = cur.fetchone()
        if row and row["base_close"] and row["latest_close"]:
            benchmark_pct = round((float(row["latest_close"]) - float(row["base_close"])) / float(row["base_close"]) * 100, 2)
        else:
            benchmark_pct = None

        # 最大回撤
        cur.execute("""
            SELECT ROUND((1 - MIN(total_nav) / NULLIF(MAX(total_nav), 0)) * 100, 2)
            FROM (
                SELECT total_nav, MAX(total_nav) OVER (ORDER BY snap_date) AS peak_nav
                FROM ashare_sim_portfolio_snapshot
            ) t
        """)
        row = cur.fetchone()
        max_drawdown_pct = float(row["round"]) if row and row["round"] else 0.0

        # 持仓数
        cur.execute("""
            SELECT COUNT(ts_code) FROM ashare_portfolio
            WHERE position_type='PAPER' AND status='open'
        """)
        row = cur.fetchone()
        position_count_paper = int(row["count"]) if row and row["count"] else 0
    finally:
        conn.close()

    def to_f(v):
        if v is None:
            return None
        if isinstance(v, _dec_signals.Decimal):
            return float(v)
        return v

    total_cost = to_f(agg["total_cost"])
    total_mv   = to_f(agg["total_market_value"])
    total_pnl  = to_f(agg["total_unrealized_pnl"])
    pos_count  = agg["position_count"]

    result = {
        "position_count":       pos_count,
        "total_cost":           total_cost,
        "total_market_value":   total_mv,
        "total_unrealized_pnl": total_pnl,
        "total_pnl_pct":        round(total_pnl / total_cost, 4) if total_cost else 0,
        "signal_count":         agg["signal_count"],
        "winning_count":        agg["winning_count"],
        "losing_count":         agg["losing_count"],
        "win_rate":             round(agg["winning_count"] / pos_count, 4) if pos_count else 0,
        "avg_pnl_pct":          to_f(agg["avg_pnl_pct"]),
        "avg_hold_days":        to_f(agg["avg_hold_days"]),
        "initial_capital":      1000000,
        "start_date":           start_date,
        "max_drawdown_pct":     max_drawdown_pct,
        "position_count":       position_count_paper,
        "cash_ratio":           round(float(snap["cash"]) / float(snap["total_nav"]), 4) if snap and snap["total_nav"] else 0,
        "benchmark_label":      "创业板指",
        "benchmark_pct":        benchmark_pct,
    }

    if snap:
        result["snapshot"] = {
            "snap_date":          str(snap["snap_date"]) if snap["snap_date"] else None,
            "total_nav":          to_f(snap["total_nav"]),
            "cash":               to_f(snap["cash"]),
            "snap_market_value":  to_f(snap["snap_market_value"]),
            "daily_pnl":          to_f(snap["daily_pnl"]),
            "daily_pnl_pct":      to_f(snap["daily_pnl_pct"]),
            "cumulative_pnl_pct": to_f(snap["cumulative_pnl_pct"]),
        }
        nav = to_f(snap["total_nav"])
        if nav and nav > 0 and total_mv:
            result["position_ratio"] = round(total_mv / nav, 4)
        else:
            result["position_ratio"] = None
    else:
        result["snapshot"] = None
        result["position_ratio"] = None

    result["industry_breakdown"] = [
        {"industry": r["industry"], "count": r["count"], "market_value": to_f(r["market_value"])}
        for r in industries
    ]
    result["strategy_breakdown"] = [
        {"strategy": r["strategy"], "count": r["count"], "market_value": to_f(r["market_value"])}
        for r in strategies
    ]

    return result


# ════════════════════════════════════════════════════════════════
# Dashboard Summary API
# ════════════════════════════════════════════════════════════════
from datetime import datetime, timezone, timedelta

@app.get("/api/dashboard/summary")
def get_dashboard_summary(trade_date: str = None):
    conn = get_db()
    cur = conn.cursor()
    try:
        # ── Resolve effective trade_date ──
        if trade_date:
            cur.execute("SELECT MAX(trade_date) FROM ashare_daily_price WHERE trade_date <= %s", (trade_date,))
        else:
            cur.execute("SELECT MAX(trade_date) FROM ashare_daily_price")
        row = cur.fetchone()
        eff_date = row[0] if row and row[0] else None
        if eff_date is None:
            conn.close()
            return {"error": "no trade data available"}
        eff_date_str = str(eff_date)  # YYYY-MM-DD

        # ══════════════════════════════════════
        # Module 1: today_changes
        # ══════════════════════════════════════
        cur.execute("SELECT COUNT(*) FROM ashare_watchlist WHERE status='active' AND buy_signal IS NOT NULL AND signal_date = %s", (eff_date_str,))
        new_signals = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM ashare_watchlist WHERE status='exited' AND exit_date = %s", (eff_date_str,))
        removed_signals = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM ashare_watchlist WHERE status='active' AND entry_date = %s", (eff_date_str,))
        new_entries = cur.fetchone()[0]
        watchlist_delta = new_entries - removed_signals

        cur.execute("SELECT COUNT(*) FROM ashare_sim_orders WHERE fill_date = %s AND direction='BUY' AND status='filled'", (eff_date_str,))
        buy_filled = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM ashare_sim_orders WHERE fill_date = %s AND direction='SELL' AND status='filled'", (eff_date_str,))
        sell_filled = cur.fetchone()[0]
        portfolio_delta = buy_filled - sell_filled

        # Check pipeline status for summary_text
        cur.execute("SELECT COUNT(*) FROM ashare_pipeline_runs WHERE trade_date = %s AND status = 'fail'", (eff_date_str,))
        failed_steps = cur.fetchone()[0]
        pipeline_ok = (failed_steps == 0)

        summary_text = f"今日新增{new_signals}个买点信号，观察池净增{watchlist_delta}只，{'系统运行正常' if pipeline_ok else '有异常步骤'}。"

        today_changes = {
            "new_signals": new_signals,
            "removed_signals": removed_signals,
            "watchlist_delta": watchlist_delta,
            "portfolio_delta": portfolio_delta,
            "risk_alerts_delta": 0,
            "system_alerts_delta": 0,
            "summary_text": summary_text,
        }

        # ══════════════════════════════════════
        # Module 2: opportunity
        # ══════════════════════════════════════
        cur.execute("SELECT COUNT(*) FROM (SELECT ts_code FROM ashare_watchlist WHERE status='active' GROUP BY ts_code HAVING COUNT(DISTINCT strategy) >= 2) t")
        resonance_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM ashare_watchlist WHERE status='active'")
        watchlist_candidates = cur.fetchone()[0]

        cur.execute("SELECT strategy, COUNT(*) as cnt FROM ashare_watchlist WHERE status='active' AND buy_signal IS NOT NULL GROUP BY strategy ORDER BY cnt DESC LIMIT 1")
        row = cur.fetchone()
        strongest_strategy_label = row[0] if row else None

        cur.execute("""
            SELECT b.industry, COUNT(*) as cnt
            FROM ashare_watchlist w JOIN ashare_stock_basic b ON w.ts_code=b.ts_code
            WHERE w.status='active'
            GROUP BY b.industry ORDER BY cnt DESC LIMIT 1
        """)
        row = cur.fetchone()
        hottest_sector_label = row[0] if row else None

        cur.execute("""
            SELECT COUNT(*) FROM ashare_watchlist w
            JOIN ashare_risk_score r ON w.ts_code=r.ts_code AND r.trade_date=%s
            WHERE w.status='active' AND w.buy_signal IS NOT NULL AND r.trade_allowed=true
        """, (eff_date_str,))
        actionable_count = cur.fetchone()[0]

        # top_opportunities: top 5 actionable by risk_score_total DESC
        cur.execute("""
            SELECT w.ts_code, b.name, w.strategy, b.industry, r.risk_score_total, r.trade_allowed
            FROM ashare_watchlist w
            JOIN ashare_risk_score r ON w.ts_code=r.ts_code AND r.trade_date=%s
            JOIN ashare_stock_basic b ON w.ts_code=b.ts_code
            WHERE w.status='active' AND w.buy_signal IS NOT NULL AND r.trade_allowed=true
            ORDER BY r.risk_score_total DESC NULLS LAST
            LIMIT 5
        """, (eff_date_str,))
        top_rows = cur.fetchall()
        top_opportunities = []
        for r in top_rows:
            top_opportunities.append({
                "ts_code": r[0],
                "name": r[1] or "",
                "strategy_label": r[2],
                "sector_label": r[3] or "",
                "score": float(r[4]) if r[4] is not None else None,
                "hint": "风控通过，允许交易" if r[5] else "",
            })

        opportunity = {
            "buy_signals_count": new_signals,
            "resonance_count": resonance_count,
            "watchlist_candidates": watchlist_candidates,
            "strongest_strategy_label": strongest_strategy_label,
            "hottest_sector_label": hottest_sector_label,
            "actionable_count": actionable_count,
            "top_opportunities": top_opportunities,
        }

        # ══════════════════════════════════════
        # Module 3: risk
        # ══════════════════════════════════════
        cur.execute("SELECT COUNT(*) FROM ashare_risk_score WHERE trade_date=%s AND trade_allowed=false", (eff_date_str,))
        gate_blocked_count = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*) FROM ashare_risk_score r
            JOIN ashare_watchlist w ON r.ts_code=w.ts_code
            WHERE r.trade_date=%s AND w.status='active' AND r.risk_score_total < 60
        """, (eff_date_str,))
        high_risk_watchlist_count = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*) FROM ashare_risk_score r
            JOIN ashare_portfolio p ON r.ts_code=p.ts_code
            WHERE r.trade_date=%s AND p.status='open' AND p.position_type='PAPER' AND r.risk_score_total < 60
        """, (eff_date_str,))
        high_risk_positions_count = cur.fetchone()[0]

        # Highest risk (lowest score) among active watchlist
        cur.execute("""
            SELECT b.name, r.risk_score_total
            FROM ashare_risk_score r
            JOIN ashare_watchlist w ON r.ts_code=w.ts_code
            JOIN ashare_stock_basic b ON r.ts_code=b.ts_code
            WHERE r.trade_date=%s AND w.status='active' AND r.risk_score_total IS NOT NULL
            ORDER BY r.risk_score_total ASC LIMIT 1
        """, (eff_date_str,))
        row = cur.fetchone()
        highest_risk_name = row[0] if row else None
        highest_risk_score = float(row[1]) if row else None

        risk_hint = f"Gate拦截{gate_blocked_count}只"
        if high_risk_positions_count > 0:
            risk_hint += f"，高风险持仓{high_risk_positions_count}只需关注"

        risk = {
            "gate_blocked_count": gate_blocked_count,
            "high_risk_watchlist_count": high_risk_watchlist_count,
            "high_risk_positions_count": high_risk_positions_count,
            "new_risk_events_count": 0,
            "highest_risk_name": highest_risk_name,
            "highest_risk_score": highest_risk_score,
            "risk_hint": risk_hint,
        }

        # ══════════════════════════════════════
        # Module 4: portfolio
        # ══════════════════════════════════════
        cur.execute("""
            SELECT total_nav, cash, market_value, position_count,
                   daily_pnl_pct, cumulative_pnl_pct
            FROM ashare_sim_portfolio_snapshot WHERE snap_date = %s
        """, (eff_date_str,))
        snap = cur.fetchone()

        # Always get live positions_count from ashare_portfolio
        cur.execute("SELECT COUNT(*) FROM ashare_portfolio WHERE position_type='PAPER' AND status='open'")
        positions_count = cur.fetchone()[0]
        # Also get live total_market_value and total_cost as fallback
        cur.execute("SELECT COALESCE(SUM(market_value),0), COALESCE(SUM(cost_amount),0) FROM ashare_portfolio WHERE position_type='PAPER' AND status='open'")
        live_row = cur.fetchone()
        live_mv = float(live_row[0])
        live_cost = float(live_row[1])

        if snap:
            total_nav = float(snap[0])
            snap_cash = float(snap[1])
            snap_mv = float(snap[2])
            daily_pnl_pct = float(snap[4]) if snap[4] is not None else 0
            cumulative_pnl_pct = float(snap[5]) if snap[5] is not None else 0
            cash_ratio = snap_cash / total_nav if total_nav > 0 else 0
            daily_pnl = daily_pnl_pct * total_nav  # approximate
        else:
            total_nav = None
            snap_cash = None
            snap_mv = live_mv if live_mv else None
            daily_pnl_pct = 0
            cumulative_pnl_pct = 0
            cash_ratio = 0
            daily_pnl = 0

        # concentration_top1
        concentration_top1 = 0
        if total_nav and total_nav > 0:
            cur.execute("""
                SELECT MAX(market_value) FROM ashare_portfolio
                WHERE position_type='PAPER' AND status='open'
            """)
            row = cur.fetchone()
            if row and row[0]:
                concentration_top1 = float(row[0]) / total_nav

        # sell_signals_count
        cur.execute("""
            SELECT COUNT(*) FROM ashare_portfolio
            WHERE position_type='PAPER' AND status='open'
              AND action_signal IS NOT NULL AND action_signal != 'HOLD'
        """)
        sell_signals_count = cur.fetchone()[0]

        action_hint = f"有{sell_signals_count}个卖出信号待复核" if sell_signals_count > 0 else "持仓稳定，无卖出信号"

        portfolio = {
            "position_type": "PAPER",
            "positions_count": positions_count,
            "total_market_value": snap_mv,
            "cash_ratio": round(cash_ratio, 4) if cash_ratio else 0,
            "daily_pnl": round(daily_pnl, 2) if daily_pnl else 0,
            "daily_pnl_pct": round(daily_pnl_pct, 4) if daily_pnl_pct else 0,
            "cumulative_pnl_pct": round(cumulative_pnl_pct, 4) if cumulative_pnl_pct else 0,
            "concentration_top1": round(concentration_top1, 4),
            "sell_signals_count": sell_signals_count,
            "action_hint": action_hint,
        }

        # ══════════════════════════════════════
        # Module 5: system_health
        # ══════════════════════════════════════
        cur.execute("SELECT step, status FROM ashare_pipeline_runs WHERE trade_date = %s", (eff_date_str,))
        pipe_rows = cur.fetchall()
        if not pipe_rows:
            pipeline_status = "unknown"
        elif any(r[1] == 'fail' for r in pipe_rows):
            pipeline_status = "error"
        elif any(r[1] == 'warn' for r in pipe_rows):
            pipeline_status = "warning"
        else:
            pipeline_status = "ok"

        cur.execute("SELECT MAX(ended_at) FROM ashare_pipeline_runs WHERE trade_date=%s AND status='success'", (eff_date_str,))
        row = cur.fetchone()
        latest_success_time = row[0].isoformat() if row and row[0] else None

        cur.execute("""
            SELECT COUNT(DISTINCT ts_code)::float / NULLIF(
                (SELECT COUNT(*) FROM ashare_stock_basic WHERE status='L' AND ts_code NOT LIKE '%%.BJ'), 0)
            FROM ashare_daily_price WHERE trade_date=%s
        """, (eff_date_str,))
        row = cur.fetchone()
        data_coverage_pct = min(round(float(row[0]), 4), 1.0) if row and row[0] else 0

        cur.execute("SELECT status FROM ashare_pipeline_runs WHERE trade_date=%s AND step='dq_gate' ORDER BY ended_at DESC LIMIT 1", (eff_date_str,))
        row = cur.fetchone()
        dq_status = "ok" if row and row[0] == 'success' else "warning"

        system_hint = "全流程正常" if pipeline_status == "ok" else f"有{failed_steps}个步骤异常"

        system_health = {
            "pipeline_status": pipeline_status,
            "latest_success_time": latest_success_time,
            "failed_steps_count": failed_steps,
            "data_coverage_pct": data_coverage_pct,
            "dq_status": dq_status,
            "api_health_status": "ok",
            "version_label": "20260309-r1",
            "system_hint": system_hint,
        }

        # ══════════════════════════════════════
        # Module 6: market_breadth
        # ══════════════════════════════════════
        cur.execute("""
            SELECT
                market_regime,
                ROUND(adr * 100, 1)   AS adr_pct,
                limit_up,
                limit_down,
                ROUND(td_ratio, 2)    AS td_ratio,
                up5_stocks,
                down5_stocks,
                net_strong,
                total_stocks,
                ROUND(metric_a, 1)    AS adr_score,
                ROUND(metric_b, 1)    AS tdr_score,
                ROUND(metric_c, 1)    AS up5_score,
                ROUND(metric_a * 0.40 + metric_b * 0.35 + metric_c * 0.25, 1) AS composite_score
            FROM ashare_market_breadth
            WHERE trade_date = %s
        """, (eff_date_str,))
        brow = cur.fetchone()
        if brow:
            market_breadth = {
                "market_regime":    brow[0],
                "adr_pct":          float(brow[1]) if brow[1] else None,
                "limit_up":         brow[2],
                "limit_down":       brow[3],
                "td_ratio":         float(brow[4]) if brow[4] else None,
                "up5_stocks":       brow[5],
                "down5_stocks":     brow[6],
                "net_strong":       brow[7],
                "total_stocks":     brow[8],
                "adr_score":        float(brow[9]) if brow[9] else None,
                "tdr_score":        float(brow[10]) if brow[10] else None,
                "up5_score":        float(brow[11]) if brow[11] else None,
                "composite_score":  float(brow[12]) if brow[12] else None,
            }
        else:
            market_breadth = None

        # ══════════════════════════════════════
        # Assemble response
        # ══════════════════════════════════════
        tz_cn = timezone(timedelta(hours=8))
        result = {
            "trade_date": eff_date_str,
            "generated_at": datetime.now(tz_cn).isoformat(),
            "version_snapshot": f"risk_model=v1 | pipeline={eff_date_str} | api=v1.0",
            "today_changes": today_changes,
            "opportunity": opportunity,
            "risk": risk,
            "portfolio": portfolio,
            "system_health": system_health,
            "market_breadth": market_breadth,
        }

        return result

    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# Context Panel Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

from datetime import datetime, timezone, timedelta as _td
import json as _json_mod
import decimal as _decimal_mod


def _resolve_trade_date(cur, trade_date_str=None):
    """Resolve to nearest valid trade date (from ashare_trade_calendar)."""
    if trade_date_str:
        cur.execute("SELECT MAX(cal_date) AS td FROM ashare_trade_calendar WHERE cal_date <= %s AND is_open = true", (trade_date_str,))
    else:
        cur.execute("SELECT MAX(cal_date) AS td FROM ashare_trade_calendar WHERE cal_date <= CURRENT_DATE AND is_open = true")
    row = cur.fetchone()
    return row["td"] if row and row["td"] else None


def _prev_trade_date(cur, td):
    """Get previous trade date before td."""
    cur.execute("SELECT MAX(trade_date) AS td FROM ashare_daily_price WHERE trade_date < %s", (td,))
    row = cur.fetchone()
    return row["td"] if row and row["td"] else None


def _dec(v):
    """Convert Decimal/numeric to float, None stays None."""
    if v is None:
        return None
    if isinstance(v, _decimal_mod.Decimal):
        return float(v)
    return v


def _now_cn():
    """Current time ISO8601 +08:00."""
    tz8 = timezone(_td(hours=8))
    return datetime.now(tz8).strftime('%Y-%m-%dT%H:%M:%S+08:00')

def _fetch_risk_block(cur, ts_code, eff_date_str):
    """Fetch risk data with fallback to most recent available date. Returns dict or None."""
    cur.execute("""
        SELECT trade_date, trade_allowed, block_reason,
               risk_score_total, risk_score_financial, risk_score_market,
               risk_score_event, risk_score_compliance,
               cap_financial, cap_market, cap_event, cap_compliance,
               position_cap_multiplier_final, detail_json
        FROM ashare_risk_score
        WHERE ts_code = %s AND trade_date <= %s
        ORDER BY trade_date DESC LIMIT 1
    """, (ts_code, eff_date_str))
    rr = cur.fetchone()
    if not rr:
        return None
    rr = dict(rr)
    risk_td = str(rr.pop("trade_date", ""))
    detail = rr.pop("detail_json", None) or {}
    risk = {
        "risk_as_of_date": risk_td if risk_td != eff_date_str else None,
        "trade_allowed": rr["trade_allowed"],
        "block_reason": rr["block_reason"],
        "risk_score_total": _dec(rr["risk_score_total"]),
        "risk_score_financial": _dec(rr["risk_score_financial"]),
        "risk_score_market": _dec(rr["risk_score_market"]),
        "risk_score_event": _dec(rr["risk_score_event"]),
        "risk_score_compliance": _dec(rr["risk_score_compliance"]),
        "cap_financial": _dec(rr["cap_financial"]),
        "cap_market": _dec(rr["cap_market"]),
        "cap_event": _dec(rr["cap_event"]),
        "cap_compliance": _dec(rr["cap_compliance"]),
        "position_cap_multiplier_final": _dec(rr["position_cap_multiplier_final"]),
        "effective_risk": detail.get("effective_risk") if isinstance(detail, dict) else None,
    }
    # risk_events from event_daily_snapshot
    risk_events = []
    try:
        cur.execute("""
            SELECT detail_json FROM ashare_event_daily_snapshot
            WHERE ts_code = %s AND trade_date <= %s
            ORDER BY trade_date DESC LIMIT 1
        """, (ts_code, eff_date_str))
        snap = cur.fetchone()
        if snap and snap.get("detail_json"):
            dj = snap["detail_json"]
            if isinstance(dj, dict):
                for ev in dj.get("events", []):
                    risk_events.append({
                        "type": ev.get("event_type", ""),
                        "severity": ev.get("severity", ""),
                        "detail": ev.get("description", ""),
                    })
    except Exception:
        pass
    risk["risk_events"] = risk_events
    return risk


def _fetch_lifecycle_block(cur, ts_code):
    """Fetch lifecycle data from lifecycle_log + watchlist + portfolio. Returns (dict, degraded, degrade_reason)."""
    # Steps from lifecycle_log
    cur.execute("""
        SELECT event_type, from_status, to_status,
               event_time AT TIME ZONE 'Asia/Shanghai' AS event_time,
               event_source, event_payload_json
        FROM ashare_trade_lifecycle_log
        WHERE ts_code = %s
        ORDER BY event_time ASC LIMIT 20
    """, (ts_code,))
    raw_steps = cur.fetchall()

    steps = []
    for r in raw_steps:
        r = dict(r)
        et = r.get("event_time")
        date_str = et.strftime('%Y-%m-%dT%H:%M:%S+08:00') if et else None
        note = None
        payload = r.get("event_payload_json")
        if payload and isinstance(payload, dict):
            note = payload.get("note") or payload.get("reason") or payload.get("signal_type")
        steps.append({
            "step": r.get("to_status") or r.get("event_type", ""),
            "status": r.get("to_status") or r.get("from_status", ""),
            "date": date_str,
            "source": r.get("event_source", ""),
            "note": note,
        })

    has_log = len(raw_steps) > 0
    degraded = False
    degrade_reason = None

    # Watchlist info
    cur.execute("""
        SELECT id, lifecycle_status, entry_date::text AS entry_date,
               signal_date::text AS signal_date, pool_day, strategy
        FROM ashare_watchlist
        WHERE ts_code = %s AND status = 'active'
        ORDER BY entry_date ASC
    """, (ts_code,))
    wl_rows = cur.fetchall()

    # Portfolio info
    cur.execute("""
        SELECT id, status FROM ashare_portfolio
        WHERE ts_code = %s AND position_type = 'PAPER' AND status = 'open'
        ORDER BY open_date DESC LIMIT 1
    """, (ts_code,))
    pf = cur.fetchone()

    # current_status
    if pf:
        current_status = "held"
    elif wl_rows:
        lc = wl_rows[-1].get("lifecycle_status")
        current_status = lc if lc else "candidate"
    else:
        current_status = "unknown"

    # strategies
    source_strategies = [r["strategy"] for r in wl_rows]
    source_strategy_primary = source_strategies[0] if source_strategies else None

    # If no lifecycle_log records, infer from watchlist/portfolio
    if not has_log and wl_rows:
        degraded = True
        degrade_reason = "lifecycle_log无历史记录，已从watchlist/portfolio推断"
        for wr in wl_rows:
            steps.append({
                "step": "candidate",
                "status": wr.get("lifecycle_status") or "candidate",
                "date": wr["entry_date"],
                "source": "watchlist_inferred",
                "note": None,
            })
    elif not has_log and not wl_rows:
        degraded = True
        degrade_reason = "lifecycle_log无历史记录，该股票不在watchlist/portfolio中"

    # key_dates
    key_dates = {
        "entered_watchlist_at": None,
        "signal_triggered_at": None,
        "transferred_to_portfolio_at": None,
        "closed_at": None,
    }
    for s in steps:
        st = s.get("step", "")
        d = s.get("date")
        if st == "candidate" and key_dates["entered_watchlist_at"] is None:
            key_dates["entered_watchlist_at"] = d
        elif st == "signaled" and key_dates["signal_triggered_at"] is None:
            key_dates["signal_triggered_at"] = d
        elif st == "held" and key_dates["transferred_to_portfolio_at"] is None:
            key_dates["transferred_to_portfolio_at"] = d
        elif st == "closed" and key_dates["closed_at"] is None:
            key_dates["closed_at"] = d
    # Fallback: use watchlist entry_date if no candidate step found
    if key_dates["entered_watchlist_at"] is None and wl_rows:
        key_dates["entered_watchlist_at"] = wl_rows[0]["entry_date"]

    # related_records
    wl_id = wl_rows[-1]["id"] if wl_rows else None
    pf_id = pf["id"] if pf else None
    exec_ids = []
    try:
        cur.execute("""
            SELECT id FROM ashare_sim_orders
            WHERE ts_code = %s ORDER BY order_date DESC LIMIT 10
        """, (ts_code,))
        exec_ids = [r["id"] for r in cur.fetchall()]
    except Exception:
        pass

    lifecycle_label_map = {
        "held": "持仓中",
        "candidate": "观察池跟踪中",
        "signaled": "已触发买点",
        "closed": "已平仓",
        "exited": "已退出观察池",
        "unknown": "暂无生命周期记录",
    }
    lifecycle_label = lifecycle_label_map.get(current_status, "观察池跟踪中")
    pool_day = wl_rows[-1].get("pool_day") if wl_rows else None

    lifecycle = {
        "ts_code": ts_code,
        "current_status": current_status,
        "lifecycle_label": lifecycle_label,
        "pool_day": pool_day,
        "source_strategy_primary": source_strategy_primary,
        "source_strategies": source_strategies,
        "steps": steps,
        "key_dates": key_dates,
        "related_records": {
            "watchlist_id": wl_id,
            "portfolio_position_id": pf_id,
            "execution_order_ids": exec_ids,
        },
    }
    return lifecycle, degraded, degrade_reason



@app.get("/api/context/stock/{ts_code}")
def get_context_stock(ts_code: str, trade_date: str = None, source: str = None):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    partial_blocks = []

    try:
        # ── Resolve trade date ──
        eff_date = _resolve_trade_date(cur, trade_date)
        if eff_date is None:
            conn.close()
            return {"data": None, "meta": {"error": "no trade data available"}}
        eff_date_str = str(eff_date)

        # ════════════════════════════════════════════════════════
        # basic
        # ════════════════════════════════════════════════════════
        basic = None
        try:
            cur.execute("""
                SELECT ts_code, name, market, industry, list_date::text AS list_date, is_st
                FROM ashare_stock_basic WHERE ts_code = %s
            """, (ts_code,))
            row = cur.fetchone()
            if row:
                basic = dict(row)
                # concept_tags
                try:
                    cur.execute("""
                        SELECT concept_name FROM ashare_ths_concept_member
                        WHERE ts_code = %s ORDER BY concept_code
                    """, (ts_code,))
                    basic["concept_tags"] = [r["concept_name"] for r in cur.fetchall()]
                except Exception:
                    basic["concept_tags"] = []

                # source_strategy_primary
                cur.execute("""
                    SELECT strategy FROM ashare_watchlist
                    WHERE ts_code = %s AND status = 'active'
                    ORDER BY entry_date ASC LIMIT 1
                """, (ts_code,))
                sp = cur.fetchone()
                basic["source_strategy_primary"] = sp["strategy"] if sp else None

                # cross_strategy_tags
                cur.execute("""
                    SELECT DISTINCT strategy FROM ashare_watchlist
                    WHERE ts_code = %s AND status = 'active'
                """, (ts_code,))
                basic["cross_strategy_tags"] = [r["strategy"] for r in cur.fetchall()]
            else:
                # ts_code not found - return empty shell
                basic = {
                    "ts_code": ts_code, "name": None, "market": None,
                    "industry": None, "list_date": None, "is_st": None,
                    "concept_tags": [], "source_strategy_primary": None,
                    "cross_strategy_tags": []
                }
        except Exception as e:
            partial_blocks.append("basic")
            basic = None

        # ════════════════════════════════════════════════════════
        # quote
        # ════════════════════════════════════════════════════════
        quote = None
        try:
            cur.execute("""
                SELECT open, high, low, close, amount, vol, trade_date
                FROM ashare_daily_price
                WHERE ts_code = %s AND trade_date <= %s
                ORDER BY trade_date DESC LIMIT 1
            """, (ts_code, eff_date_str))
            pr = cur.fetchone()
            if pr:
                pr = dict(pr)
                is_today = (str(pr["trade_date"]) == eff_date_str)

                # turnover_rate
                cur.execute("""
                    SELECT turnover_rate, trade_date FROM ashare_daily_basic
                    WHERE ts_code = %s AND trade_date <= %s
                    ORDER BY trade_date DESC LIMIT 1
                """, (ts_code, eff_date_str))
                db_row = cur.fetchone()
                db_is_today = (str(db_row["trade_date"]) == eff_date_str) if db_row and db_row["trade_date"] else False
                turnover_rate = _dec(db_row["turnover_rate"]) if (db_row and db_is_today) else None

                # prev_close
                prev_td = _prev_trade_date(cur, eff_date)
                prev_close = None
                if prev_td:
                    cur.execute("""
                        SELECT close FROM ashare_daily_price
                        WHERE ts_code = %s AND trade_date = %s
                    """, (ts_code, prev_td))
                    pc_row = cur.fetchone()
                    if pc_row:
                        prev_close = _dec(pc_row["close"])

                close_val = _dec(pr["close"])
                amount_val = _dec(pr["amount"])
                pct_chg = None
                if prev_close and prev_close != 0 and close_val is not None:
                    pct_chg = round((close_val - prev_close) / prev_close, 6)

                quote = {
                    "open": _dec(pr["open"]),
                    "high": _dec(pr["high"]),
                    "low": _dec(pr["low"]),
                    "close": close_val,
                    "latest_price": close_val,
                    "prev_close": prev_close,
                    "pct_chg": pct_chg if is_today else None,
                    "vol": _dec(pr["vol"]),
                    "amount": amount_val,
                    "amount_yi": round(amount_val / 100000, 4) if amount_val else None,
                    "turnover_rate": turnover_rate,
                }
            else:
                quote = None
        except Exception as e:
            partial_blocks.append("quote")
            quote = None

        # ════════════════════════════════════════════════════════
        # risk (via _fetch_risk_block)
        # ════════════════════════════════════════════════════════
        risk = None
        try:
            risk = _fetch_risk_block(cur, ts_code, eff_date_str)
        except Exception as e:
            partial_blocks.append("risk")
            risk = None

        # ════════════════════════════════════════════════════════
        # lifecycle (via _fetch_lifecycle_block)
        # ════════════════════════════════════════════════════════
        lifecycle = None
        try:
            lc_full, _lc_deg, _lc_reason = _fetch_lifecycle_block(cur, ts_code)
            # Main endpoint uses simplified lifecycle structure for backward compat
            lifecycle = {
                "steps": lc_full["steps"],
                "lifecycle_status": lc_full["current_status"],
                "entry_date": lc_full["key_dates"].get("entered_watchlist_at"),
                "signal_date": lc_full["key_dates"].get("signal_triggered_at"),
                "pool_day": None,
            }
            # Try to get pool_day from watchlist
            cur.execute("""
                SELECT pool_day FROM ashare_watchlist
                WHERE ts_code = %s AND status = 'active'
                ORDER BY entry_date DESC LIMIT 1
            """, (ts_code,))
            pw = cur.fetchone()
            if pw:
                lifecycle["pool_day"] = pw["pool_day"]
        except Exception as e:
            partial_blocks.append("lifecycle")
            lifecycle = None

        # ════════════════════════════════════════════════════════
        # strategies
        # ════════════════════════════════════════════════════════
        strategies = None
        try:
            cur.execute("""
                SELECT strategy, buy_signal FROM ashare_watchlist
                WHERE ts_code = %s AND status = 'active'
                ORDER BY entry_date ASC
            """, (ts_code,))
            wl_rows = cur.fetchall()
            source_strategies = [r["strategy"] for r in wl_rows]
            latest_signal = None
            for r in wl_rows:
                if r.get("buy_signal"):
                    latest_signal = r["buy_signal"]

            strategies = {
                "source_strategy_primary": source_strategies[0] if source_strategies else None,
                "source_strategies": source_strategies,
                "cross_strategy_count": len(source_strategies) if len(source_strategies) > 1 else 0,
                "cross_strategy_tags": source_strategies if len(source_strategies) > 1 else [],
                "latest_signal_type": latest_signal,
                "signal_strength": None,
            }
        except Exception as e:
            partial_blocks.append("strategies")
            strategies = None

        # ════════════════════════════════════════════════════════
        # watchlist_context
        # ════════════════════════════════════════════════════════
        watchlist_context = None
        try:
            cur.execute("""
                SELECT status AS watchlist_status, buy_signal, sell_signal,
                       pool_day, gain_since_entry
                FROM ashare_watchlist
                WHERE ts_code = %s AND status = 'active'
                ORDER BY entry_date DESC LIMIT 1
            """, (ts_code,))
            wc = cur.fetchone()
            if wc:
                watchlist_context = {
                    "in_watchlist": True,
                    "watchlist_status": wc["watchlist_status"],
                    "buy_signal": wc["buy_signal"],
                    "sell_signal": wc["sell_signal"],
                    "pool_day": wc["pool_day"],
                    "gain_since_entry": _dec(wc["gain_since_entry"]),
                }
            else:
                watchlist_context = {
                    "in_watchlist": False,
                    "watchlist_status": None,
                    "buy_signal": None,
                    "sell_signal": None,
                    "pool_day": None,
                    "gain_since_entry": None,
                }
        except Exception as e:
            partial_blocks.append("watchlist_context")
            watchlist_context = None

        # ════════════════════════════════════════════════════════
        # portfolio_context
        # ════════════════════════════════════════════════════════
        portfolio_context = None
        try:
            cur.execute("""
                SELECT position_type, open_date::text AS open_date, open_price,
                       shares, market_value, unrealized_pnl_pct,
                       hold_days, status, action_signal
                FROM ashare_portfolio
                WHERE ts_code = %s AND position_type = 'PAPER' AND status = 'open'
                ORDER BY open_date DESC LIMIT 1
            """, (ts_code,))
            pf = cur.fetchone()
            if pf:
                portfolio_context = {
                    "in_portfolio": True,
                    "position_type": pf["position_type"],
                    "open_date": pf["open_date"],
                    "open_price": _dec(pf["open_price"]),
                    "shares": pf["shares"],
                    "market_value": _dec(pf["market_value"]),
                    "unrealized_pnl_pct": _dec(pf["unrealized_pnl_pct"]),
                    "hold_days": pf["hold_days"],
                    "status": pf["status"],
                    "sell_signal_type": pf["action_signal"],
                }
            else:
                portfolio_context = {
                    "in_portfolio": False,
                    "position_type": None, "open_date": None, "open_price": None,
                    "shares": None, "market_value": None, "unrealized_pnl_pct": None,
                    "hold_days": None, "status": None, "sell_signal_type": None,
                }
        except Exception as e:
            partial_blocks.append("portfolio_context")
            portfolio_context = None

        # ════════════════════════════════════════════════════════
        # signal_context
        # ════════════════════════════════════════════════════════
        signal_context = None
        try:
            cur.execute("""
                SELECT buy_signal, sell_signal, signal_date::text AS signal_date
                FROM ashare_watchlist
                WHERE ts_code = %s AND status = 'active'
            """, (ts_code,))
            sig_rows = cur.fetchall()
            buy_signals = [r["buy_signal"] for r in sig_rows if r.get("buy_signal")]
            sell_signals = [r["sell_signal"] for r in sig_rows if r.get("sell_signal")]
            signal_context = {
                "latest_buy_signals": buy_signals,
                "latest_sell_signals": sell_signals,
                "signal_reason": None,
            }
        except Exception as e:
            partial_blocks.append("signal_context")
            signal_context = None

        # ════════════════════════════════════════════════════════
        # ai_context
        # ════════════════════════════════════════════════════════
        ai_context = None

        # ════════════════════════════════════════════════════════
        # actions (derived)
        # ════════════════════════════════════════════════════════
        in_wl = watchlist_context.get("in_watchlist", False) if watchlist_context else False
        in_pf = portfolio_context.get("in_portfolio", False) if portfolio_context else False
        lc_status = lifecycle.get("lifecycle_status") if lifecycle else None
        trade_ok = risk.get("trade_allowed", False) if risk else False
        pf_open = portfolio_context.get("status") == "open" if portfolio_context else False

        actions = {
            "can_add_watchlist": not in_wl,
            "can_transfer_to_portfolio": in_wl and lc_status == "signaled" and trade_ok,
            "can_reduce_position": in_pf and pf_open,
            "can_close_position": in_pf and pf_open,
        }

        # ════════════════════════════════════════════════════════
        # panel_state
        # ════════════════════════════════════════════════════════
        panel_state = {
            "degraded": len(partial_blocks) > 0,
            "partial_blocks": partial_blocks,
            "data_source": "real",
        }

        data = {
            "basic": basic,
            "quote": quote,
            "risk": risk,
            "lifecycle": lifecycle,
            "strategies": strategies,
            "watchlist_context": watchlist_context,
            "portfolio_context": portfolio_context,
            "signal_context": signal_context,
            "ai_context": ai_context,
            "actions": actions,
            "panel_state": panel_state,
        }

        meta = {
            "trade_date": eff_date_str,
            "version_snapshot": f"risk_model=v1.0 | pipeline={eff_date_str} | api=v1.0",
            "source": source,
            "generated_at": _now_cn(),
        }

        return {"data": data, "meta": meta}

    finally:
        conn.close()




# ═══════════════════════════════════════════════════════════════════════════════
# Context Panel: Risk Detail Endpoint
# ═══════════════════════════════════════════════════════════════════════════════

def _risk_level(score):
    if score is None:
        return None
    if score >= 80:
        return "low"
    if score >= 60:
        return "medium"
    return "high"


def _risk_explanation(risk):
    if risk is None:
        return "暂无风控评分数据"
    if not risk.get("trade_allowed"):
        br = risk.get("block_reason") or "未知原因"
        return f"该股票被风控闸门拦截：{br}"
    mult = risk.get("position_cap_multiplier_final")
    total = risk.get("risk_score_total")
    if mult is not None and mult < 0.5:
        # find lowest cap dimension
        caps = {
            "financial": risk.get("cap_financial"),
            "market": risk.get("cap_market"),
            "event": risk.get("cap_event"),
            "compliance": risk.get("cap_compliance"),
        }
        valid = {k: v for k, v in caps.items() if v is not None}
        dim_name = min(valid, key=valid.get) if valid else "unknown"
        dim_map = {"financial": "财务", "market": "市场", "event": "事件", "compliance": "合规"}
        return f"仓位被大幅限制（{mult}），主要受{dim_map.get(dim_name, dim_name)}维度制约"
    if total is not None and total >= 80:
        return "风险水平较低，各维度均在正常范围"
    if total is not None:
        scores = {
            "financial": risk.get("risk_score_financial"),
            "market": risk.get("risk_score_market"),
            "event": risk.get("risk_score_event"),
            "compliance": risk.get("risk_score_compliance"),
        }
        valid = {k: v for k, v in scores.items() if v is not None}
        dim_name = min(valid, key=valid.get) if valid else "unknown"
        dim_map = {"financial": "财务", "market": "市场", "event": "事件", "compliance": "合规"}
        return f"综合风险{total}分，{dim_map.get(dim_name, dim_name)}维度需关注"
    return "暂无风控评分数据"


@app.get("/api/context/stock/{ts_code}/risk")
def get_context_risk(ts_code: str, trade_date: str = None, source: str = None):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        eff_date = _resolve_trade_date(cur, trade_date)
        if eff_date is None:
            conn.close()
            return {"data": None, "meta": {"error": "no trade data available"}}
        eff_date_str = str(eff_date)

        degraded = False
        degrade_reason = None
        try:
            risk = _fetch_risk_block(cur, ts_code, eff_date_str)
        except Exception as e:
            risk = None
            degraded = True
            degrade_reason = str(e)

        if risk:
            data = {
                "ts_code": ts_code,
                "trade_allowed": risk["trade_allowed"],
                "block_reason": risk["block_reason"],
                "risk_score_total": risk["risk_score_total"],
                "risk_level": _risk_level(risk["risk_score_total"]),
                "dimension_scores": {
                    "financial": risk["risk_score_financial"],
                    "market": risk["risk_score_market"],
                    "event": risk["risk_score_event"],
                    "compliance": risk["risk_score_compliance"],
                },
                "dimension_caps": {
                    "financial": risk["cap_financial"],
                    "market": risk["cap_market"],
                    "event": risk["cap_event"],
                    "compliance": risk["cap_compliance"],
                },
                "position_cap_multiplier_final": risk["position_cap_multiplier_final"],
                "effective_risk": risk["effective_risk"],
                "risk_explanation": _risk_explanation(risk),
                "risk_events": risk.get("risk_events", []),
                "risk_as_of_date": risk.get("risk_as_of_date"),
            }
        else:
            data = {
                "ts_code": ts_code,
                "trade_allowed": None,
                "block_reason": None,
                "risk_score_total": None,
                "risk_level": None,
                "dimension_scores": {"financial": None, "market": None, "event": None, "compliance": None},
                "dimension_caps": {"financial": None, "market": None, "event": None, "compliance": None},
                "position_cap_multiplier_final": None,
                "effective_risk": None,
                "risk_explanation": _risk_explanation(None),
                "risk_events": [],
                "risk_as_of_date": None,
            }

        meta = {
            "trade_date": eff_date_str,
            "source": source,
            "version_snapshot": f"risk_model=v1.0 | pipeline={eff_date_str} | api=v1.0",
            "degraded": degraded,
            "degrade_reason": degrade_reason,
            "generated_at": _now_cn(),
        }
        return {"data": data, "meta": meta}
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# Context Panel: Lifecycle Detail Endpoint
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/context/stock/{ts_code}/lifecycle")
def get_context_lifecycle(ts_code: str, trade_date: str = None, source: str = None):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        eff_date = _resolve_trade_date(cur, trade_date)
        if eff_date is None:
            conn.close()
            return {"data": None, "meta": {"error": "no trade data available"}}
        eff_date_str = str(eff_date)

        degraded = False
        degrade_reason = None
        try:
            lifecycle, degraded, degrade_reason = _fetch_lifecycle_block(cur, ts_code)
        except Exception as e:
            lifecycle = {
                "ts_code": ts_code,
                "current_status": "unknown",
                "source_strategy_primary": None,
                "source_strategies": [],
                "steps": [],
                "key_dates": {
                    "entered_watchlist_at": None,
                    "signal_triggered_at": None,
                    "transferred_to_portfolio_at": None,
                    "closed_at": None,
                },
                "related_records": {
                    "watchlist_id": None,
                    "portfolio_position_id": None,
                    "execution_order_ids": [],
                },
            }
            degraded = True
            degrade_reason = str(e)

        meta = {
            "trade_date": eff_date_str,
            "source": source,
            "version_snapshot": f"risk_model=v1.0 | pipeline={eff_date_str} | api=v1.0",
            "degraded": degraded,
            "degrade_reason": degrade_reason,
            "generated_at": _now_cn(),
        }
        return {"data": lifecycle, "meta": meta}
    finally:
        conn.close()

# ═══════════════════════════════════════════════════════════════════════════════
# Context Panel: K-line Endpoint
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/context/stock/{ts_code}/kline")
def get_context_kline(ts_code: str, trade_date: str = None,
                      range: str = "60d", adjust: str = "qfq"):
    range_map = {"20d": 20, "60d": 60, "120d": 120, "1y": 250}
    days = range_map.get(range, 60)
    buf = days + 25  # warmup for MA20

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        eff_date = _resolve_trade_date(cur, trade_date)
        if eff_date is None:
            return {"data": None, "meta": {"error": "no trade data available"}}
        eff_date_str = str(eff_date)

        if adjust == "qfq":
            # Front-adjusted: price * (adj_factor / latest_adj_factor)
            cur.execute("""
                WITH raw AS (
                    SELECT dp.trade_date, dp.open, dp.high, dp.low, dp.close, dp.vol,
                           af.adj_factor AS af_val,
                           ROW_NUMBER() OVER (ORDER BY dp.trade_date DESC) AS rn
                    FROM ashare_daily_price dp
                    LEFT JOIN ashare_adj_factor af
                        ON dp.ts_code = af.ts_code AND dp.trade_date = af.trade_date
                    WHERE dp.ts_code = %s AND dp.trade_date <= %s
                    ORDER BY dp.trade_date DESC
                    LIMIT %s
                ),
                latest_af AS (
                    SELECT af_val FROM raw WHERE rn = 1
                ),
                adjusted AS (
                    SELECT trade_date,
                           ROUND((open  * raw.af_val / laf.af_val)::numeric, 2) AS open,
                           ROUND((high  * raw.af_val / laf.af_val)::numeric, 2) AS high,
                           ROUND((low   * raw.af_val / laf.af_val)::numeric, 2) AS low,
                           ROUND((close * raw.af_val / laf.af_val)::numeric, 2) AS close,
                           vol::bigint AS volume,
                           rn
                    FROM raw, latest_af laf
                ),
                with_ma AS (
                    SELECT trade_date, open, high, low, close, volume, rn,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma5,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma10,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma20
                    FROM adjusted
                )
                SELECT TO_CHAR(trade_date, 'YYYY-MM-DD') AS date,
                       open, high, low, close, volume, ma5, ma10, ma20
                FROM with_ma
                WHERE rn <= %s
                ORDER BY trade_date ASC
            """, (ts_code, eff_date_str, buf, days))
        elif adjust == "hfq":
            cur.execute("""
                WITH raw AS (
                    SELECT dp.trade_date, dp.open, dp.high, dp.low, dp.close, dp.vol,
                           af.adj_factor AS af_val,
                           ROW_NUMBER() OVER (ORDER BY dp.trade_date DESC) AS rn
                    FROM ashare_daily_price dp
                    LEFT JOIN ashare_adj_factor af
                        ON dp.ts_code = af.ts_code AND dp.trade_date = af.trade_date
                    WHERE dp.ts_code = %s AND dp.trade_date <= %s
                    ORDER BY dp.trade_date DESC
                    LIMIT %s
                ),
                first_af AS (
                    SELECT af_val FROM raw ORDER BY trade_date ASC LIMIT 1
                ),
                adjusted AS (
                    SELECT trade_date,
                           ROUND((open  * raw.af_val / faf.af_val)::numeric, 2) AS open,
                           ROUND((high  * raw.af_val / faf.af_val)::numeric, 2) AS high,
                           ROUND((low   * raw.af_val / faf.af_val)::numeric, 2) AS low,
                           ROUND((close * raw.af_val / faf.af_val)::numeric, 2) AS close,
                           vol::bigint AS volume,
                           rn
                    FROM raw, first_af faf
                ),
                with_ma AS (
                    SELECT trade_date, open, high, low, close, volume, rn,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma5,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma10,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma20
                    FROM adjusted
                )
                SELECT TO_CHAR(trade_date, 'YYYY-MM-DD') AS date,
                       open, high, low, close, volume, ma5, ma10, ma20
                FROM with_ma
                WHERE rn <= %s
                ORDER BY trade_date ASC
            """, (ts_code, eff_date_str, buf, days))
        else:
            # No adjustment
            cur.execute("""
                WITH raw AS (
                    SELECT trade_date, open, high, low, close, vol,
                           ROW_NUMBER() OVER (ORDER BY trade_date DESC) AS rn
                    FROM ashare_daily_price
                    WHERE ts_code = %s AND trade_date <= %s
                    ORDER BY trade_date DESC
                    LIMIT %s
                ),
                with_ma AS (
                    SELECT trade_date,
                           ROUND(open::numeric, 2) AS open,
                           ROUND(high::numeric, 2) AS high,
                           ROUND(low::numeric, 2) AS low,
                           ROUND(close::numeric, 2) AS close,
                           vol::bigint AS volume,
                           rn,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma5,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma10,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma20
                    FROM raw
                )
                SELECT TO_CHAR(trade_date, 'YYYY-MM-DD') AS date,
                       open, high, low, close, volume, ma5, ma10, ma20
                FROM with_ma
                WHERE rn <= %s
                ORDER BY trade_date ASC
            """, (ts_code, eff_date_str, buf, days))

        rows = cur.fetchall()
        bars = []
        for r in rows:
            bars.append({
                "date": r["date"],
                "open": _dec(r["open"]),
                "high": _dec(r["high"]),
                "low": _dec(r["low"]),
                "close": _dec(r["close"]),
                "volume": r["volume"],
                "ma5": _dec(r["ma5"]),
                "ma10": _dec(r["ma10"]),
                "ma20": _dec(r["ma20"]),
            })

        data = {
            "ts_code": ts_code,
            "range": range,
            "bars": bars,
        }
        meta = {
            "trade_date": eff_date_str,
            "adjust": adjust,
            "bar_count": len(bars),
            "generated_at": _now_cn(),
        }
        return {"data": data, "meta": meta}

    finally:
        conn.close()


# ============================================================
# Batch 1: Risk endpoints (3)
# ============================================================

@app.get("/api/risk/gate_blocks")
def get_risk_gate_blocks(trade_date: str = None, scope: str = "all"):
    """Return stocks blocked from trading (trade_allowed=false)."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if trade_date:
            eff = _resolve_trade_date(cur, trade_date)
        else:
            cur.execute("SELECT MAX(trade_date) AS td FROM ashare_risk_score")
            _r = cur.fetchone()
            eff = _r["td"] if _r else None
        if not eff:
            return []
        base = """
            SELECT r.ts_code, s.name, r.trade_date::text, r.trade_allowed,
                   r.block_reason, r.risk_score_total, r.risk_score_financial,
                   r.risk_score_market, r.risk_score_event, r.risk_score_compliance,
                   r.position_cap_multiplier_final,
                   CASE WHEN r.risk_score_total >= 80 THEN 'extreme'
                        WHEN r.risk_score_total >= 60 THEN 'high'
                        WHEN r.risk_score_total >= 40 THEN 'medium'
                        ELSE 'low' END AS risk_level
            FROM ashare_risk_score r
            LEFT JOIN ashare_stock_basic s ON s.ts_code = r.ts_code
        """
        wheres = ["r.trade_date = %s", "r.trade_allowed = false"]
        params = [eff]
        if scope == "watchlist":
            base += " INNER JOIN ashare_watchlist w ON w.ts_code = r.ts_code AND w.status = 'active' "
        elif scope == "portfolio":
            base += " INNER JOIN ashare_portfolio p ON p.ts_code = r.ts_code AND p.status = 'open' "
        sql = base + " WHERE " + " AND ".join(wheres) + " ORDER BY r.risk_score_total DESC"
        cur.execute(sql, params)
        return cur.fetchall()
    finally:
        conn.close()


# ============================================================
# Batch 1: Risk endpoints (3)
# ============================================================


@app.get("/api/risk/top_scores")
def get_risk_top_scores(trade_date: str = None, scope: str = "all", limit: int = 50):
    """Return top N stocks by risk_score_total."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if trade_date:
            eff = _resolve_trade_date(cur, trade_date)
        else:
            cur.execute("SELECT MAX(trade_date) AS td FROM ashare_risk_score")
            _r = cur.fetchone()
            eff = _r["td"] if _r else None
        if not eff:
            return []
        base = """
            SELECT r.ts_code, s.name, r.trade_date::text, r.trade_allowed,
                   r.block_reason, r.risk_score_total, r.risk_score_financial,
                   r.risk_score_market, r.risk_score_event, r.risk_score_compliance,
                   r.cap_financial, r.cap_market, r.cap_event, r.cap_compliance,
                   r.position_cap_multiplier_final,
                   CASE WHEN r.risk_score_total >= 80 THEN 'extreme'
                        WHEN r.risk_score_total >= 60 THEN 'high'
                        WHEN r.risk_score_total >= 40 THEN 'medium'
                        ELSE 'low' END AS risk_level,
                   EXISTS(SELECT 1 FROM ashare_watchlist w WHERE w.ts_code = r.ts_code AND w.status = 'active') AS in_watchlist,
                   EXISTS(SELECT 1 FROM ashare_portfolio p WHERE p.ts_code = r.ts_code AND p.status = 'open') AS in_portfolio
            FROM ashare_risk_score r
            LEFT JOIN ashare_stock_basic s ON s.ts_code = r.ts_code
        """
        wheres = ["r.trade_date = %s"]
        params = [eff]
        if scope == "watchlist":
            base += " INNER JOIN ashare_watchlist w2 ON w2.ts_code = r.ts_code AND w2.status = 'active' "
        elif scope == "portfolio":
            base += " INNER JOIN ashare_portfolio p2 ON p2.ts_code = r.ts_code AND p2.status = 'open' "
        sql = base + " WHERE " + " AND ".join(wheres) + " ORDER BY r.risk_score_total DESC LIMIT %s"
        params.append(limit)
        cur.execute(sql, params)
        return cur.fetchall()
    finally:
        conn.close()


@app.get("/api/risk/{ts_code}/{trade_date}")
def get_risk_detail(ts_code: str, trade_date: str):
    """Return full risk data for a single stock on a given date."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT r.*, s.name
            FROM ashare_risk_score r
            LEFT JOIN ashare_stock_basic s ON s.ts_code = r.ts_code
            WHERE r.ts_code = %s AND r.trade_date = %s::date
        """, (ts_code, trade_date))
        row = cur.fetchone()
        if not row:
            cur.execute("""
                SELECT r.*, s.name
                FROM ashare_risk_score r
                LEFT JOIN ashare_stock_basic s ON s.ts_code = r.ts_code
                WHERE r.ts_code = %s
                ORDER BY r.trade_date DESC LIMIT 1
            """, (ts_code,))
            row = cur.fetchone()
        if not row:
            return {"error": "not found"}
        result = {}
        for k, v in row.items():
            if isinstance(v, _decimal_mod.Decimal):
                result[k] = float(v)
            elif hasattr(v, 'isoformat'):
                result[k] = v.isoformat()
            else:
                result[k] = v
        return result
    finally:
        conn.close()


# ============================================================
# Batch 2: System endpoints (5)
# ============================================================

@app.get("/api/system/pipeline_runs")
def get_pipeline_runs(trade_date: str = None):
    """Return pipeline step statuses for a given trade date."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if trade_date:
            eff = trade_date
        else:
            cur.execute("SELECT MAX(trade_date) AS td FROM ashare_pipeline_runs")
            r = cur.fetchone()
            eff = r["td"] if r else None
        if not eff:
            return []
        cur.execute("""
            SELECT step, status, started_at, ended_at, duration_ms, rowcount, message
            FROM ashare_pipeline_runs
            WHERE trade_date = %s::date
            ORDER BY started_at ASC
        """, (eff,))
        rows = cur.fetchall()
        out = []
        for r in rows:
            d = {}
            for k, v in r.items():
                if hasattr(v, 'isoformat'):
                    d[k] = v.isoformat()
                else:
                    d[k] = v
            out.append(d)
        return out
    finally:
        conn.close()


@app.get("/api/system/data_coverage")
def get_data_coverage(trade_date: str = None):
    """Return data coverage stats for core tables."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        eff = _resolve_trade_date(cur, trade_date)
        eff_str = str(eff) if eff else None

        tables = [
            "ashare_daily_price", "ashare_daily_basic", "ashare_adj_factor",
            "ashare_index_daily", "ashare_intraday_5m", "ashare_fin_income",
            "ashare_fin_balance", "ashare_fin_cashflow", "ashare_audit_opinion",
            "ashare_pledge_stat", "ashare_risk_score", "ashare_watchlist",
            "ashare_vol_surge_pool"
        ]
        result = []
        for tbl in tables:
            try:
                cur.execute("""
                    SELECT MAX(trade_date)::text AS latest_date,
                           (SELECT reltuples::bigint FROM pg_class WHERE relname = %s) AS total_rows
                    FROM """ + tbl, (tbl,))
                row = cur.fetchone()
                latest = row["latest_date"] if row else None
                total = int(row["total_rows"]) if row and row["total_rows"] else 0
                result.append({
                    "table_name": tbl,
                    "latest_date": latest,
                    "total_rows": total,
                    "is_current": (latest == eff_str) if (latest and eff_str) else False,
                })
            except Exception:
                conn.rollback()
                result.append({
                    "table_name": tbl,
                    "latest_date": None,
                    "total_rows": 0,
                    "is_current": False,
                    "error": "table not found or no trade_date column",
                })
        return result
    finally:
        conn.close()


@app.get("/api/system/version")
def get_system_version():
    """Return system version info."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT started_at FROM ashare_pipeline_runs ORDER BY started_at DESC LIMIT 1")
        row = cur.fetchone()
        updated = row["started_at"].isoformat() if row and row["started_at"] else None
        return {
            "version_snapshot": os.environ.get("ASHARE_VERSION", "v5.0"),
            "updated_at": updated,
            "pipeline_version": os.environ.get("ASHARE_PIPELINE_VERSION", "v5.0"),
        }
    finally:
        conn.close()


@app.get("/api/system/runlog/latest")
def get_runlog_latest():
    """Return latest pipeline run summary with failure info."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT MAX(trade_date) AS td FROM ashare_pipeline_runs")
        row = cur.fetchone()
        if not row or not row["td"]:
            return {"latest_trade_date": None}
        td = row["td"]
        cur.execute("""
            SELECT status, step, message, ended_at
            FROM ashare_pipeline_runs
            WHERE trade_date = %s
            ORDER BY started_at ASC
        """, (td,))
        rows = cur.fetchall()
        total = len(rows)
        success = sum(1 for r in rows if r["status"] == "success")
        failed = sum(1 for r in rows if r["status"] == "failed")
        fail_rows = [r for r in rows if r["status"] == "failed"]
        success_rows = [r for r in rows if r["status"] == "success"]
        return {
            "latest_trade_date": str(td),
            "total_steps": total,
            "success_count": success,
            "failed_count": failed,
            "latest_fail_step": fail_rows[-1]["step"] if fail_rows else None,
            "latest_fail_message": fail_rows[-1]["message"] if fail_rows else None,
            "latest_success_time": success_rows[-1]["ended_at"].isoformat() if success_rows and success_rows[-1]["ended_at"] else None,
        }
    finally:
        conn.close()


@app.get("/api/system/api_health")
def get_api_health():
    """Health check for internal API endpoints."""
    import httpx
    from datetime import datetime as _dt_health

    endpoints = [
        ("/api/health", "health"),
        ("/api/dashboard/summary", "dashboard_summary"),
        ("/api/watchlist/stats", "watchlist_stats"),
        ("/api/portfolio", "portfolio"),
    ]
    results = []
    for path, key in endpoints:
        t0 = _dt_health.now()
        try:
            resp = httpx.get(f"http://127.0.0.1:8000{path}", timeout=2.0)
            elapsed = int((_dt_health.now() - t0).total_seconds() * 1000)
            results.append({
                "endpoint_key": key,
                "status": "ok" if resp.status_code == 200 else "error",
                "response_time_ms": elapsed,
                "http_status": resp.status_code,
                "checked_at": _dt_health.now().isoformat(),
            })
        except Exception as e:
            elapsed = int((_dt_health.now() - t0).total_seconds() * 1000)
            results.append({
                "endpoint_key": key,
                "status": "error",
                "response_time_ms": elapsed,
                "http_status": None,
                "checked_at": _dt_health.now().isoformat(),
                "error": str(e),
            })
    return results


# ============================================================
# Batch 3: Research endpoints (3)
# ============================================================

@app.get("/api/research/factor_ic")
def get_factor_ic(strategy: str = None):
    """Return factor IC analysis data."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        sql = """
            SELECT factor_name, REPLACE(holding_period, '+', '') AS horizon,
                   ic_mean AS ic, icir,
                   sample_days AS sample_count,
                   regime AS market_regime,
                   calc_date::text AS trade_date_range
            FROM ashare_factor_ic
        """
        params = []
        if strategy:
            sql += " WHERE factor_name ILIKE %s"
            params.append(f"%{strategy}%")
        sql += " ORDER BY factor_name, holding_period"
        cur.execute(sql, params)
        rows = cur.fetchall()
        out = []
        for r in rows:
            d = {}
            for k, v in r.items():
                d[k] = float(v) if isinstance(v, _decimal_mod.Decimal) else v
            out.append(d)
        return out
    finally:
        conn.close()


@app.get("/api/research/strategy_attribution")
def get_strategy_attribution(strategy: str = None):
    """Return strategy performance attribution data."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        sql = "SELECT * FROM ashare_perf_by_strategy"
        params = []
        if strategy:
            sql += " WHERE strategy = %s"
            params.append(strategy)
        sql += " ORDER BY calc_date DESC, strategy"
        cur.execute(sql, params)
        rows = cur.fetchall()
        out = []
        for r in rows:
            d = {}
            for k, v in r.items():
                if isinstance(v, _decimal_mod.Decimal):
                    d[k] = float(v)
                elif hasattr(v, 'isoformat'):
                    d[k] = v.isoformat()
                else:
                    d[k] = v
            out.append(d)
        return out
    finally:
        conn.close()


@app.get("/api/research/resonance_analysis")
def get_resonance_analysis():
    """Return multi-strategy resonance: stocks selected by multiple strategies."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT w.ts_code, s.name,
                   array_agg(DISTINCT w.strategy) AS strategies,
                   COUNT(DISTINCT w.strategy) AS strategy_count,
                   AVG(w.entry_score) AS avg_score
            FROM ashare_watchlist w
            LEFT JOIN ashare_stock_basic s ON s.ts_code = w.ts_code
            WHERE w.status = 'active'
            GROUP BY w.ts_code, s.name
            HAVING COUNT(DISTINCT w.strategy) >= 2
            ORDER BY strategy_count DESC, avg_score DESC
        """)
        rows = cur.fetchall()
        out = []
        for r in rows:
            d = {}
            for k, v in r.items():
                if isinstance(v, _decimal_mod.Decimal):
                    d[k] = float(v)
                else:
                    d[k] = v
            out.append(d)
        return out
    finally:
        conn.close()


# ============================================================
# Batch 4: Execution / Sim endpoints (3)
# ============================================================

@app.get("/api/sim/orders")
def get_sim_orders(trade_date: str = None, strategy: str = None):
    """Return simulated orders."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        wheres = []
        params = []
        if trade_date:
            wheres.append("o.order_date = %s::date")
            params.append(trade_date)
        else:
            wheres.append("o.order_date = (SELECT MAX(order_date) FROM ashare_sim_orders)")
        if strategy:
            wheres.append("o.strategy = %s")
            params.append(strategy)
        sql = """
            SELECT o.*, s.name
            FROM ashare_sim_orders o
            LEFT JOIN ashare_stock_basic s ON s.ts_code = o.ts_code
            WHERE """ + " AND ".join(wheres) + """
            ORDER BY o.id DESC
        """
        cur.execute(sql, params)
        rows = cur.fetchall()
        out = []
        for r in rows:
            d = {}
            for k, v in r.items():
                if isinstance(v, _decimal_mod.Decimal):
                    d[k] = float(v)
                elif hasattr(v, 'isoformat'):
                    d[k] = v.isoformat()
                else:
                    d[k] = v
            out.append(d)
        return out
    finally:
        conn.close()


@app.get("/api/sim/positions")
def get_sim_positions(trade_date: str = None):
    """Return latest simulated portfolio snapshot."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if trade_date:
            cur.execute("""
                SELECT * FROM ashare_sim_portfolio_snapshot
                WHERE snap_date = %s::date
            """, (trade_date,))
        else:
            cur.execute("""
                SELECT * FROM ashare_sim_portfolio_snapshot
                WHERE snap_date = (SELECT MAX(snap_date) FROM ashare_sim_portfolio_snapshot)
            """)
        rows = cur.fetchall()
        out = []
        for r in rows:
            d = {}
            for k, v in r.items():
                if isinstance(v, _decimal_mod.Decimal):
                    d[k] = float(v)
                elif hasattr(v, 'isoformat'):
                    d[k] = v.isoformat()
                else:
                    d[k] = v
            out.append(d)
        return out
    finally:
        conn.close()


@app.get("/api/sim/fills")
def get_sim_fills(trade_date: str = None, strategy: str = None):
    """Return filled simulated orders."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        wheres = ["o.status = 'filled'"]
        params = []
        if trade_date:
            wheres.append("o.order_date = %s::date")
            params.append(trade_date)
        if strategy:
            wheres.append("o.strategy = %s")
            params.append(strategy)
        sql = """
            SELECT o.*, s.name
            FROM ashare_sim_orders o
            LEFT JOIN ashare_stock_basic s ON s.ts_code = o.ts_code
            WHERE """ + " AND ".join(wheres) + """
            ORDER BY o.fill_date DESC NULLS LAST, o.id DESC
        """
        cur.execute(sql, params)
        rows = cur.fetchall()
        out = []
        for r in rows:
            d = {}
            for k, v in r.items():
                if isinstance(v, _decimal_mod.Decimal):
                    d[k] = float(v)
                elif hasattr(v, 'isoformat'):
                    d[k] = v.isoformat()
                else:
                    d[k] = v
            out.append(d)
        return out
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════════
# System Audit API
# ════════════════════════════════════════════════════════════════

@app.get("/api/system/audit")
def get_audit_results(trade_date: str = None):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if not trade_date:
            cur.execute("SELECT MAX(trade_date) FROM ashare_audit_results")
            row = cur.fetchone()
            if not row or not row['max']:
                return {"error": "no audit data"}
            trade_date = str(row['max'])
        cur.execute("""
            SELECT check_id, check_name, severity, expected, actual, detail,
                   created_at::text
            FROM ashare_audit_results WHERE trade_date = %s ORDER BY check_id
        """, (trade_date,))
        rows = cur.fetchall()
        checks = [dict(r) for r in rows]
        summary = {
            "pass": sum(1 for c in checks if c['severity'] == 'PASS'),
            "fail": sum(1 for c in checks if c['severity'] == 'FAIL'),
            "warn": sum(1 for c in checks if c['severity'] == 'WARN'),
            "skip": sum(1 for c in checks if c['severity'] == 'SKIP'),
        }
        return {"trade_date": trade_date, "summary": summary, "checks": checks}
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════════
# Market Regime API
# ════════════════════════════════════════════════════════════════

@app.get("/api/market/regime")
def get_market_regime():
    LABEL_MAP = {"strong": "强势上行", "bullish": "偏多震荡", "neutral": "中性震荡", "bearish": "偏空震荡", "weak": "弱势下跌", "trend_up": "强势上行", "range_up": "温和上涨", "range_choppy": "震荡整理", "down_weak": "弱势下跌"}
    LEVEL_MAP = {"strong": "positive", "bullish": "mild", "neutral": "neutral", "bearish": "warning", "weak": "danger", "trend_up": "positive", "range_up": "mild", "range_choppy": "warning", "down_weak": "danger"}
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT trade_date, market_regime FROM ashare_market_breadth WHERE market_regime IS NOT NULL ORDER BY trade_date DESC LIMIT 1")
        row = cur.fetchone()
        if not row:
            return {"trade_date": None, "regime": None, "label": "环境未知", "level": "unknown"}
        regime = row["market_regime"]
        td = str(row["trade_date"])
        return {"trade_date": td, "regime": regime, "label": LABEL_MAP.get(regime, "环境未知"), "level": LEVEL_MAP.get(regime, "unknown")}
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════════
# Dashboard Action List API
# ════════════════════════════════════════════════════════════════

@app.get("/api/dashboard/action_list")
def get_dashboard_action_list():
    SIGNAL_REASON = {
        "WARN_MA_BREAK": "均线破位", "STOP_LOSS": "触发止损",
        "TIME_EXIT": "持仓超期", "BREAKOUT_FAIL": "突破失败",
        "TRAILING_STOP": "追踪止盈", "TAKE_PROFIT": "止盈卖出",
        "WARN_DRAWDOWN": "回撤预警",
    }
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # resolve latest trade_date for risk_score join
        cur.execute("SELECT MAX(trade_date) FROM ashare_risk_score")
        r = cur.fetchone()
        rs_date = r["max"] if r and r["max"] else None

        # ── sell ──
        cur.execute("""
            SELECT p.ts_code, s.name, p.source_strategy AS strategy,
                   p.action_signal, p.signal_reason,
                   p.open_date::text AS entry_date,
                   p.hold_days,
                   p.unrealized_pnl_pct AS gain_pct
            FROM ashare_portfolio p
            LEFT JOIN ashare_stock_basic s ON p.ts_code = s.ts_code
            WHERE p.position_type='PAPER' AND p.status='open'
              AND p.action_signal IN ('WARN_MA_BREAK','STOP_LOSS','TIME_EXIT','BREAKOUT_FAIL','REDUCE','WARN_BREAKOUT_FAIL','TRAILING_STOP','TAKE_PROFIT','WARN_DRAWDOWN')
            ORDER BY p.unrealized_pnl_pct ASC NULLS LAST
        """)
        sell_rows = cur.fetchall()
        sell = []
        for r in sell_rows:
            sig = r["action_signal"] or ""
            sell.append({
                "ts_code": r["ts_code"],
                "name": r["name"] or "",
                "strategy": r["strategy"] or "",
                "signal": sig,
                "reason": r["signal_reason"] or SIGNAL_REASON.get(sig, sig),
                "entry_date": r["entry_date"] or "",
                "hold_days": int(r["hold_days"]) if r["hold_days"] is not None else 0,
                "gain_pct": round(float(r["gain_pct"]), 4) if r["gain_pct"] is not None else 0,
            })

        # ── buy ──
        STRATEGY_CN = {
            "VOL_SURGE": "连续放量蓄势", "RETOC2": "第4次异动",
            "PATTERN_T2UP9": "T-2大涨蓄势", "PATTERN_GREEN10": "近10日阳线",
            "IGNITE": "放量蓄势",
        }
        buy_sql = """
            SELECT * FROM (
                SELECT DISTINCT ON (w.ts_code) w.ts_code, s.name, w.strategy, w.buy_signal,
                       r.risk_score_total AS risk_score
                FROM ashare_watchlist w
                LEFT JOIN ashare_stock_basic s ON w.ts_code = s.ts_code
                LEFT JOIN ashare_risk_score r ON w.ts_code = r.ts_code AND r.trade_date = %s
                WHERE w.status = 'active'
                  AND w.buy_signal IS NOT NULL AND w.buy_signal != ''
                  AND (r.trade_allowed = true OR r.trade_allowed IS NULL)
                  AND w.ts_code NOT IN (
                      SELECT ts_code FROM ashare_portfolio
                      WHERE position_type='PAPER' AND status='open'
                  )
                ORDER BY w.ts_code, r.risk_score_total DESC NULLS LAST
            ) sub
            ORDER BY risk_score DESC NULLS LAST
            LIMIT 10
        """
        cur.execute(buy_sql, (rs_date,))
        buy_rows = cur.fetchall()
        buy = []
        for r in buy_rows:
            score = round(float(r["risk_score"]), 0) if r["risk_score"] is not None else 0
            strat = r["strategy"] or ""
            strat_cn = STRATEGY_CN.get(strat, strat)
            buy.append({
                "ts_code": r["ts_code"],
                "name": r["name"] or "",
                "strategy": strat,
                "signal": r["buy_signal"] or "",
                "reason": f"{strat_cn}  Gate通过 评分{int(score)}" if score else f"{strat_cn}  Gate通过",
                "risk_score": float(r["risk_score"]) if r["risk_score"] is not None else 0,
            })

        # ── watch ──
        watch_sql = """
            SELECT p.ts_code, s.name, p.source_strategy AS strategy,
                   r.risk_score_total AS risk_score,
                   r.block_reason
            FROM ashare_portfolio p
            LEFT JOIN ashare_stock_basic s ON p.ts_code = s.ts_code
            LEFT JOIN ashare_risk_score r ON p.ts_code = r.ts_code AND r.trade_date = %s
            WHERE p.position_type='PAPER' AND p.status='open'
              AND (r.trade_allowed = false OR r.risk_score_total < 60)
            ORDER BY r.risk_score_total ASC NULLS LAST LIMIT 5
        """
        cur.execute(watch_sql, (rs_date,))
        watch_rows = cur.fetchall()
        watch = []
        for r in watch_rows:
            br = r["block_reason"] or ""
            score = round(float(r["risk_score"]), 0) if r["risk_score"] is not None else 0
            reason = br.split(";")[0].strip() if br else f"评分偏低: {int(score)}"
            watch.append({
                "ts_code": r["ts_code"],
                "name": r["name"] or "",
                "strategy": r["strategy"] or "",
                "reason": reason,
                "risk_score": float(r["risk_score"]) if r["risk_score"] is not None else 0,
            })

        # resolve trade_date for response
        cur.execute("SELECT MAX(trade_date) FROM ashare_daily_price")
        td_row = cur.fetchone()
        td = str(td_row["max"]) if td_row and td_row["max"] else ""

        return {
            "trade_date": td,
            "actions": {"sell": sell, "buy": buy, "watch": watch},
            "summary": {
                "sell_count": len(sell),
                "buy_count": len(buy),
                "watch_count": len(watch),
            }
        }
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════════
# Watchlist Pre-Check API
# ════════════════════════════════════════════════════════════════

@app.get("/api/watchlist/pre_check/{ts_code}")
def get_watchlist_pre_check(ts_code: str):
    STRATEGY_CN = {
        "VOL_SURGE": "连续放量蓄势", "RETOC2": "第4次异动",
        "PATTERN_T2UP9": "T-2大涨蓄势", "PATTERN_GREEN10": "近10日阳线",
        "IGNITE": "放量蓄势",
    }
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # ── basic info ──
        cur.execute("SELECT name FROM ashare_stock_basic WHERE ts_code = %s", (ts_code,))
        row = cur.fetchone()
        name = row["name"] if row else None

        cur.execute("""SELECT strategy FROM ashare_watchlist
                       WHERE ts_code = %s AND status = 'active'
                       ORDER BY entry_date DESC LIMIT 1""", (ts_code,))
        row = cur.fetchone()
        strategy = row["strategy"] if row else None
        strategy_label = STRATEGY_CN.get(strategy, strategy) if strategy else None

        # ── gate & risk ──
        cur.execute("""SELECT trade_allowed, block_reason, risk_score_total
                       FROM ashare_risk_score
                       WHERE ts_code = %s ORDER BY trade_date DESC LIMIT 1""", (ts_code,))
        risk_row = cur.fetchone()

        if risk_row:
            gate_passed = bool(risk_row["trade_allowed"])
            br = risk_row["block_reason"] or ""
            block_reasons = [s.strip() for s in br.split(";") if s.strip()] if br else []
            total_score = float(risk_row["risk_score_total"]) if risk_row["risk_score_total"] is not None else None
        else:
            gate_passed = None
            block_reasons = []
            total_score = None

        if total_score is not None:
            score_level = "high" if total_score >= 80 else ("medium" if total_score >= 60 else "low")
        else:
            score_level = None

        # ── position sizing ──
        cur.execute("SELECT total_nav, cash FROM ashare_sim_portfolio_snapshot ORDER BY snap_date DESC LIMIT 1")
        snap = cur.fetchone()
        total_nav = float(snap["total_nav"]) if snap and snap["total_nav"] else None
        current_cash = float(snap["cash"]) if snap and snap["cash"] else None

        cur.execute("SELECT close FROM ashare_daily_price WHERE ts_code = %s ORDER BY trade_date DESC LIMIT 1", (ts_code,))
        price_row = cur.fetchone()
        close_price = float(price_row["close"]) if price_row and price_row["close"] else None

        suggested_shares = None
        suggested_amount = None
        position_pct = None
        if total_nav and close_price and close_price > 0 and score_level:
            multiplier = {"high": 1.0, "medium": 0.8, "low": 0.6}.get(score_level, 0.8)
            suggested_amount = round(total_nav * 0.06 * multiplier, 2)
            suggested_shares = int(suggested_amount / close_price / 100) * 100
            suggested_amount = round(suggested_shares * close_price, 2)
            position_pct = round(suggested_amount / total_nav, 4) if total_nav else None

        # ── portfolio impact ──
        cur.execute("SELECT COUNT(*) AS cnt FROM ashare_portfolio WHERE position_type='PAPER' AND status='open'")
        current_positions = cur.fetchone()["cnt"]

        top1_concentration = None
        if total_nav and total_nav > 0:
            cur.execute("SELECT MAX(market_value) AS mx FROM ashare_portfolio WHERE position_type='PAPER' AND status='open'")
            mx = cur.fetchone()["mx"]
            if mx:
                top1_concentration = round(float(mx) / total_nav, 4)

        return {
            "ts_code": ts_code,
            "name": name,
            "strategy": strategy,
            "strategy_label": strategy_label,
            "gate": {
                "passed": gate_passed,
                "block_reasons": block_reasons,
            },
            "risk": {
                "total_score": total_score,
                "score_level": score_level,
            },
            "position": {
                "suggested_shares": suggested_shares,
                "suggested_amount": suggested_amount,
                "position_pct": position_pct,
            },
            "portfolio_impact": {
                "current_positions": current_positions,
                "after_positions": current_positions + 1,
                "current_cash": current_cash,
                "after_cash": round(current_cash - suggested_amount, 2) if current_cash is not None and suggested_amount is not None else None,
                "top1_concentration": top1_concentration,
            },
        }
    finally:
        conn.close()


# ════════════════════════════════════════════════════════════════
# Portfolio Concentration API
# ════════════════════════════════════════════════════════════════

@app.get("/api/portfolio/concentration")
def get_portfolio_concentration():
    STRATEGY_CN = {
        "VOL_SURGE": "连续放量蓄势", "RETOC2": "第4次异动",
        "PATTERN_T2UP9": "T-2大涨蓄势", "PATTERN_GREEN10": "近10日阳线",
        "IGNITE": "放量蓄势",
    }
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute("SELECT COUNT(*) AS cnt FROM ashare_portfolio WHERE position_type='PAPER' AND status='open'")
        total = cur.fetchone()["cnt"]

        # ── strategy ──
        cur.execute("""
            SELECT source_strategy AS strategy, COUNT(*) AS count
            FROM ashare_portfolio
            WHERE position_type='PAPER' AND status='open'
            GROUP BY source_strategy ORDER BY count DESC
        """)
        strat_rows = cur.fetchall()
        strategy_distribution = []
        for r in strat_rows:
            s = r["strategy"] or "UNKNOWN"
            strategy_distribution.append({
                "strategy": s,
                "label": STRATEGY_CN.get(s, s),
                "count": r["count"],
                "pct": round(r["count"] / total, 2) if total else 0,
            })

        # ── industry ──
        cur.execute("""
            SELECT COALESCE(s.industry, '未知') AS industry, COUNT(*) AS count
            FROM ashare_portfolio p
            LEFT JOIN ashare_stock_basic s ON p.ts_code = s.ts_code
            WHERE p.position_type='PAPER' AND p.status='open'
            GROUP BY s.industry ORDER BY count DESC
        """)
        ind_rows = cur.fetchall()
        industry_distribution = []
        top5_count = 0
        for i, r in enumerate(ind_rows):
            if i < 5:
                industry_distribution.append({
                    "industry": r["industry"],
                    "count": r["count"],
                    "pct": round(r["count"] / total, 2) if total else 0,
                })
                top5_count += r["count"]
        others = total - top5_count
        if others > 0:
            industry_distribution.append({
                "industry": "其他",
                "count": others,
                "pct": round(others / total, 2) if total else 0,
            })

        cur.execute("SELECT MAX(trade_date) FROM ashare_daily_price")
        td_row = cur.fetchone()
        td = str(td_row["max"]) if td_row and td_row["max"] else ""

        return {
            "trade_date": td,
            "total_positions": total,
            "strategy_distribution": strategy_distribution,
            "industry_distribution": industry_distribution,
        }
    finally:
        conn.close()

@app.get("/api/portfolio/transactions")
def get_all_transactions(limit: int = 100):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT o.id, o.ts_code, b.name,
                   o.direction AS trade_type,
                   o.fill_date::text AS trade_date,
                   o.fill_price AS price,
                   o.fill_shares AS shares,
                   o.fill_amount AS amount,
                   o.strategy AS trigger_source,
                   o.signal_type,
                   o.status
            FROM ashare_sim_orders o
            LEFT JOIN ashare_stock_basic b ON o.ts_code = b.ts_code
            WHERE o.status = 'filled'
            ORDER BY o.fill_date DESC, o.id DESC
            LIMIT %s
        """, (limit,))
        rows = cur.fetchall()
        return {"data": [dict(r) for r in rows], "total": len(rows)}
    finally:
        conn.close()
