#!/opt/ashare_venv/bin/python
"""
risk_scorer.py — Gate+Score 双层风控评分预计算层
Pipeline 位置：数据采集之后、策略扫描之前
对全市场所有上市A股(沪深)计算风控评分，写入 ashare_risk_score 表
"""

import argparse
import json
import logging
import os
import sys
import time
from collections import defaultdict
from datetime import datetime

import numpy as np
import psycopg2

# ─── Constants ────────────────────────────────────────────────────────────────

RISK_MODEL_VERSION = 'v1'
POSITION_MODEL_VERSION = 'v1'
BATCH_SIZE = 500

# ─── Thresholds / Config (persisted to config_snapshot_json) ──────────────────

CONFIG = {
    'gate': {
        'liquidity_min_amount_k': 5000,
        'pledge_ratio_max': 60,
        'pledge_vol_std_threshold': 0.05,
        'limit_down_pct': -9.5,
        'limit_down_min_days': 2,
    },
    'score_financial': {
        'rev_cash_ratio': {'good': 0.8, 'mid': 0.5},
        'goodwill_ratio': {'good': 0.2, 'bad': 0.5},
        'pledge': {'good': 15, 'bad': 40},
        'receivable_ratio': {'good': 0.3, 'bad': 0.6},
        'gross_margin': {'good': 0.3, 'mid': 0.2},
    },
    'score_market': {
        'volatility_std': [0.02, 0.04, 0.06],
        'liquidity_amount_k': [50000, 10000, 5000],
        'gap_std': [0.01, 0.02, 0.03],
    },
    'score_event': {
        'crash_5d_pct': [-5, -10, -15],
        'turnover_surge_ratio': [1.5, 3.0],
    },
    'weights': {
        'financial': 0.35,
        'market': 0.25,
        'event': 0.25,
        'compliance': 0.15,
    },
}


# ─── Infrastructure ──────────────────────────────────────────────────────────

def setup_logging():
    log_dir = '/var/log/ashare'
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, 'risk_scorer.log')
    fmt = '%(asctime)s [%(levelname)s] %(message)s'
    handlers = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_file, encoding='utf-8'),
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
    parser = argparse.ArgumentParser(description='Gate+Score risk scorer for A-share')
    parser.add_argument('--date', type=str, help='Trade date YYYYMMDD (default: today)')
    parser.add_argument('--dry_run', action='store_true', help='Calculate only, no DB write')
    return parser.parse_args()


# ─── Batch Data Fetch ────────────────────────────────────────────────────────

