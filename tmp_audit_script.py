#!/usr/bin/env python3
"""数据一致性审计脚本 - 每日pipeline末尾运行，检查API与数据库、表间交叉一致性"""

import argparse, json, logging, os, sys, random, smtplib
from datetime import datetime, date
from decimal import Decimal
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import psycopg2
import psycopg2.extras
import requests

LOG_DIR = '/var/log/ashare'
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, 'audit.log'), encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

API_BASE = "http://127.0.0.1:8000"


def get_db():
    return psycopg2.connect(
        host=os.environ.get('ASHARE_DB_HOST', 'localhost'),
        dbname=os.environ.get('ASHARE_DB_NAME', 'ashare'),
        user=os.environ.get('ASHARE_DB_USER', 'ashare_user'),
        password=os.environ.get('ASHARE_DB_PASS', ''),
        port=os.environ.get('ASHARE_DB_PORT', '5432')
    )


def api_get(path):
    """调API，返回dict。失败返回None。"""
    try:
        resp = requests.get(f"{API_BASE}{path}", timeout=10)
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception:
        return None


def resolve_trade_date(cur, date_str=None):
    if date_str:
        cur.execute("SELECT MAX(trade_date) FROM ashare_daily_price WHERE trade_date <= %s", (date_str,))
    else:
        cur.execute("SELECT MAX(trade_date) FROM ashare_daily_price")
    row = cur.fetchone()
    return str(row[0]) if row and row[0] else None


def _result(check_id, check_name, severity, expected, actual, detail=None):
    return {"check_id": check_id, "check_name": check_name, "severity": severity,
            "expected": expected, "actual": actual, "detail": detail}


# ════════════════════════════════════════════════════════════════
# A层 — API vs DB
# ════════════════════════════════════════════════════════════════

def check_a1(cur, td):
    """dashboard.positions_count"""
    name = "dashboard.positions_count"
    api = api_get(f"/api/dashboard/summary?trade_date={td}")
    if not api or 'portfolio' not in api:
        return _result("A1", name, "SKIP", "-", "-", "API调用失败")
    api_val = api['portfolio']['positions_count']
    cur.execute("SELECT COUNT(*) FROM ashare_portfolio WHERE position_type='PAPER' AND status='open'")
    db_val = cur.fetchone()[0]
    if api_val != db_val:
        return _result("A1", name, "FAIL", db_val, api_val, f"DB={db_val} API={api_val}")
    return _result("A1", name, "PASS", db_val, api_val)


def check_a2(cur, td):
    """dashboard.sell_signals_count"""
    name = "dashboard.sell_signals_count"
    api = api_get(f"/api/dashboard/summary?trade_date={td}")
    if not api or 'portfolio' not in api:
        return _result("A2", name, "SKIP", "-", "-", "API调用失败")
    api_val = api['portfolio']['sell_signals_count']
    cur.execute("""SELECT COUNT(*) FROM ashare_portfolio
                   WHERE position_type='PAPER' AND status='open'
                     AND action_signal IS NOT NULL AND action_signal != 'HOLD'""")
    db_val = cur.fetchone()[0]
    if api_val != db_val:
        return _result("A2", name, "FAIL", db_val, api_val, f"DB={db_val} API={api_val}")
    return _result("A2", name, "PASS", db_val, api_val)


def check_a3(cur, td):
    """dashboard.gate_blocked_count"""
    name = "dashboard.gate_blocked_count"
    api = api_get(f"/api/dashboard/summary?trade_date={td}")
    if not api or 'risk' not in api:
        return _result("A3", name, "SKIP", "-", "-", "API调用失败")
    api_val = api['risk']['gate_blocked_count']
    cur.execute("SELECT COUNT(*) FROM ashare_risk_score WHERE trade_date=%s AND trade_allowed=false", (td,))
    db_val = cur.fetchone()[0]
    if api_val != db_val:
        return _result("A3", name, "WARN", db_val, api_val, f"DB={db_val} API={api_val}")
    return _result("A3", name, "PASS", db_val, api_val)


def check_a4(cur, td):
    """signals/buy count"""
    name = "signals/buy count"
    api = api_get(f"/api/signals/buy?trade_date={td}")
    if not api or 'count' not in api:
        return _result("A4", name, "SKIP", "-", "-", "API调用失败")
    api_val = api['count']
    cur.execute("SELECT COUNT(*) FROM ashare_watchlist WHERE status='active' AND buy_signal IS NOT NULL")
    db_val = cur.fetchone()[0]
    if api_val != db_val:
        return _result("A4", name, "FAIL", db_val, api_val, f"DB={db_val} API={api_val}")
    return _result("A4", name, "PASS", db_val, api_val)


