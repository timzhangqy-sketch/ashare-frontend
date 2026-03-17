#!/opt/ashare_venv/bin/python
"""Patch main.py: extract _fetch_risk_block/_fetch_lifecycle_block, add /risk and /lifecycle endpoints."""
path = '/opt/ashare-api/main.py'
with open(path, 'r') as f:
    code = f.read()

# ═══════════════════════════════════════════════════════════════
# 1. Insert public functions after _now_cn()
# ═══════════════════════════════════════════════════════════════

INSERT_AFTER = '''def _now_cn():
    """Current time ISO8601 +08:00."""
    tz8 = timezone(_td(hours=8))
    return datetime.now(tz8).strftime('%Y-%m-%dT%H:%M:%S+08:00')'''

PUBLIC_FUNCS = '''

def _fetch_risk_block(cur, ts_code, eff_date_str):
    """Fetch risk data with fallback to most recent available date. Returns dict or None."""
    cur.execute("""
        SELECT trade_date, trade_allowed, block_reason,
               risk_score_total, risk_score_financial, risk_score_market,
               risk_score_event, risk_score_compliance,
               cap_financial, cap_market, cap_event, cap_compliance,
               position_cap_multiplier_final, detail_json
        FROM ashare_risk_score
        WHERE ts_code = %s AND trade_date <= %s
        ORDER BY trade_date DESC LIMIT 1
    """, (ts_code, eff_date_str))
    rr = cur.fetchone()
    if not rr:
        return None
    rr = dict(rr)
    risk_td = str(rr.pop("trade_date", ""))
    detail = rr.pop("detail_json", None) or {}
    risk = {
        "risk_as_of_date": risk_td if risk_td != eff_date_str else None,
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
            WHERE ts_code = %s AND trade_date <= %s
            ORDER BY trade_date DESC LIMIT 1
        """, (ts_code, eff_date_str))
        snap = cur.fetchone()
        if snap and snap.get("detail_json"):
            dj = snap["detail_json"]
            if isinstance(dj, dict):
                for ev in dj.get("events", []):
                    risk_events.append({
                        "type": ev.get("event_type", ""),
                        "severity": ev.get("severity", ""),
                        "detail": ev.get("description", ""),
                    })
    except Exception:
        pass
    risk["risk_events"] = risk_events
    return risk


def _fetch_lifecycle_block(cur, ts_code):
    """Fetch lifecycle data from lifecycle_log + watchlist + portfolio. Returns (dict, degraded, degrade_reason)."""
    # Steps from lifecycle_log
    cur.execute("""
        SELECT event_type, from_status, to_status,
               event_time AT TIME ZONE 'Asia/Shanghai' AS event_time,
               event_source, event_payload_json
        FROM ashare_trade_lifecycle_log
        WHERE ts_code = %s
        ORDER BY event_time ASC LIMIT 20
    """, (ts_code,))
    raw_steps = cur.fetchall()

    steps = []
    for r in raw_steps:
        r = dict(r)
        et = r.get("event_time")
        date_str = et.strftime('%Y-%m-%dT%H:%M:%S+08:00') if et else None
        note = None
        payload = r.get("event_payload_json")
        if payload and isinstance(payload, dict):
            note = payload.get("note") or payload.get("reason") or payload.get("signal_type")
        steps.append({
            "step": r.get("to_status") or r.get("event_type", ""),
            "status": r.get("to_status") or r.get("from_status", ""),
            "date": date_str,
            "source": r.get("event_source", ""),
            "note": note,
        })

    has_log = len(raw_steps) > 0
    degraded = False
    degrade_reason = None

    # Watchlist info
    cur.execute("""
        SELECT id, lifecycle_status, entry_date::text AS entry_date,
               signal_date::text AS signal_date, pool_day, strategy
        FROM ashare_watchlist
        WHERE ts_code = %s AND status = 'active'
        ORDER BY entry_date ASC
    """, (ts_code,))
    wl_rows = cur.fetchall()

    # Portfolio info
    cur.execute("""
        SELECT id, status FROM ashare_portfolio
        WHERE ts_code = %s AND position_type = 'PAPER' AND status = 'open'
        ORDER BY open_date DESC LIMIT 1
    """, (ts_code,))
    pf = cur.fetchone()

    # current_status
    if pf:
        current_status = "held"
    elif wl_rows:
        lc = wl_rows[-1].get("lifecycle_status")
        current_status = lc if lc else "candidate"
    else:
        current_status = "unknown"

    # strategies
    source_strategies = [r["strategy"] for r in wl_rows]
    source_strategy_primary = source_strategies[0] if source_strategies else None

    # If no lifecycle_log records, infer from watchlist/portfolio
    if not has_log and wl_rows:
        degraded = True
        degrade_reason = "lifecycle_log无历史记录，已从watchlist/portfolio推断"
        for wr in wl_rows:
            steps.append({
                "step": "candidate",
                "status": wr.get("lifecycle_status") or "candidate",
                "date": wr["entry_date"],
                "source": "watchlist_inferred",
                "note": None,
            })
    elif not has_log and not wl_rows:
        degraded = True
        degrade_reason = "lifecycle_log无历史记录，该股票不在watchlist/portfolio中"

    # key_dates
    key_dates = {
        "entered_watchlist_at": None,
        "signal_triggered_at": None,
        "transferred_to_portfolio_at": None,
        "closed_at": None,
    }
    for s in steps:
        st = s.get("step", "")
        d = s.get("date")
        if st == "candidate" and key_dates["entered_watchlist_at"] is None:
            key_dates["entered_watchlist_at"] = d
        elif st == "signaled" and key_dates["signal_triggered_at"] is None:
            key_dates["signal_triggered_at"] = d
        elif st == "held" and key_dates["transferred_to_portfolio_at"] is None:
            key_dates["transferred_to_portfolio_at"] = d
        elif st == "closed" and key_dates["closed_at"] is None:
            key_dates["closed_at"] = d
    # Fallback: use watchlist entry_date if no candidate step found
    if key_dates["entered_watchlist_at"] is None and wl_rows:
        key_dates["entered_watchlist_at"] = wl_rows[0]["entry_date"]

    # related_records
    wl_id = wl_rows[-1]["id"] if wl_rows else None
    pf_id = pf["id"] if pf else None
    exec_ids = []
    try:
        cur.execute("""
            SELECT id FROM ashare_sim_orders
            WHERE ts_code = %s ORDER BY order_date DESC LIMIT 10
        """, (ts_code,))
        exec_ids = [r["id"] for r in cur.fetchall()]
    except Exception:
        pass

    lifecycle = {
        "ts_code": ts_code,
        "current_status": current_status,
        "source_strategy_primary": source_strategy_primary,
        "source_strategies": source_strategies,
        "steps": steps,
        "key_dates": key_dates,
        "related_records": {
            "watchlist_id": wl_id,
            "portfolio_position_id": pf_id,
            "execution_order_ids": exec_ids,
        },
    }
    return lifecycle, degraded, degrade_reason
'''

