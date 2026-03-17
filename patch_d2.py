#!/opt/ashare_venv/bin/python
"""Patch watchlist_entry/signal/exit for lifecycle_status support."""

def patch(filepath, patches):
    with open(filepath, 'r') as fh:
        content = fh.read()
    for old, new in patches:
        if old not in content:
            print(f"  WARNING: marker not found in {filepath}: {repr(old[:80])}")
            continue
        content = content.replace(old, new, 1)
    with open(filepath, 'w') as fh:
        fh.write(content)
    print(f"  OK: {filepath}")


# ============================================================
# 1. watchlist_entry.py — add lifecycle_status='candidate' to INSERT
# ============================================================
print("=== 1. watchlist_entry.py ===")
patch('/opt/watchlist_entry.py', [
    # Add lifecycle_status to INSERT column list
    (
        "             entry_rank, baseline_vol_wan)",
        "             entry_rank, baseline_vol_wan, lifecycle_status, lifecycle_updated_at)"
    ),
    # Add value placeholders
    (
        "        VALUES (%s, %s, %s, %s, %s, %s, %s)",
        "        VALUES (%s, %s, %s, %s, %s, %s, %s, 'candidate', NOW())"
    ),
])


# ============================================================
# 2. watchlist_signal.py — set lifecycle_status='signaled' when buy_signal detected
# ============================================================
print("=== 2. watchlist_signal.py ===")
patch('/opt/watchlist_signal.py', [
    # In the UPDATE that writes signals, add lifecycle_status
    (
        "                UPDATE public.ashare_watchlist SET\n"
        "                    buy_signal = %s,\n"
        "                    sell_signal = %s,\n"
        "                    signal_date = %s,\n"
        "                    updated_at = now()\n"
        "                WHERE id = %s\n"
        '            """, (u["buy_signal"], u["sell_signal"], trade_date, u["id"]))',

        "                UPDATE public.ashare_watchlist SET\n"
        "                    buy_signal = %s,\n"
        "                    sell_signal = %s,\n"
        "                    signal_date = %s,\n"
        "                    lifecycle_status = CASE WHEN %s IS NOT NULL THEN 'signaled' ELSE lifecycle_status END,\n"
        "                    lifecycle_updated_at = CASE WHEN %s IS NOT NULL THEN NOW() ELSE lifecycle_updated_at END,\n"
        "                    updated_at = now()\n"
        "                WHERE id = %s\n"
        '            """, (u["buy_signal"], u["sell_signal"], trade_date, u["buy_signal"], u["buy_signal"], u["id"]))'
    ),
])


# ============================================================
# 3. watchlist_exit.py — set lifecycle_status='retired' on exit
# ============================================================
print("=== 3. watchlist_exit.py ===")
patch('/opt/watchlist_exit.py', [
    # In apply_exit function, add lifecycle fields to the UPDATE
    (
        "            status = 'exited',\n"
        "            exit_date = %s,\n"
        "            exit_reason = %s,\n"
        "            exit_price = %s,\n"
        "            pnl_pct = %s,\n"
        "            updated_at = now()\n"
        "        WHERE id = %s\n"
        '    """, (trade_date, exit_reason, latest_close, pnl_pct, rec_id))',

        "            status = 'exited',\n"
        "            exit_date = %s,\n"
        "            exit_reason = %s,\n"
        "            exit_price = %s,\n"
        "            pnl_pct = %s,\n"
        "            lifecycle_status = 'retired',\n"
        "            retired_reason = %s,\n"
        "            lifecycle_updated_at = NOW(),\n"
        "            updated_at = now()\n"
        "        WHERE id = %s\n"
        '    """, (trade_date, exit_reason, latest_close, pnl_pct, exit_reason, rec_id))'
    ),
])


print("\n=== All D2 patches applied ===")
