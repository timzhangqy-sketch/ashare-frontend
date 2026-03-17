#!/usr/bin/env python3
"""在 get_stock_detail 的 conn.close() 前插入财务数据查询"""

insert_content = open('/tmp/fin_insert.txt').read()

path = '/opt/ashare-api/main.py'
with open(path, 'r') as f:
    src = f.read()

marker = '    conn.close()\n    return result\n\n\n@app.get("/api/ai_analysis/{ts_code}/{date}")'

if marker in src:
    src = src.replace(marker, insert_content + marker, 1)
    print('Patch applied.')
else:
    print('ERROR: marker not found!')
    import sys; sys.exit(1)

with open(path, 'w') as f:
    f.write(src)

import ast
try:
    ast.parse(src)
    print('Syntax OK')
except SyntaxError as e:
    print(f'Syntax ERROR: {e}')