assert INSERT_AFTER in code, 'Cannot find _now_cn function'
code = code.replace(INSERT_AFTER, INSERT_AFTER + PUBLIC_FUNCS)
print('Step 1 OK: inserted public functions')

# ═══════════════════════════════════════════════════════════════
# 2. Replace risk block in main endpoint
# ═══════════════════════════════════════════════════════════════

OLD_RISK = """        # ════════════════════════════════════════════════════════
        # risk
        # ════════════════════════════════════════════════════════
        risk = None
        try:
            cur.execute(\"\"\"
                SELECT trade_date, trade_allowed, block_reason,
                       risk_score_total, risk_score_financial, risk_score_market,
                       risk_score_event, risk_score_compliance,
                       cap_financial, cap_market, cap_event, cap_compliance,
                       position_cap_multiplier_final, detail_json
                FROM ashare_risk_score
                WHERE ts_code = %s AND trade_date <= %s
                ORDER BY trade_date DESC LIMIT 1
            \"\"\", (ts_code, eff_date_str))
            rr = cur.fetchone()
            if rr:
                rr = dict(rr)
                risk_td = str(rr.pop("trade_date", ""))
                detail = rr.pop("detail_json", None) or {}
                risk = {
                    "risk_as_of_date": risk_td if risk_td != eff_date_str else None,
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
                    cur.execute(\"\"\"
                        SELECT detail_json FROM ashare_event_daily_snapshot
                        WHERE ts_code = %s AND trade_date <= %s
                        ORDER BY trade_date DESC LIMIT 1
                    \"\"\", (ts_code, eff_date_str))
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
            risk = None"""

NEW_RISK = """        # ════════════════════════════════════════════════════════
        # risk (via _fetch_risk_block)
        # ════════════════════════════════════════════════════════
        risk = None
        try:
            risk = _fetch_risk_block(cur, ts_code, eff_date_str)
        except Exception as e:
            partial_blocks.append("risk")
            risk = None"""

assert OLD_RISK in code, 'Cannot find old risk block'
code = code.replace(OLD_RISK, NEW_RISK)
print('Step 2 OK: replaced risk block')

# ═══════════════════════════════════════════════════════════════
# 3. Replace lifecycle block in main endpoint
# ═══════════════════════════════════════════════════════════════

