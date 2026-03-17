#!/opt/ashare_venv/bin/python
"""Patch D3 (mailer sim section) and D4 (position_sizer min threshold)."""

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
# D3: ashare_daily_mailer.py — add sim portfolio section
# ============================================================
print("=== D3: ashare_daily_mailer.py ===")

# 1. Add fetch_sim_data function after fetch_all_watch_codes
SIM_FETCH_FUNC = '''

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

'''

# 2. HTML section builder for sim data
SIM_HTML_SECTION = '''
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
'''

patch('/opt/ashare_daily_mailer.py', [
    # 1. Add fetch_sim_data function after fetch_all_watch_codes function ends
    (
        "def generate_today_txt(",
        SIM_FETCH_FUNC + "def generate_today_txt("
    ),

    # 2. Modify build_html signature to accept sim_data
    (
        "def build_html(date_iso, stats, candidates, vol_watch,\n"
        "               retoc2_trigger, retoc2_watch,\n"
        "               pattern_t2up9, pattern_t2up9_watch,\n"
        "               pattern_green10):",
        "def build_html(date_iso, stats, candidates, vol_watch,\n"
        "               retoc2_trigger, retoc2_watch,\n"
        "               pattern_t2up9, pattern_t2up9_watch,\n"
        "               pattern_green10, sim_data=None):"
    ),

    # 3. Insert sim section before the footer
    (
        "    # ── 页脚 ──\n",
        SIM_HTML_SECTION + "\n    # ── 页脚 ──\n"
    ),

    # 4. Fetch sim_data in main()
    (
        "        all_watch_codes = fetch_all_watch_codes(conn, date_iso)\n",
        "        all_watch_codes = fetch_all_watch_codes(conn, date_iso)\n"
        "        sim_data        = fetch_sim_data(conn, date_iso)\n"
    ),

    # 5. Pass sim_data to build_html
    (
        "    html = build_html(date_iso, stats, candidates, vol_watch,\n"
        "                      retoc2_trigger, retoc2_watch,\n"
        "                      pattern_t2up9, pattern_t2up9_watch,\n"
        "                      pattern_green10)",
        "    html = build_html(date_iso, stats, candidates, vol_watch,\n"
        "                      retoc2_trigger, retoc2_watch,\n"
        "                      pattern_t2up9, pattern_t2up9_watch,\n"
        "                      pattern_green10, sim_data=sim_data)"
    ),
])


# ============================================================
# D4: position_sizer.py — add MIN_POSITION_AMOUNT threshold
# ============================================================
print("=== D4: position_sizer.py ===")
patch('/opt/position_sizer.py', [
    # 1. Add config constant after MIN_CASH_PCT
    (
        "MIN_CASH_PCT = 0.20\n",
        "MIN_CASH_PCT = 0.20\n"
        "MIN_POSITION_AMOUNT = 10000\n"
    ),

    # 2. In size_positions, skip stocks with final_amt < MIN_POSITION_AMOUNT
    # After shares calculation, before industry lookup
    (
        "        industry = data['industry'].get(ts, '未知')\n",
        "        if final_amt < MIN_POSITION_AMOUNT:\n"
        "            logging.info(f'  skip {ts}: position {final_amt:.0f} < MIN {MIN_POSITION_AMOUNT}')\n"
        "            continue\n"
        "\n"
        "        industry = data['industry'].get(ts, '未知')\n"
    ),
])

# D4 part 2: sim_engine.py — add same threshold
print("=== D4: sim_engine.py (MIN_POSITION_AMOUNT) ===")
patch('/opt/sim_engine.py', [
    # 1. Add MIN_POSITION_AMOUNT config after MIN_CASH_PCT
    (
        "MIN_CASH_PCT = 0.20\n",
        "MIN_CASH_PCT = 0.20\n"
        "MIN_POSITION_AMOUNT = 10000\n"
    ),

    # 2. In step3, after shares calculation and "if shares <= 0: continue"
    (
        "        if shares <= 0:\n"
        "            continue\n"
        "        final_amt = shares * close\n",
        "        if shares <= 0:\n"
        "            continue\n"
        "        final_amt = shares * close\n"
        "        if final_amt < MIN_POSITION_AMOUNT:\n"
        "            logging.info(f'  [Order] skip {ts}: position {final_amt:.0f} < MIN {MIN_POSITION_AMOUNT}')\n"
        "            continue\n"
    ),
])


print("\n=== All D3/D4 patches applied ===")
