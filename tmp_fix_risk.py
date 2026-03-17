#!/opt/ashare_venv/bin/python
"""Fix risk block: exact match -> fallback with risk_as_of_date."""
path = '/opt/ashare-api/main.py'
with open(path, 'r') as f:
    code = f.read()

# 1. Fix risk_score query
old1 = """                SELECT trade_allowed, block_reason,
                       risk_score_total, risk_score_financial, risk_score_market,
                       risk_score_event, risk_score_compliance,
                       cap_financial, cap_market, cap_event, cap_compliance,
                       position_cap_multiplier_final, detail_json
                FROM ashare_risk_score
                WHERE ts_code = %s AND trade_date = %s
            \"\"\", (ts_code, eff_date_str))"""
new1 = """                SELECT trade_date, trade_allowed, block_reason,
                       risk_score_total, risk_score_financial, risk_score_market,
                       risk_score_event, risk_score_compliance,
                       cap_financial, cap_market, cap_event, cap_compliance,
                       position_cap_multiplier_final, detail_json
                FROM ashare_risk_score
                WHERE ts_code = %s AND trade_date <= %s
                ORDER BY trade_date DESC LIMIT 1
            \"\"\", (ts_code, eff_date_str))"""
assert old1 in code, 'Cannot find old risk query'
code = code.replace(old1, new1)

# 2. Add risk_as_of_date
old2 = """                rr = dict(rr)
                detail = rr.pop("detail_json", None) or {}
                risk = {
                    "trade_allowed": rr["trade_allowed"],"""
new2 = """                rr = dict(rr)
                risk_td = str(rr.pop("trade_date", ""))
                detail = rr.pop("detail_json", None) or {}
                risk = {
                    "risk_as_of_date": risk_td if risk_td != eff_date_str else None,
                    "trade_allowed": rr["trade_allowed"],"""
assert old2 in code, 'Cannot find old risk build'
code = code.replace(old2, new2)

# 3. Fix event_daily_snapshot query
old3 = """                        SELECT detail_json FROM ashare_event_daily_snapshot
                        WHERE ts_code = %s AND trade_date = %s
                    \"\"\", (ts_code, eff_date_str))"""
new3 = """                        SELECT detail_json FROM ashare_event_daily_snapshot
                        WHERE ts_code = %s AND trade_date <= %s
                        ORDER BY trade_date DESC LIMIT 1
                    \"\"\", (ts_code, eff_date_str))"""
assert old3 in code, 'Cannot find old snapshot query'
code = code.replace(old3, new3)

with open(path, 'w') as f:
    f.write(code)
print('OK: risk block updated with fallback logic')