OLD_LIFECYCLE = """        # ════════════════════════════════════════════════════════
        # lifecycle
        # ════════════════════════════════════════════════════════
        lifecycle = None
        try:
            cur.execute(\"\"\"
                SELECT event_type, from_status, to_status,
                       event_time::text AS event_time, event_source,
                       event_payload_json
                FROM ashare_trade_lifecycle_log
                WHERE ts_code = %s
                ORDER BY event_time ASC
            \"\"\", (ts_code,))
            steps = [dict(r) for r in cur.fetchall()]

            # lifecycle_status, entry_date, signal_date, pool_day from watchlist
            cur.execute(\"\"\"
                SELECT lifecycle_status, entry_date::text AS entry_date,
                       signal_date::text AS signal_date, pool_day
                FROM ashare_watchlist
                WHERE ts_code = %s AND status = 'active'
                ORDER BY entry_date DESC LIMIT 1
            \"\"\", (ts_code,))
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
                cur.execute(\"\"\"
                    SELECT status AS lifecycle_status FROM ashare_portfolio
                    WHERE ts_code = %s AND status = 'open'
                    ORDER BY open_date DESC LIMIT 1
                \"\"\", (ts_code,))
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
            lifecycle = None"""

NEW_LIFECYCLE = """        # ════════════════════════════════════════════════════════
        # lifecycle (via _fetch_lifecycle_block)
        # ════════════════════════════════════════════════════════
        lifecycle = None
        try:
            lc_full, _lc_deg, _lc_reason = _fetch_lifecycle_block(cur, ts_code)
            # Main endpoint uses simplified lifecycle structure for backward compat
            lifecycle = {
                "steps": lc_full["steps"],
                "lifecycle_status": lc_full["current_status"],
                "entry_date": lc_full["key_dates"].get("entered_watchlist_at"),
                "signal_date": lc_full["key_dates"].get("signal_triggered_at"),
                "pool_day": None,
            }
            # Try to get pool_day from watchlist
            cur.execute(\"\"\"
                SELECT pool_day FROM ashare_watchlist
                WHERE ts_code = %s AND status = 'active'
                ORDER BY entry_date DESC LIMIT 1
            \"\"\", (ts_code,))
            pw = cur.fetchone()
            if pw:
                lifecycle["pool_day"] = pw["pool_day"]
        except Exception as e:
            partial_blocks.append("lifecycle")
            lifecycle = None"""

assert OLD_LIFECYCLE in code, 'Cannot find old lifecycle block'
code = code.replace(OLD_LIFECYCLE, NEW_LIFECYCLE)
print('Step 3 OK: replaced lifecycle block')

# ═══════════════════════════════════════════════════════════════
# 4. Append new endpoints before kline endpoint
# ═══════════════════════════════════════════════════════════════