def fetch_all_data(conn, trade_date_sql):
    """6 batch SQL queries → all data needed for Gate+Score."""
    cur = conn.cursor()
    data = {}

    # 0) Universe: v1 scope — union of strategy triggers + watchlist + portfolio
    logging.info('Fetching stock universe (v1 scope)...')

    # Resolve previous trading day
    cur.execute("""
        SELECT MAX(trade_date) FROM ashare_daily_price WHERE trade_date < %s
    """, (trade_date_sql,))
    prev_td = cur.fetchone()[0]
    if prev_td is None:
        prev_td = trade_date_sql
    logging.info(f'Previous trading day: {prev_td}')

    # Source counts for logging
    src_counts = {}

    def _safe_query(label, sql, params=()):
        """Execute query, return set of ts_code. Empty set if table missing."""
        try:
            cur.execute(sql, params)
            codes = {r[0] for r in cur.fetchall()}
            src_counts[label] = len(codes)
            return codes
        except Exception as e:
            conn.rollback()
            logging.warning(f'{label}: query failed ({e}), returning empty set')
            src_counts[label] = 0
            return set()

    vol_surge = _safe_query('vol_surge', """
        SELECT DISTINCT ts_code FROM ashare_vol_surge_pool WHERE trade_date = %s
    """, (prev_td,))

    retoc2 = _safe_query('retoc2', """
        SELECT DISTINCT ts_code FROM ashare_retoc2_v3_trigger WHERE trade_date = %s
    """, (prev_td,))

    t2up9 = _safe_query('t2up9', """
        SELECT DISTINCT ts_code FROM ashare_pattern_t2up9_2dup_lt5_candidates
        WHERE trade_date = %s
    """, (prev_td,))

    green10 = _safe_query('green10', """
        SELECT DISTINCT ts_code FROM ashare_pattern_top10_green_10d_candidates
        WHERE anchor_date = %s
    """, (prev_td,))

    watchlist = _safe_query('watchlist', """
        SELECT DISTINCT ts_code FROM ashare_watchlist WHERE status = 'active'
    """)

    portfolio = _safe_query('portfolio', """
        SELECT DISTINCT ts_code FROM ashare_portfolio WHERE status = 'held'
    """)

    universe_codes = vol_surge | retoc2 | t2up9 | green10 | watchlist | portfolio
    src_counts['dedup_total'] = len(universe_codes)

    parts = ' '.join(f'{k}:{v}' for k, v in src_counts.items())
    logging.info(f'=== 评分对象 === {parts}')

    # Fetch is_st for universe stocks only
    if universe_codes:
        cur.execute("""
            SELECT ts_code, is_st FROM ashare_stock_basic
            WHERE ts_code = ANY(%s)
        """, (list(universe_codes),))
        rows = cur.fetchall()
    else:
        rows = []
    data['universe'] = universe_codes
    data['is_st'] = {r[0]: (r[1] == 't' or r[1] is True) for r in rows}
    logging.info(f'Universe: {len(data["universe"])} stocks')

    # 1) 65-trading-day daily price (covers 60d turnover + 20d gate/score)
    logging.info('Fetching ~65-day daily price...')
    cur.execute("""
        SELECT ts_code, trade_date, open, close, amount
        FROM ashare_daily_price
        WHERE trade_date >= (
            SELECT MIN(trade_date) FROM (
                SELECT DISTINCT trade_date FROM ashare_daily_price
                WHERE trade_date <= %s ORDER BY trade_date DESC LIMIT 65
            ) sub
        ) AND trade_date <= %s
        ORDER BY ts_code, trade_date
    """, (trade_date_sql, trade_date_sql))
    price_rows = cur.fetchall()
    price_map = defaultdict(list)
    for ts, td, opn, cls, amt in price_rows:
        price_map[ts].append({
            'trade_date': td,
            'open': float(opn) if opn is not None else None,
            'close': float(cls) if cls is not None else None,
            'amount': float(amt) if amt is not None else None,
        })
    data['price'] = dict(price_map)
    logging.info(f'Price: {len(price_rows)} rows, {len(price_map)} stocks')

    # 2) 65-trading-day daily basic (turnover_rate)
    logging.info('Fetching ~65-day daily basic...')
    cur.execute("""
        SELECT ts_code, trade_date, turnover_rate
        FROM ashare_daily_basic
        WHERE trade_date >= (
            SELECT MIN(trade_date) FROM (
                SELECT DISTINCT trade_date FROM ashare_daily_basic
                WHERE trade_date <= %s ORDER BY trade_date DESC LIMIT 65
            ) sub
        ) AND trade_date <= %s
        ORDER BY ts_code, trade_date
    """, (trade_date_sql, trade_date_sql))
    turnover_map = defaultdict(list)
    for ts, td, tr in cur.fetchall():
        turnover_map[ts].append({
            'trade_date': td,
            'turnover_rate': float(tr) if tr is not None else None,
        })
    data['turnover'] = dict(turnover_map)
    logging.info(f'Turnover: {len(turnover_map)} stocks')

    # 3) Latest 2 financial periods (income + balance + cashflow)
    logging.info('Fetching latest financials...')
    cur.execute("""
        SELECT ts_code, end_date, revenue, operate_profit, n_income
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY ts_code ORDER BY end_date DESC) AS rn
            FROM ashare_fin_income
        ) t WHERE rn <= 2
    """)
    income_map = defaultdict(list)
    for ts, ed, rev, op, ni in cur.fetchall():
        income_map[ts].append({
            'end_date': ed,
            'revenue': float(rev) if rev is not None else None,
            'operate_profit': float(op) if op is not None else None,
            'n_income': float(ni) if ni is not None else None,
        })
    data['income'] = dict(income_map)

    cur.execute("""
        SELECT ts_code, end_date, total_hldr_eqy_exc_min_int, goodwill, accounts_receiv
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY ts_code ORDER BY end_date DESC) AS rn
            FROM ashare_fin_balance
        ) t WHERE rn = 1
    """)
    balance_map = {}
    for ts, ed, eq, gw, ar in cur.fetchall():
        balance_map[ts] = {
            'total_hldr_eqy_exc_min_int': float(eq) if eq is not None else None,
            'goodwill': float(gw) if gw is not None else None,
            'accounts_receiv': float(ar) if ar is not None else None,
        }
    data['balance'] = balance_map

    cur.execute("""
        SELECT ts_code, end_date, n_cashflow_act
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY ts_code ORDER BY end_date DESC) AS rn
            FROM ashare_fin_cashflow
        ) t WHERE rn <= 2
    """)
    cashflow_map = defaultdict(list)
    for ts, ed, ncf in cur.fetchall():
        cashflow_map[ts].append({
            'end_date': ed,
            'n_cashflow_act': float(ncf) if ncf is not None else None,
        })
    data['cashflow'] = dict(cashflow_map)
    logging.info(f'Financials: income={len(income_map)} balance={len(balance_map)} cashflow={len(cashflow_map)}')

    # 4) Latest pledge per stock
    logging.info('Fetching latest pledge...')
    cur.execute("""
        SELECT ts_code, pledge_ratio
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY ts_code ORDER BY end_date DESC) AS rn
            FROM ashare_pledge_stat
        ) t WHERE rn = 1
    """)
    pledge_map = {}
    for ts, pr in cur.fetchall():
        pledge_map[ts] = float(pr) if pr is not None else None
    data['pledge'] = pledge_map
    logging.info(f'Pledge: {len(pledge_map)} stocks')

    # 5) All audit opinions (for latest + 3-year history)
    logging.info('Fetching audit opinions...')
    cur.execute("""
        SELECT ts_code, end_date, audit_result
        FROM ashare_audit_opinion
        ORDER BY ts_code, end_date DESC
    """)
    audit_map = defaultdict(list)
    for ts, ed, ar in cur.fetchall():
        audit_map[ts].append({'end_date': ed, 'audit_result': ar})
    data['audit'] = dict(audit_map)
    logging.info(f'Audit: {len(audit_map)} stocks')

    # 6) Event daily snapshot (from event_detector)
    logging.info('Fetching event daily snapshot...')
    try:
        cur.execute("""
            SELECT ts_code, event_count, max_severity, has_block_event,
                   block_reasons, event_risk_score, compliance_risk_score
            FROM ashare_event_daily_snapshot WHERE trade_date = %s
        """, (trade_date_sql,))
        event_snap_map = {}
        for row in cur.fetchall():
            event_snap_map[row[0]] = {
                'event_count': row[1],
                'max_severity': row[2],
                'has_block_event': row[3],
                'block_reasons': row[4],
                'event_risk_score': float(row[5]) if row[5] is not None else None,
                'compliance_risk_score': float(row[6]) if row[6] is not None else None,
            }
        data['event_snapshot'] = event_snap_map
        logging.info(f'Event snapshot: {len(event_snap_map)} stocks with events')
    except Exception as e:
        logging.warning(f'Event snapshot load failed ({e}), using fallback')
        conn.rollback()
        data['event_snapshot'] = {}

    cur.close()
    return data


