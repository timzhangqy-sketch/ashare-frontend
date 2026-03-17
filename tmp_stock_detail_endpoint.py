

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
               db.turnover_rate, db.pe_ttm, db.pb,
               ROUND(db.total_mv / 10000, 2) AS market_cap_yi,
               ROUND((dp.close - dp.pre_close) / NULLIF(dp.pre_close, 0) * 100, 2) AS pct_chg,
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

    conn.close()
    return result
