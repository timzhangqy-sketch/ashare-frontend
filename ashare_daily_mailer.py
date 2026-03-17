#!/opt/ashare_venv/bin/python
# -*- coding: utf-8 -*-
"""
ashare_daily_mailer.py — A股量化系统每日邮件通知

邮件内容（4个策略区块）：
  1. 连续放量蓄势策略
     - 当日候选（全量）
     - 累积观察池 Top10（按avg_vr3 DESC, gain_pct DESC）
  2. Retoc2 v3 异动策略
     - 当日触发信号（全量）
     - 观察池 Top10（按total_bars_10 DESC, amount_yi DESC）
  3. T-2大涨蓄势策略
     - 当日触发（全量）
     - 观察池 Top10（按days_left ASC, ret_t2 DESC）
  4. 弱市吸筹

用法：
  source /opt/ashare_env.sh
  /opt/ashare_venv/bin/python /opt/ashare_daily_mailer.py --date 20260303
  /opt/ashare_venv/bin/python /opt/ashare_daily_mailer.py --date 20260303 --dry_run
"""

import os
import sys
import argparse
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from email.header import Header
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor

# ============================================================
# Config
# ============================================================
REPORT_FILE = "/opt/reports/pool_daily_scans.xlsx"

def env(key, default=""):
    return os.environ.get(key, default) or default

def get_db_conn():
    return psycopg2.connect(
        host=env("ASHARE_DB_HOST", "localhost"),
        dbname=env("ASHARE_DB_NAME", "ashare"),
        user=env("ASHARE_DB_USER", "ashare_user"),
        password=env("ASHARE_DB_PASS", "")
    )

def parse_yyyymmdd(s):
    s = s.replace("-", "")
    return datetime.strptime(s, "%Y%m%d").date()