# ─── Price Enrichment ────────────────────────────────────────────────────────

def enrich_prices(raw_prices):
    """Add pct_chg and gap fields computed from close/open."""
    result = []
    for i, p in enumerate(raw_prices):
        rec = dict(p)
        if i == 0 or raw_prices[i - 1]['close'] is None or p['close'] is None:
            rec['pct_chg'] = None
        else:
            prev_close = raw_prices[i - 1]['close']
            rec['pct_chg'] = (p['close'] - prev_close) / prev_close * 100

        if i == 0 or raw_prices[i - 1]['close'] is None or p['open'] is None:
            rec['gap'] = None
        else:
            prev_close = raw_prices[i - 1]['close']
            rec['gap'] = abs(p['open'] / prev_close - 1)
        result.append(rec)
    return result


# ─── Gate Layer (5 real + 2 stub) ────────────────────────────────────────────

def gate_st(ts_code, data):
    return data['is_st'].get(ts_code, False)


def gate_audit(ts_code, data):
    audits = data['audit'].get(ts_code, [])
    if not audits:
        return False
    latest = audits[0].get('audit_result') or ''
    return '无法表示' in latest or '否定' in latest


def gate_liquidity(prices_20):
    if not prices_20:
        return True
    amounts = [p['amount'] for p in prices_20 if p['amount'] is not None]
    if not amounts:
        return True
    return sum(amounts) / len(amounts) < CONFIG['gate']['liquidity_min_amount_k']


