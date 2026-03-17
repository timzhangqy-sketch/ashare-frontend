#!/usr/bin/env python3
import ast, sys

path = '/opt/ashare-api/main.py'
src  = open(path).read()

# ── Patch 1: add today_pnl batch query to get_portfolio ──────────────────────
old1 = '''    rows = cur.fetchall()
    conn.close()

    total_cost = sum(float(r["cost_amount"] or 0) for r in rows)
    total_value = sum(float(r["market_value"] or 0) for r in rows)
    total_pnl = total_value - total_cost

    return {
        "count": len(rows),
        "total_cost": round(total_cost, 2),
        "total_value": round(total_value, 2),
        "total_pnl": round(total_pnl, 2),
        "total_pnl_pct": round(total_pnl / total_cost, 4) if total_cost > 0 else 0,
        "data": [dict(r) for r in rows]
    }'''

new1 = '''    rows = cur.fetchall()

    # today_pnl: batch query prev close for all stocks in result
    ts_codes = list({r["ts_code"] for r in rows if r.get("latest_close") is not None})
    prev_map = {}
    if ts_codes:
        cur.execute("""
            SELECT DISTINCT ON (ts_code) ts_code, close
            FROM public.ashare_daily_price
            WHERE ts_code = ANY(%s)
              AND trade_date < CURRENT_DATE
            ORDER BY ts_code, trade_date DESC
        """, (ts_codes,))
        for pc in cur.fetchall():
            prev_map[pc["ts_code"]] = float(pc["close"])
    conn.close()

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
    }'''

if old1 in src:
    src = src.replace(old1, new1, 1)
    print('Patch 1 OK (today_pnl)')
else:
    print('ERROR: Patch 1 pattern not found')
    sys.exit(1)

# ── Patch 2: insert add_position endpoint before the duplicate section ────────
add_pos = '''

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
'''

marker = '\n# ── 持仓管理 API ──────────────────────────────────────────'
if marker in src:
    src = src.replace(marker, add_pos + marker, 1)
    print('Patch 2 OK (add_position endpoint)')
else:
    src += add_pos
    print('Patch 2 appended (add_position endpoint)')

# ── Verify & write ────────────────────────────────────────────────────────────
try:
    ast.parse(src)
    print('Syntax OK')
except SyntaxError as e:
    print(f'Syntax ERROR: {e}')
    sys.exit(1)

open(path, 'w').write(src)
print('Written.')