# ============================================================
# 数据获取
# ============================================================
def fetch_stats(conn, date_iso):
    """获取当日统计概览"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT COUNT(*) AS n FROM ashare_vol_surge_pool WHERE trade_date=%s", (date_iso,))
        today_n = cur.fetchone()['n']

        cur.execute("""
            SELECT COUNT(*) AS n,
                   COALESCE(ROUND(AVG(gain_since_buy)*100, 2), 0) AS avg_gain,
                   COALESCE(SUM(CASE WHEN gain_since_buy > 0 THEN 1 ELSE 0 END), 0) AS win_n
            FROM ashare_vol_surge_pool WHERE status='active' AND buy_price IS NOT NULL
        """)
        active = cur.fetchone()

        cur.execute("""
            SELECT COUNT(*) AS n, COALESCE(ROUND(AVG(pnl_pct)*100, 2), 0) AS avg_pnl
            FROM ashare_vol_surge_pool WHERE exit_date=%s
        """, (date_iso,))
        exited = cur.fetchone()

        return {
            'today_candidates': today_n,
            'active_n': active['n'],
            'active_avg_gain': active['avg_gain'],
            'active_win_n': active['win_n'],
            'exited_n': exited['n'],
            'exited_avg_pnl': exited['avg_pnl'],
        }

def fetch_vol_surge_today(conn, date_iso):
    """连续放量蓄势 — 当日候选（全量）"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT ts_code, name, close,
                   ROUND(avg_vr3::numeric, 2) AS avg_vr3,
                   ROUND(ret5::numeric*100, 1) AS ret5_pct,
                   ROUND(ret20::numeric*100, 1) AS ret20_pct,
                   ROUND(amount/100000.0, 2) AS amount_yi,
                   turnover_rate, entry_rank
            FROM ashare_vol_surge_pool
            WHERE trade_date = %s ORDER BY entry_rank
        """, (date_iso,))
        return cur.fetchall()

def fetch_vol_surge_watch(conn, date_iso, limit=10):
    """连续放量蓄势 — 累积观察池 Top10（按放量强度+成交额排序）"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT ts_code, name, trade_date,
                   ROUND(close::numeric, 2) AS close,
                   ROUND(avg_vr3::numeric, 2) AS avg_vr3,
                   ROUND(ret5::numeric*100, 1) AS ret5_pct,
                   ROUND(ret20::numeric*100, 1) AS ret20_pct,
                   ROUND(amount/100000.0, 2) AS amount_yi,
                   turnover_rate, entry_rank
            FROM ashare_vol_surge_pool
            WHERE status='active'
            ORDER BY avg_vr3 DESC, amount DESC
            LIMIT %s
        """, (limit,))
        return cur.fetchall()

def fetch_retoc2_v3_trigger(conn, date_iso, limit=20):
    """Retoc2 v3 触发信号（第4次异动，全量）"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT ts_code, name, grade, total_bars_10, cnt_bars,
                ROUND(ret10*100, 2) AS ret10_pct,
                ROUND(turnover_rate, 2) AS turnover,
                ROUND(pct_chg*100, 2) AS pct_pct,
                ROUND(close, 2) AS close,
                ROUND(ma20, 2) AS ma20,
                ROUND(amount_yi, 2) AS amount_yi
            FROM ashare_retoc2_v3_trigger
            WHERE trade_date = %s
            ORDER BY grade ASC, total_bars_10 DESC, amount_yi DESC NULLS LAST
            LIMIT %s
        """, (date_iso, limit))
        return cur.fetchall()

def fetch_retoc2_v3_watch(conn, date_iso, limit=10):
    """Retoc2 v3 观察池 Top10（按10日bar数+成交额排序）"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            WITH latest_per_stock AS (
                SELECT DISTINCT ON (ts_code)
                    ts_code, name, trade_date, total_bars_10, cnt_bars,
                    ROUND(ret10*100, 2) AS ret10_pct,
                    ROUND(turnover_rate, 2) AS turnover,
                    ROUND(pct_chg*100, 2) AS pct_pct,
                    ROUND(close, 2) AS close,
                    ROUND(amount_yi, 2) AS amount_yi
                FROM ashare_retoc2_v3_watch
                WHERE trade_date BETWEEN (%s::date - INTERVAL '10 days') AND %s::date
                ORDER BY ts_code, trade_date DESC
            )
            SELECT *, (%s::date - trade_date) AS days_in_pool
            FROM latest_per_stock
            ORDER BY total_bars_10 DESC, amount_yi DESC NULLS LAST
            LIMIT %s
        """, (date_iso, date_iso, date_iso, limit))
        return cur.fetchall()

def fetch_pattern_t2up9(conn, date_iso, limit=20):
    """T-2大涨蓄势 — 当日触发信号（全量）"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT p.ts_code, COALESCE(s.name,'') AS name,
                   ROUND(p.ret_t2::numeric*100,1) AS ret_t2,
                   ROUND(p.ret_t1::numeric*100,1) AS ret_t1,
                   ROUND(p.ret_t0::numeric*100,1) AS ret_t0,
                   ROUND(p.ret_2d::numeric*100,1) AS ret_2d,
                   ROUND(p.amount_t_k::numeric/100000.0,2) AS amount_yi
            FROM public.ashare_pattern_t2up9_2dup_lt5_candidates p
            LEFT JOIN public.ashare_stock_basic s ON p.ts_code=s.ts_code
            WHERE p.anchor_date = %s ORDER BY p.ret_t2 DESC LIMIT %s
        """, (date_iso, limit))
        return cur.fetchall()

def fetch_pattern_t2up9_watch(conn, date_iso, limit=10):
    """T-2大涨蓄势 — 观察池 Top10（按剩余天数升序+T-2涨幅降序）"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT
                w.ts_code,
                COALESCE(w.name, s.name, '') AS name,
                w.entry_date,
                w.exit_date,
                ROUND(w.ret_t2::numeric*100, 1) AS ret_t2,
                ROUND(w.ret_2d::numeric*100,  2) AS ret_2d,
                ROUND(w.amount_t_k::numeric/100000.0, 2) AS amount_yi,
                ROUND(p.close::numeric, 2) AS close_today,
                CASE WHEN p0.close > 0
                     THEN ROUND((p.close::numeric / p0.close::numeric - 1)*100, 1)
                END AS gain_pct,
                (SELECT COUNT(*) FROM ashare_trade_calendar
                 WHERE is_open=true AND cal_date > %s::date AND cal_date <= w.exit_date
                ) AS days_left
            FROM public.ashare_pattern_t2up9_watch w
            LEFT JOIN public.ashare_stock_basic s ON s.ts_code = w.ts_code
            LEFT JOIN public.ashare_daily_price p
                ON p.ts_code = w.ts_code AND p.trade_date = %s::date
            LEFT JOIN public.ashare_daily_price p0
                ON p0.ts_code = w.ts_code AND p0.trade_date = w.entry_date
            WHERE (w.exit_date > %s::date OR w.exit_date IS NULL)
            ORDER BY days_left ASC, w.ret_t2 DESC
            LIMIT %s
        """, (date_iso, date_iso, date_iso, limit))
        return cur.fetchall()

def fetch_all_watch_codes(conn, date_iso):
    """获取所有观察池股票代码（全量，用于文本附件）"""
    codes = set()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # 放量蓄势全量
        cur.execute("SELECT ts_code FROM ashare_vol_surge_pool WHERE status='active'")
        for r in cur.fetchall(): codes.add(r['ts_code'])
        # Retoc2全量
        cur.execute("""
            SELECT DISTINCT ON (ts_code) ts_code
            FROM ashare_retoc2_v3_watch
            WHERE trade_date BETWEEN (%s::date - INTERVAL '10 days') AND %s::date
        """, (date_iso, date_iso))
        for r in cur.fetchall(): codes.add(r['ts_code'])
        # T-2全量
        cur.execute("""
            SELECT ts_code FROM ashare_pattern_t2up9_watch
            WHERE exit_date > %s::date OR exit_date IS NULL
        """, (date_iso,))
        for r in cur.fetchall(): codes.add(r['ts_code'])
    return sorted(codes)

def fetch_weak_buy(conn, date_iso, limit=20):
    """弱市吸筹 - 当日信号"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT ts_code, name,
                   ROUND(close::numeric, 2) AS close,
                   ROUND(ret60::numeric*100, 1) AS ret60_pct,
                   volup15_days,
                   ROUND(volup15_avg_ret::numeric*100, 2) AS avg_ret_pct,
                   amount_yi
            FROM ashare_weak_buy_pool
            WHERE trade_date = %s
            ORDER BY ret60 ASC
            LIMIT %s
        """, (date_iso, limit))
        return cur.fetchall()

# ============================================================
# 文本附件生成
# ============================================================


def fetch_sim_data(conn, date_iso):
    """Fetch sim portfolio snapshot and orders for the given date."""
    cur = conn.cursor()
    sim = {}

    # Snapshot
    cur.execute("""
        SELECT total_nav, cash, market_value, position_count,
               daily_pnl_pct, cumulative_pnl_pct
        FROM ashare_sim_portfolio_snapshot
        WHERE snap_date = %s
    """, (date_iso,))
    row = cur.fetchone()
    if row:
        sim['nav'] = float(row[0])
        sim['cash'] = float(row[1])
        sim['market_value'] = float(row[2])
        sim['positions'] = int(row[3])
        sim['daily_pnl_pct'] = float(row[4]) if row[4] is not None else 0
        sim['cum_pnl_pct'] = float(row[5]) if row[5] is not None else 0
        sim['cash_pct'] = round(sim['cash'] / sim['nav'] * 100, 1) if sim['nav'] > 0 else 0
    else:
        sim['nav'] = None

    # Market regime
    cur.execute("""
        SELECT regime FROM ashare_market_regime WHERE trade_date = %s
    """, (date_iso,))
    rrow = cur.fetchone()
    sim['regime'] = rrow[0] if rrow else '-'

    # Today's filled BUY orders
    cur.execute("""
        SELECT o.ts_code, b.name, o.strategy, o.signal_type,
               o.fill_price, o.fill_amount, o.fill_shares
        FROM ashare_sim_orders o
        LEFT JOIN ashare_stock_basic b ON b.ts_code = o.ts_code
        WHERE o.direction = 'BUY' AND o.status = 'filled'
          AND o.fill_date = %s
        ORDER BY o.fill_amount DESC
    """, (date_iso,))
    sim['buys'] = [{'ts_code': r[0], 'name': r[1] or '', 'strategy': r[2],
                    'signal': r[3], 'price': float(r[4]) if r[4] else 0,
                    'amount': float(r[5]) if r[5] else 0,
                    'shares': int(r[6]) if r[6] else 0} for r in cur.fetchall()]

    # Today's filled SELL orders
    cur.execute("""
        SELECT o.ts_code, b.name, o.signal_type,
               o.fill_price, o.fill_amount
        FROM ashare_sim_orders o
        LEFT JOIN ashare_stock_basic b ON b.ts_code = o.ts_code
        WHERE o.direction = 'SELL' AND o.status = 'filled'
          AND o.fill_date = %s
        ORDER BY o.fill_amount DESC
    """, (date_iso,))
    sim['sells'] = [{'ts_code': r[0], 'name': r[1] or '', 'signal': r[2],
                     'price': float(r[3]) if r[3] else 0,
                     'amount': float(r[4]) if r[4] else 0} for r in cur.fetchall()]

    # Today's rejected orders
    cur.execute("""
        SELECT o.ts_code, o.direction, o.reject_reason
        FROM ashare_sim_orders o
        WHERE o.status = 'rejected' AND o.order_date = %s
        ORDER BY o.ts_code
    """, (date_iso,))
    sim['rejects'] = [{'ts_code': r[0], 'direction': r[1],
                       'reason': r[2] or ''} for r in cur.fetchall()]

    cur.close()
    return sim

def generate_today_txt(date_iso, candidates, retoc2_trigger, pattern_t2up9, weak_buy):
    codes = set()
    for r in candidates: codes.add(r['ts_code'])
    for r in retoc2_trigger: codes.add(r['ts_code'])
    for r in pattern_t2up9: codes.add(r['ts_code'])
    for r in weak_buy: codes.add(r['ts_code'])
    return "\n".join(sorted(codes))

def generate_watchpool_txt(all_codes):
    return "\n".join(all_codes)

# ============================================================
# HTML 构建
# ============================================================
STYLE = """
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', sans-serif;
    font-size: 13px;
    color: #2c3e50;
    background: #eef2f7;
    padding: 20px 0;
  }

  .wrapper {
    max-width: 860px;
    margin: 0 auto;
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0,0,0,0.10);
  }

  /* ── 顶部标题栏 ── */
  .header {
    background: linear-gradient(135deg, #1a3a5c 0%, #2471a3 60%, #1abc9c 100%);
    padding: 28px 30px 22px;
    color: #fff;
  }
  .header h1 {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }
  .header .sub {
    font-size: 12px;
    opacity: 0.75;
    letter-spacing: 0.5px;
  }

  /* ── KPI 卡片行 ── */
  .kpi-row {
    display: flex;
    gap: 0;
    background: #f0f4f8;
    border-bottom: 1px solid #dde3ea;
  }
  .kpi-card {
    flex: 1;
    padding: 14px 10px;
    text-align: center;
    border-right: 1px solid #dde3ea;
  }
  .kpi-card:last-child { border-right: none; }
  .kpi-card .num {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.1;
  }
  .kpi-card .lbl {
    font-size: 11px;
    color: #7f8c8d;
    margin-top: 4px;
  }
  .num-blue  { color: #1a5276; }
  .num-red   { color: #c0392b; }
  .num-green { color: #27ae60; }
  .num-gray  { color: #7f8c8d; }

  /* ── 策略区块横幅 ── */
  .strategy-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 20px;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #fff;
    margin-top: 0;
  }
  .banner-1 { background: linear-gradient(90deg, #1a3a5c, #2471a3); }
  .banner-2 { background: linear-gradient(90deg, #4a235a, #8e44ad); }
  .banner-3 { background: linear-gradient(90deg, #7b3100, #e67e22); }
  .banner-4 { background: linear-gradient(90deg, #1e6b3c, #27ae60); }

  .strategy-body { padding: 14px 20px 6px; }

  /* ── 子区块标题 ── */
  .sub-title {
    font-size: 13px;
    font-weight: 600;
    color: #34495e;
    margin: 10px 0 6px;
    padding-left: 9px;
    border-left: 3px solid #bdc3c7;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sub-title.trigger { border-left-color: #e74c3c; color: #c0392b; }
  .sub-title.watch   { border-left-color: #95a5a6; color: #7f8c8d; }

  .badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(0,0,0,0.08);
    color: inherit;
    vertical-align: middle;
  }

  /* ── 表格 ── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
    font-size: 12px;
  }
  th {
    padding: 7px 8px;
    text-align: center;
    font-weight: 600;
    font-size: 11px;
    white-space: nowrap;
  }
  td {
    padding: 6px 8px;
    text-align: center;
    border-bottom: 1px solid #ecf0f1;
    white-space: nowrap;
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f5f8fc !important; }

  /* 策略1表头色 */
  .t1 th { background: #1a3a5c; color: #fff; }
  .t1 tr:nth-child(even) td { background: #f0f5fb; }

  /* 策略2表头色 */
  .t2 th { background: #4a235a; color: #fff; }
  .t2 tr:nth-child(even) td { background: #f8f4fb; }

  /* 策略3表头色 */
  .t3 th { background: #7b3100; color: #fff; }
  .t3 tr:nth-child(even) td { background: #fdf6ee; }

  /* 策略4表头色 */
  .t4 th { background: #1e6b3c; color: #fff; }
  .t4 tr:nth-child(even) td { background: #f0faf4; }

  /* 观察池表头稍浅 */
  .watch th { opacity: 0.88; }

  /* 涨跌色（A股：涨红跌绿） */
  .up   { color: #c0392b; font-weight: 600; }
  .dn   { color: #27ae60; font-weight: 600; }

  /* 今日新入池高亮行 */
  .row-new td { background: #fffbe6 !important; }
  /* 剩余天数紧迫 */
  .urgent { color: #c0392b; font-weight: 700; }

  /* 级别A标记 */
  .grade-a { color: #c0392b; font-weight: 700; }
  .grade-b { color: #7f8c8d; }

  .empty { color: #bdc3c7; font-size: 12px; padding: 12px 0; text-align: center; }

  /* ── 分割线 ── */
  .strategy-divider { height: 8px; background: #eef2f7; }

  /* ── 页脚 ── */
  .footer {
    background: #f8f9fa;
    border-top: 1px solid #e0e6ed;
    padding: 14px 20px;
    font-size: 11px;
    color: #95a5a6;
    text-align: center;
    line-height: 1.8;
  }
  .footer strong { color: #7f8c8d; }
</style>
"""

def pnl_cls(val):
    """返回涨跌CSS class"""
    if val is None: return ""
    try:
        v = float(val)
        if v > 0: return ' class="up"'
        if v < 0: return ' class="dn"'
    except: pass
    return ""

def fmt_pnl(val):
    """带符号显示盈亏"""
    if val is None: return "-"
    try:
        v = float(val)
        return f"+{v}" if v > 0 else str(v)
    except:
        return str(val)

def build_html(date_iso, stats, candidates, vol_watch,
               retoc2_trigger, retoc2_watch,
               pattern_t2up9, pattern_t2up9_watch,
               weak_buy, sim_data=None):

    parts = [f"<html><head><meta charset='utf-8'>{STYLE}</head><body>"]
    parts.append("<div class='wrapper'>")

    # ── 顶部标题 ──
    parts.append(f"""
    <div class='header'>
      <h1>📊 A股量化策略日报</h1>
      <div class='sub'>{date_iso} &nbsp;·&nbsp; 生成时间 {datetime.now().strftime('%H:%M')}</div>
    </div>
    """)

    # ── KPI 卡片（全策略汇总）──
    parts.append(f"""
    <div class='kpi-row'>
      <div class='kpi-card'>
        <div class='num' style='color:#2471a3'>🔥 {len(candidates)}</div>
        <div class='lbl'>放量蓄势 今日候选</div>
      </div>
      <div class='kpi-card'>
        <div class='num' style='color:#8e44ad'>⚡ {len(retoc2_trigger)}</div>
        <div class='lbl'>Retoc2 今日触发</div>
      </div>
      <div class='kpi-card'>
        <div class='num' style='color:#e67e22'>📌 {len(pattern_t2up9)}</div>
        <div class='lbl'>T-2大涨 今日触发</div>
      </div>
      <div class='kpi-card'>
        <div class='num' style='color:#27ae60'>🛡 {len(weak_buy)}</div>
        <div class='lbl'>弱市吸筹 今日信号</div>
      </div>
    </div>
    """)

    # ════════════════════════════════════════════
    # 策略1：连续放量蓄势
    # ════════════════════════════════════════════
    parts.append("<div class='strategy-banner banner-1'>🔥 策略一 &nbsp;·&nbsp; 连续放量蓄势</div>")
    parts.append("<div class='strategy-body'>")

    # 表1a：当日候选
    parts.append(f"<div class='sub-title trigger'>今日候选 <span class='badge'>{len(candidates)}只</span></div>")
    if candidates:
        parts.append("<table class='t1'><tr><th>#</th><th>代码</th><th>名称</th><th>收盘</th>"
                     "<th>3日均VR</th><th>5日%</th><th>20日%</th><th>成交(亿)</th><th>换手%</th></tr>")
        for r in candidates:
            r5 = pnl_cls(r['ret5_pct']); r20 = pnl_cls(r['ret20_pct'])
            parts.append(f"<tr><td>{r['entry_rank']}</td><td>{r['ts_code']}</td>"
                         f"<td><b>{r['name']}</b></td><td>{r['close']}</td>"
                         f"<td><b>{r['avg_vr3']}</b></td>"
                         f"<td{r5}>{r['ret5_pct']}</td>"
                         f"<td{r20}>{r['ret20_pct']}</td>"
                         f"<td>{r['amount_yi']}</td><td>{r['turnover_rate'] or ''}</td></tr>")
        parts.append("</table>")
    else:
        parts.append("<div class='empty'>今日无候选</div>")

    # 表1b：累积观察池
    parts.append(f"<div class='sub-title watch'>累积观察池 Top10（按放量强度排序）<span class='badge'>{len(vol_watch)}只</span></div>")
    if vol_watch:
        parts.append("<table class='t1 watch'><tr><th>#</th><th>代码</th><th>名称</th><th>入池日</th>"
                     "<th>收盘</th><th>3日均VR</th><th>5日%</th><th>20日%</th>"
                     "<th>成交(亿)</th><th>换手%</th></tr>")
        for i, r in enumerate(vol_watch, 1):
            r5 = pnl_cls(r['ret5_pct']); r20 = pnl_cls(r['ret20_pct'])
            parts.append(f"<tr><td>{i}</td><td>{r['ts_code']}</td>"
                         f"<td><b>{r['name']}</b></td><td>{r['trade_date']}</td>"
                         f"<td>{r['close']}</td><td><b>{r['avg_vr3']}</b></td>"
                         f"<td{r5}>{r['ret5_pct']}</td>"
                         f"<td{r20}>{r['ret20_pct']}</td>"
                         f"<td>{r['amount_yi']}</td><td>{r['turnover_rate'] or ''}</td></tr>")
        parts.append("</table>")
    else:
        parts.append("<div class='empty'>观察池暂无数据</div>")

    parts.append("</div>")  # strategy-body

    # ════════════════════════════════════════════
    # 策略2：Retoc2 v3 异动
    # ════════════════════════════════════════════
    parts.append("<div class='strategy-divider'></div>")
    parts.append("<div class='strategy-banner banner-2'>⚡ 策略二 &nbsp;·&nbsp; Retoc2 v3 异动</div>")
    parts.append("<div class='strategy-body'>")

    # 表2a：触发信号
    parts.append(f"<div class='sub-title trigger'>今日触发信号（第4次异动）<span class='badge'>{len(retoc2_trigger)}只</span></div>")
    if retoc2_trigger:
        parts.append("<table class='t2'><tr><th>级别</th><th>代码</th><th>名称</th>"
                     "<th>10日bar</th><th>当日bar</th><th>ret10%</th>"
                     "<th>换手%</th><th>涨幅%</th><th>收盘</th><th>MA20</th><th>成交(亿)</th></tr>")
        for r in retoc2_trigger:
            g = str(r.get('grade', '')).strip()
            gcls = "grade-a" if g == 'A' else "grade-b"
            pct = pnl_cls(r['pct_pct']); ret10 = pnl_cls(r['ret10_pct'])
            parts.append(f"<tr><td class='{gcls}'>{g}</td><td>{r['ts_code']}</td>"
                         f"<td><b>{r['name']}</b></td>"
                         f"<td>{r['total_bars_10']}</td><td>{r['cnt_bars']}</td>"
                         f"<td{ret10}>{r['ret10_pct']}</td>"
                         f"<td>{r['turnover']}</td>"
                         f"<td{pct}>{r['pct_pct']}</td>"
                         f"<td>{r['close']}</td><td>{r['ma20']}</td><td>{r['amount_yi']}</td></tr>")
        parts.append("</table>")
    else:
        parts.append("<div class='empty'>今日无触发信号</div>")

    # 表2b：观察池
    parts.append(f"<div class='sub-title watch'>观察池 Top10（按10日bar数+成交额排序）<span class='badge'>{len(retoc2_watch)}只</span></div>")
    if retoc2_watch:
        parts.append("<table class='t2 watch'><tr><th>代码</th><th>名称</th><th>入池日</th>"
                     "<th>在池天</th><th>10日bar</th><th>ret10%</th>"
                     "<th>换手%</th><th>成交(亿)</th></tr>")
        for r in retoc2_watch:
            days = r.get('days_in_pool', 0)
            if hasattr(days, 'days'): days = days.days
            row_cls = " class='row-new'" if days == 0 else ""
            ret10 = pnl_cls(r['ret10_pct'])
            parts.append(f"<tr{row_cls}><td>{r['ts_code']}</td>"
                         f"<td>{'💎 ' if days==0 else ''}{r['name']}</td>"
                         f"<td>{r['trade_date']}</td><td>{days}天</td>"
                         f"<td>{r['total_bars_10']}</td>"
                         f"<td{ret10}>{r['ret10_pct']}</td>"
                         f"<td>{r['turnover']}</td><td>{r['amount_yi']}</td></tr>")
        parts.append("</table>")
    else:
        parts.append("<div class='empty'>观察池暂无数据</div>")

    parts.append("</div>")

    # ════════════════════════════════════════════
    # 策略3：T-2大涨蓄势
    # ════════════════════════════════════════════
    parts.append("<div class='strategy-divider'></div>")
    parts.append("<div class='strategy-banner banner-3'>📌 策略三 &nbsp;·&nbsp; T-2大涨蓄势</div>")
    parts.append("<div class='strategy-body'>")

    # 表3a：当日触发
    parts.append(f"<div class='sub-title trigger'>今日触发<span class='badge'>{len(pattern_t2up9)}只</span></div>")
    if pattern_t2up9:
        parts.append("<table class='t3'><tr><th>代码</th><th>名称</th>"
                     "<th>T-2涨幅%</th><th>T-1涨幅%</th><th>T日涨幅%</th>"
                     "<th>两日累计%</th><th>成交(亿)</th></tr>")
        for r in pattern_t2up9:
            parts.append(f"<tr><td>{r['ts_code']}</td><td><b>{r['name']}</b></td>"
                         f"<td class='up'>{r['ret_t2']}</td>"
                         f"<td{pnl_cls(r['ret_t1'])}>{r['ret_t1']}</td>"
                         f"<td{pnl_cls(r['ret_t0'])}>{r['ret_t0']}</td>"
                         f"<td{pnl_cls(r['ret_2d'])}>{r['ret_2d']}</td>"
                         f"<td>{r['amount_yi']}</td></tr>")
        parts.append("</table>")
    else:
        parts.append("<div class='empty'>今日无触发信号</div>")

    # 表3b：观察池
    parts.append(f"<div class='sub-title watch'>观察池 Top10（按剩余天数紧迫度排序）<span class='badge'>{len(pattern_t2up9_watch)}只</span></div>")
    if pattern_t2up9_watch:
        parts.append("<table class='t3 watch'><tr><th>代码</th><th>名称</th><th>入池日</th>"
                     "<th>T-2涨幅%</th><th>两日累计%</th>"
                     "<th>今日收盘</th><th>入池涨幅%</th>"
                     "<th>剩余天数</th><th>成交(亿)</th></tr>")
        for r in pattern_t2up9_watch:
            days_left = r.get('days_left', 0)
            is_new = str(r.get('entry_date', '')) == date_iso
            row_cls = " class='row-new'" if is_new else ""
            gain = r.get('gain_pct')
            gain_str = fmt_pnl(gain) + "%" if gain is not None else "-"
            days_cls = " class='urgent'" if (days_left or 0) <= 2 else ""
            parts.append(
                f"<tr{row_cls}>"
                f"<td>{r['ts_code']}</td>"
                f"<td>{'💎 ' if is_new else ''}{r['name']}</td>"
                f"<td>{r['entry_date']}</td>"
                f"<td class='up'>{r['ret_t2']}</td>"
                f"<td{pnl_cls(r['ret_2d'])}>{r['ret_2d']}</td>"
                f"<td>{r.get('close_today') or '-'}</td>"
                f"<td{pnl_cls(gain)}>{gain_str}</td>"
                f"<td{days_cls}>{days_left}天</td>"
                f"<td>{r['amount_yi']}</td>"
                f"</tr>"
            )
        parts.append("</table>")
    else:
        parts.append("<div class='empty'>观察池暂无数据</div>")

    parts.append("</div>")

    # ════════════════════════════════════════════
    # 策略4：近弱市吸筹最多
    # ════════════════════════════════════════════
    parts.append("<div class='strategy-divider'></div>")
    parts.append("<div class='strategy-banner banner-4'>🛡 策略四 &nbsp;·&nbsp; 弱市吸筹</div>")
    parts.append("<div class='strategy-body'>")

    if weak_buy:
        parts.append(f"<div class='sub-title trigger'>今日信号<span class='badge'>{len(weak_buy)}只</span></div>")
        parts.append("<table class='t4'><tr><th>代码</th><th>名称</th>"
                     "<th>收盘</th><th>60日涨幅%</th><th>放量天数</th><th>平均涨幅%</th><th>成交(亿)</th></tr>")
        for r in weak_buy:
            parts.append(f"<tr><td>{r['ts_code']}</td><td><b>{r['name']}</b></td>"
                         f"<td>{r['close']}</td>"
                         f"<td class='dn'>{r['ret60_pct']}</td>"
                         f"<td class='up'><b>{r['volup15_days']}</b></td>"
                         f"<td>{r['avg_ret_pct']}</td>"
                         f"<td>{r['amount_yi']}</td></tr>")
        parts.append("</table>")
    else:
        parts.append("<div class='empty'>今日无数据</div>")

    parts.append("</div>")


    # ════════════════════════════════════════════
    # 模拟盘日报
    # ════════════════════════════════════════════
    parts.append("<div class='strategy-divider'></div>")
    parts.append("<div class='strategy-banner banner-1'>&#128202; 模拟盘日报</div>")
    parts.append("<div class='strategy-body'>")

    if sim_data and sim_data.get('nav') is not None:
        sd = sim_data
        regime_map = {'trend_up': '趋势上涨', 'range_up': '温和上涨',
                      'range_choppy': '震荡', 'down_weak': '弱势下跌'}
        regime_cn = regime_map.get(sd['regime'], sd['regime'])
        daily_cls = ' class="up"' if sd['daily_pnl_pct'] > 0 else (' class="dn"' if sd['daily_pnl_pct'] < 0 else '')
        cum_cls = ' class="up"' if sd['cum_pnl_pct'] > 0 else (' class="dn"' if sd['cum_pnl_pct'] < 0 else '')

        parts.append("<div class='sub-title trigger'>账户概览</div>")
        parts.append("<table class='t1'><tr>"
                     "<th>NAV</th><th>日收益</th><th>累计收益</th>"
                     "<th>持仓数</th><th>现金比例</th><th>市场环境</th></tr>")
        parts.append(f"<tr>"
                     f"<td><b>{sd['nav']:,.0f}</b></td>"
                     f"<td{daily_cls}><b>{sd['daily_pnl_pct']*100:+.2f}%</b></td>"
                     f"<td{cum_cls}><b>{sd['cum_pnl_pct']*100:+.2f}%</b></td>"
                     f"<td>{sd['positions']}</td>"
                     f"<td>{sd['cash_pct']:.1f}%</td>"
                     f"<td>{regime_cn}</td></tr>")
        parts.append("</table>")

        # Buy details
        if sd['buys']:
            parts.append(f"<div class='sub-title trigger'>今日买入 <span class='badge'>{len(sd['buys'])}笔</span></div>")
            parts.append("<table class='t1'><tr><th>股票</th><th>名称</th><th>策略</th>"
                         "<th>信号</th><th>成交价</th><th>金额</th><th>股数</th></tr>")
            for b in sd['buys']:
                parts.append(f"<tr><td>{b['ts_code']}</td><td>{b['name']}</td>"
                             f"<td>{b['strategy']}</td><td>{b['signal']}</td>"
                             f"<td>{b['price']:.2f}</td><td>{b['amount']:,.0f}</td>"
                             f"<td>{b['shares']}</td></tr>")
            parts.append("</table>")

        # Sell details
        if sd['sells']:
            parts.append(f"<div class='sub-title trigger'>今日卖出 <span class='badge'>{len(sd['sells'])}笔</span></div>")
            parts.append("<table class='t2'><tr><th>股票</th><th>名称</th>"
                         "<th>信号类型</th><th>成交价</th><th>金额</th></tr>")
            for s in sd['sells']:
                parts.append(f"<tr><td>{s['ts_code']}</td><td>{s['name']}</td>"
                             f"<td>{s['signal']}</td><td>{s['price']:.2f}</td>"
                             f"<td>{s['amount']:,.0f}</td></tr>")
            parts.append("</table>")

        # Rejected orders
        if sd['rejects']:
            parts.append(f"<div class='sub-title watch'>拒单 <span class='badge'>{len(sd['rejects'])}笔</span></div>")
            parts.append("<table class='t3'><tr><th>股票</th><th>方向</th><th>原因</th></tr>")
            for r in sd['rejects']:
                parts.append(f"<tr><td>{r['ts_code']}</td><td>{r['direction']}</td>"
                             f"<td>{r['reason']}</td></tr>")
            parts.append("</table>")

        if not sd['buys'] and not sd['sells'] and not sd['rejects']:
            parts.append("<div class='empty'>今日无交易</div>")
    else:
        parts.append("<div class='empty'>今日无模拟盘数据</div>")

    parts.append("</div>")

    # ── 页脚 ──
    parts.append(f"""
    <div class='footer'>
      <strong>A股量化系统</strong> &nbsp;|&nbsp;
      连续放量 VR≥2.0·ret20 0-5%·MA20上方·持5天 &nbsp;|&nbsp;
      Retoc2 v3 第4次异动 &nbsp;|&nbsp; T-2大涨蓄势 &nbsp;|&nbsp; 弱市吸筹<br>
      本报告由系统自动生成，不构成投资建议 &nbsp;·&nbsp; {datetime.now().strftime('%Y-%m-%d %H:%M')}
    </div>
    """)

    parts.append("</div></body></html>")
    return "\n".join(parts)

# ============================================================
# 邮件发送
# ============================================================
def send_mail(subject, html_body, to_addr, attachment_path=None):
    smtp_host = env("SMTP_HOST", "smtp.126.com")
    smtp_port = int(env("SMTP_PORT", "465"))
    smtp_user = env("SMTP_USER")
    smtp_pass = env("SMTP_PASS")
    from_addr = env("SMTP_FROM", smtp_user)

    if not smtp_user or not smtp_pass:
        raise RuntimeError("SMTP credentials not set. Check /opt/ashare_env.sh")

    msg = MIMEMultipart()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    # 附件（支持列表，txt用MIMEText，其他用MIMEBase）
    if attachment_path:
        paths = attachment_path if isinstance(attachment_path, list) else [attachment_path]
        for ap in paths:
            if not ap or not os.path.exists(ap):
                continue
            fname = os.path.basename(ap)
            encoded_fname = Header(fname, 'utf-8').encode()
            if ap.endswith('.txt'):
                with open(ap, "r", encoding="utf-8") as fp:
                    part = MIMEText(fp.read(), "plain", "utf-8")
                part.add_header("Content-Disposition", f"attachment", filename=('utf-8', '', fname))
            else:
                with open(ap, "rb") as fp:
                    part = MIMEBase("application", "octet-stream")
                    part.set_payload(fp.read())
                    encoders.encode_base64(part)
                    part.add_header("Content-Disposition", f"attachment", filename=('utf-8', '', fname))
            msg.attach(part)
    with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
        server.login(smtp_user, smtp_pass)
        server.sendmail(from_addr, to_addr.split(","), msg.as_string())

# ============================================================
# Main
# ============================================================
def main():
    ap = argparse.ArgumentParser(description="A股量化日报邮件通知")
    ap.add_argument("--date", required=True, help="YYYYMMDD")
    ap.add_argument("--to", default=None, help="收件人（逗号分隔）")
    ap.add_argument("--dry_run", action="store_true", help="只生成HTML不发送")
    args = ap.parse_args()

    date_iso = str(parse_yyyymmdd(args.date))
    to_addr = args.to or env("SMTP_TO", "")

    conn = get_db_conn()
    try:
        stats           = fetch_stats(conn, date_iso)
        candidates      = fetch_vol_surge_today(conn, date_iso)
        vol_watch       = fetch_vol_surge_watch(conn, date_iso, limit=10)
        retoc2_trigger  = fetch_retoc2_v3_trigger(conn, date_iso, limit=20)
        retoc2_watch    = fetch_retoc2_v3_watch(conn, date_iso, limit=10)
        pattern_t2up9   = fetch_pattern_t2up9(conn, date_iso)
        pattern_t2up9_watch = fetch_pattern_t2up9_watch(conn, date_iso, limit=10)
        weak_buy = fetch_weak_buy(conn, date_iso)
        all_watch_codes = fetch_all_watch_codes(conn, date_iso)
        sim_data        = fetch_sim_data(conn, date_iso)
    finally:
        conn.close()

    html = build_html(date_iso, stats, candidates, vol_watch,
                      retoc2_trigger, retoc2_watch,
                      pattern_t2up9, pattern_t2up9_watch,
                      weak_buy, sim_data=sim_data)

    today_txt_path = f"/tmp/当日入池_{date_iso}.txt"
    watch_txt_path = f"/tmp/所有观察池_{date_iso}.txt"
    with open(today_txt_path, "w", encoding="utf-8") as f:
        f.write(generate_today_txt(date_iso, candidates, retoc2_trigger, pattern_t2up9, weak_buy))
    with open(watch_txt_path, "w", encoding="utf-8") as f:
        f.write(generate_watchpool_txt(all_watch_codes))

    n_trigger = len(retoc2_trigger)
    n_watch   = len(retoc2_watch)
    subject = (f"[A股日报] {date_iso} | "
               f"放量候选{stats['today_candidates']} | "
               f"观察池{stats['active_n']}(均{fmt_pnl(stats['active_avg_gain'])}%) | "
               f"Retoc2触发{n_trigger}+观察{n_watch} | "
               f"退出{stats['exited_n']}")

    if args.dry_run:
        print(f"Subject: {subject}")
        print(f"To: {to_addr}")
        preview = "/tmp/ashare_mail_preview.html"
        with open(preview, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"HTML preview saved: {preview}")
        print(f"Attachment 当日入池: {today_txt_path} ({len(open(today_txt_path).readlines())}只)")
        print(f"Attachment 所有观察池: {watch_txt_path} ({len(open(watch_txt_path).readlines())}只)")
        print("MAILER DONE | dry_run=true")
        return

    if not to_addr:
        print("⚠️  未设置收件人（--to 或 SMTP_TO），跳过发送")
        print("MAILER DONE | skipped=no_recipient")
        return

    attachments = []
    if os.path.exists(REPORT_FILE):
        attachments.append(REPORT_FILE)
    attachments.append(today_txt_path)
    attachments.append(watch_txt_path)
    send_mail(subject, html, to_addr, attachments)
    print(f"✅ Mail sent to {to_addr}")
    print(f"MAILER DONE | date={date_iso} | to={to_addr}")

if __name__ == "__main__":
    main()