def gate_pledge_vol(ts_code, data, prices_20):
    pledge_ratio = data['pledge'].get(ts_code)
    if pledge_ratio is None or pledge_ratio <= CONFIG['gate']['pledge_ratio_max']:
        return False
    returns = [p['pct_chg'] / 100 for p in prices_20 if p['pct_chg'] is not None]
    if len(returns) < 5:
        return False
    std = float(np.std(returns, ddof=1))
    return std > CONFIG['gate']['pledge_vol_std_threshold']


def gate_limit_down(prices_20):
    threshold = CONFIG['gate']['limit_down_pct']
    min_days = CONFIG['gate']['limit_down_min_days']
    count = sum(1 for p in prices_20 if p['pct_chg'] is not None and p['pct_chg'] <= threshold)
    return count >= min_days


def gate_investigation(ts_code, data):
    event_snap = data.get('event_snapshot', {}).get(ts_code)
    if not event_snap:
        return False
    reasons = event_snap.get('block_reasons') or []
    for r in reasons:
        if 'regulatory_investigation' in r or 'regulatory_penalty' in r:
            return True
    return False


def gate_restatement(ts_code, data):
    event_snap = data.get('event_snapshot', {}).get(ts_code)
    if not event_snap:
        return False
    reasons = event_snap.get('block_reasons') or []
    for r in reasons:
        if 'financial_restatement' in r:
            return True
    return False


def run_gates(ts_code, data, prices_enriched):
    prices_20 = prices_enriched[-20:] if len(prices_enriched) >= 20 else prices_enriched
    reasons = []
    if gate_st(ts_code, data):
        reasons.append('ST')
    if gate_audit(ts_code, data):
        reasons.append('audit_negative')
    if gate_liquidity(prices_20):
        reasons.append('low_liquidity')
    if gate_pledge_vol(ts_code, data, prices_20):
        reasons.append('high_pledge_vol')
    if gate_limit_down(prices_20):
        reasons.append('limit_down')
    if gate_investigation(ts_code, data):
        reasons.append('investigation')
    if gate_restatement(ts_code, data):
        reasons.append('restatement')
    event_snap = data.get('event_snapshot', {}).get(ts_code)
    if event_snap and event_snap.get('has_block_event'):
        reasons.append('event_block')
    return (len(reasons) == 0), (','.join(reasons) if reasons else None)


# ─── Score Layer ──────────────────────────────────────────────────────────────