def check_a5(cur, td):
    """signals/sell count"""
    name = "signals/sell count"
    api = api_get(f"/api/signals/sell?trade_date={td}")
    if not api or 'count' not in api:
        return _result("A5", name, "SKIP", "-", "-", "API调用失败")
    api_val = api['count']
    cur.execute("""SELECT COUNT(*) FROM ashare_portfolio
                   WHERE status='open' AND action_signal IS NOT NULL""")
    db_val = cur.fetchone()[0]
    if api_val != db_val:
        return _result("A5", name, "FAIL", db_val, api_val, f"DB={db_val} API={api_val}")
    return _result("A5", name, "PASS", db_val, api_val)


def check_a6(cur, td):
    """watchlist gain_since_entry 抽样"""
    name = "watchlist gain_since_entry抽样"
    api = api_get("/api/watchlist")
    if not api or 'data' not in api:
        return _result("A6", name, "SKIP", "-", "-", "API调用失败")
    data = api['data']
    if not data:
        return _result("A6", name, "PASS", "无数据", "无数据", "watchlist为空")
    sample = random.sample(data, min(5, len(data)))
    mismatches = []
    for s in sample:
        ep = float(s.get('entry_price') or 0)
        lc = float(s.get('latest_close') or 0)
        api_gain = float(s.get('gain_since_entry') or 0)
        if ep > 0:
            calc_gain = (lc - ep) / ep
            diff = abs(calc_gain - api_gain)
            mismatches.append(f"{s['ts_code']}: calc={calc_gain:.4f} api={api_gain:.4f} diff={diff:.4f}")
            if diff > 0.01:
                detail = "; ".join(mismatches)
                return _result("A6", name, "FAIL", "diff<0.01", f"diff={diff:.4f}", detail)
    detail = "; ".join(mismatches)
    return _result("A6", name, "PASS", "diff<0.01", "OK", detail)


def check_a7(cur, td):
    """portfolio/summary total_nav"""
    name = "portfolio/summary total_nav"
    api = api_get("/api/portfolio/summary")
    if not api or not api.get('snapshot'):
        return _result("A7", name, "SKIP", "-", "-", "API无snapshot数据")
    api_nav = float(api['snapshot']['total_nav'])
    cur.execute("SELECT total_nav, snap_date FROM ashare_sim_portfolio_snapshot ORDER BY snap_date DESC LIMIT 1")
    row = cur.fetchone()
    if not row:
        return _result("A7", name, "SKIP", "-", "-", "无snapshot记录")
    db_nav = float(row[0])
    snap_date = str(row[1])
    diff_pct = abs(api_nav - db_nav) / db_nav if db_nav else 0
    detail = f"snap_date={snap_date} api_nav={api_nav:.2f} db_nav={db_nav:.2f}"
    if diff_pct > 0.01:
        return _result("A7", name, "WARN", f"{db_nav:.2f}", f"{api_nav:.2f}", detail)
    return _result("A7", name, "PASS", f"{db_nav:.2f}", f"{api_nav:.2f}", detail)


# ════════════════════════════════════════════════════════════════
# B层 — 表间交叉一致性
# ════════════════════════════════════════════════════════════════

def check_b1(cur, td):
    """持仓数一致"""
    name = "持仓数一致(portfolio vs snapshot)"
    cur.execute("SELECT COUNT(*) FROM ashare_portfolio WHERE position_type='PAPER' AND status='open'")
    db_port = cur.fetchone()[0]
    cur.execute("SELECT position_count, snap_date FROM ashare_sim_portfolio_snapshot ORDER BY snap_date DESC LIMIT 1")
    row = cur.fetchone()
    if not row:
        return _result("B1", name, "SKIP", str(db_port), "-", "无snapshot记录")
    db_snap = row[0]
    snap_date = str(row[1])
    detail = f"portfolio={db_port} snapshot={db_snap} snap_date={snap_date}"
    if db_port != db_snap:
        return _result("B1", name, "WARN", str(db_port), str(db_snap), detail)
    return _result("B1", name, "PASS", str(db_port), str(db_snap), detail)


