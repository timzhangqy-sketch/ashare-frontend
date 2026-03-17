

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
