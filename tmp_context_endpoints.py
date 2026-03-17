#!/opt/ashare_venv/bin/python
"""Append context panel endpoints to /opt/ashare-api/main.py"""

BLOCK = r'''

# ═══════════════════════════════════════════════════════════════════════════════
# Context Panel Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

from datetime import datetime, timezone, timedelta as _td
import json as _json_mod
import decimal as _decimal_mod


def _resolve_trade_date(cur, trade_date_str=None):
    """Resolve to nearest valid trade date (fallback from ashare_daily_price)."""
    if trade_date_str:
        cur.execute("SELECT MAX(trade_date) FROM ashare_daily_price WHERE trade_date <= %s", (trade_date_str,))
    else:
        cur.execute("SELECT MAX(trade_date) FROM ashare_daily_price")
    row = cur.fetchone()
    return row[0] if row and row[0] else None


def _prev_trade_date(cur, td):
    """Get previous trade date before td."""
    cur.execute("SELECT MAX(trade_date) FROM ashare_daily_price WHERE trade_date < %s", (td,))
    row = cur.fetchone()
    return row[0] if row and row[0] else None


def _dec(v):
    """Convert Decimal/numeric to float, None stays None."""
    if v is None:
        return None
    if isinstance(v, _decimal_mod.Decimal):
        return float(v)
    return v


def _now_cn():
    """Current time ISO8601 +08:00."""
    tz8 = timezone(_td(hours=8))
    return datetime.now(tz8).strftime('%Y-%m-%dT%H:%M:%S+08:00')


@app.get("/api/context/stock/{ts_code}")
def get_context_stock(ts_code: str, trade_date: str = None, source: str = None):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    partial_blocks = []

    try:
        # ── Resolve trade date ──
        eff_date = _resolve_trade_date(cur, trade_date)
        if eff_date is None:
            conn.close()
            return {"data": None, "meta": {"error": "no trade data available"}}
        eff_date_str = str(eff_date)

        # ════════════════════════════════════════════════════════
        # basic
        # ════════════════════════════════════════════════════════
        basic = None
        try:
            cur.execute("""
                SELECT ts_code, name, market, industry, list_date::text AS list_date, is_st
                FROM ashare_stock_basic WHERE ts_code = %s
            """, (ts_code,))
            row = cur.fetchone()
            if row:
                basic = dict(row)
                # concept_tags
                try:
                    cur.execute("""
                        SELECT concept_name FROM ashare_ths_concept_member
                        WHERE ts_code = %s ORDER BY concept_code
                    """, (ts_code,))
                    basic["concept_tags"] = [r["concept_name"] for r in cur.fetchall()]
                except Exception:
                    basic["concept_tags"] = []

                # source_strategy_primary
                cur.execute("""
                    SELECT strategy FROM ashare_watchlist
                    WHERE ts_code = %s AND status = 'active'
                    ORDER BY entry_date ASC LIMIT 1
                """, (ts_code,))
                sp = cur.fetchone()
                basic["source_strategy_primary"] = sp["strategy"] if sp else None

                # cross_strategy_tags
                cur.execute("""
                    SELECT DISTINCT strategy FROM ashare_watchlist
                    WHERE ts_code = %s AND status = 'active'
                """, (ts_code,))
                basic["cross_strategy_tags"] = [r["strategy"] for r in cur.fetchall()]
            else:
                # ts_code not found - return empty shell
                basic = {
                    "ts_code": ts_code, "name": None, "market": None,
                    "industry": None, "list_date": None, "is_st": None,
                    "concept_tags": [], "source_strategy_primary": None,
                    "cross_strategy_tags": []
                }
        except Exception as e:
            partial_blocks.append("basic")
            basic = None

        # ════════════════════════════════════════════════════════
        # quote
        # ════════════════════════════════════════════════════════
        quote = None
        try:
            cur.execute("""
                SELECT open, high, low, close, amount, vol
                FROM ashare_daily_price
                WHERE ts_code = %s AND trade_date = %s
            """, (ts_code, eff_date_str))
            pr = cur.fetchone()
            if pr:
                pr = dict(pr)
                # turnover_rate
                cur.execute("""
                    SELECT turnover_rate FROM ashare_daily_basic
                    WHERE ts_code = %s AND trade_date = %s
                """, (ts_code, eff_date_str))
                db_row = cur.fetchone()
                turnover_rate = _dec(db_row["turnover_rate"]) if db_row else None

                # prev_close
                prev_td = _prev_trade_date(cur, eff_date)
                prev_close = None
                if prev_td:
                    cur.execute("""
                        SELECT close FROM ashare_daily_price
                        WHERE ts_code = %s AND trade_date = %s
                    """, (ts_code, prev_td))
                    pc_row = cur.fetchone()
                    if pc_row:
                        prev_close = _dec(pc_row["close"])

                close_val = _dec(pr["close"])
                amount_val = _dec(pr["amount"])
                pct_chg = None
                if prev_close and prev_close != 0 and close_val is not None:
                    pct_chg = round((close_val - prev_close) / prev_close, 6)

                quote = {
                    "open": _dec(pr["open"]),
                    "high": _dec(pr["high"]),
                    "low": _dec(pr["low"]),
                    "close": close_val,
                    "latest_price": close_val,
                    "prev_close": prev_close,
                    "pct_chg": pct_chg,
                    "vol": _dec(pr["vol"]),
                    "amount": amount_val,
                    "amount_yi": round(amount_val / 100000, 4) if amount_val else None,
                    "turnover_rate": turnover_rate,
                }
            else:
                quote = None
        except Exception as e:
            partial_blocks.append("quote")
            quote = None

        # ════════════════════════════════════════════════════════
        # risk
        # ════════════════════════════════════════════════════════
        risk = None
        try:
            cur.execute("""
                SELECT trade_allowed, block_reason,
                       risk_score_total, risk_score_financial, risk_score_market,
                       risk_score_event, risk_score_compliance,
                       cap_financial, cap_market, cap_event, cap_compliance,
                       position_cap_multiplier_final, detail_json
                FROM ashare_risk_score
                WHERE ts_code = %s AND trade_date = %s
            """, (ts_code, eff_date_str))
            rr = cur.fetchone()
            if rr:
                rr = dict(rr)
                detail = rr.pop("detail_json", None) or {}
                risk = {
                    "trade_allowed": rr["trade_allowed"],
                    "block_reason": rr["block_reason"],
                    "risk_score_total": _dec(rr["risk_score_total"]),
                    "risk_score_financial": _dec(rr["risk_score_financial"]),
                    "risk_score_market": _dec(rr["risk_score_market"]),
                    "risk_score_event": _dec(rr["risk_score_event"]),
                    "risk_score_compliance": _dec(rr["risk_score_compliance"]),
                    "cap_financial": _dec(rr["cap_financial"]),
                    "cap_market": _dec(rr["cap_market"]),
                    "cap_event": _dec(rr["cap_event"]),
                    "cap_compliance": _dec(rr["cap_compliance"]),
                    "position_cap_multiplier_final": _dec(rr["position_cap_multiplier_final"]),
                    "effective_risk": detail.get("effective_risk") if isinstance(detail, dict) else None,
                }
                # risk_events from event_daily_snapshot
                risk_events = []
                try:
                    cur.execute("""
                        SELECT detail_json FROM ashare_event_daily_snapshot
                        WHERE ts_code = %s AND trade_date = %s
                    """, (ts_code, eff_date_str))
                    snap = cur.fetchone()
                    if snap and snap.get("detail_json"):
                        dj = snap["detail_json"]
                        if isinstance(dj, dict):
                            evts = dj.get("events", [])
                            for ev in evts:
                                risk_events.append({
                                    "type": ev.get("event_type", ""),
                                    "severity": ev.get("severity", ""),
                                    "detail": ev.get("description", ""),
                                })
                except Exception:
                    pass
                risk["risk_events"] = risk_events
            else:
                risk = None
        except Exception as e:
            partial_blocks.append("risk")
            risk = None

        # ════════════════════════════════════════════════════════
        # lifecycle
        # ════════════════════════════════════════════════════════
        lifecycle = None
        try:
            cur.execute("""
                SELECT event_type, from_status, to_status,
                       event_time::text AS event_time, event_source,
                       event_payload_json
                FROM ashare_trade_lifecycle_log
                WHERE ts_code = %s
                ORDER BY event_time ASC
            """, (ts_code,))
            steps = [dict(r) for r in cur.fetchall()]

            # lifecycle_status, entry_date, signal_date, pool_day from watchlist
            cur.execute("""
                SELECT lifecycle_status, entry_date::text AS entry_date,
                       signal_date::text AS signal_date, pool_day
                FROM ashare_watchlist
                WHERE ts_code = %s AND status = 'active'
                ORDER BY entry_date DESC LIMIT 1
            """, (ts_code,))
            wl = cur.fetchone()
            if wl:
                lifecycle = {
                    "steps": steps,
                    "lifecycle_status": wl["lifecycle_status"],
                    "entry_date": wl["entry_date"],
                    "signal_date": wl["signal_date"],
                    "pool_day": wl["pool_day"],
                }
            else:
                # check portfolio
                cur.execute("""
                    SELECT status AS lifecycle_status FROM ashare_portfolio
                    WHERE ts_code = %s AND status = 'open'
                    ORDER BY open_date DESC LIMIT 1
                """, (ts_code,))
                pf = cur.fetchone()
                lifecycle = {
                    "steps": steps,
                    "lifecycle_status": pf["lifecycle_status"] if pf else None,
                    "entry_date": None,
                    "signal_date": None,
                    "pool_day": None,
                }
        except Exception as e:
            partial_blocks.append("lifecycle")
            lifecycle = None

        # ════════════════════════════════════════════════════════
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
            strategies = None

        # ════════════════════════════════════════════════════════
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
            watchlist_context = None

        # ════════════════════════════════════════════════════════
        # portfolio_context
        # ════════════════════════════════════════════════════════
        portfolio_context = None
        try:
            cur.execute("""
                SELECT position_type, open_date::text AS open_date, open_price,
                       shares, market_value, unrealized_pnl_pct,
                       hold_days, status, action_signal
                FROM ashare_portfolio
                WHERE ts_code = %s AND position_type = 'PAPER' AND status = 'open'
                ORDER BY open_date DESC LIMIT 1
            """, (ts_code,))
            pf = cur.fetchone()
            if pf:
                portfolio_context = {
                    "in_portfolio": True,
                    "position_type": pf["position_type"],
                    "open_date": pf["open_date"],
                    "open_price": _dec(pf["open_price"]),
                    "shares": pf["shares"],
                    "market_value": _dec(pf["market_value"]),
                    "unrealized_pnl_pct": _dec(pf["unrealized_pnl_pct"]),
                    "hold_days": pf["hold_days"],
                    "status": pf["status"],
                    "sell_signal_type": pf["action_signal"],
                }
            else:
                portfolio_context = {
                    "in_portfolio": False,
                    "position_type": None, "open_date": None, "open_price": None,
                    "shares": None, "market_value": None, "unrealized_pnl_pct": None,
                    "hold_days": None, "status": None, "sell_signal_type": None,
                }
        except Exception as e:
            partial_blocks.append("portfolio_context")
            portfolio_context = None

        # ════════════════════════════════════════════════════════
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
            signal_context = None

        # ════════════════════════════════════════════════════════
        # ai_context
        # ════════════════════════════════════════════════════════
        ai_context = None

        # ════════════════════════════════════════════════════════
        # actions (derived)
        # ════════════════════════════════════════════════════════
        in_wl = watchlist_context.get("in_watchlist", False) if watchlist_context else False
        in_pf = portfolio_context.get("in_portfolio", False) if portfolio_context else False
        lc_status = lifecycle.get("lifecycle_status") if lifecycle else None
        trade_ok = risk.get("trade_allowed", False) if risk else False
        pf_open = portfolio_context.get("status") == "open" if portfolio_context else False

        actions = {
            "can_add_watchlist": not in_wl,
            "can_transfer_to_portfolio": in_wl and lc_status == "signaled" and trade_ok,
            "can_reduce_position": in_pf and pf_open,
            "can_close_position": in_pf and pf_open,
        }

        # ════════════════════════════════════════════════════════
        # panel_state
        # ════════════════════════════════════════════════════════
        panel_state = {
            "degraded": len(partial_blocks) > 0,
            "partial_blocks": partial_blocks,
            "data_source": "real",
        }

        data = {
            "basic": basic,
            "quote": quote,
            "risk": risk,
            "lifecycle": lifecycle,
            "strategies": strategies,
            "watchlist_context": watchlist_context,
            "portfolio_context": portfolio_context,
            "signal_context": signal_context,
            "ai_context": ai_context,
            "actions": actions,
            "panel_state": panel_state,
        }

        meta = {
            "trade_date": eff_date_str,
            "version_snapshot": f"risk_model=v1.0 | pipeline={eff_date_str} | api=v1.0",
            "source": source,
            "generated_at": _now_cn(),
        }

        return {"data": data, "meta": meta}

    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# Context Panel: K-line Endpoint
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/context/stock/{ts_code}/kline")
def get_context_kline(ts_code: str, trade_date: str = None,
                      range: str = "60d", adjust: str = "qfq"):
    range_map = {"20d": 20, "60d": 60, "120d": 120, "1y": 250}
    days = range_map.get(range, 60)
    buf = days + 25  # warmup for MA20

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        eff_date = _resolve_trade_date(cur, trade_date)
        if eff_date is None:
            return {"data": None, "meta": {"error": "no trade data available"}}
        eff_date_str = str(eff_date)

        if adjust == "qfq":
            # Front-adjusted: price * (adj_factor / latest_adj_factor)
            cur.execute("""
                WITH raw AS (
                    SELECT dp.trade_date, dp.open, dp.high, dp.low, dp.close, dp.vol,
                           af.adj_factor,
                           ROW_NUMBER() OVER (ORDER BY dp.trade_date DESC) AS rn
                    FROM ashare_daily_price dp
                    LEFT JOIN ashare_adj_factor af
                        ON dp.ts_code = af.ts_code AND dp.trade_date = af.trade_date
                    WHERE dp.ts_code = %s AND dp.trade_date <= %s
                    ORDER BY dp.trade_date DESC
                    LIMIT %s
                ),
                latest_af AS (
                    SELECT adj_factor FROM raw WHERE rn = 1
                ),
                adjusted AS (
                    SELECT trade_date,
                           ROUND((open  * adj_factor / laf.adj_factor)::numeric, 2) AS open,
                           ROUND((high  * adj_factor / laf.adj_factor)::numeric, 2) AS high,
                           ROUND((low   * adj_factor / laf.adj_factor)::numeric, 2) AS low,
                           ROUND((close * adj_factor / laf.adj_factor)::numeric, 2) AS close,
                           vol::bigint AS volume,
                           rn
                    FROM raw, latest_af laf
                ),
                with_ma AS (
                    SELECT trade_date, open, high, low, close, volume, rn,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma5,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma10,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma20
                    FROM adjusted
                )
                SELECT TO_CHAR(trade_date, 'YYYY-MM-DD') AS date,
                       open, high, low, close, volume, ma5, ma10, ma20
                FROM with_ma
                WHERE rn <= %s
                ORDER BY trade_date ASC
            """, (ts_code, eff_date_str, buf, days))
        elif adjust == "hfq":
            cur.execute("""
                WITH raw AS (
                    SELECT dp.trade_date, dp.open, dp.high, dp.low, dp.close, dp.vol,
                           af.adj_factor,
                           ROW_NUMBER() OVER (ORDER BY dp.trade_date DESC) AS rn
                    FROM ashare_daily_price dp
                    LEFT JOIN ashare_adj_factor af
                        ON dp.ts_code = af.ts_code AND dp.trade_date = af.trade_date
                    WHERE dp.ts_code = %s AND dp.trade_date <= %s
                    ORDER BY dp.trade_date DESC
                    LIMIT %s
                ),
                first_af AS (
                    SELECT adj_factor FROM raw ORDER BY trade_date ASC LIMIT 1
                ),
                adjusted AS (
                    SELECT trade_date,
                           ROUND((open  * adj_factor / faf.adj_factor)::numeric, 2) AS open,
                           ROUND((high  * adj_factor / faf.adj_factor)::numeric, 2) AS high,
                           ROUND((low   * adj_factor / faf.adj_factor)::numeric, 2) AS low,
                           ROUND((close * adj_factor / faf.adj_factor)::numeric, 2) AS close,
                           vol::bigint AS volume,
                           rn
                    FROM raw, first_af faf
                ),
                with_ma AS (
                    SELECT trade_date, open, high, low, close, volume, rn,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma5,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma10,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma20
                    FROM adjusted
                )
                SELECT TO_CHAR(trade_date, 'YYYY-MM-DD') AS date,
                       open, high, low, close, volume, ma5, ma10, ma20
                FROM with_ma
                WHERE rn <= %s
                ORDER BY trade_date ASC
            """, (ts_code, eff_date_str, buf, days))
        else:
            # No adjustment
            cur.execute("""
                WITH raw AS (
                    SELECT trade_date, open, high, low, close, vol,
                           ROW_NUMBER() OVER (ORDER BY trade_date DESC) AS rn
                    FROM ashare_daily_price
                    WHERE ts_code = %s AND trade_date <= %s
                    ORDER BY trade_date DESC
                    LIMIT %s
                ),
                with_ma AS (
                    SELECT trade_date,
                           ROUND(open::numeric, 2) AS open,
                           ROUND(high::numeric, 2) AS high,
                           ROUND(low::numeric, 2) AS low,
                           ROUND(close::numeric, 2) AS close,
                           vol::bigint AS volume,
                           rn,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma5,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma10,
                           ROUND(AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)::numeric, 2) AS ma20
                    FROM raw
                )
                SELECT TO_CHAR(trade_date, 'YYYY-MM-DD') AS date,
                       open, high, low, close, volume, ma5, ma10, ma20
                FROM with_ma
                WHERE rn <= %s
                ORDER BY trade_date ASC
            """, (ts_code, eff_date_str, buf, days))

        rows = cur.fetchall()
        bars = []
        for r in rows:
            bars.append({
                "date": r["date"],
                "open": _dec(r["open"]),
                "high": _dec(r["high"]),
                "low": _dec(r["low"]),
                "close": _dec(r["close"]),
                "volume": r["volume"],
                "ma5": _dec(r["ma5"]),
                "ma10": _dec(r["ma10"]),
                "ma20": _dec(r["ma20"]),
            })

        data = {
            "ts_code": ts_code,
            "range": range,
            "bars": bars,
        }
        meta = {
            "trade_date": eff_date_str,
            "adjust": adjust,
            "bar_count": len(bars),
            "generated_at": _now_cn(),
        }
        return {"data": data, "meta": meta}

    finally:
        conn.close()
'''

path = '/opt/ashare-api/main.py'
with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

# Check not already appended
if '/api/context/stock/' in code:
    print('SKIP: context endpoints already exist in main.py')
else:
    code += BLOCK
    with open(path, 'w', encoding='utf-8') as f:
        f.write(code)
    print(f'OK: appended context endpoints to main.py (new length: {len(code.splitlines())} lines)')
