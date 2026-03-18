#!/usr/bin/env python3
"""Optimization 3: Merge context.py watchlist queries."""

path = "/opt/ashare-api/routers/context.py"
with open(path, "r") as f:
    content = f.read()

# 1. Replace strategies block with pre-fetch + simplified strategies
old_strategies_header = '''        # ════════════════════════════════════════════════════════
        # strategies
        # ════════════════════════════════════════════════════════
        strategies = None
        try:
            cur.execute("""
                SELECT strategy, buy_signal FROM ashare_watchlist
                WHERE ts_code = %s AND status = 'active'
                ORDER BY entry_date ASC
            """, (ts_code,))
            wl_rows = cur.fetchall()
            source_strategies = [r["strategy"] for r in wl_rows]
            latest_signal = None
            for r in wl_rows:
                if r.get("buy_signal"):
                    latest_signal = r["buy_signal"]

            strategies = {
                "source_strategy_primary": source_strategies[0] if source_strategies else None,
                "source_strategies": source_strategies,
                "cross_strategy_count": len(source_strategies) if len(source_strategies) > 1 else 0,
                "cross_strategy_tags": source_strategies if len(source_strategies) > 1 else [],
                "latest_signal_type": latest_signal,
                "signal_strength": None,
            }
        except Exception as e:
            partial_blocks.append("strategies")
            strategies = None'''

new_strategies_block = '''        # ═══ Pre-fetch watchlist rows (used by strategies, watchlist_context, signal_context) ═══
        _wl_rows = []
        try:
            cur.execute("""
                SELECT strategy, buy_signal, sell_signal, signal_date::text AS signal_date,
                       status AS watchlist_status, pool_day, gain_since_entry,
                       entry_date::text AS entry_date
                FROM ashare_watchlist
                WHERE ts_code = %s AND status = 'active'
                ORDER BY entry_date ASC
            """, (ts_code,))
            _wl_rows = cur.fetchall()
        except Exception:
            pass

        # ════════════════════════════════════════════════════════
        # strategies (from pre-fetched _wl_rows)
        # ════════════════════════════════════════════════════════
        strategies = None
        try:
            source_strategies = [r["strategy"] for r in _wl_rows]
            latest_signal = None
            for r in _wl_rows:
                if r.get("buy_signal"):
                    latest_signal = r["buy_signal"]
            strategies = {
                "source_strategy_primary": source_strategies[0] if source_strategies else None,
                "source_strategies": source_strategies,
                "cross_strategy_count": len(source_strategies) if len(source_strategies) > 1 else 0,
                "cross_strategy_tags": source_strategies if len(source_strategies) > 1 else [],
                "latest_signal_type": latest_signal,
                "signal_strength": None,
            }
        except Exception as e:
            partial_blocks.append("strategies")
            strategies = None'''

assert old_strategies_header in content, "Old strategies block not found!"
content = content.replace(old_strategies_header, new_strategies_block)

# 2. Replace watchlist_context block
old_wl_context = '''        # ════════════════════════════════════════════════════════
        # watchlist_context
        # ════════════════════════════════════════════════════════
        watchlist_context = None
        try:
            cur.execute("""
                SELECT status AS watchlist_status, buy_signal, sell_signal,
                       pool_day, gain_since_entry
                FROM ashare_watchlist
                WHERE ts_code = %s AND status = 'active'
                ORDER BY entry_date DESC LIMIT 1
            """, (ts_code,))
            wc = cur.fetchone()
            if wc:
                watchlist_context = {
                    "in_watchlist": True,
                    "watchlist_status": wc["watchlist_status"],
                    "buy_signal": wc["buy_signal"],
                    "sell_signal": wc["sell_signal"],
                    "pool_day": wc["pool_day"],
                    "gain_since_entry": _dec(wc["gain_since_entry"]),
                }
            else:
                watchlist_context = {
                    "in_watchlist": False,
                    "watchlist_status": None,
                    "buy_signal": None,
                    "sell_signal": None,
                    "pool_day": None,
                    "gain_since_entry": None,
                }
        except Exception as e:
            partial_blocks.append("watchlist_context")
            watchlist_context = None'''

new_wl_context = '''        # ════════════════════════════════════════════════════════
        # watchlist_context (from pre-fetched _wl_rows)
        # ════════════════════════════════════════════════════════
        watchlist_context = None
        try:
            if _wl_rows:
                wc = _wl_rows[-1]  # latest by entry_date (already sorted ASC)
                watchlist_context = {
                    "in_watchlist": True,
                    "watchlist_status": wc["watchlist_status"],
                    "buy_signal": wc["buy_signal"],
                    "sell_signal": wc["sell_signal"],
                    "pool_day": wc["pool_day"],
                    "gain_since_entry": _dec(wc["gain_since_entry"]),
                }
            else:
                watchlist_context = {
                    "in_watchlist": False,
                    "watchlist_status": None,
                    "buy_signal": None,
                    "sell_signal": None,
                    "pool_day": None,
                    "gain_since_entry": None,
                }
        except Exception as e:
            partial_blocks.append("watchlist_context")
            watchlist_context = None'''

assert old_wl_context in content, "Old watchlist_context block not found!"
content = content.replace(old_wl_context, new_wl_context)

# 3. Replace signal_context block
old_sig_context = '''        # ════════════════════════════════════════════════════════
        # signal_context
        # ════════════════════════════════════════════════════════
        signal_context = None
        try:
            cur.execute("""
                SELECT buy_signal, sell_signal, signal_date::text AS signal_date
                FROM ashare_watchlist
                WHERE ts_code = %s AND status = 'active'
            """, (ts_code,))
            sig_rows = cur.fetchall()
            buy_signals = [r["buy_signal"] for r in sig_rows if r.get("buy_signal")]
            sell_signals = [r["sell_signal"] for r in sig_rows if r.get("sell_signal")]
            signal_context = {
                "latest_buy_signals": buy_signals,
                "latest_sell_signals": sell_signals,
                "signal_reason": None,
            }
        except Exception as e:
            partial_blocks.append("signal_context")
            signal_context = None'''

new_sig_context = '''        # ════════════════════════════════════════════════════════
        # signal_context (from pre-fetched _wl_rows)
        # ════════════════════════════════════════════════════════
        signal_context = None
        try:
            buy_signals = [r["buy_signal"] for r in _wl_rows if r.get("buy_signal")]
            sell_signals = [r["sell_signal"] for r in _wl_rows if r.get("sell_signal")]
            signal_context = {
                "latest_buy_signals": buy_signals,
                "latest_sell_signals": sell_signals,
                "signal_reason": None,
            }
        except Exception as e:
            partial_blocks.append("signal_context")
            signal_context = None'''

assert old_sig_context in content, "Old signal_context block not found!"
content = content.replace(old_sig_context, new_sig_context)

with open(path, "w") as f:
    f.write(content)

assert "_wl_rows" in content, "_wl_rows not found!"
assert "Pre-fetch watchlist rows" in content, "Pre-fetch comment not found!"
print("context.py: optimization 3 applied OK")