def check_b2(cur, td):
    """模拟盘NAV平衡"""
    name = "模拟盘NAV平衡(nav=cash+mv)"
    cur.execute("SELECT total_nav, cash, market_value FROM ashare_sim_portfolio_snapshot ORDER BY snap_date DESC LIMIT 1")
    row = cur.fetchone()
    if not row:
        return _result("B2", name, "SKIP", "-", "-", "无snapshot记录")
    nav, cash, mv = float(row[0]), float(row[1]), float(row[2])
    diff = abs(nav - cash - mv)
    detail = f"nav={nav:.2f} cash={cash:.2f} mv={mv:.2f} diff={diff:.2f}"
    if diff > 1:
        return _result("B2", name, "FAIL", f"{nav:.2f}", f"{cash + mv:.2f}", detail)
    return _result("B2", name, "PASS", f"{nav:.2f}", f"{cash + mv:.2f}", detail)


def check_b3(cur, td):
    """持仓市值一致"""
    name = "持仓市值一致(portfolio vs snapshot)"
    cur.execute("SELECT COALESCE(SUM(market_value),0) FROM ashare_portfolio WHERE position_type='PAPER' AND status='open'")
    port_mv = float(cur.fetchone()[0])
    cur.execute("SELECT market_value, snap_date FROM ashare_sim_portfolio_snapshot ORDER BY snap_date DESC LIMIT 1")
    row = cur.fetchone()
    if not row:
        return _result("B3", name, "SKIP", f"{port_mv:.2f}", "-", "无snapshot记录")
    snap_mv = float(row[0])
    snap_date = str(row[1])
    diff_pct = abs(port_mv - snap_mv) / snap_mv if snap_mv else 0
    detail = f"portfolio_mv={port_mv:.2f} snapshot_mv={snap_mv:.2f} snap_date={snap_date} diff={diff_pct:.4%}"
    if diff_pct > 0.01:
        return _result("B3", name, "WARN", f"{snap_mv:.2f}", f"{port_mv:.2f}", detail)
    return _result("B3", name, "PASS", f"{snap_mv:.2f}", f"{port_mv:.2f}", detail)


def check_b4(cur, td):
    """watchlist active数量"""
    name = "watchlist active数量"
    cur.execute("SELECT COUNT(*) FROM ashare_watchlist WHERE status='active'")
    db_val = cur.fetchone()[0]
    api = api_get(f"/api/dashboard/summary?trade_date={td}")
    if api and 'opportunity' in api:
        api_val = api['opportunity']['watchlist_candidates']
        detail = f"DB={db_val} API={api_val}"
        if db_val != api_val:
            return _result("B4", name, "WARN", str(db_val), str(api_val), detail)
        return _result("B4", name, "PASS", str(db_val), str(api_val), detail)
    return _result("B4", name, "PASS", str(db_val), str(db_val), "API不可用，仅DB自检")


def check_b5(cur, td):
    """risk_score覆盖率"""
    name = "risk_score覆盖率"
    cur.execute("SELECT DISTINCT ts_code FROM ashare_risk_score WHERE trade_date=%s", (td,))
    scored = {r[0] for r in cur.fetchall()}
    cur.execute("""SELECT DISTINCT ts_code FROM ashare_watchlist WHERE status='active'
                   UNION
                   SELECT DISTINCT ts_code FROM ashare_portfolio WHERE position_type='PAPER' AND status='open'""")
    needed = {r[0] for r in cur.fetchall()}
    missing = needed - scored
    detail = f"需要{len(needed)}只 已覆盖{len(scored)}只 缺失{len(missing)}只"
    if missing:
        detail += f" 缺失: {','.join(sorted(missing)[:10])}"
        return _result("B5", name, "FAIL", f"0缺失", f"{len(missing)}缺失", detail)
    return _result("B5", name, "PASS", f"0缺失", f"0缺失", detail)


def check_b6(cur, td):
    """lifecycle_status一致"""
    name = "lifecycle_status一致"
    cur.execute("""SELECT ts_code, status, lifecycle_status FROM ashare_watchlist
                   WHERE status='active' AND lifecycle_status IS NOT NULL LIMIT 50""")
    rows = cur.fetchall()
    if not rows:
        return _result("B6", name, "PASS", "-", "-", "无lifecycle_status数据")
    bad = []
    valid_lifecycle = ('candidate', 'approved', 'signaled', 'active')
    for ts, status, ls in rows:
        if ls and ls not in valid_lifecycle:
            bad.append(f"{ts}: status={status} lifecycle={ls}")
    detail = f"检查{len(rows)}条"
    if bad:
        detail += f" 异常{len(bad)}条: {'; '.join(bad[:5])}"
        return _result("B6", name, "WARN", "consistent", f"{len(bad)}条异常", detail)
    return _result("B6", name, "PASS", "consistent", "consistent", detail)


