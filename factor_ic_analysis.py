#!/opt/ashare_venv/bin/python
"""
factor_ic_analysis.py — 因子IC/ICIR分析
独立运行的分析脚本，计算6个因子在4个持有周期的Rank IC/ICIR，
支持市场环境分层、因子相关性矩阵、分桶收益分析。
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime

import numpy as np
import pandas as pd
import psycopg2
from scipy import stats as sp_stats

# ─── Config ──────────────────────────────────────────────────────────────────

FACTORS = ['ret20', 'turnover', 'vr5', 'close_vs_ma5', 'pct_chg_1d', 'rs20']
HOLDING_PERIODS = [1, 3, 5, 10]
IC_THRESHOLD = 0.03
ICIR_THRESHOLD = 0.5
QUINTILES = 5
INDEX_CODE = '399006.SZ'

REGIME_GROUPS = {
    '强市': ['trend_up', 'range_up'],
    '弱市': ['down_weak'],
    '震荡': ['range_choppy'],
}


# ─── Infrastructure ─────────────────────────────────────────────────────────

def setup_logging():
    log_dir = '/var/log/ashare'
    os.makedirs(log_dir, exist_ok=True)
    fmt = '%(asctime)s [%(levelname)s] %(message)s'
    handlers = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(log_dir, 'factor_ic_analysis.log'), encoding='utf-8'),
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
    parser = argparse.ArgumentParser(description='Factor IC/ICIR analysis')
    parser.add_argument('--end_date', type=str, help='End date YYYYMMDD (default: latest trading day)')
    parser.add_argument('--window', type=int, default=120, help='Lookback trading days (default: 120)')
    parser.add_argument('--dry_run', action='store_true', help='No DB write')
    return parser.parse_args()


# ─── Data Loading ────────────────────────────────────────────────────────────

def load_data(conn, end_date_sql, window):
    """Load all required data into pandas DataFrames in bulk."""
    logging.info('Loading data...')

    total_days = window + 30
    cur = conn.cursor()

    # Get trading dates up to end_date
    cur.execute("""
        SELECT DISTINCT trade_date FROM ashare_daily_price
        WHERE trade_date <= %s ORDER BY trade_date DESC LIMIT %s
    """, (end_date_sql, total_days + 30))
    all_dates = sorted([r[0] for r in cur.fetchall()])
    if len(all_dates) < 50:
        logging.error(f'Not enough trading dates: {len(all_dates)}')
        return None
    start_date = all_dates[0]
    logging.info(f'Date range: {start_date} ~ {end_date_sql}, {len(all_dates)} trading days')

    # (1) Daily price
    cur.execute("""
        SELECT ts_code, trade_date, open, high, low, close, vol, amount
        FROM ashare_daily_price
        WHERE trade_date >= %s AND trade_date <= %s
        ORDER BY ts_code, trade_date
    """, (start_date, end_date_sql))
    cols = ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'vol', 'amount']
    price_df = pd.DataFrame(cur.fetchall(), columns=cols)
    for c in ['open', 'high', 'low', 'close', 'vol', 'amount']:
        price_df[c] = pd.to_numeric(price_df[c], errors='coerce')
    logging.info(f'Daily price: {len(price_df)} rows, {price_df["ts_code"].nunique()} stocks')

    # (2) Daily basic (turnover_rate)
    cur.execute("""
        SELECT ts_code, trade_date, turnover_rate
        FROM ashare_daily_basic
        WHERE trade_date >= %s AND trade_date <= %s
    """, (start_date, end_date_sql))
    basic_df = pd.DataFrame(cur.fetchall(), columns=['ts_code', 'trade_date', 'turnover_rate'])
    basic_df['turnover_rate'] = pd.to_numeric(basic_df['turnover_rate'], errors='coerce')
    logging.info(f'Daily basic: {len(basic_df)} rows')

    # (3) Index daily price (399006.SZ)
    cur.execute("""
        SELECT trade_date, close FROM ashare_index_daily_price
        WHERE ts_code = %s AND trade_date >= %s AND trade_date <= %s
        ORDER BY trade_date
    """, (INDEX_CODE, start_date, end_date_sql))
    idx_df = pd.DataFrame(cur.fetchall(), columns=['trade_date', 'idx_close'])
    idx_df['idx_close'] = pd.to_numeric(idx_df['idx_close'], errors='coerce')
    logging.info(f'Index data: {len(idx_df)} rows')

    # (4) ST stocks
    cur.execute("SELECT ts_code FROM ashare_stock_basic WHERE is_st = 't'")
    st_set = set(r[0] for r in cur.fetchall())
    logging.info(f'ST stocks: {len(st_set)}')

    # (5) Market regime
    cur.execute("""
        SELECT trade_date, regime FROM ashare_market_regime
        WHERE trade_date >= %s AND trade_date <= %s
    """, (start_date, end_date_sql))
    regime_df = pd.DataFrame(cur.fetchall(), columns=['trade_date', 'regime'])
    logging.info(f'Market regime: {len(regime_df)} rows')

    cur.close()

    return {
        'price': price_df,
        'basic': basic_df,
        'index': idx_df,
        'st_set': st_set,
        'regime': regime_df,
        'all_dates': all_dates,
    }


# ─── Factor Construction ────────────────────────────────────────────────────

def build_factors(data):
    """Construct 6 factors and 4 forward returns in pandas."""
    logging.info('Building factors...')
    df = data['price'].copy()

    # Sort and group
    df = df.sort_values(['ts_code', 'trade_date']).reset_index(drop=True)
    g = df.groupby('ts_code')

    # pct_chg and pre_close
    df['pre_close'] = g['close'].shift(1)
    df['pct_chg'] = df['close'] / df['pre_close'] - 1

    # Factor 1: ret20 = close / close_20d_ago - 1
    df['close_20ago'] = g['close'].shift(20)
    df['ret20'] = df['close'] / df['close_20ago'] - 1

    # Factor 2: turnover (merge from daily_basic)
    basic = data['basic'][['ts_code', 'trade_date', 'turnover_rate']]
    df = df.merge(basic, on=['ts_code', 'trade_date'], how='left')
    df['turnover'] = df['turnover_rate']

    # Factor 3: vr5 = MA5(vol) / MA20(vol)
    # Need to re-group after merge
    df = df.sort_values(['ts_code', 'trade_date']).reset_index(drop=True)
    g = df.groupby('ts_code')
    df['vol_ma5'] = g['vol'].transform(lambda x: x.rolling(5, min_periods=5).mean())
    df['vol_ma20'] = g['vol'].transform(lambda x: x.rolling(20, min_periods=20).mean())
    df['vr5'] = df['vol_ma5'] / df['vol_ma20']

    # Factor 4: close_vs_ma5 = close / MA5(close) - 1
    df['ma5'] = g['close'].transform(lambda x: x.rolling(5, min_periods=5).mean())
    df['close_vs_ma5'] = df['close'] / df['ma5'] - 1

    # Factor 5: pct_chg_1d (already computed)
    df['pct_chg_1d'] = df['pct_chg']

    # Factor 6: rs20 = stock_ret20 - index_ret20
    idx = data['index'].copy()
    idx = idx.sort_values('trade_date').reset_index(drop=True)
    idx['idx_close_20ago'] = idx['idx_close'].shift(20)
    idx['idx_ret20'] = idx['idx_close'] / idx['idx_close_20ago'] - 1
    df = df.merge(idx[['trade_date', 'idx_ret20']], on='trade_date', how='left')
    df['rs20'] = df['ret20'] - df['idx_ret20']

    # Forward returns
    g2 = df.groupby('ts_code')
    for hp in HOLDING_PERIODS:
        col = f'fwd_ret_{hp}'
        df[col] = g2['close'].shift(-hp) / df['close'] - 1

    # Merge regime
    regime = data['regime']
    df = df.merge(regime, on='trade_date', how='left')

    # Mark ST
    df['is_st'] = df['ts_code'].isin(data['st_set'])

    logging.info(f'Factor DataFrame: {len(df)} rows, {df["ts_code"].nunique()} stocks')
    return df


# ─── IC Computation ─────────────────────────────────────────────────────────

def compute_daily_ic(df, trade_dates, factor, holding_period):
    """Compute daily Spearman rank IC for a factor-period pair."""
    fwd_col = f'fwd_ret_{holding_period}'
    ic_series = []

    for td in trade_dates:
        cross = df[df['trade_date'] == td]
        # Filter: not ST, amount >= 5000 (千元 = 500万), valid factor & fwd_ret
        cross = cross[~cross['is_st']]
        cross = cross[cross['amount'] >= 5000]
        sub = cross[[factor, fwd_col]].dropna()
        if len(sub) < 30:
            continue
        ic, _ = sp_stats.spearmanr(sub[factor], sub[fwd_col])
        if not np.isnan(ic):
            ic_series.append({'trade_date': td, 'ic': ic, 'n_stocks': len(sub)})

    return ic_series


def compute_ic_stats(ic_series):
    """Compute IC mean, std, ICIR from a list of daily ICs."""
    if not ic_series:
        return None
    ics = [x['ic'] for x in ic_series]
    n_stocks = [x['n_stocks'] for x in ic_series]
    ic_mean = np.mean(ics)
    ic_std = np.std(ics, ddof=1) if len(ics) > 1 else 0
    icir = ic_mean / ic_std if ic_std > 0 else 0
    return {
        'ic_mean': round(float(ic_mean), 5),
        'ic_std': round(float(ic_std), 5),
        'icir': round(float(icir), 5),
        'sample_days': len(ics),
        'sample_stocks_avg': int(np.mean(n_stocks)),
    }


# ─── Deliverable 1: Full-sample IC/ICIR ─────────────────────────────────────

def deliverable_1(df, trade_dates):
    """Full-sample Rank IC/ICIR for 6 factors x 4 periods."""
    logging.info('Computing Deliverable 1: Full-sample IC/ICIR...')
    results = {}
    all_ic_series = {}

    for factor in FACTORS:
        for hp in HOLDING_PERIODS:
            ic_series = compute_daily_ic(df, trade_dates, factor, hp)
            all_ic_series[(factor, hp)] = ic_series
            stats = compute_ic_stats(ic_series)
            results[(factor, hp)] = stats

    # Log output
    header = '                  '
    for hp in HOLDING_PERIODS:
        header += f'   T+{hp:<3}       '
    lines = ['\n=== 交付1：全样本 Rank IC/ICIR ===', header]

    sub_hdr = f'{"factor":<18}'
    for _ in HOLDING_PERIODS:
        sub_hdr += f'{"IC":>7} {"ICIR":>6}  '
    lines.append(sub_hdr)

    for factor in FACTORS:
        row = f'{factor:<18}'
        for hp in HOLDING_PERIODS:
            s = results.get((factor, hp))
            if s:
                row += f'{s["ic_mean"]:>+7.4f} {s["icir"]:>6.3f}  '
            else:
                row += f'{"N/A":>7} {"N/A":>6}  '
        lines.append(row)

    # Effective factors
    effective = []
    for factor in FACTORS:
        for hp in HOLDING_PERIODS:
            s = results.get((factor, hp))
            if s and abs(s['ic_mean']) > IC_THRESHOLD and abs(s['icir']) > ICIR_THRESHOLD:
                effective.append(f'{factor}(T+{hp})')
    eff_str = ', '.join(effective) if effective else '无'
    lines.append(f'有效因子(|IC|>{IC_THRESHOLD}, ICIR>{ICIR_THRESHOLD}): {eff_str}')

    for line in lines:
        logging.info(line)

    return results, all_ic_series


# ─── Deliverable 2: Regime-stratified IC/ICIR ────────────────────────────────

def deliverable_2(df, trade_dates, all_ic_series):
    """Regime-stratified IC/ICIR."""
    logging.info('Computing Deliverable 2: Regime-stratified IC/ICIR...')

    # Build regime lookup
    regime_lookup = {}
    for _, row in df[['trade_date', 'regime']].drop_duplicates().iterrows():
        regime_lookup[row['trade_date']] = row['regime']

    results = {}

    for factor in FACTORS:
        for hp in HOLDING_PERIODS:
            ic_series = all_ic_series.get((factor, hp), [])
            grouped = {rg: [] for rg in REGIME_GROUPS}
            for item in ic_series:
                regime = regime_lookup.get(item['trade_date'])
                for rg, regimes in REGIME_GROUPS.items():
                    if regime in regimes:
                        grouped[rg].append(item)
                        break

            for rg, sub_series in grouped.items():
                stats = compute_ic_stats(sub_series)
                results[(factor, hp, rg)] = stats

    # Log T+5 detail
    for show_hp in [5]:
        lines = [f'\n=== 交付2：分层 IC/ICIR (T+{show_hp}) ===']
        hdr = f'{"factor":<18}'
        for rg in REGIME_GROUPS:
            hdr += f'  {rg:^14}  '
        lines.append(hdr)

        sub_hdr = f'{"":<18}'
        for _ in REGIME_GROUPS:
            sub_hdr += f'{"IC":>7} {"ICIR":>6}  '
        lines.append(sub_hdr)

        for factor in FACTORS:
            row = f'{factor:<18}'
            for rg in REGIME_GROUPS:
                s = results.get((factor, show_hp, rg))
                if s:
                    row += f'{s["ic_mean"]:>+7.4f} {s["icir"]:>6.3f}  '
                else:
                    row += f'{"N/A":>7} {"N/A":>6}  '
            lines.append(row)

        for line in lines:
            logging.info(line)

    # All periods summary
    lines = ['\n=== 交付2：全周期分层汇总 ===']
    for hp in HOLDING_PERIODS:
        lines.append(f'--- T+{hp} ---')
        for factor in FACTORS:
            parts = []
            for rg in REGIME_GROUPS:
                s = results.get((factor, hp, rg))
                if s:
                    parts.append(f'{rg}:IC={s["ic_mean"]:+.4f}/ICIR={s["icir"]:.3f}(n={s["sample_days"]})')
                else:
                    parts.append(f'{rg}:N/A')
            lines.append(f'  {factor:<16} {" | ".join(parts)}')

    for line in lines:
        logging.info(line)

    return results


# ─── Deliverable 3: Factor Correlation Matrix ───────────────────────────────

def deliverable_3(df, trade_dates):
    """Factor Spearman correlation matrix on latest cross-section."""
    logging.info('Computing Deliverable 3: Factor correlation matrix...')
    latest_date = max(trade_dates)
    cross = df[df['trade_date'] == latest_date].copy()
    cross = cross[~cross['is_st']]
    cross = cross[cross['amount'] >= 5000]
    sub = cross[FACTORS].dropna()

    if len(sub) < 30:
        logging.warning(f'Too few stocks on {latest_date}: {len(sub)}')
        return None

    corr = sub[FACTORS].corr(method='spearman')

    lines = [f'\n=== 交付3：因子相关性矩阵 (截面日={latest_date}, N={len(sub)}) ===']
    hdr = f'{"":<16}' + ''.join(f'{f:>12}' for f in FACTORS)
    lines.append(hdr)
    for f1 in FACTORS:
        row = f'{f1:<16}'
        for f2 in FACTORS:
            row += f'{corr.loc[f1, f2]:>12.4f}'
        lines.append(row)

    # High correlation pairs
    high_pairs = []
    for i, f1 in enumerate(FACTORS):
        for j, f2 in enumerate(FACTORS):
            if i < j and abs(corr.loc[f1, f2]) > 0.5:
                high_pairs.append(f'{f1}-{f2}({corr.loc[f1, f2]:.4f})')
    hp_str = ', '.join(high_pairs) if high_pairs else '无'
    lines.append(f'高相关对(|r|>0.5): {hp_str}')

    for line in lines:
        logging.info(line)

    return corr


# ─── Deliverable 4: Quintile Bucket Returns ─────────────────────────────────

def deliverable_4(df, trade_dates):
    """Quintile bucket average forward returns for each factor."""
    logging.info('Computing Deliverable 4: Quintile bucket returns...')

    show_periods = [1, 3, 5]
    results = {}

    for factor in FACTORS:
        for hp in show_periods:
            fwd_col = f'fwd_ret_{hp}'
            bucket_rets = {q: [] for q in range(1, QUINTILES + 1)}

            for td in trade_dates:
                cross = df[df['trade_date'] == td].copy()
                cross = cross[~cross['is_st']]
                cross = cross[cross['amount'] >= 5000]
                sub = cross[[factor, fwd_col]].dropna()
                if len(sub) < QUINTILES * 10:
                    continue

                try:
                    sub = sub.copy()
                    sub['quintile'] = pd.qcut(sub[factor], QUINTILES, labels=False, duplicates='drop') + 1
                except ValueError:
                    continue

                for q in range(1, QUINTILES + 1):
                    qdata = sub[sub['quintile'] == q][fwd_col]
                    if len(qdata) > 0:
                        bucket_rets[q].append(qdata.mean())

            for q in range(1, QUINTILES + 1):
                if bucket_rets[q]:
                    results[(factor, hp, q)] = np.mean(bucket_rets[q])
                else:
                    results[(factor, hp, q)] = None

    # Log
    for show_hp in show_periods:
        lines = [f'\n=== 交付4：分桶收益(T+{show_hp}) ===']
        for factor in FACTORS:
            parts = []
            vals = []
            for q in range(1, QUINTILES + 1):
                v = results.get((factor, show_hp, q))
                if v is not None:
                    parts.append(f'Q{q}={v*100:+.2f}%')
                    vals.append(v)
                else:
                    parts.append(f'Q{q}=N/A')

            # Monotonicity check
            if len(vals) == QUINTILES:
                diffs = [vals[i+1] - vals[i] for i in range(len(vals)-1)]
                if all(d >= 0 for d in diffs):
                    mono = '递增✓'
                elif all(d <= 0 for d in diffs):
                    mono = '递减✓'
                else:
                    mono = '非单调'
            else:
                mono = 'N/A'

            line = f'  {factor:<16} {"  ".join(parts)}  单调性:{mono}'
            lines.append(line)

        for line in lines:
            logging.info(line)

    return results


# ─── DB Write ────────────────────────────────────────────────────────────────

def write_results(conn, calc_date, d1_results, d2_results, dry_run):
    """Write deliverable 1 & 2 results to ashare_factor_ic."""
    if dry_run:
        logging.info('DRY RUN: would write to ashare_factor_ic -- skipped.')
        return

    cur = conn.cursor()
    count = 0

    # Deliverable 1: regime='all'
    for (factor, hp), stats in d1_results.items():
        if stats is None:
            continue
        cur.execute("""
            INSERT INTO ashare_factor_ic
            (calc_date, factor_name, holding_period, regime, ic_mean, ic_std, icir,
             sample_days, sample_stocks_avg)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (calc_date, factor_name, holding_period, regime) DO UPDATE SET
                ic_mean=EXCLUDED.ic_mean, ic_std=EXCLUDED.ic_std, icir=EXCLUDED.icir,
                sample_days=EXCLUDED.sample_days, sample_stocks_avg=EXCLUDED.sample_stocks_avg
        """, (calc_date, factor, f'T+{hp}', 'all',
              stats['ic_mean'], stats['ic_std'], stats['icir'],
              stats['sample_days'], stats['sample_stocks_avg']))
        count += 1

    # Deliverable 2: per regime group
    for (factor, hp, rg), stats in d2_results.items():
        if stats is None:
            continue
        cur.execute("""
            INSERT INTO ashare_factor_ic
            (calc_date, factor_name, holding_period, regime, ic_mean, ic_std, icir,
             sample_days, sample_stocks_avg)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (calc_date, factor_name, holding_period, regime) DO UPDATE SET
                ic_mean=EXCLUDED.ic_mean, ic_std=EXCLUDED.ic_std, icir=EXCLUDED.icir,
                sample_days=EXCLUDED.sample_days, sample_stocks_avg=EXCLUDED.sample_stocks_avg
        """, (calc_date, factor, f'T+{hp}', rg,
              stats['ic_mean'], stats['ic_std'], stats['icir'],
              stats['sample_days'], stats['sample_stocks_avg']))
        count += 1

    conn.commit()
    cur.close()
    logging.info(f'Wrote {count} rows to ashare_factor_ic.')


# ─── Conclusions ─────────────────────────────────────────────────────────────

def print_conclusions(d1_results, d2_results, corr_matrix):
    """Print summary conclusions."""
    lines = ['\n=== 结论 ===']

    # Effective factors
    effective = []
    for factor in FACTORS:
        eff_periods = []
        for hp in HOLDING_PERIODS:
            s = d1_results.get((factor, hp))
            if s and abs(s['ic_mean']) > IC_THRESHOLD and abs(s['icir']) > ICIR_THRESHOLD:
                eff_periods.append(f'T+{hp}')
        if eff_periods:
            effective.append(f'{factor}({",".join(eff_periods)})')
    lines.append(f'有效因子: {", ".join(effective) if effective else "无"}')

    # Redundant factors (high correlation)
    redundant = []
    if corr_matrix is not None:
        for i, f1 in enumerate(FACTORS):
            for j, f2 in enumerate(FACTORS):
                if i < j and abs(corr_matrix.loc[f1, f2]) > 0.5:
                    redundant.append(f'{f1}<->{f2}(r={corr_matrix.loc[f1, f2]:.3f})')
    lines.append(f'冗余因子: {", ".join(redundant) if redundant else "无"}')

    # Regime dependency
    regime_dep = []
    for factor in FACTORS:
        hp = 5
        ic_by_regime = {}
        for rg in REGIME_GROUPS:
            s = d2_results.get((factor, hp, rg))
            if s:
                ic_by_regime[rg] = s['ic_mean']
        if len(ic_by_regime) >= 2:
            vals = list(ic_by_regime.values())
            spread = max(vals) - min(vals)
            if spread > 0.04:
                best = max(ic_by_regime, key=ic_by_regime.get)
                regime_dep.append(f'{factor}(T+5: {best}最优, 极差={spread:.4f})')
    lines.append(f'环境依赖: {", ".join(regime_dep) if regime_dep else "无明显环境依赖"}')

    for line in lines:
        logging.info(line)


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    setup_logging()
    args = parse_args()
    t0 = time.time()

    conn = get_db_conn()
    cur = conn.cursor()

    # Determine end_date
    if args.end_date:
        end_date = args.end_date
        end_date_sql = f'{end_date[:4]}-{end_date[4:6]}-{end_date[6:8]}'
    else:
        cur.execute("SELECT MAX(trade_date) FROM ashare_daily_price")
        end_date_sql = str(cur.fetchone()[0])
        end_date = end_date_sql.replace('-', '')
    cur.close()

    logging.info(f'=== Factor IC Analysis start | end_date={end_date} '
                 f'window={args.window} dry_run={args.dry_run} ===')

    # Load data
    data = load_data(conn, end_date_sql, args.window)
    if data is None:
        conn.close()
        return

    # Build factors
    df = build_factors(data)

    # Determine analysis trade dates (the window)
    all_dates = sorted(data['all_dates'])
    analysis_dates = [d for d in all_dates if d <= pd.Timestamp(end_date_sql).date()]
    # Take last window+10 dates, then remove last 10 (need forward returns for T+10)
    if len(analysis_dates) > args.window + 10:
        analysis_dates = analysis_dates[-(args.window + 10):]
    analysis_dates = analysis_dates[:-10] if len(analysis_dates) > 10 else analysis_dates

    logging.info(f'Analysis dates: {len(analysis_dates)} days '
                 f'({analysis_dates[0]} ~ {analysis_dates[-1]})')

    # Deliverable 1
    d1_results, all_ic_series = deliverable_1(df, analysis_dates)

    # Deliverable 2
    d2_results = deliverable_2(df, analysis_dates, all_ic_series)

    # Deliverable 3
    corr_matrix = deliverable_3(df, analysis_dates)

    # Deliverable 4
    deliverable_4(df, analysis_dates)

    # Conclusions
    print_conclusions(d1_results, d2_results, corr_matrix)

    # Write to DB
    write_results(conn, end_date_sql, d1_results, d2_results, args.dry_run)

    conn.close()
    elapsed = time.time() - t0
    logging.info(f'=== Factor IC Analysis done in {elapsed:.1f}s ===')


if __name__ == '__main__':
    main()
