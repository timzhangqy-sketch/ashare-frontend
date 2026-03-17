#!/opt/ashare_venv/bin/python
"""patch_lifecycle.py - Add lifecycle logging to 5 pipeline scripts."""


def patch(filepath, patches):
    with open(filepath, 'r') as fh:
        content = fh.read()
    for old, new in patches:
        if old not in content:
            print(f"  WARNING: marker not found in {filepath}: {repr(old[:80])}")
            continue
        n = content.count(old)
        if n > 1:
            print(f"  WARNING: marker found {n} times, replacing first: {repr(old[:60])}")
        content = content.replace(old, new, 1)
    with open(filepath, 'w') as fh:
        fh.write(content)
    print(f"  OK: {filepath}")


# ============================================================
# 1. watchlist_entry.py
# ============================================================
print("=== 1. watchlist_entry.py ===")
patch('/opt/watchlist_entry.py', [
    # Import (sys already imported at line 27)
    (
        "import psycopg2.extras\n",
        "import psycopg2.extras\n"
        "sys.path.insert(0, '/opt')\n"
        "from lib.state_machine import log_lifecycle_event\n"
    ),
    # After successful insert — marker: "inserted += cur.rowcount"
    (
        "        inserted += cur.rowcount\n",
        "        inserted += cur.rowcount\n"
        "        if cur.rowcount > 0:\n"
        "            log_lifecycle_event(conn, ts_code=r[0], event_type='watchlist_entry',\n"
        "                from_status=None, to_status='active', event_source='watchlist_entry',\n"
        "                trade_date=str(trade_date),\n"
        "                event_payload_json={'strategy': r[1], 'entry_price': float(r[3]) if r[3] else None})\n"
    ),
])


# ============================================================
# 2. watchlist_signal.py
# ============================================================
print("=== 2. watchlist_signal.py ===")
patch('/opt/watchlist_signal.py', [
    # Import (no sys import yet)
    (
        "import psycopg2.extras\n",
        "import psycopg2.extras\n"
        "import sys; sys.path.insert(0, '/opt')\n"
        "from lib.state_machine import log_lifecycle_event\n"
    ),
    # After signal UPDATE — marker: the execute params line
    (
        '            """, (u["buy_signal"], u["sell_signal"], trade_date, u["id"]))\n',
        '            """, (u["buy_signal"], u["sell_signal"], trade_date, u["id"]))\n'
        '            if u["buy_signal"]:\n'
        "                log_lifecycle_event(conn, ts_code=u['ts_code'], event_type='signal_fired',\n"
        "                    from_status='active', to_status='active', event_source='watchlist_signal',\n"
        "                    trade_date=str(trade_date),\n"
        "                    event_payload_json={'buy_signal': u['buy_signal'], 'signal_date': str(trade_date)})\n"
    ),
])


# ============================================================
# 3. watchlist_exit.py
# ============================================================
print("=== 3. watchlist_exit.py ===")
patch('/opt/watchlist_exit.py', [
    # Import (no sys import)
    (
        "import psycopg2.extras\n",
        "import psycopg2.extras\n"
        "import sys; sys.path.insert(0, '/opt')\n"
        "from lib.state_machine import log_lifecycle_event\n"
    ),
    # After apply_exit call — marker: the multi-line call
    (
        '                apply_exit(conn, e["id"], trade_date, e["reason"],\n'
        '                           e["latest_close"], e["entry_price"])\n',

        '                apply_exit(conn, e["id"], trade_date, e["reason"],\n'
        '                           e["latest_close"], e["entry_price"])\n'
        "                log_lifecycle_event(conn, ts_code=e['ts_code'], event_type='watchlist_exit',\n"
        "                    from_status='active', to_status='exited', event_source='watchlist_exit',\n"
        "                    watchlist_id=e['id'], trade_date=str(trade_date),\n"
        "                    event_payload_json={'exit_reason': e['reason'],\n"
        "                        'exit_price': float(e['latest_close']) if e['latest_close'] else None,\n"
        "                        'pnl_pct': e['gain']})\n"
    ),
])


# ============================================================
# 4. sell_signal_engine.py
# ============================================================
print("=== 4. sell_signal_engine.py ===")
patch('/opt/sell_signal_engine.py', [
    # Import (sys already imported at line 14)
    (
        "import psycopg2\n",
        "import psycopg2\n"
        "sys.path.insert(0, '/opt')\n"
        "from lib.state_machine import log_lifecycle_event\n"
    ),
    # Change function signature to accept trade_date
    (
        "def apply_signals(conn, triggered, dry_run):\n",
        "def apply_signals(conn, triggered, dry_run, trade_date=None):\n"
    ),
    # After UPDATE in apply_signals
    (
        """            \"\"\", (sig['signal'], sig['reason'], pos['id']))\n""",
        """            \"\"\", (sig['signal'], sig['reason'], pos['id']))\n"""
        "            log_lifecycle_event(conn, ts_code=pos['ts_code'], event_type='sell_signal',\n"
        "                from_status='open', to_status='open', event_source='sell_signal_engine',\n"
        "                portfolio_id=pos['id'], trade_date=trade_date,\n"
        "                event_payload_json={'signal': sig['signal'], 'reason': sig['reason']})\n"
    ),
    # Change call site to pass trade_date
    (
        "        apply_signals(conn, triggered, dry_run=False)\n",
        "        apply_signals(conn, triggered, dry_run=False, trade_date=td_sql)\n"
    ),
])