NEW_ENDPOINTS = '''

# ═══════════════════════════════════════════════════════════════════════════════
# Context Panel: Risk Detail Endpoint
# ═══════════════════════════════════════════════════════════════════════════════

def _risk_level(score):
    if score is None:
        return None
    if score >= 80:
        return "low"
    if score >= 60:
        return "medium"
    return "high"


def _risk_explanation(risk):
    if risk is None:
        return "暂无风控评分数据"
    if not risk.get("trade_allowed"):
        br = risk.get("block_reason") or "未知原因"
        return f"该股票被风控闸门拦截：{br}"
    mult = risk.get("position_cap_multiplier_final")
    total = risk.get("risk_score_total")
    if mult is not None and mult < 0.5:
        # find lowest cap dimension
        caps = {
            "financial": risk.get("cap_financial"),
            "market": risk.get("cap_market"),
            "event": risk.get("cap_event"),
            "compliance": risk.get("cap_compliance"),
        }
        valid = {k: v for k, v in caps.items() if v is not None}
        dim_name = min(valid, key=valid.get) if valid else "unknown"
        dim_map = {"financial": "财务", "market": "市场", "event": "事件", "compliance": "合规"}
        return f"仓位被大幅限制（{mult}），主要受{dim_map.get(dim_name, dim_name)}维度制约"
    if total is not None and total >= 80:
        return "风险水平较低，各维度均在正常范围"
    if total is not None:
        scores = {
            "financial": risk.get("risk_score_financial"),
            "market": risk.get("risk_score_market"),
            "event": risk.get("risk_score_event"),
            "compliance": risk.get("risk_score_compliance"),
        }
        valid = {k: v for k, v in scores.items() if v is not None}
        dim_name = min(valid, key=valid.get) if valid else "unknown"
        dim_map = {"financial": "财务", "market": "市场", "event": "事件", "compliance": "合规"}
        return f"综合风险{total}分，{dim_map.get(dim_name, dim_name)}维度需关注"
    return "暂无风控评分数据"


@app.get("/api/context/stock/{ts_code}/risk")
def get_context_risk(ts_code: str, trade_date: str = None, source: str = None):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        eff_date = _resolve_trade_date(cur, trade_date)
        if eff_date is None:
            conn.close()
            return {"data": None, "meta": {"error": "no trade data available"}}
        eff_date_str = str(eff_date)

        degraded = False
        degrade_reason = None
        try:
            risk = _fetch_risk_block(cur, ts_code, eff_date_str)
        except Exception as e:
            risk = None
            degraded = True
            degrade_reason = str(e)

        if risk:
            data = {
                "ts_code": ts_code,
                "trade_allowed": risk["trade_allowed"],
                "block_reason": risk["block_reason"],
                "risk_score_total": risk["risk_score_total"],
                "risk_level": _risk_level(risk["risk_score_total"]),
                "dimension_scores": {
                    "financial": risk["risk_score_financial"],
                    "market": risk["risk_score_market"],
                    "event": risk["risk_score_event"],
                    "compliance": risk["risk_score_compliance"],
                },
                "dimension_caps": {
                    "financial": risk["cap_financial"],
                    "market": risk["cap_market"],
                    "event": risk["cap_event"],
                    "compliance": risk["cap_compliance"],
                },
                "position_cap_multiplier_final": risk["position_cap_multiplier_final"],
                "effective_risk": risk["effective_risk"],
                "risk_explanation": _risk_explanation(risk),
                "risk_events": risk.get("risk_events", []),
                "risk_as_of_date": risk.get("risk_as_of_date"),
            }
        else:
            data = {
                "ts_code": ts_code,
                "trade_allowed": None,
                "block_reason": None,
                "risk_score_total": None,
                "risk_level": None,
                "dimension_scores": {"financial": None, "market": None, "event": None, "compliance": None},
                "dimension_caps": {"financial": None, "market": None, "event": None, "compliance": None},
                "position_cap_multiplier_final": None,
                "effective_risk": None,
                "risk_explanation": _risk_explanation(None),
                "risk_events": [],
                "risk_as_of_date": None,
            }

        meta = {
            "trade_date": eff_date_str,
            "source": source,
            "version_snapshot": f"risk_model=v1.0 | pipeline={eff_date_str} | api=v1.0",
            "degraded": degraded,
            "degrade_reason": degrade_reason,
            "generated_at": _now_cn(),
        }
        return {"data": data, "meta": meta}
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# Context Panel: Lifecycle Detail Endpoint
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/context/stock/{ts_code}/lifecycle")
def get_context_lifecycle(ts_code: str, trade_date: str = None, source: str = None):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        eff_date = _resolve_trade_date(cur, trade_date)
        if eff_date is None:
            conn.close()
            return {"data": None, "meta": {"error": "no trade data available"}}
        eff_date_str = str(eff_date)

        degraded = False
        degrade_reason = None
        try:
            lifecycle, degraded, degrade_reason = _fetch_lifecycle_block(cur, ts_code)
        except Exception as e:
            lifecycle = {
                "ts_code": ts_code,
                "current_status": "unknown",
                "source_strategy_primary": None,
                "source_strategies": [],
                "steps": [],
                "key_dates": {
                    "entered_watchlist_at": None,
                    "signal_triggered_at": None,
                    "transferred_to_portfolio_at": None,
                    "closed_at": None,
                },
                "related_records": {
                    "watchlist_id": None,
                    "portfolio_position_id": None,
                    "execution_order_ids": [],
                },
            }
            degraded = True
            degrade_reason = str(e)

        meta = {
            "trade_date": eff_date_str,
            "source": source,
            "version_snapshot": f"risk_model=v1.0 | pipeline={eff_date_str} | api=v1.0",
            "degraded": degraded,
            "degrade_reason": degrade_reason,
            "generated_at": _now_cn(),
        }
        return {"data": lifecycle, "meta": meta}
    finally:
        conn.close()
'''

# Insert before kline endpoint
KLINE_MARKER = '# ═══════════════════════════════════════════════════════════════════════════════\n# Context Panel: K-line Endpoint'
assert KLINE_MARKER in code, 'Cannot find kline marker'
code = code.replace(KLINE_MARKER, NEW_ENDPOINTS + '\n' + KLINE_MARKER)
print('Step 4 OK: appended risk and lifecycle endpoints')

with open(path, 'w') as f:
    f.write(code)
print(f'DONE: {len(code.splitlines())} lines total')
