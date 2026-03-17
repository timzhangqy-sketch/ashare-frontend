#!/usr/bin/env python3
"""批量替换 main.py 中错误的涨跌幅计算（close-open → LAG 昨收）"""
import re

path = '/opt/ashare-api/main.py'
with open(path, 'r') as f:
    src = f.read()

# 子查询模板（pr 和 dp 两种别名）
def prev_close_subq(alias):
    return (
        f"(SELECT p2.close FROM public.ashare_daily_price p2 "
        f"WHERE p2.ts_code={alias}.ts_code AND p2.trade_date<{alias}.trade_date "
        f"ORDER BY p2.trade_date DESC LIMIT 1)"
    )

def new_pct(alias):
    sq = prev_close_subq(alias)
    return (
        f"ROUND(({alias}.close - {sq}) / "
        f"NULLIF({sq}, 0) * 100, 2) AS pct_chg,"
    )

# 精确匹配每种原始字符串（含前导空白，用 re 保留缩进）
patterns = [
    # pr 4处（相同格式）
    (
        r'( +)ROUND\(\(pr\.close - pr\.open\) / NULLIF\(pr\.open, 0\) \* 100, 2\) AS pct_chg,',
        lambda m: m.group(1) + new_pct('pr'),
    ),
    # dp 格式1（stock_detail, 4空格缩进）
    (
        r'( +)ROUND\(\(dp\.close - dp\.open\) / NULLIF\(dp\.open, 0\) \* 100, 2\) AS pct_chg,',
        lambda m: m.group(1) + new_pct('dp'),
    ),
    # dp 格式2（ai_analysis endpoint，紧凑写法）
    (
        r'( +)ROUND\(\(dp\.close - dp\.open\) / NULLIF\(dp\.open,0\)\*100, 2\)\s+AS pct_chg,',
        lambda m: m.group(1) + new_pct('dp'),
    ),
]

changed = 0
for pat, repl in patterns:
    new_src, n = re.subn(pat, repl, src)
    if n:
        print(f'  Replaced {n} occurrence(s) of: {pat[:60]}…')
        src = new_src
        changed += n

with open(path, 'w') as f:
    f.write(src)

print(f'Done. Total replacements: {changed}')

# Quick syntax check
import ast
try:
    ast.parse(src)
    print('Syntax OK')
except SyntaxError as e:
    print(f'Syntax ERROR: {e}')
