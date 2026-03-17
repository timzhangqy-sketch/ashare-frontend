#!/opt/ashare_venv/bin/python
"""
perf_analyzer.py — 模拟盘绩效分析器
将 sim_orders 的 BUY/SELL 配对成 round trip，按4个维度聚合写入 perf 表。
"""

import argparse
import json
import logging
import os
import sys
import time
from collections import defaultdict
from datetime import datetime

import psycopg2

# ─── Infrastructure ──────────────────────────────────────────────────────────

def setup_logging():
    log_dir = '/var/log/ashare'
    os.makedirs(log_dir, exist_ok=True)
    fmt = '%(asctime)s [%(levelname)s] %(message)s'
    handlers = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(log_dir, 'perf_analyzer.log'), encoding='utf-8'),
    ]
    logging.basicConfig(level=logging.INFO, format=fmt, handlers=handlers)


def get_db_conn():
    return psycopg2.connect(
        host=os.environ.get('ASHARE_DB_HOST', 'localhost'),
        dbname=os.environ.get('ASHARE_DB_NAME', 'ashare'),
        user=os.environ.get('ASHARE_DB_USER', 'ashare_user'),
        password=os.environ.get('ASHARE_DB_PASS', ''),
    )


def parse_args():
    parser = argparse.ArgumentParser(description='Performance analyzer')
    parser.add_argument('--date', type=str, help='Trade date YYYYMMDD (default: today)')
    parser.add_argument('--dry_run', action='store_true', help='No DB write')
    return parser.parse_args()


# ─── Data Fetch & Pairing ────────────────────────────────────────────────────

def fetch_and_pair(conn, trade_date_sql):
    """Fetch filled orders, FIFO pair BUY/SELL, compute per-trade metrics."""
    cur = conn.cursor()

    # All filled orders
    cur.execute("""
        SELECT id, ts_code, direction, fill_date, fill_price, fill_shares,
               fill_amount, strategy, signal_type
        FROM ashare_sim_orders WHERE status = 'filled'
        ORDER BY ts_code, fill_date, id
    """)
    orders = cur.fetchall()

    # Group by ts_code
    buys_by_ts = defaultdict(list)
    sells_by_ts = defaultdict(list)
    for oid, ts, direction, fd, fp, fs, fa, strat, sig in orders:
        rec = {
            'id': oid, 'ts_code': ts, 'fill_date': fd,
            'fill_price': float(fp), 'fill_shares': int(fs),
            'fill_amount': float(fa), 'strategy': strat, 'signal_type': sig,
        }
        if direction == 'BUY':
            buys_by_ts[ts].append(rec)
        else:
            sells_by_ts[ts].append(rec)

    buy_count = sum(len(v) for v in buys_by_ts.values())
    sell_count = sum(len(v) for v in sells_by_ts.values())

    # Fetch regime map
    cur.execute("SELECT trade_date, market_regime AS regime FROM ashare_market_breadth WHERE market_regime IS NOT NULL")
    regime_map = {str(r[0]): r[1] for r in cur.fetchall()}

    # Fetch risk_score map (ts_code, trade_date → risk_score_total)
    cur.execute("""
        SELECT ts_code, trade_date, risk_score_total
        FROM ashare_risk_score WHERE risk_score_total IS NOT NULL
    """)
    risk_map = {}
    for ts, td, score in cur.fetchall():
        risk_map[(ts, str(td))] = float(score)

    # Fetch today's close for open positions
    open_ts = set()
    for ts, buy_list in buys_by_ts.items():
        sell_list = sells_by_ts.get(ts, [])
        if len(buy_list) > len(sell_list):
            open_ts.add(ts)

    close_map = {}
    if open_ts:
        cur.execute("""
            SELECT DISTINCT ON (ts_code) ts_code, close
            FROM ashare_daily_price
            WHERE ts_code = ANY(%s) AND trade_date <= %s
            ORDER BY ts_code, trade_date DESC
        """, (list(open_ts), trade_date_sql))
        for ts, c in cur.fetchall():
            close_map[ts] = float(c) if c is not None else None

    cur.close()

    # FIFO pairing
    trades = []
    paired = 0
    open_count = 0

    for ts in set(list(buys_by_ts.keys()) + list(sells_by_ts.keys())):
        buy_q = list(buys_by_ts.get(ts, []))
        sell_q = list(sells_by_ts.get(ts, []))
        si = 0

        for buy in buy_q:
            if si < len(sell_q):
                sell = sell_q[si]
                si += 1
                sell_price = sell['fill_price']
                sell_date = sell['fill_date']
                is_closed = True
                paired += 1
            else:
                # Open position — use today's close
                sell_price = close_map.get(ts, buy['fill_price'])
                sell_date = datetime.strptime(trade_date_sql, '%Y-%m-%d').date()
                is_closed = False
                open_count += 1

            buy_price = buy['fill_price']
            pnl_pct = round((sell_price - buy_price) / buy_price, 4) if buy_price > 0 else 0
            hold_days = (sell_date - buy['fill_date']).days
            pnl_amount = round((sell_price - buy_price) * buy['fill_shares'], 2)

            # Regime at buy date
            regime = regime_map.get(str(buy['fill_date']), 'unknown')

            # Risk bucket at buy date
            risk_score = risk_map.get((ts, str(buy['fill_date'])))
            if risk_score is not None:
                if risk_score >= 70:
                    risk_bucket = 'low_risk'
                elif risk_score >= 50:
                    risk_bucket = 'mid_risk'
                else:
                    risk_bucket = 'high_risk'
            else:
                risk_bucket = 'unknown'

            trades.append({
                'ts_code': ts,
                'strategy': buy['strategy'],
                'signal_type': buy['signal_type'],
                'regime': regime,
                'risk_bucket': risk_bucket,
                'buy_date': buy['fill_date'],
                'buy_price': buy_price,
                'sell_price': sell_price,
                'pnl_pct': pnl_pct,
                'pnl_amount': pnl_amount,
                'hold_days': hold_days,
                'is_win': pnl_pct > 0,
                'is_closed': is_closed,
                'shares': buy['fill_shares'],
            })

    logging.info(f'=== 交易配对 === BUY:{buy_count} SELL:{sell_count} '
                 f'配对:{paired}笔 未平仓:{open_count}笔')
    return trades


