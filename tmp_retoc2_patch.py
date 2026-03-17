#!/usr/bin/env python3
import ast, sys

path = '/opt/ashare-api/main.py'
src  = open(path).read()

old = '@app.get("/api/retoc2/{date}")\ndef get_retoc2(date: str):\n    conn = get_db()\n    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)\n    cur.execute("""\n        SELECT ts_code, name, rank_10d AS rank, cnt10, vr5, score\n        FROM public.ashare_5m_retoc2_vr5_score_top20_10d\n        WHERE trade_date=%s::date ORDER BY rank_10d LIMIT 20\n    """, (date,))\n    rows = cur.fetchall()\n    conn.close()\n    return {"date": date, "data": [dict(r) for r in rows]}'

new = '''@app.get("/api/retoc2/{date}")
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
    return {"date": date, "data": [dict(r) for r in rows]}'''

if old in src:
    src = src.replace(old, new, 1)
    try:
        ast.parse(src)
        print('Syntax OK')
    except SyntaxError as e:
        print(f'Syntax ERROR: {e}')
        sys.exit(1)
    open(path, 'w').write(src)
    print('Patched OK')
else:
    print('ERROR: pattern not found')
    # debug: show current endpoint
    idx = src.find('@app.get("/api/retoc2/')
    print(repr(src[idx:idx+300]))
    sys.exit(1)
