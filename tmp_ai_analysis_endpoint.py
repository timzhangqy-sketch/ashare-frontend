

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
               ROUND((dp.close - dp.open) / NULLIF(dp.open,0)*100, 2)     AS pct_chg,
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