# ============================================================
# 5. sim_engine.py
# ============================================================
print("=== 5. sim_engine.py ===")

# Build rejection patches: 5 rejection reasons
reject_reasons = [
    ('停牌或无数据', '停牌或无数据'),
    ('流动性不足', '流动性不足'),
    ('一字涨停', '一字涨停'),
    ('现金不足', '现金不足'),
    ('一字跌停', '一字跌停'),
]

sim_patches = [
    # Import (sys already imported at line 13)
    (
        "import psycopg2\n",
        "import psycopg2\n"
        "sys.path.insert(0, '/opt')\n"
        "from lib.state_machine import log_lifecycle_event\n"
    ),
]

# 5 rejection patches
for reason, reason_str in reject_reasons:
    old = (
        f"                    SET status='rejected', reject_reason='{reason}', updated_at=NOW()\n"
        f"                    WHERE id=%s\n"
        f'                """, (order_id,))\n'
    )
    new = (
        f"                    SET status='rejected', reject_reason='{reason}', updated_at=NOW()\n"
        f"                    WHERE id=%s\n"
        f'                """, (order_id,))\n'
        f"                log_lifecycle_event(conn, ts_code=ts_code, event_type='order_rejected',\n"
        f"                    from_status='pending', to_status='rejected', event_source='sim_engine',\n"
        f"                    trade_date=trade_date_sql,\n"
        f"                    event_payload_json={{'reason': '{reason_str}', 'order_id': order_id}})\n"
    )
    sim_patches.append((old, new))

# Filled order patch
sim_patches.append((
    "            \"\"\", (trade_date_sql, fill_price, fill_shares, fill_amount, slip, order_id))\n",
    "            \"\"\", (trade_date_sql, fill_price, fill_shares, fill_amount, slip, order_id))\n"
    "            log_lifecycle_event(conn, ts_code=ts_code, event_type='order_filled',\n"
    "                from_status='pending', to_status='filled', event_source='sim_engine',\n"
    "                trade_date=trade_date_sql,\n"
    "                event_payload_json={'fill_price': fill_price, 'fill_amount': fill_amount,\n"
    "                    'direction': direction, 'order_id': order_id})\n"
))

# Portfolio opened (BUY fill in step2)
sim_patches.append((
    "                  f['fill_price'], f['fill_amount']))\n",
    "                  f['fill_price'], f['fill_amount']))\n"
    "            log_lifecycle_event(conn, ts_code=f['ts_code'], event_type='position_opened',\n"
    "                from_status=None, to_status='open', event_source='sim_engine',\n"
    "                trade_date=trade_date_sql,\n"
    "                event_payload_json={'open_price': f['fill_price'], 'shares': f['fill_shares'],\n"
    "                    'strategy': f['strategy']})\n"
))

# Portfolio closed (SELL fill in step2)
sim_patches.append((
    "                \"\"\", (trade_date_sql, f['fill_price'], realized_pnl, realized_pnl_pct, pos_id))\n",
    "                \"\"\", (trade_date_sql, f['fill_price'], realized_pnl, realized_pnl_pct, pos_id))\n"
    "                log_lifecycle_event(conn, ts_code=f['ts_code'], event_type='position_closed',\n"
    "                    from_status='open', to_status='closed', event_source='sim_engine',\n"
    "                    portfolio_id=pos_id, trade_date=trade_date_sql,\n"
    "                    event_payload_json={'close_price': f['fill_price'],\n"
    "                        'realized_pnl': realized_pnl, 'realized_pnl_pct': realized_pnl_pct})\n"
))

# SELL order created (step3)
sim_patches.append((
    "                  so['strategy'], so['signal_type']))\n",
    "                  so['strategy'], so['signal_type']))\n"
    "            log_lifecycle_event(conn, ts_code=so['ts_code'], event_type='order_created',\n"
    "                from_status=None, to_status='pending', event_source='sim_engine',\n"
    "                trade_date=trade_date_sql,\n"
    "                event_payload_json={'direction': 'SELL', 'shares': so['shares'],\n"
    "                    'signal_type': so['signal_type']})\n"
))

# BUY order created (step3)
sim_patches.append((
    "                  b['strategy'], b['signal_type'], b['wl_id']))\n",
    "                  b['strategy'], b['signal_type'], b['wl_id']))\n"
    "            log_lifecycle_event(conn, ts_code=b['ts_code'], event_type='order_created',\n"
    "                from_status=None, to_status='pending', event_source='sim_engine',\n"
    "                trade_date=trade_date_sql,\n"
    "                event_payload_json={'direction': 'BUY', 'shares': b['shares'],\n"
    "                    'amount': round(b['amount'], 2), 'signal_type': b['signal_type']})\n"
))

patch('/opt/sim_engine.py', sim_patches)

print("\n=== All patches applied ===")
