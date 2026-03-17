#!/usr/bin/env python3
"""修复 watchlist_tracker.py 中的涨跌幅计算"""

path = '/opt/watchlist_tracker.py'
with open(path, 'r') as f:
    src = f.read()

# 替换 SQL：加入昨收价子查询
old_sql = """    cur.execute(\"\"\"
        SELECT
            dp.ts_code,
            dp.close,
            dp.open,
            dp.vol,          -- 手
            dp.amount,       -- 千元
            db.turnover_rate
        FROM public.ashare_daily_price dp
        LEFT JOIN public.ashare_daily_basic db
            ON dp.ts_code = db.ts_code AND dp.trade_date = db.trade_date
        WHERE dp.trade_date = %s AND dp.ts_code = ANY(%s)
    \"\"\", (trade_date, list(ts_codes)))"""

new_sql = """    cur.execute(\"\"\"
        SELECT
            dp.ts_code,
            dp.close,
            dp.open,
            dp.vol,          -- 手
            dp.amount,       -- 千元
            db.turnover_rate,
            (SELECT p2.close FROM public.ashare_daily_price p2
             WHERE p2.ts_code = dp.ts_code AND p2.trade_date < dp.trade_date
             ORDER BY p2.trade_date DESC LIMIT 1) AS prev_close
        FROM public.ashare_daily_price dp
        LEFT JOIN public.ashare_daily_basic db
            ON dp.ts_code = db.ts_code AND dp.trade_date = db.trade_date
        WHERE dp.trade_date = %s AND dp.ts_code = ANY(%s)
    \"\"\", (trade_date, list(ts_codes)))"""

if old_sql in src:
    src = src.replace(old_sql, new_sql)
    print('SQL query updated.')
else:
    print('ERROR: SQL pattern not found!')

# 替换 Python 计算逻辑
old_calc = """        # 计算当日涨跌幅
        pct_chg = None
        if row["close"] and row["open"] and row["open"] > 0:
            pct_chg = round((row["close"] - row["open"]) / row["open"] * 100, 4)
        row["pct_chg"] = pct_chg"""

new_calc = """        # 计算当日涨跌幅（(close - 昨收) / 昨收，A股标准）
        pct_chg = None
        prev = row.get("prev_close")
        if row["close"] and prev and prev > 0:
            pct_chg = round((row["close"] - prev) / prev * 100, 4)
        row["pct_chg"] = pct_chg"""

if old_calc in src:
    src = src.replace(old_calc, new_calc)
    print('pct_chg calculation updated.')
else:
    print('ERROR: calc pattern not found!')

with open(path, 'w') as f:
    f.write(src)

import ast
try:
    ast.parse(src)
    print('Syntax OK')
except SyntaxError as e:
    print(f'Syntax ERROR: {e}')