def score_financial(ts_code, data):
    detail = {}
    scores = []

    income_list = data['income'].get(ts_code, [])
    latest_income = income_list[0] if income_list else {}
    balance = data['balance'].get(ts_code, {})
    cashflow_list = data['cashflow'].get(ts_code, [])
    latest_cf = cashflow_list[0] if cashflow_list else {}
    pledge_ratio = data['pledge'].get(ts_code)

    revenue = latest_income.get('revenue')
    n_cashflow_act = latest_cf.get('n_cashflow_act')

    # (1) rev_cash_ratio
    if revenue and n_cashflow_act and revenue != 0:
        ratio = n_cashflow_act / revenue
        detail['rev_cash_ratio'] = round(ratio, 4)
        s = 100 if ratio >= 0.8 else (60 if ratio >= 0.5 else 20)
    else:
        detail['rev_cash_ratio'] = None
        s = 50
    detail['rev_cash_score'] = s
    scores.append(s)

    # (2) goodwill_ratio
    goodwill = balance.get('goodwill')
    equity = balance.get('total_hldr_eqy_exc_min_int')
    if goodwill is not None and equity and equity != 0:
        ratio = goodwill / equity
        detail['goodwill_ratio'] = round(ratio, 4)
        s = 100 if (goodwill == 0 or ratio <= 0.2) else (60 if ratio <= 0.5 else 20)
    else:
        detail['goodwill_ratio'] = None
        s = 100
    detail['goodwill_score'] = s
    scores.append(s)

    # (3) pledge_score
    detail['pledge_ratio'] = pledge_ratio
    if pledge_ratio is not None:
        s = 100 if pledge_ratio <= 15 else (60 if pledge_ratio <= 40 else 20)
    else:
        s = 70
    detail['pledge_score'] = s
    scores.append(s)

    # (4) audit_score
    audits = data['audit'].get(ts_code, [])
    latest_audit = audits[0]['audit_result'] if audits else None
    detail['audit_result'] = latest_audit
    if latest_audit is None:
        s = 60
    elif '标准无保留' in latest_audit:
        s = 100
    elif '保留' in latest_audit:
        s = 50
    else:
        s = 20
    detail['audit_score'] = s
    scores.append(s)

    # (5) cashflow_health
    cf_vals = [cf.get('n_cashflow_act') for cf in cashflow_list[:2]]
    detail['cashflow_values'] = cf_vals
    if len(cf_vals) >= 2 and cf_vals[0] is not None and cf_vals[1] is not None:
        if cf_vals[0] > 0 and cf_vals[1] > 0:
            s = 100
        elif cf_vals[0] <= 0 and cf_vals[1] <= 0:
            s = 20
        else:
            s = 50
    elif len(cf_vals) >= 1 and cf_vals[0] is not None:
        s = 100 if cf_vals[0] > 0 else 50
    else:
        s = 50
    detail['cashflow_health_score'] = s
    scores.append(s)

    # (6) receivable_ratio
    accounts_receiv = balance.get('accounts_receiv')
    if accounts_receiv is not None and revenue and revenue != 0:
        ratio = accounts_receiv / revenue
        detail['receivable_ratio'] = round(ratio, 4)
        s = 100 if ratio <= 0.3 else (60 if ratio <= 0.6 else 20)
    else:
        detail['receivable_ratio'] = None
        s = 60
    detail['receivable_score'] = s
    scores.append(s)

    # (7) gross_margin_vol → profitability proxy
    operate_profit = latest_income.get('operate_profit')
    if operate_profit is not None and revenue and revenue != 0:
        margin = operate_profit / revenue
        detail['op_margin'] = round(margin, 4)
        s = 80 if margin > 0.3 else (60 if margin >= 0.2 else 40)
    else:
        detail['op_margin'] = None
        s = 50
    detail['op_margin_score'] = s
    scores.append(s)

    return round(sum(scores) / len(scores), 2), detail


def score_market(prices_enriched):
    detail = {}
    scores = []
    p20 = prices_enriched[-20:] if len(prices_enriched) >= 20 else prices_enriched

    # (1) volatility
    rets = [p['pct_chg'] / 100 for p in p20 if p['pct_chg'] is not None]
    if len(rets) >= 5:
        std = float(np.std(rets, ddof=1))
        detail['volatility_std'] = round(std, 4)
        s = 100 if std < 0.02 else (70 if std < 0.04 else (40 if std < 0.06 else 20))
    else:
        detail['volatility_std'] = None
        s = 50
    detail['volatility_score'] = s
    scores.append(s)

    # (2) liquidity
    amounts = [p['amount'] for p in p20 if p['amount'] is not None]
    avg_amt = sum(amounts) / len(amounts) if amounts else 0
    detail['avg_amount_k'] = round(avg_amt, 2)
    if avg_amt > 50000:
        s = 100
    elif avg_amt > 10000:
        s = 70
    elif avg_amt > 5000:
        s = 40
    else:
        s = 20
    detail['liquidity_score'] = s
    scores.append(s)

    # (3) limit_down count in 20d
    ld = sum(1 for p in p20 if p['pct_chg'] is not None and p['pct_chg'] <= -9.5)
    detail['limit_down_count'] = ld
    s = 100 if ld == 0 else (60 if ld == 1 else 20)
    detail['limit_down_score'] = s
    scores.append(s)

    # (4) gap_score
    gaps = [p['gap'] for p in p20 if p['gap'] is not None]
    if len(gaps) >= 5:
        gap_std = float(np.std(gaps, ddof=1))
        detail['gap_std'] = round(gap_std, 4)
        s = 100 if gap_std < 0.01 else (70 if gap_std < 0.02 else (40 if gap_std < 0.03 else 20))
    else:
        detail['gap_std'] = None
        s = 50
    detail['gap_score'] = s
    scores.append(s)

    return round(sum(scores) / len(scores), 2), detail