def check_b7(cur, td):
    """sim_orders vs portfolio"""
    name = "sim_orders买入→持仓一致"
    cur.execute("""SELECT DISTINCT ts_code FROM ashare_sim_orders
                   WHERE fill_date=%s AND direction='BUY' AND status='filled'""", (td,))
    bought = {r[0] for r in cur.fetchall()}
    if not bought:
        return _result("B7", name, "PASS", "-", "-", "当日无成交买单")
    cur.execute("SELECT DISTINCT ts_code FROM ashare_portfolio WHERE position_type='PAPER' AND status='open'")
    held = {r[0] for r in cur.fetchall()}
    missing = bought - held
    detail = f"买入{len(bought)}只 持仓{len(held)}只"
    if missing:
        detail += f" 缺失: {','.join(sorted(missing))}"
        return _result("B7", name, "FAIL", str(len(bought)), str(len(held)), detail)
    return _result("B7", name, "PASS", str(len(bought)), str(len(held)), detail)


def check_b8(cur, td):
    """pipeline完整性"""
    name = "pipeline完整性"
    cur.execute("SELECT COUNT(*) FROM ashare_pipeline_runs WHERE trade_date=%s", (td,))
    cnt = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM ashare_pipeline_runs WHERE trade_date=%s AND status='fail'", (td,))
    fail_cnt = cur.fetchone()[0]
    detail = f"总步骤={cnt} 失败={fail_cnt}"
    if cnt < 30:
        return _result("B8", name, "FAIL", ">=30", str(cnt), detail)
    if fail_cnt > 0:
        return _result("B8", name, "WARN", "0 fail", f"{fail_cnt} fail", detail)
    return _result("B8", name, "PASS", ">=30", str(cnt), detail)


def check_b9(cur, td):
    """数据时效性"""
    name = "数据时效性"
    cur.execute("SELECT MAX(signal_date) FROM ashare_watchlist WHERE status='active' AND signal_date IS NOT NULL")
    row = cur.fetchone()
    max_signal = str(row[0]) if row and row[0] else None
    cur.execute("SELECT MAX(snap_date) FROM ashare_sim_portfolio_snapshot")
    row = cur.fetchone()
    max_snap = str(row[0]) if row and row[0] else None
    detail = f"signal_date={max_signal} snap_date={max_snap} trade_date={td}"
    # 简单判断：如果snap_date和td差距超过1天视为滞后
    issues = []
    if max_snap and max_snap < td:
        # 允许1天延迟（取前一个交易日）
        cur.execute("SELECT trade_date FROM ashare_daily_price WHERE trade_date < %s ORDER BY trade_date DESC LIMIT 1", (td,))
        prev = cur.fetchone()
        prev_td = str(prev[0]) if prev else None
        if max_snap < (prev_td or td):
            issues.append(f"snap滞后: {max_snap} < {prev_td}")
    if issues:
        return _result("B9", name, "FAIL", td, "; ".join(issues), detail)
    return _result("B9", name, "PASS", td, "时效正常", detail)


# ════════════════════════════════════════════════════════════════
# 邮件告警
# ════════════════════════════════════════════════════════════════

