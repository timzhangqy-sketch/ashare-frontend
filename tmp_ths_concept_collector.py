#!/opt/ashare_venv/bin/python
"""ths_concept_collector.py — 同花顺概念板块 & 成分股采集。

概念成分变化慢，不嵌入daily pipeline，每周或每月手动跑一次。
"""

import argparse
import logging
import os
import sys
import time
from datetime import datetime

import pandas as pd
import psycopg2
import tushare as ts


# ─── Logging ─────────────────────────────────────────────────────────────────

def setup_logging():
    log_dir = '/var/log/ashare'
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, 'ths_concept_collector.log')
    fmt = '%(asctime)s %(levelname)s %(message)s'
    handlers = [logging.StreamHandler(sys.stdout),
                logging.FileHandler(log_file, encoding='utf-8')]
    logging.basicConfig(level=logging.INFO, format=fmt, handlers=handlers)


# ─── DB ──────────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(
        host=os.environ['ASHARE_DB_HOST'],
        port=os.environ.get('ASHARE_DB_PORT', '5432'),
        dbname=os.environ['ASHARE_DB_NAME'],
        user=os.environ['ASHARE_DB_USER'],
        password=os.environ['ASHARE_DB_PASS'],
    )


def to_date(s):
    if s is None or (isinstance(s, float) and pd.isna(s)) or s == '':
        return None
    s = str(s)
    if len(s) == 8:
        return f'{s[:4]}-{s[4:6]}-{s[6:8]}'
    return s


# ─── 1. Concept List ────────────────────────────────────────────────────────

def collect_concept_list(pro, conn, dry_run=False):
    """Fetch all THS concept indices and UPSERT into ashare_ths_concept."""
    df = pro.ths_index(exchange='A', type='N')
    if df is None or len(df) == 0:
        logging.warning('ths_index returned empty')
        return 0, df

    cur = conn.cursor()
    count = 0
    for _, row in df.iterrows():
        if dry_run:
            count += 1
            continue
        cur.execute("""
            INSERT INTO ashare_ths_concept (ts_code, name, count, exchange, list_date)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (ts_code) DO UPDATE SET
                name = EXCLUDED.name,
                count = EXCLUDED.count,
                exchange = EXCLUDED.exchange,
                list_date = EXCLUDED.list_date,
                updated_at = NOW()
        """, (row['ts_code'], row['name'],
              int(row['count']) if pd.notna(row.get('count')) else None,
              row.get('exchange', ''),
              to_date(row.get('list_date'))))
        count += 1

    if not dry_run:
        conn.commit()
    logging.info(f'=== 概念列表 === {count}个概念已更新')
    return count, df


# ─── 2. Concept Members ─────────────────────────────────────────────────────

def collect_concept_members(pro, conn, concepts_df, full=False, dry_run=False):
    """Fetch members for each concept and write to ashare_ths_concept_member."""
    cur = conn.cursor()

    if full and not dry_run:
        cur.execute("TRUNCATE ashare_ths_concept_member")
        conn.commit()
        logging.info('全量模式: TRUNCATE ashare_ths_concept_member')

    total_mappings = 0
    for i, (_, row) in enumerate(concepts_df.iterrows()):
        concept_code = row['ts_code']
        concept_name = row['name']

        try:
            df = pro.ths_member(ts_code=concept_code)
        except Exception as e:
            logging.warning(f'  ths_member {concept_code} {concept_name} failed: {e}')
            time.sleep(1)
            continue

        if df is not None and len(df) > 0:
            for _, m in df.iterrows():
                if dry_run:
                    total_mappings += 1
                    continue
                cur.execute("""
                    INSERT INTO ashare_ths_concept_member
                        (concept_code, concept_name, ts_code, name)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (concept_code, ts_code) DO UPDATE SET
                        name = EXCLUDED.name,
                        concept_name = EXCLUDED.concept_name
                """, (concept_code, concept_name,
                      m.get('con_code', ''), m.get('con_name', '')))
                total_mappings += 1

        if not dry_run and (i + 1) % 20 == 0:
            conn.commit()

        if (i + 1) % 50 == 0:
            logging.info(f'  成分映射进度: {i+1}/{len(concepts_df)} 累计{total_mappings}条')

        time.sleep(1)

    if not dry_run:
        conn.commit()

    # Stats
    if not dry_run:
        cur.execute("SELECT COUNT(DISTINCT ts_code) FROM ashare_ths_concept_member")
        stock_count = cur.fetchone()[0]
        avg_concepts = round(total_mappings / stock_count, 1) if stock_count > 0 else 0
    else:
        stock_count = 0
        avg_concepts = 0

    logging.info(f'=== 成分映射 === 已处理 {len(concepts_df)}/{len(concepts_df)} 概念, '
                 f'总映射 {total_mappings} 条')
    logging.info(f'=== 个股覆盖 === {stock_count} 只股票有概念标签, '
                 f'平均每只属于 {avg_concepts} 个概念')
    return total_mappings


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='同花顺概念板块采集')
    parser.add_argument('--full', action='store_true', help='全量刷新（TRUNCATE成分表后重建）')
    parser.add_argument('--dry_run', action='store_true', help='不写DB')
    args = parser.parse_args()

    setup_logging()
    logging.info('=== ths_concept_collector start ===')

    pro = ts.pro_api(os.environ['TUSHARE_TOKEN'])
    conn = get_conn()

    try:
        concept_count, concepts_df = collect_concept_list(pro, conn, args.dry_run)
        if concepts_df is not None and len(concepts_df) > 0:
            collect_concept_members(pro, conn, concepts_df, full=args.full, dry_run=args.dry_run)
    finally:
        conn.close()

    logging.info('=== ths_concept_collector done ===')


if __name__ == '__main__':
    main()