def score_event(ts_code, prices_enriched, data):
    detail = {}

    # Try event_detector snapshot first
    event_snap = data.get('event_snapshot', {}).get(ts_code)
    if event_snap and event_snap.get('event_risk_score') is not None:
        score = event_snap['event_risk_score']
        detail['event_risk_score'] = score
        detail['max_severity'] = event_snap.get('max_severity')
        detail['event_count'] = event_snap.get('event_count', 0)
        detail['source'] = 'event_detector'
        return score, detail

    # Detector ran but no events for this stock -> full score
    event_snapshot_dict = data.get('event_snapshot')
    if event_snapshot_dict is not None and len(event_snapshot_dict) > 0 and event_snap is None:
        detail['event_risk_score'] = 100
        detail['source'] = 'event_detector'
        return 100, detail

    # Fallback: original calculation (event_detector not available)
    scores = []
    p5 = prices_enriched[-5:] if len(prices_enriched) >= 5 else prices_enriched

    # (1) crash_score
    pct_chgs = [p['pct_chg'] for p in p5 if p['pct_chg'] is not None]
    cum = sum(pct_chgs) if pct_chgs else 0
    detail['crash_5d_cum'] = round(cum, 2)
    if cum > -5:
        s = 100
    elif cum > -10:
        s = 60
    elif cum > -15:
        s = 30
    else:
        s = 10
    detail['crash_score'] = s
    scores.append(s)

    # (2) turnover_surge
    tr_list = data['turnover'].get(ts_code, [])
    if len(tr_list) >= 5:
        recent_5 = tr_list[-5:]
        tr5 = [t['turnover_rate'] for t in recent_5 if t['turnover_rate'] is not None]
        tr_all = [t['turnover_rate'] for t in tr_list if t['turnover_rate'] is not None]
        if tr5 and tr_all and sum(tr_all) / len(tr_all) > 0:
            avg5 = sum(tr5) / len(tr5)
            avg60 = sum(tr_all) / len(tr_all)
            ratio = avg5 / avg60
            detail['turnover_surge_ratio'] = round(ratio, 2)
            s = 100 if ratio < 1.5 else (60 if ratio < 3 else 30)
        else:
            detail['turnover_surge_ratio'] = None
            s = 70
    else:
        detail['turnover_surge_ratio'] = None
        s = 70
    detail['turnover_surge_score'] = s
    scores.append(s)

    # (3) announcement stub
    detail['announcement_score'] = 70
    scores.append(70)

    detail['source'] = 'fallback'
    return round(sum(scores) / len(scores), 2), detail


def score_compliance(ts_code, data):
    detail = {}

    # Try event_detector snapshot first
    event_snap = data.get('event_snapshot', {}).get(ts_code)
    if event_snap and event_snap.get('compliance_risk_score') is not None:
        score = event_snap['compliance_risk_score']
        detail['compliance_risk_score'] = score
        detail['source'] = 'event_detector'
        return score, detail

    # Detector ran but no events for this stock -> full score
    event_snapshot_dict = data.get('event_snapshot')
    if event_snapshot_dict is not None and len(event_snapshot_dict) > 0 and event_snap is None:
        detail['compliance_risk_score'] = 100
        detail['source'] = 'event_detector'
        return 100, detail

    # Fallback: original calculation
    scores = []

    # (1) st_score — passed gate so not ST
    detail['st_score'] = 100
    scores.append(100)

    # (2) audit_history — last 3 years
    audits = data['audit'].get(ts_code, [])
    cutoff_year = datetime.now().year - 3
    recent = [a for a in audits if a['end_date'] and a['end_date'].year >= cutoff_year]
    detail['audit_history_count'] = len(recent)
    if not recent:
        s = 60
    else:
        results = [a['audit_result'] or '' for a in recent]
        if any('无法表示' in r or '否定' in r for r in results):
            s = 20
        elif any('保留' in r for r in results):
            s = 50
        else:
            s = 100
    detail['audit_history_score'] = s
    scores.append(s)

    # (3) regulatory stub
    detail['regulatory_score'] = 80
    scores.append(80)

    detail['source'] = 'fallback'
    return round(sum(scores) / len(scores), 2), detail


# ─── Position Cap ─────────────────────────────────────────────────────────────