def send_alert_email(trade_date, results, fail_count, warn_count):
    smtp_host = os.environ.get('SMTP_HOST')
    smtp_port = int(os.environ.get('SMTP_PORT', 465))
    smtp_user = os.environ.get('SMTP_USER')
    smtp_pass = os.environ.get('SMTP_PASS')
    smtp_from = os.environ.get('SMTP_FROM')
    smtp_to = os.environ.get('SMTP_TO', 'timzhangqy@126.com')

    if not all([smtp_host, smtp_user, smtp_pass, smtp_from]):
        logger.warning("SMTP配置不完整，跳过邮件发送")
        return

    subject = f"[审计告警] A股系统 {trade_date}: {fail_count}项FAIL {warn_count}项WARN"

    pass_count = sum(1 for r in results if r['severity'] == 'PASS')
    rows_html = ""
    for r in results:
        sev = r['severity']
        if sev == 'FAIL':
            color, bg = '#dc2626', '#fef2f2'
        elif sev == 'WARN':
            color, bg = '#d97706', '#fffbeb'
        elif sev == 'PASS':
            color, bg = '#16a34a', '#f0fdf4'
        else:
            color, bg = '#6b7280', '#f9fafb'
        rows_html += f"""<tr style="background:{bg}">
            <td style="padding:6px 10px;color:{color};font-weight:bold">{sev}</td>
            <td style="padding:6px 10px">{r['check_id']}</td>
            <td style="padding:6px 10px">{r['check_name']}</td>
            <td style="padding:6px 10px">{r['expected']}</td>
            <td style="padding:6px 10px">{r['actual']}</td>
            <td style="padding:6px 10px;font-size:12px">{r.get('detail','') or ''}</td>
        </tr>"""

    html = f"""<html><body style="font-family:sans-serif">
    <h2 style="color:#1e293b">数据一致性审计 — {trade_date}</h2>
    <p>PASS: {pass_count} |
       <span style="color:#dc2626">FAIL: {fail_count}</span> |
       <span style="color:#d97706">WARN: {warn_count}</span></p>
    <table style="border-collapse:collapse;width:100%;font-size:13px" border="1" bordercolor="#e5e7eb">
    <tr style="background:#f1f5f9"><th>级别</th><th>ID</th><th>检查项</th><th>预期</th><th>实际</th><th>详情</th></tr>
    {rows_html}
    </table>
    <p style="color:#9ca3af;font-size:11px">自动发送 by data_consistency_audit.py</p>
    </body></html>"""

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = smtp_from
    msg['To'] = smtp_to
    msg.attach(MIMEText(html, 'html', 'utf-8'))

    try:
        with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from, [smtp_to], msg.as_string())
        logger.info(f"告警邮件已发送至 {smtp_to}")
    except Exception as e:
        logger.error(f"邮件发送失败: {e}")


# ════════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description='数据一致性审计')
    parser.add_argument('--date', help='交易日 YYYYMMDD')
    parser.add_argument('--dry_run', action='store_true')
    args = parser.parse_args()

    conn = get_db()
    cur = conn.cursor()
    date_str = args.date.replace('-', '') if args.date else None
    td = resolve_trade_date(cur, date_str)
    if not td:
        logger.error("无法解析交易日期")
        sys.exit(1)
    logger.info(f"=== 数据一致性审计 {td} ===")

    results = []
    checks = [check_a1, check_a2, check_a3, check_a4, check_a5, check_a6, check_a7,
              check_b1, check_b2, check_b3, check_b4, check_b5, check_b6, check_b7,
              check_b8, check_b9]
    for fn in checks:
        try:
            results.append(fn(cur, td))
        except Exception as e:
            cid = fn.__name__.replace('check_', '').upper()
            logger.error(f"检查 {cid} 异常: {e}")
            results.append(_result(cid, fn.__doc__ or cid, "SKIP", "-", "-", str(e)))

    pass_count = sum(1 for r in results if r['severity'] == 'PASS')
    fail_count = sum(1 for r in results if r['severity'] == 'FAIL')
    warn_count = sum(1 for r in results if r['severity'] == 'WARN')
    skip_count = sum(1 for r in results if r['severity'] == 'SKIP')

    for r in results:
        tag = r['severity']
        logger.info(f"  [{tag:4s}] {r['check_id']} {r['check_name']}: expected={r['expected']}, actual={r['actual']}")

    logger.info(f"=== 结果: {pass_count} PASS / {fail_count} FAIL / {warn_count} WARN / {skip_count} SKIP ===")

    if not args.dry_run:
        write_cur = conn.cursor()
        for r in results:
            write_cur.execute("""
                INSERT INTO ashare_audit_results (trade_date, check_id, check_name, severity, expected, actual, detail)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (trade_date, check_id)
                DO UPDATE SET check_name=EXCLUDED.check_name, severity=EXCLUDED.severity,
                              expected=EXCLUDED.expected, actual=EXCLUDED.actual,
                              detail=EXCLUDED.detail, created_at=NOW()
            """, (td, r['check_id'], r['check_name'], r['severity'],
                  str(r['expected']), str(r['actual']), r.get('detail')))
        conn.commit()
        logger.info(f"已写入 {len(results)} 条审计结果到 ashare_audit_results")

        if fail_count > 0 or warn_count > 0:
            send_alert_email(td, results, fail_count, warn_count)
        else:
            logger.info("全部PASS，无需发送告警邮件")
    else:
        logger.info("[DRY RUN] 跳过数据库写入和邮件发送")

    conn.close()
    print(f"DATA_AUDIT DONE | date={td} | pass={pass_count} fail={fail_count} warn={warn_count} skip={skip_count}")


if __name__ == '__main__':
    main()