# ─── Aggregation ──────────────────────────────────────────────────────────────

def aggregate(trades, group_key):
    """Group trades by group_key and compute stats."""
    groups = defaultdict(list)
    for t in trades:
        k = t[group_key]
        groups[k].append(t)

    results = {}
    for key, group in groups.items():
        n = len(group)
        wins = sum(1 for t in group if t['is_win'])
        pnls = [t['pnl_pct'] for t in group]
        holds = [t['hold_days'] for t in group]
        pos_pnls = [p for p in pnls if p > 0]
        neg_pnls = [p for p in pnls if p < 0]

        avg_pnl = round(sum(pnls) / n, 4) if n else 0
        avg_hold = round(sum(holds) / n, 1) if n else 0
        win_rate = round(wins / n, 4) if n else 0

        if pos_pnls and neg_pnls:
            plr = round((sum(pos_pnls) / len(pos_pnls)) / abs(sum(neg_pnls) / len(neg_pnls)), 4)
        else:
            plr = None

        max_loss = round(min(pnls), 4) if pnls else None
        total_pnl = round(sum(t['pnl_amount'] for t in group), 2)

        results[key] = {
            'trade_count': n, 'win_count': wins, 'win_rate': win_rate,
            'avg_pnl_pct': avg_pnl, 'avg_hold_days': avg_hold,
            'profit_loss_ratio': plr, 'max_single_loss': max_loss,
            'total_pnl': total_pnl,
        }
    return results


def log_agg(title, agg):
    logging.info(f'=== {title} ===')
    for key, stats in sorted(agg.items()):
        plr_str = f'{stats["profit_loss_ratio"]:.2f}' if stats['profit_loss_ratio'] is not None else 'N/A'
        logging.info(f'  {key}: trades={stats["trade_count"]} win={stats["win_rate"]:.1%} '
                     f'avg_pnl={stats["avg_pnl_pct"]:+.2%} hold={stats["avg_hold_days"]:.0f}d '
                     f'P/L={plr_str} total_pnl={stats["total_pnl"]:,.0f}')


# ─── DB Write ─────────────────────────────────────────────────────────────────

def write_perf_by_strategy(conn, calc_date, agg, dry_run):
    if dry_run:
        return
    cur = conn.cursor()
    for strategy, s in agg.items():
        cur.execute("""
            INSERT INTO ashare_perf_by_strategy
            (calc_date, strategy, trade_count, win_count, win_rate, avg_pnl_pct,
             avg_hold_days, profit_loss_ratio, max_single_loss, total_pnl)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (calc_date, strategy) DO UPDATE SET
                trade_count=EXCLUDED.trade_count, win_count=EXCLUDED.win_count,
                win_rate=EXCLUDED.win_rate, avg_pnl_pct=EXCLUDED.avg_pnl_pct,
                avg_hold_days=EXCLUDED.avg_hold_days,
                profit_loss_ratio=EXCLUDED.profit_loss_ratio,
                max_single_loss=EXCLUDED.max_single_loss, total_pnl=EXCLUDED.total_pnl
        """, (calc_date, strategy, s['trade_count'], s['win_count'], s['win_rate'],
              s['avg_pnl_pct'], s['avg_hold_days'], s['profit_loss_ratio'],
              s['max_single_loss'], s['total_pnl']))
    conn.commit()
    cur.close()


