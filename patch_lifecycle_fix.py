#!/opt/ashare_venv/bin/python
"""Fix 3 missed rejection patches in sim_engine.py."""

def patch(filepath, patches):
    with open(filepath, 'r') as fh:
        content = fh.read()
    for old, new in patches:
        if old not in content:
            print(f"  WARNING: marker not found: {repr(old[:80])}")
            continue
        content = content.replace(old, new, 1)
    with open(filepath, 'w') as fh:
        fh.write(content)
    print(f"  OK: {filepath}")


# These 3 rejection blocks have 24-space indent for SET and 20-space for """,
reject_fixes = []
for reason in ['一字涨停', '现金不足', '一字跌停']:
    old = (
        f"                        SET status='rejected', reject_reason='{reason}', updated_at=NOW()\n"
        f"                        WHERE id=%s\n"
        f'                    """, (order_id,))\n'
    )
    new = (
        f"                        SET status='rejected', reject_reason='{reason}', updated_at=NOW()\n"
        f"                        WHERE id=%s\n"
        f'                    """, (order_id,))\n'
        f"                    log_lifecycle_event(conn, ts_code=ts_code, event_type='order_rejected',\n"
        f"                        from_status='pending', to_status='rejected', event_source='sim_engine',\n"
        f"                        trade_date=trade_date_sql,\n"
        f"                        event_payload_json={{'reason': '{reason}', 'order_id': order_id}})\n"
    )
    reject_fixes.append((old, new))

patch('/opt/sim_engine.py', reject_fixes)
