#!/opt/ashare_venv/bin/python
"""Add GET /api/dashboard/summary endpoint to main.py."""

ENDPOINT_CODE = '''

# ════════════════════════════════════════════════════════════════
# Dashboard Summary API
# ════════════════════════════════════════════════════════════════
from datetime import datetime, timezone, timedelta

@app.get("/api/dashboard/summary")
def get_dashboard_summary(trade_date: str = None):
    conn = get_db()
    cur = conn.cursor()
    try:
        # ── Resolve effective trade_date ──
        if trade_date:
            cur.execute("SELECT MAX(trade_date) FROM ashare_daily_price WHERE trade_date <= %s", (trade_date,))
        else:
            cur.execute("SELECT MAX(trade_date) FROM ashare_daily_price")
        row = cur.fetchone()
        eff_date = row[0] if row and row[0] else None
        if eff_date is None:
            conn.close()
            return {"error": "no trade data available"}
        eff_date_str = str(eff_date)  # YYYY-MM-DD

        # ══════════════════════════════════════
        # Module 1: today_changes
        # ══════════════════════════════════════
        cur.execute("SELECT COUNT(*) FROM ashare_watchlist WHERE status='active' AND buy_signal IS NOT NULL AND signal_date = %s", (eff_date_str,))
        new_signals = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM ashare_watchlist WHERE status='exited' AND exit_date = %s", (eff_date_str,))
        removed_signals = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM ashare_watchlist WHERE status='active' AND entry_date = %s", (eff_date_str,))
        new_entries = cur.fetchone()[0]
        watchlist_delta = new_entries - removed_signals

        cur.execute("SELECT COUNT(*) FROM ashare_sim_orders WHERE fill_date = %s AND direction='BUY' AND status='filled'", (eff_date_str,))
        buy_filled = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM ashare_sim_orders WHERE fill_date = %s AND direction='SELL' AND status='filled'", (eff_date_str,))
        sell_filled = cur.fetchone()[0]
        portfolio_delta = buy_filled - sell_filled

        # Check pipeline status for summary_text
        cur.execute("SELECT COUNT(*) FROM ashare_pipeline_runs WHERE trade_date = %s AND status = 'fail'", (eff_date_str,))
        failed_steps = cur.fetchone()[0]
        pipeline_ok = (failed_steps == 0)

        summary_text = f"今日新增{new_signals}个买点信号，观察池净增{watchlist_delta}只，{'系统运行正常' if pipeline_ok else '有异常步骤'}。"

        today_changes = {
            "new_signals": new_signals,
            "removed_signals": removed_signals,
            "watchlist_delta": watchlist_delta,
            "portfolio_delta": portfolio_delta,
            "risk_alerts_delta": 0,
            "system_alerts_delta": 0,
            "summary_text": summary_text,
        }

        # ══════════════════════════════════════
        # Module 2: opportunity
        # ══════════════════════════════════════
        cur.execute("SELECT COUNT(*) FROM (SELECT ts_code FROM ashare_watchlist WHERE status='active' GROUP BY ts_code HAVING COUNT(DISTINCT strategy) >= 2) t")
        resonance_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM ashare_watchlist WHERE status='active'")
        watchlist_candidates = cur.fetchone()[0]

        cur.execute("SELECT strategy, COUNT(*) as cnt FROM ashare_watchlist WHERE status='active' AND buy_signal IS NOT NULL GROUP BY strategy ORDER BY cnt DESC LIMIT 1")
        row = cur.fetchone()
        strongest_strategy_label = row[0] if row else None

        cur.execute("""
            SELECT b.industry, COUNT(*) as cnt
            FROM ashare_watchlist w JOIN ashare_stock_basic b ON w.ts_code=b.ts_code
            WHERE w.status='active'
            GROUP BY b.industry ORDER BY cnt DESC LIMIT 1
        """)
        row = cur.fetchone()
        hottest_sector_label = row[0] if row else None

        cur.execute("""
            SELECT COUNT(*) FROM ashare_watchlist w
            JOIN ashare_risk_score r ON w.ts_code=r.ts_code AND r.trade_date=%s
            WHERE w.status='active' AND w.buy_signal IS NOT NULL AND r.trade_allowed=true
        """, (eff_date_str,))
        actionable_count = cur.fetchone()[0]

        # top_opportunities: top 5 actionable by risk_score_total DESC
        cur.execute("""
            SELECT w.ts_code, b.name, w.strategy, b.industry, r.risk_score_total, r.trade_allowed
            FROM ashare_watchlist w
            JOIN ashare_risk_score r ON w.ts_code=r.ts_code AND r.trade_date=%s
            JOIN ashare_stock_basic b ON w.ts_code=b.ts_code
            WHERE w.status='active' AND w.buy_signal IS NOT NULL AND r.trade_allowed=true
            ORDER BY r.risk_score_total DESC NULLS LAST
            LIMIT 5
        """, (eff_date_str,))
        top_rows = cur.fetchall()
        top_opportunities = []
        for r in top_rows:
            top_opportunities.append({
                "ts_code": r[0],
                "name": r[1] or "",
                "strategy_label": r[2],
                "sector_label": r[3] or "",
                "score": float(r[4]) if r[4] is not None else None,
                "hint": "风控通过，允许交易" if r[5] else "",
            })

        opportunity = {
            "buy_signals_count": new_signals,
            "resonance_count": resonance_count,
            "watchlist_candidates": watchlist_candidates,
            "strongest_strategy_label": strongest_strategy_label,
            "hottest_sector_label": hottest_sector_label,
            "actionable_count": actionable_count,
            "top_opportunities": top_opportunities,
        }

        # ══════════════════════════════════════
        # Module 3: risk
        # ══════════════════════════════════════
        cur.execute("SELECT COUNT(*) FROM ashare_risk_score WHERE trade_date=%s AND trade_allowed=false", (eff_date_str,))
        gate_blocked_count = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*) FROM ashare_risk_score r
            JOIN ashare_watchlist w ON r.ts_code=w.ts_code
            WHERE r.trade_date=%s AND w.status='active' AND r.risk_score_total < 60
        """, (eff_date_str,))
        high_risk_watchlist_count = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*) FROM ashare_risk_score r
            JOIN ashare_portfolio p ON r.ts_code=p.ts_code
            WHERE r.trade_date=%s AND p.status='open' AND p.position_type='PAPER' AND r.risk_score_total < 60
        """, (eff_date_str,))
        high_risk_positions_count = cur.fetchone()[0]

        # Highest risk (lowest score) among active watchlist
        cur.execute("""
            SELECT b.name, r.risk_score_total
            FROM ashare_risk_score r
            JOIN ashare_watchlist w ON r.ts_code=w.ts_code
            JOIN ashare_stock_basic b ON r.ts_code=b.ts_code
            WHERE r.trade_date=%s AND w.status='active' AND r.risk_score_total IS NOT NULL
            ORDER BY r.risk_score_total ASC LIMIT 1
        """, (eff_date_str,))
        row = cur.fetchone()
        highest_risk_name = row[0] if row else None
        highest_risk_score = float(row[1]) if row else None

        risk_hint = f"Gate拦截{gate_blocked_count}只"
        if high_risk_positions_count > 0:
            risk_hint += f"，高风险持仓{high_risk_positions_count}只需关注"

        risk = {
            "gate_blocked_count": gate_blocked_count,
            "high_risk_watchlist_count": high_risk_watchlist_count,
            "high_risk_positions_count": high_risk_positions_count,
            "new_risk_events_count": 0,
            "highest_risk_name": highest_risk_name,
            "highest_risk_score": highest_risk_score,
            "risk_hint": risk_hint,
        }

        # ══════════════════════════════════════
        # Module 4: portfolio
        # ══════════════════════════════════════
        cur.execute("""
            SELECT total_nav, cash, market_value, position_count,
                   daily_pnl_pct, cumulative_pnl_pct
            FROM ashare_sim_portfolio_snapshot WHERE snap_date = %s
        """, (eff_date_str,))
        snap = cur.fetchone()

        if snap:
            total_nav = float(snap[0])
            snap_cash = float(snap[1])
            snap_mv = float(snap[2])
            positions_count = int(snap[3])
            daily_pnl_pct = float(snap[4]) if snap[4] is not None else 0
            cumulative_pnl_pct = float(snap[5]) if snap[5] is not None else 0
            cash_ratio = snap_cash / total_nav if total_nav > 0 else 0
            daily_pnl = daily_pnl_pct * total_nav  # approximate
        else:
            total_nav = None
            snap_cash = None
            snap_mv = None
            positions_count = 0
            daily_pnl_pct = 0
            cumulative_pnl_pct = 0
            cash_ratio = 0
            daily_pnl = 0

        # concentration_top1
        concentration_top1 = 0
        if total_nav and total_nav > 0:
            cur.execute("""
                SELECT MAX(market_value) FROM ashare_portfolio
                WHERE position_type='PAPER' AND status='open'
            """)
            row = cur.fetchone()
            if row and row[0]:
                concentration_top1 = float(row[0]) / total_nav

        # sell_signals_count
        cur.execute("""
            SELECT COUNT(*) FROM ashare_portfolio
            WHERE position_type='PAPER' AND status='open'
              AND action_signal IS NOT NULL AND action_signal != 'HOLD'
        """)
        sell_signals_count = cur.fetchone()[0]

        action_hint = f"有{sell_signals_count}个卖出信号待复核" if sell_signals_count > 0 else "持仓稳定，无卖出信号"

        portfolio = {
            "position_type": "PAPER",
            "positions_count": positions_count,
            "total_market_value": snap_mv,
            "cash_ratio": round(cash_ratio, 4) if cash_ratio else 0,
            "daily_pnl": round(daily_pnl, 2) if daily_pnl else 0,
            "daily_pnl_pct": round(daily_pnl_pct, 4) if daily_pnl_pct else 0,
            "cumulative_pnl_pct": round(cumulative_pnl_pct, 4) if cumulative_pnl_pct else 0,
            "concentration_top1": round(concentration_top1, 4),
            "sell_signals_count": sell_signals_count,
            "action_hint": action_hint,
        }

        # ══════════════════════════════════════
        # Module 5: system_health
        # ══════════════════════════════════════
        cur.execute("SELECT step, status FROM ashare_pipeline_runs WHERE trade_date = %s", (eff_date_str,))
        pipe_rows = cur.fetchall()
        if not pipe_rows:
            pipeline_status = "unknown"
        elif any(r[1] == 'fail' for r in pipe_rows):
            pipeline_status = "error"
        elif any(r[1] == 'warn' for r in pipe_rows):
            pipeline_status = "warning"
        else:
            pipeline_status = "ok"

        cur.execute("SELECT MAX(ended_at) FROM ashare_pipeline_runs WHERE trade_date=%s AND status='success'", (eff_date_str,))
        row = cur.fetchone()
        latest_success_time = row[0].isoformat() if row and row[0] else None

        cur.execute("""
            SELECT COUNT(DISTINCT ts_code)::float / NULLIF(
                (SELECT COUNT(*) FROM ashare_stock_basic WHERE status='L' AND ts_code NOT LIKE '%%.BJ'), 0)
            FROM ashare_daily_price WHERE trade_date=%s
        """, (eff_date_str,))
        row = cur.fetchone()
        data_coverage_pct = round(float(row[0]), 4) if row and row[0] else 0

        cur.execute("SELECT status FROM ashare_pipeline_runs WHERE trade_date=%s AND step='dq_gate' ORDER BY ended_at DESC LIMIT 1", (eff_date_str,))
        row = cur.fetchone()
        dq_status = "ok" if row and row[0] == 'success' else "warning"

        system_hint = "全流程正常" if pipeline_status == "ok" else f"有{failed_steps}个步骤异常"

        system_health = {
            "pipeline_status": pipeline_status,
            "latest_success_time": latest_success_time,
            "failed_steps_count": failed_steps,
            "data_coverage_pct": data_coverage_pct,
            "dq_status": dq_status,
            "api_health_status": "ok",
            "version_label": "20260309-r1",
            "system_hint": system_hint,
        }

        # ══════════════════════════════════════
        # Assemble response
        # ══════════════════════════════════════
        tz_cn = timezone(timedelta(hours=8))
        result = {
            "trade_date": eff_date_str,
            "generated_at": datetime.now(tz_cn).isoformat(),
            "version_snapshot": f"risk_model=v1 | pipeline={eff_date_str} | api=v1.0",
            "today_changes": today_changes,
            "opportunity": opportunity,
            "risk": risk,
            "portfolio": portfolio,
            "system_health": system_health,
        }

        return result

    finally:
        conn.close()
'''

# Append to main.py
filepath = '/opt/ashare-api/main.py'
with open(filepath, 'r') as fh:
    content = fh.read()

if '/api/dashboard/summary' in content:
    print("WARNING: /api/dashboard/summary already exists, skipping")
else:
    content += ENDPOINT_CODE
    with open(filepath, 'w') as fh:
        fh.write(content)
    new_lines = len(content.splitlines())
    print(f"OK: appended dashboard endpoint. Total lines: {new_lines}")