def write_perf_by_regime(conn, calc_date, trades, dry_run):
    if dry_run:
        return
    # Group by (strategy, regime)
    groups = defaultdict(list)
    for t in trades:
        groups[(t['strategy'], t['regime'])].append(t)

    cur = conn.cursor()
    for (strategy, regime), group in groups.items():
        n = len(group)
        wins = sum(1 for t in group if t['is_win'])
        pnls = [t['pnl_pct'] for t in group]
        holds = [t['hold_days'] for t in group]
        cur.execute("""
            INSERT INTO ashare_perf_by_regime
            (calc_date, strategy, regime, trade_count, win_count, win_rate, avg_pnl_pct, avg_hold_days)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (calc_date, strategy, regime) DO UPDATE SET
                trade_count=EXCLUDED.trade_count, win_count=EXCLUDED.win_count,
                win_rate=EXCLUDED.win_rate, avg_pnl_pct=EXCLUDED.avg_pnl_pct,
                avg_hold_days=EXCLUDED.avg_hold_days
        """, (calc_date, strategy, regime, n, wins,
              round(wins/n, 4) if n else 0,
              round(sum(pnls)/n, 4) if n else 0,
              round(sum(holds)/n, 1) if n else 0))
    conn.commit()
    cur.close()


def write_perf_by_signal(conn, calc_date, agg, dry_run):
    if dry_run:
        return
    cur = conn.cursor()
    for sig, s in agg.items():
        cur.execute("""
            INSERT INTO ashare_perf_by_signal
            (calc_date, signal_type, trade_count, win_count, win_rate, avg_pnl_pct, avg_hold_days)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (calc_date, signal_type) DO UPDATE SET
                trade_count=EXCLUDED.trade_count, win_count=EXCLUDED.win_count,
                win_rate=EXCLUDED.win_rate, avg_pnl_pct=EXCLUDED.avg_pnl_pct,
                avg_hold_days=EXCLUDED.avg_hold_days
        """, (calc_date, sig, s['trade_count'], s['win_count'], s['win_rate'],
              s['avg_pnl_pct'], s['avg_hold_days']))
    conn.commit()
    cur.close()


def write_perf_by_risk(conn, calc_date, agg, dry_run):
    if dry_run:
        return
    cur = conn.cursor()
    for bucket, s in agg.items():
        cur.execute("""
            INSERT INTO ashare_perf_by_risk
            (calc_date, risk_bucket, trade_count, win_count, win_rate, avg_pnl_pct, avg_hold_days)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (calc_date, risk_bucket) DO UPDATE SET
                trade_count=EXCLUDED.trade_count, win_count=EXCLUDED.win_count,
                win_rate=EXCLUDED.win_rate, avg_pnl_pct=EXCLUDED.avg_pnl_pct,
                avg_hold_days=EXCLUDED.avg_hold_days
        """, (calc_date, bucket, s['trade_count'], s['win_count'], s['win_rate'],
              s['avg_pnl_pct'], s['avg_hold_days']))
    conn.commit()
    cur.close()


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    setup_logging()
    args = parse_args()
    t0 = time.time()

    if args.date:
        trade_date = args.date
    else:
        trade_date = datetime.now().strftime('%Y%m%d')
    td_sql = f'{trade_date[:4]}-{trade_date[4:6]}-{trade_date[6:8]}'

    logging.info(f'=== Perf Analyzer start | date={trade_date} dry_run={args.dry_run} ===')

    conn = get_db_conn()
    trades = fetch_and_pair(conn, td_sql)

    if not trades:
        logging.info('无已成交交易，跳过')
        conn.close()
        return

    # Aggregate by 4 dimensions
    by_strategy = aggregate(trades, 'strategy')
    by_regime = aggregate(trades, 'regime')
    by_signal = aggregate(trades, 'signal_type')
    by_risk = aggregate(trades, 'risk_bucket')

    log_agg('按策略', by_strategy)
    log_agg('按环境', by_regime)
    log_agg('按信号', by_signal)
    log_agg('按风险', by_risk)

    # Write to DB
    write_perf_by_strategy(conn, td_sql, by_strategy, args.dry_run)
    write_perf_by_regime(conn, td_sql, trades, args.dry_run)
    write_perf_by_signal(conn, td_sql, by_signal, args.dry_run)
    write_perf_by_risk(conn, td_sql, by_risk, args.dry_run)

    if args.dry_run:
        logging.info(f'DRY RUN: would write to 4 perf tables — skipped.')

    conn.close()
    elapsed = time.time() - t0
    logging.info(f'=== Perf Analyzer done in {elapsed:.1f}s | {len(trades)} trades ===')


if __name__ == '__main__':
    main()
