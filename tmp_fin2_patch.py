#!/usr/bin/env python3
path = '/opt/ashare-api/main.py'
with open(path, 'r') as f:
    src = f.read()

old = '''    # 6. 最近3年年报财务数据
    cur.execute(
        """
        SELECT
            EXTRACT(YEAR FROM end_date)::int           AS year,
            ROUND(revenue      / 100000000, 2)         AS revenue_yi,
            ROUND(total_profit / 100000000, 2)         AS total_profit_yi,
            ROUND(net_profit   / 100000000, 2)         AS net_income_yi
        FROM public.ashare_fin_income_core
        WHERE ts_code = %s
          AND TO_CHAR(end_date, 'MMDD') = \'1231\'
          AND report_type = \'1\'
        ORDER BY end_date DESC
        LIMIT 3
        """,
        (ts_code,),
    )
    fin_rows = cur.fetchall()
    result["financials"] = [dict(r) for r in fin_rows]'''

new = open('/tmp/fin2_insert.txt').read().rstrip('\n')

if old in src:
    src = src.replace(old, new, 1)
    print('Patch applied.')
else:
    # try with literal quotes
    old2 = old.replace("\\'", "'")
    if old2 in src:
        src = src.replace(old2, new, 1)
        print('Patch applied (literal quotes).')
    else:
        print('ERROR: pattern not found! Showing snippet:')
        idx = src.find('# 6. 最近3年年报财务数据')
        print(repr(src[idx:idx+600]))
        import sys; sys.exit(1)

with open(path, 'w') as f:
    f.write(src)

import ast
try:
    ast.parse(src)
    print('Syntax OK')
except SyntaxError as e:
    print(f'Syntax ERROR: {e}')