def compute_position_cap(risk_scores, detail_all):
    fin = risk_scores['financial']
    mkt = risk_scores['market']
    crash = detail_all.get('event', {}).get('crash_score', 100)
    total = risk_scores['total']

    cap_fin = 0.5 if fin < 40 else (0.7 if fin < 60 else (0.9 if fin < 80 else 1.0))
    cap_mkt = 0.4 if mkt < 30 else (0.6 if mkt < 50 else (0.8 if mkt < 70 else 1.0))
    cap_evt = 0.5 if crash < 30 else 1.0
    cap_cpl = 1.0

    dim_cap = min(cap_fin, cap_mkt, cap_evt, cap_cpl)
    total_adj = 0.9 if total < 60 else (1.0 if total < 80 else 1.05)
    multiplier = round(dim_cap * total_adj, 2)
    multiplier = max(0.0, min(1.2, multiplier))

    return cap_fin, cap_mkt, cap_evt, cap_cpl, multiplier


# ─── UPSERT SQL ───────────────────────────────────────────────────────────────

UPSERT_SQL = """
INSERT INTO ashare_risk_score (
    ts_code, trade_date, trade_allowed, block_reason,
    risk_score_financial, risk_score_market, risk_score_event, risk_score_compliance,
    risk_score_total,
    cap_financial, cap_market, cap_event, cap_compliance,
    position_cap_multiplier_final,
    risk_model_version, position_model_version,
    config_snapshot_json, detail_json,
    created_at, updated_at
) VALUES (
    %(ts_code)s, %(trade_date)s, %(trade_allowed)s, %(block_reason)s,
    %(risk_score_financial)s, %(risk_score_market)s, %(risk_score_event)s, %(risk_score_compliance)s,
    %(risk_score_total)s,
    %(cap_financial)s, %(cap_market)s, %(cap_event)s, %(cap_compliance)s,
    %(position_cap_multiplier_final)s,
    %(risk_model_version)s, %(position_model_version)s,
    %(config_snapshot_json)s, %(detail_json)s,
    NOW(), NOW()
) ON CONFLICT (ts_code, trade_date) DO UPDATE SET
    trade_allowed = EXCLUDED.trade_allowed,
    block_reason = EXCLUDED.block_reason,
    risk_score_financial = EXCLUDED.risk_score_financial,
    risk_score_market = EXCLUDED.risk_score_market,
    risk_score_event = EXCLUDED.risk_score_event,
    risk_score_compliance = EXCLUDED.risk_score_compliance,
    risk_score_total = EXCLUDED.risk_score_total,
    cap_financial = EXCLUDED.cap_financial,
    cap_market = EXCLUDED.cap_market,
    cap_event = EXCLUDED.cap_event,
    cap_compliance = EXCLUDED.cap_compliance,
    position_cap_multiplier_final = EXCLUDED.position_cap_multiplier_final,
    risk_model_version = EXCLUDED.risk_model_version,
    position_model_version = EXCLUDED.position_model_version,
    config_snapshot_json = EXCLUDED.config_snapshot_json,
    detail_json = EXCLUDED.detail_json,
    updated_at = NOW()
"""


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

    logging.info(f'=== Risk Scorer {RISK_MODEL_VERSION} start | date={trade_date} dry_run={args.dry_run} ===')

    conn = get_db_conn()
    try:
        data = fetch_all_data(conn, td_sql)
    except Exception as e:
        logging.error(f'Failed to fetch data: {e}')
        conn.close()
        sys.exit(1)

    universe = data['universe']

    # ── Pre-compute enriched prices for every stock ──
    prices_cache = {}
    for ts_code in universe:
        prices_cache[ts_code] = enrich_prices(data['price'].get(ts_code, []))

    # ── Gate Phase ──
    gate_pass = set()
    gate_block = {}
    block_reason_cnt = defaultdict(int)

    for ts_code in universe:
        allowed, reason = run_gates(ts_code, data, prices_cache[ts_code])
        if allowed:
            gate_pass.add(ts_code)
        else:
            gate_block[ts_code] = reason
            for r in reason.split(','):
                block_reason_cnt[r] += 1

    logging.info(f'Gate: total={len(universe)} pass={len(gate_pass)} block={len(gate_block)}')
    top5 = sorted(block_reason_cnt.items(), key=lambda x: -x[1])[:5]
    logging.info(f'Block TOP5: {top5}')

    config_json = json.dumps(CONFIG, ensure_ascii=False)
    results = []

    # ── Blocked rows (score=NULL, cap=0) ──
    for ts_code, reason in gate_block.items():
        results.append({
            'ts_code': ts_code, 'trade_date': td_sql,
            'trade_allowed': False, 'block_reason': reason,
            'risk_score_financial': None, 'risk_score_market': None,
            'risk_score_event': None, 'risk_score_compliance': None,
            'risk_score_total': None,
            'cap_financial': None, 'cap_market': None,
            'cap_event': None, 'cap_compliance': None,
            'position_cap_multiplier_final': 0,
            'risk_model_version': RISK_MODEL_VERSION,
            'position_model_version': POSITION_MODEL_VERSION,
            'config_snapshot_json': config_json,
            'detail_json': json.dumps({'block_reason': reason}, ensure_ascii=False),
        })

    # ── Score Phase (passed stocks only) ──
    score_agg = {'financial': [], 'market': [], 'event': [], 'compliance': [], 'total': []}
    cap_dist = defaultdict(int)

    for ts_code in gate_pass:
        pe = prices_cache[ts_code]
        detail_all = {}

        fin_s, fin_d = score_financial(ts_code, data)
        detail_all['financial'] = fin_d

        mkt_s, mkt_d = score_market(pe)
        detail_all['market'] = mkt_d

        evt_s, evt_d = score_event(ts_code, pe, data)
        detail_all['event'] = evt_d

        cpl_s, cpl_d = score_compliance(ts_code, data)
        detail_all['compliance'] = cpl_d

        w = CONFIG['weights']
        total = round(fin_s * w['financial'] + mkt_s * w['market'] +
                      evt_s * w['event'] + cpl_s * w['compliance'], 2)

        rs = {'financial': fin_s, 'market': mkt_s, 'event': evt_s, 'compliance': cpl_s, 'total': total}
        cap_fin, cap_mkt, cap_evt, cap_cpl, multiplier = compute_position_cap(rs, detail_all)

        for dim in score_agg:
            score_agg[dim].append(rs[dim])

        if multiplier < 0.5:
            cap_dist['<0.5'] += 1
        elif multiplier < 0.8:
            cap_dist['0.5~0.8'] += 1
        elif multiplier <= 1.0:
            cap_dist['0.8~1.0'] += 1
        else:
            cap_dist['>1.0'] += 1

        results.append({
            'ts_code': ts_code, 'trade_date': td_sql,
            'trade_allowed': True, 'block_reason': None,
            'risk_score_financial': fin_s, 'risk_score_market': mkt_s,
            'risk_score_event': evt_s, 'risk_score_compliance': cpl_s,
            'risk_score_total': total,
            'cap_financial': cap_fin, 'cap_market': cap_mkt,
            'cap_event': cap_evt, 'cap_compliance': cap_cpl,
            'position_cap_multiplier_final': multiplier,
            'risk_model_version': RISK_MODEL_VERSION,
            'position_model_version': POSITION_MODEL_VERSION,
            'config_snapshot_json': config_json,
            'detail_json': json.dumps(detail_all, ensure_ascii=False, default=str),
        })

    # ── Log score summaries ──
    for dim in ['financial', 'market', 'event', 'compliance', 'total']:
        vals = score_agg[dim]
        if vals:
            logging.info(f'Score {dim}: mean={sum(vals)/len(vals):.2f} '
                         f'min={min(vals):.2f} max={max(vals):.2f}')
    logging.info(f'Cap distribution: {dict(cap_dist)}')

    # ── Write to DB ──
    if args.dry_run:
        logging.info(f'DRY RUN: would write {len(results)} rows — skipped.')
    else:
        logging.info(f'Writing {len(results)} rows to ashare_risk_score...')
        cur = conn.cursor()
        written = 0
        for i in range(0, len(results), BATCH_SIZE):
            batch = results[i:i + BATCH_SIZE]
            for row in batch:
                cur.execute(UPSERT_SQL, row)
            conn.commit()
            written += len(batch)
            if written % 2000 == 0:
                logging.info(f'  progress: {written}/{len(results)}')
        logging.info(f'Write complete: {written} rows')
        cur.close()

    conn.close()
    elapsed = time.time() - t0
    logging.info(f'=== Risk Scorer done in {elapsed:.1f}s ===')


if __name__ == '__main__':
    main()
