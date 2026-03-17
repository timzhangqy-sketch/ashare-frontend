#!/opt/ashare_venv/bin/python
"""Patch event_detector.py to add float detection rules 7 & 8."""
import re

path = '/opt/event_detector.py'
with open(path, 'r') as f:
    code = f.read()

# 1. Add float data loading in fetch_data()
old_fetch_end = "    return data"
new_fetch_end = """

    # 5) share_float: upcoming 90 days
    cur.execute(\"\"\"
        SELECT ts_code, float_date, float_share, float_ratio
        FROM ashare_share_float
        WHERE ts_code = ANY(%s)
          AND float_date >= %s
          AND float_date <= (%s::date + INTERVAL '90 days')
    \"\"\", (codes, trade_date_sql, trade_date_sql))
    rows = cur.fetchall()
    df_float = pd.DataFrame(rows, columns=['ts_code', 'float_date', 'float_share', 'float_ratio'])
    data['share_float'] = df_float

    return data"""
assert old_fetch_end in code, f"Cannot find fetch_data end marker"
code = code.replace(old_fetch_end, new_fetch_end)

# 2. Add Rule 7 & 8 functions before Score Calculation section
float_rules = '''
# ─── Rule 7 & 8: Large Float (解禁) ──────────────────────────────────────────

def detect_large_float(universe, data):
    """large_float_5pct / large_float_15pct: 未来90天内大比例解禁。"""
    events = []
    df = data.get('share_float')
    if df is None or len(df) == 0:
        return events

    # Aggregate max float_ratio per stock
    agg = df.groupby('ts_code')['float_ratio'].max().to_dict()

    for code in universe:
        ratio = agg.get(code)
        if ratio is None:
            continue
        if ratio >= 15:
            events.append({
                'ts_code': code,
                'event_source': 'share_float',
                'event_type': 'large_float_15pct',
                'severity': 'high',
                'action': 'cap',
                'description': f'解禁比例{ratio:.1f}%>=15%，90天内大额解禁',
                'raw_data': {'float_ratio': round(ratio, 2)},
            })
        elif ratio >= 5:
            events.append({
                'ts_code': code,
                'event_source': 'share_float',
                'event_type': 'large_float_5pct',
                'severity': 'medium',
                'action': 'cap',
                'description': f'解禁比例{ratio:.1f}%>=5%，90天内解禁',
                'raw_data': {'float_ratio': round(ratio, 2)},
            })
    return events

'''

old_score_section = '# ─── Score Calculation'
assert old_score_section in code, "Cannot find Score Calculation marker"
code = code.replace(old_score_section, float_rules + old_score_section)

# 3. Add float detection call in main() after announcement
old_ann_block = """        ann_evts = detect_announcement_events(universe, conn, trade_date_sql)
        counts['announcement'] = len(ann_evts)
        all_events.extend(ann_evts)"""

new_ann_block = """        ann_evts = detect_announcement_events(universe, conn, trade_date_sql)
        counts['announcement'] = len(ann_evts)
        all_events.extend(ann_evts)

        # Rules 7 & 8: float detection
        float_evts = detect_large_float(universe, data)
        counts['large_float'] = len(float_evts)
        all_events.extend(float_evts)"""

assert old_ann_block in code, "Cannot find announcement block in main()"
code = code.replace(old_ann_block, new_ann_block)

# 4. Update docstring
old_doc = "5种事件检测：price_action / turnover_anomaly / limit_down / st_change / pledge_surge"
new_doc = "8种事件检测：price_action / turnover_anomaly / limit_down / st_change / pledge_surge / announcement / large_float_5pct / large_float_15pct"
code = code.replace(old_doc, new_doc)

with open(path, 'w') as f:
    f.write(code)

print('OK: event_detector.py patched with float rules 7 & 8')
