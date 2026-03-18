"""
Transform main.py: structural refactoring per the optimization spec.
- Insert common utilities after get_db()
- Delete deprecated endpoints (ignite, continuation, ignite_v2, continuation_v2, green10)
- Delete duplicate portfolio routes (simplified versions)
- Remove duplicate imports and helper definitions
- Replace _dec_signals.Decimal → _decimal_mod.Decimal
- Replace _td(hours= → timedelta(hours=
- Replace serialization loops with _serialize_rows/_serialize_row
- Replace local STRATEGY_CN with global reference
- Update section comments
"""

import re

with open("main.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

# Work with 1-indexed line numbers for clarity
# lines[0] is line 1

def find_line(text, start=0):
    """Find first line containing text, return 0-based index."""
    for i in range(start, len(lines)):
        if text in lines[i]:
            return i
    return -1

def find_function_end(start_idx):
    """Find end of a function/route handler starting at start_idx (0-based).
    Returns the last line index (inclusive) of the function."""
    # Find the def line or decorator
    # Then find next line at same or lesser indent (or next decorator/def/comment block)
    in_func = False
    func_indent = None
    last_content = start_idx

    for i in range(start_idx, len(lines)):
        line = lines[i]
        stripped = line.rstrip('\n\r')

        if stripped.startswith('def ') or stripped.startswith('async def '):
            in_func = True
            # measure indent of the def
            func_indent = len(line) - len(line.lstrip())
            last_content = i
            continue

        if in_func:
            if stripped == '' or stripped.isspace():
                # blank line - could be end or middle
                continue

            current_indent = len(line) - len(line.lstrip())
            if current_indent <= func_indent and not stripped.startswith('#'):
                # We've exited the function
                return last_content
            last_content = i

    return last_content


def find_endpoint_range(decorator_line_idx):
    """Given a decorator @app.get/post/etc line, find the full range including
    decorator and function body. Returns (start, end) 0-based inclusive."""
    start = decorator_line_idx
    # Find the def line
    def_idx = start
    for i in range(start, min(start + 5, len(lines))):
        if lines[i].strip().startswith('def ') or lines[i].strip().startswith('async def '):
            def_idx = i
            break

    # Now find where the function body ends
    # Look for next non-blank line at indent 0 (next function, decorator, or section comment)
    func_body_indent = None
    end = def_idx

    for i in range(def_idx + 1, len(lines)):
        stripped = lines[i].rstrip('\n\r')

        if stripped == '' or stripped.isspace():
            continue

        # Detect indent
        indent = len(lines[i]) - len(lines[i].lstrip())

        if indent == 0:
            # Top-level item: this is past our function
            # Back up to include trailing blank lines? No, return last content line
            end = i - 1
            # Skip trailing blanks
            while end > def_idx and lines[end].strip() == '':
                end -= 1
            return (start, end)

        end = i

    return (start, end)


# ============================================================
# Step 1: Mark lines for deletion
# ============================================================
delete_set = set()

# 2B: Delete deprecated endpoints
# 1) get_ignite: lines 27-52 (0-based: 26-51)
r = find_endpoint_range(26)  # @app.get("/api/ignite/{date}")
print(f"get_ignite: lines {r[0]+1}-{r[1]+1}")
for i in range(r[0], r[1]+1):
    delete_set.add(i)

# 2) get_continuation: lines 54-71 (0-based: 53-70)
idx = find_line('@app.get("/api/continuation/{date}")')
r = find_endpoint_range(idx)
print(f"get_continuation: lines {r[0]+1}-{r[1]+1}")
for i in range(r[0], r[1]+1):
    delete_set.add(i)

# 3) get_ignite_v2: lines 227-268 (0-based: 226-267)
idx = find_line('@app.get("/api/ignite/v2/{date}")')
r = find_endpoint_range(idx)
print(f"get_ignite_v2: lines {r[0]+1}-{r[1]+1}")
for i in range(r[0], r[1]+1):
    delete_set.add(i)

# 4) get_continuation_v2: lines 270-302 (0-based: 269-301)
idx = find_line('@app.get("/api/continuation/v2/{date}")')
r = find_endpoint_range(idx)
print(f"get_continuation_v2: lines {r[0]+1}-{r[1]+1}")
for i in range(r[0], r[1]+1):
    delete_set.add(i)

# 5) get_pattern_green10: lines 158-173 (0-based: 157-172)
idx = find_line('@app.get("/api/pattern/green10/{date}")')
r = find_endpoint_range(idx)
print(f"get_pattern_green10: lines {r[0]+1}-{r[1]+1}")
for i in range(r[0], r[1]+1):
    delete_set.add(i)


# 2C: Delete duplicate portfolio routes
# Duplicate GET /api/portfolio (simplified, ~lines 679-704)
idx = find_line('# ── 持仓管理 API ──')
print(f"持仓管理 API comment at line {idx+1}")
# Delete from comment through the simplified get_portfolio() and add_portfolio()
# Find the end of add_portfolio (simplified), which is before @app.delete
delete_idx = find_line('@app.delete("/api/portfolio/{portfolio_id}")')
print(f"DELETE /api/portfolio at line {delete_idx+1}")
# Delete from 持仓管理 comment through line before @app.delete
for i in range(idx, delete_idx):
    delete_set.add(i)

# Also delete blank line before 持仓管理 if present
if idx > 0 and lines[idx-1].strip() == '':
    delete_set.add(idx-1)


# 2D: Delete duplicate imports
# import decimal as _dec_signals (line 1249, 0-based 1248)
idx = find_line('import decimal as _dec_signals')
if idx >= 0:
    print(f"_dec_signals import at line {idx+1}")
    delete_set.add(idx)

# from datetime import datetime, timezone, timedelta (line 1504, 0-based 1503)
idx = find_line('from datetime import datetime, timezone, timedelta', 1500)
if idx >= 0 and 'as _td' not in lines[idx]:
    print(f"datetime import (no alias) at line {idx+1}")
    delete_set.add(idx)

# from datetime import datetime, timezone, timedelta as _td (line 1847)
idx = find_line('from datetime import datetime, timezone, timedelta as _td')
if idx >= 0:
    print(f"datetime import (with _td alias) at line {idx+1}")
    delete_set.add(idx)

# import json as _json_mod (line 1848)
idx = find_line('import json as _json_mod')
if idx >= 0:
    print(f"json import at line {idx+1}")
    delete_set.add(idx)

# import decimal as _decimal_mod (line 1849)
idx = find_line('import decimal as _decimal_mod')
if idx >= 0:
    print(f"decimal import at line {idx+1}")
    delete_set.add(idx)


# 2D: Delete duplicate helper function definitions (lines 1852-1881)
# _resolve_trade_date, _prev_trade_date, _dec, _now_cn
# These are between the imports we just deleted and _fetch_risk_block
idx_start = find_line('def _resolve_trade_date(cur, trade_date_str=None):')
idx_end = find_line('def _fetch_risk_block(')
if idx_start >= 0 and idx_end >= 0:
    print(f"Helper functions to delete: lines {idx_start+1}-{idx_end}")
    for i in range(idx_start, idx_end):
        delete_set.add(i)


# ============================================================
# Step 2: Build new content with deletions applied
# ============================================================
new_lines = []
for i, line in enumerate(lines):
    if i in delete_set:
        continue
    new_lines.append(line)

content = ''.join(new_lines)

# ============================================================
# Step 3: Insert common utilities after get_db()
# ============================================================
COMMON_UTILS = '''
# ════════════════════════════════════════════════════════════════
# Common Utilities
# ════════════════════════════════════════════════════════════════
import decimal as _decimal_mod
import json as _json_mod
from datetime import datetime, timezone, timedelta

def _dec(v):
    """Convert Decimal/numeric to float, None stays None."""
    if v is None:
        return None
    if isinstance(v, _decimal_mod.Decimal):
        return float(v)
    return v

def _serialize_row(row):
    """Serialize a single RealDictRow: Decimal→float, date/datetime→str."""
    if row is None:
        return None
    d = {}
    for k, v in (row.items() if hasattr(row, 'items') else dict(row).items()):
        if isinstance(v, _decimal_mod.Decimal):
            d[k] = float(v)
        elif hasattr(v, 'isoformat'):
            d[k] = v.isoformat()
        else:
            d[k] = v
    return d

def _serialize_rows(rows):
    """Serialize a list of RealDictRows."""
    return [_serialize_row(r) for r in rows]

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

def _now_cn():
    """Current time ISO8601 +08:00."""
    tz8 = timezone(timedelta(hours=8))
    return datetime.now(tz8).strftime('%Y-%m-%dT%H:%M:%S+08:00')

# Strategy Chinese name mapping (single source of truth)
STRATEGY_CN = {
    "VOL_SURGE": "连续放量蓄势",
    "RETOC2": "第4次异动",
    "PATTERN_T2UP9": "T-2大涨蓄势",
    "WEAK_BUY": "弱市吸筹",
}

'''

# Insert after get_db() function, before @app.get("/api/health")
content = content.replace(
    '    return conn\n\n@app.get("/api/health")',
    '    return conn\n' + COMMON_UTILS + '@app.get("/api/health")'
)


# ============================================================
# Step 4: Replace _dec_signals.Decimal with _decimal_mod.Decimal
# ============================================================
content = content.replace('_dec_signals.Decimal', '_decimal_mod.Decimal')


# ============================================================
# Step 5: Replace _td(hours= with timedelta(hours=
# ============================================================
content = content.replace('_td(hours=', 'timedelta(hours=')


# ============================================================
# Step 6: Replace serialization loops with _serialize_rows/_serialize_row
# ============================================================

# Pattern A: Full serialization (Decimal + isoformat)
# Matches the multi-line pattern:
#   out = []
#   for r in rows:
#       d = {}
#       for k, v in r.items():
#           if isinstance(v, _decimal_mod.Decimal):
#               d[k] = float(v)
#           elif hasattr(v, 'isoformat'):
#               d[k] = v.isoformat()
#           else:
#               d[k] = v
#       out.append(d)

pattern_full = re.compile(
    r'(\s+)(out|result) = \[\]\n'
    r'\1for r in (\w+):\n'
    r'\1    d = \{\}\n'
    r'\1    for k, v in r\.items\(\):\n'
    r'\1        if isinstance\(v, _decimal_mod\.Decimal\):\n'
    r'\1            d\[k\] = float\(v\)\n'
    r'\1        elif hasattr\(v, \'isoformat\'\):\n'
    r'\1            d\[k\] = v\.isoformat\(\)\n'
    r'\1        else:\n'
    r'\1            d\[k\] = v\n'
    r'\1    out\.append\(d\)\n',
    re.MULTILINE
)

def replace_full(m):
    indent = m.group(1)
    varname = m.group(2)
    rows_var = m.group(3)
    return f'{indent}{varname} = _serialize_rows({rows_var})\n'

content = pattern_full.sub(replace_full, content)

# Pattern B: Decimal-only serialization (no isoformat branch)
pattern_dec_only = re.compile(
    r'(\s+)(out) = \[\]\n'
    r'\1for r in (\w+):\n'
    r'\1    d = \{\}\n'
    r'\1    for k, v in r\.items\(\):\n'
    r'\1        d\[k\] = float\(v\) if isinstance\(v, _decimal_mod\.Decimal\) else v\n'
    r'\1    out\.append\(d\)\n',
    re.MULTILINE
)

def replace_dec_only(m):
    indent = m.group(1)
    varname = m.group(2)
    rows_var = m.group(3)
    return f'{indent}{varname} = _serialize_rows({rows_var})\n'

content = pattern_dec_only.sub(replace_dec_only, content)

# Pattern C: _serialize_row for single row (get_risk_score_detail)
# result = {}
# for k, v in row.items():
#     if isinstance(v, _decimal_mod.Decimal):
#         result[k] = float(v)
#     elif hasattr(v, 'isoformat'):
#         result[k] = v.isoformat()
#     else:
#         result[k] = v
pattern_single = re.compile(
    r'(\s+)result = \{\}\n'
    r'\1for k, v in row\.items\(\):\n'
    r'\1    if isinstance\(v, _decimal_mod\.Decimal\):\n'
    r'\1        result\[k\] = float\(v\)\n'
    r'\1    elif hasattr\(v, \'isoformat\'\):\n'
    r'\1        result\[k\] = v\.isoformat\(\)\n'
    r'\1    else:\n'
    r'\1        result\[k\] = v\n',
    re.MULTILINE
)

content = pattern_single.sub(lambda m: f'{m.group(1)}result = _serialize_row(row)\n', content)

# Pattern D: Signal-style Decimal-only with dict(r)
# data = []
# for r in rows:
#     d = {}
#     for k, v in dict(r).items():
#         d[k] = float(v) if isinstance(v, _decimal_mod.Decimal) else v
#     data.append(d)
pattern_signal = re.compile(
    r'(\s+)(data) = \[\]\n'
    r'\1for r in (\w+):\n'
    r'\1    d = \{\}\n'
    r'\1    for k, v in dict\(r\)\.items\(\):\n'
    r'\1        d\[k\] = float\(v\) if isinstance\(v, _decimal_mod\.Decimal\) else v\n'
    r'\1    data\.append\(d\)\n',
    re.MULTILINE
)

content = pattern_signal.sub(lambda m: f'{m.group(1)}{m.group(2)} = _serialize_rows({m.group(3)})\n', content)

# Pattern E: pipeline_runs has isoformat-only (no Decimal check)
# out = []
# for r in rows:
#     d = {}
#     for k, v in r.items():
#         if hasattr(v, 'isoformat'):
#             d[k] = v.isoformat()
#         else:
#             d[k] = v
#     out.append(d)
pattern_isoformat_only = re.compile(
    r'(\s+)(out) = \[\]\n'
    r'\1for r in (\w+):\n'
    r'\1    d = \{\}\n'
    r'\1    for k, v in r\.items\(\):\n'
    r'\1        if hasattr\(v, \'isoformat\'\):\n'
    r'\1            d\[k\] = v\.isoformat\(\)\n'
    r'\1        else:\n'
    r'\1            d\[k\] = v\n'
    r'\1    out\.append\(d\)\n',
    re.MULTILINE
)

content = pattern_isoformat_only.sub(lambda m: f'{m.group(1)}{m.group(2)} = _serialize_rows({m.group(3)})\n', content)


# ============================================================
# Step 7: sim_checks special case - has extra logic after serialize
# The sim_checks pattern has additional d[...] = ... lines after the inner loop
# Handle it separately if not caught by the generic pattern
# ============================================================
# The sim_checks serialization loop is special because after the inner for loop,
# it adds extra fields before out.append(d). We handle this by replacing just
# the serialize part and keeping the extra assignments.
# Pattern:
#         out = []
#         for r in risk_rows:
#             d = {}
#             for k, v in r.items():
#                 if isinstance(v, _decimal_mod.Decimal):
#                     d[k] = float(v)
#                 elif hasattr(v, 'isoformat'):
#                     d[k] = v.isoformat()
#                 else:
#                     d[k] = v
#
#             # parse detail_json ...
#             ...
#             out.append(d)
# This one likely wasn't caught by the generic pattern because of extra code
# between the inner loop and out.append. Let's check if it was replaced.
# If "for r in risk_rows:" still appears with the old pattern, replace manually.

sim_checks_old = '''        out = []
        for r in risk_rows:
            d = {}
            for k, v in r.items():
                if isinstance(v, _decimal_mod.Decimal):
                    d[k] = float(v)
                elif hasattr(v, 'isoformat'):
                    d[k] = v.isoformat()
                else:
                    d[k] = v

            # parse detail_json for granular checks'''

sim_checks_new = '''        out = []
        for r in risk_rows:
            d = _serialize_row(r)

            # parse detail_json for granular checks'''

content = content.replace(sim_checks_old, sim_checks_new)


# ============================================================
# Step 8: Replace local STRATEGY_CN definitions with global ref
# ============================================================

# Pattern in get_dashboard_action_list (~line 3455-3460)
content = content.replace(
    '''        # ── buy ──
        STRATEGY_CN = {
            "VOL_SURGE": "连续放量蓄势", "RETOC2": "第4次异动",
            "PATTERN_T2UP9": "T-2大涨蓄势", "PATTERN_GREEN10": "近10日阳线",
            "IGNITE": "放量蓄势",
        }''',
    '        # ── buy ──'
)

# Pattern in get_watchlist_pre_check (~line 3547-3551)
content = content.replace(
    '''    STRATEGY_CN = {
        "VOL_SURGE": "连续放量蓄势", "RETOC2": "第4次异动",
        "PATTERN_T2UP9": "T-2大涨蓄势", "PATTERN_GREEN10": "近10日阳线",
        "IGNITE": "放量蓄势",
    }
    conn = get_db()''',
    '    conn = get_db()'
)

# Pattern in get_portfolio_concentration (~line 3655-3660)
content = content.replace(
    '''    STRATEGY_CN = {
        "VOL_SURGE": "连续放量蓄势", "RETOC2": "第4次异动",
        "PATTERN_T2UP9": "T-2大涨蓄势", "PATTERN_GREEN10": "近10日阳线",
        "IGNITE": "放量蓄势",
    }
    conn = get_db()''',
    '    conn = get_db()'
)


# ============================================================
# Step 9: Update section comments
# ============================================================

# Replace old section headers with clean ones
replacements = [
    # Watchlist & Portfolio APIs
    (
        '# ============================================================\n# Watchlist & Portfolio APIs — 2026-03-03\n# ============================================================',
        '# ═══ Watchlist APIs ═══'
    ),
    # Signal & Portfolio Summary APIs
    (
        '# ════════════════════════════════════════════════════════════════\n# Signal & Portfolio Summary APIs\n# ════════════════════════════════════════════════════════════════',
        '# ═══ Signal APIs ═══'
    ),
    # Dashboard Summary API
    (
        '# ════════════════════════════════════════════════════════════════\n# Dashboard Summary API\n# ════════════════════════════════════════════════════════════════',
        '# ═══ Dashboard APIs ═══'
    ),
    # Context Panel Endpoints (main - the helper functions are now at top)
    (
        '# ═══════════════════════════════════════════════════════════════════════════════\n# Context Panel Endpoints\n# ═══════════════════════════════════════════════════════════════════════════════',
        '# ═══ Context Panel APIs ═══'
    ),
    # Context Panel: Risk Detail
    (
        '# ═══════════════════════════════════════════════════════════════════════════════\n# Context Panel: Risk Detail Endpoint\n# ═══════════════════════════════════════════════════════════════════════════════',
        '# ═══ Context Panel: Risk Detail ═══'
    ),
    # Context Panel: Lifecycle
    (
        '# ═══════════════════════════════════════════════════════════════════════════════\n# Context Panel: Lifecycle Detail Endpoint\n# ═══════════════════════════════════════════════════════════════════════════════',
        '# ═══ Context Panel: Lifecycle ═══'
    ),
    # Context Panel: K-line
    (
        '# ═══════════════════════════════════════════════════════════════════════════════\n# Context Panel: K-line Endpoint\n# ═══════════════════════════════════════════════════════════════════════════════',
        '# ═══ Context Panel: K-line ═══'
    ),
    # Batch 1: Risk endpoints (first occurrence)
    (
        '# ============================================================\n# Batch 1: Risk endpoints (3)\n# ============================================================',
        '# ═══ Risk APIs ═══'
    ),
    # Batch 2: System endpoints
    (
        '# ============================================================\n# Batch 2: System endpoints (5)\n# ============================================================',
        '# ═══ System APIs ═══'
    ),
    # Batch 3: Research endpoints
    (
        '# ============================================================\n# Batch 3: Research endpoints (3)\n# ============================================================',
        '# ═══ Research APIs ═══'
    ),
    # Batch 4: Execution / Sim endpoints
    (
        '# ============================================================\n# Batch 4: Execution / Sim endpoints (3)\n# ============================================================',
        '# ═══ Execution / Sim APIs ═══'
    ),
    # System Audit API
    (
        '# ════════════════════════════════════════════════════════════════\n# System Audit API\n# ════════════════════════════════════════════════════════════════',
        '# ═══ System Audit API ═══'
    ),
    # Market Regime API
    (
        '# ════════════════════════════════════════════════════════════════\n# Market Regime API\n# ════════════════════════════════════════════════════════════════',
        '# ═══ Market Regime API ═══'
    ),
    # Dashboard Action List API
    (
        '# ════════════════════════════════════════════════════════════════\n# Dashboard Action List API\n# ════════════════════════════════════════════════════════════════',
        '# ═══ Dashboard Action List API ═══'
    ),
    # Watchlist Pre-Check API
    (
        '# ════════════════════════════════════════════════════════════════\n# Watchlist Pre-Check API\n# ════════════════════════════════════════════════════════════════',
        '# ═══ Watchlist Pre-Check API ═══'
    ),
    # Portfolio Concentration API
    (
        '# ════════════════════════════════════════════════════════════════\n# Portfolio Concentration API\n# ════════════════════════════════════════════════════════════════',
        '# ═══ Portfolio Concentration API ═══'
    ),
    # Sim Execution Checks API
    (
        '# ════════════════════════════════════════════════════════════════\n# Sim Execution Checks API\n# ════════════════════════════════════════════════════════════════',
        '# ═══ Sim Execution Checks API ═══'
    ),
    # Concept Board API
    (
        '# ════════════════════════════════════════════════════════════════\n# Concept Board API (人工概念板块)\n# ════════════════════════════════════════════════════════════════',
        '# ═══ Concept Board APIs ═══'
    ),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        print(f"Replaced section: {new}")
    else:
        print(f"WARNING: Section not found: {new}")

# The second "Batch 1: Risk endpoints (3)" is now also "Risk APIs" after first replacement
# It should already be replaced. If there's a duplicate, handle it.
# After our first replacement, both got replaced to the same thing.
# We want the second occurrence to just be removed (it's a duplicate header for top_scores)
# Check if there are two consecutive "# ═══ Risk APIs ═══"
content = content.replace('# ═══ Risk APIs ═══\n\n# ═══ Risk APIs ═══', '# ═══ Risk APIs ═══')
# Also handle case with different spacing
lines_check = content.split('\n')
new_lines_check = []
skip_next_risk = False
seen_risk = False
for i, line in enumerate(lines_check):
    if '# ═══ Risk APIs ═══' in line:
        if seen_risk:
            # Skip this duplicate
            continue
        seen_risk = True
    new_lines_check.append(line)
content = '\n'.join(new_lines_check)


# ============================================================
# Step 10: Clean up multiple blank lines (max 2 consecutive)
# ============================================================
content = re.sub(r'\n{4,}', '\n\n\n', content)

# ============================================================
# Step 11: Remove the "# ── VOL_SURGE 放量蓄势 API ──" comment that was after the deleted duplicate section
# Actually, check if it's still there and properly placed
# ============================================================
# The "# ── VOL_SURGE" comment should still be there after the DELETE endpoint - that's fine


# ============================================================
# Verification
# ============================================================
final_lines = content.split('\n')
print(f"\nFinal line count: {len(final_lines)}")

# Check no deprecated endpoints remain
for bad in ['/api/ignite/{date}', '/api/ignite/v2/{date}', '/api/continuation/{date}',
            '/api/continuation/v2/{date}', '/api/pattern/green10/{date}']:
    if bad in content:
        print(f"WARNING: {bad} still in file!")
    else:
        print(f"OK: {bad} removed")

# Check no duplicate imports remain
if content.count('import decimal as _dec_signals') > 0:
    print("WARNING: _dec_signals still present")
if content.count('_dec_signals') > 0:
    print("WARNING: _dec_signals references still present")

# Check _serialize_rows is used
count_sr = content.count('_serialize_rows')
count_s1 = content.count('_serialize_row')
print(f"_serialize_rows usage: {count_sr}")
print(f"_serialize_row usage: {count_s1} (includes _serialize_rows)")

# Write output
with open("main.py", "w", encoding="utf-8") as f:
    f.write(content)

print("\nDone! main.py has been transformed.")
