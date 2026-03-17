#!/opt/ashare_venv/bin/python
"""
sync_watchlist_legacy_status.py — lifecycle_status → 旧status字段单向同步
将 lifecycle_status 映射到旧 status 字段，保持向后兼容。

映射规则：
  candidate / approved / signaled / handed_off → active
  blocked → expired
  retired → exited (有exit_date) 或 expired (无exit_date)

Pipeline 位置：PERF_ANALYZE 之后、pool_mailer 之前
"""

import argparse
import logging
import os
import sys
from datetime import datetime

import psycopg2

def setup_logging():
    log_dir = '/var/log/ashare'
    os.makedirs(log_dir, exist_ok=True)
    fmt = '%(asctime)s [%(levelname)s] %(message)s'
    handlers = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(log_dir, 'sync_watchlist_legacy_status.log'), encoding='utf-8'),
    ]
    logging.basicConfig(level=logging.INFO, format=fmt, handlers=handlers)


def get_db_conn():
    return psycopg2.connect(
        host=os.environ.get('ASHARE_DB_HOST', 'localhost'),
        dbname=os.environ.get('ASHARE_DB_NAME', 'ashare'),
        user=os.environ.get('ASHARE_DB_USER', 'ashare_user'),
        password=os.environ.get('ASHARE_DB_PASS', ''),
    )


LIFECYCLE_TO_LEGACY = {
    'candidate': 'active',
    'approved': 'active',
    'signaled': 'active',
    'handed_off': 'active',
    'blocked': 'expired',
}


def sync(conn, dry_run):
    """Sync lifecycle_status → legacy status field."""
    cur = conn.cursor()

    # 1. Fixed mappings (candidate/approved/signaled/handed_off → active, blocked → expired)
    total_updated = 0
    for lc_status, legacy_status in LIFECYCLE_TO_LEGACY.items():
        cur.execute("""
            UPDATE ashare_watchlist
            SET status = %s, updated_at = NOW()
            WHERE lifecycle_status = %s AND status != %s
        """, (legacy_status, lc_status, legacy_status))
        n = cur.rowcount
        if n > 0:
            logging.info(f'  {lc_status} → {legacy_status}: {n} rows')
            total_updated += n

    # 2. Retired: exited (has exit_date) or expired (no exit_date)
    cur.execute("""
        UPDATE ashare_watchlist
        SET status = 'exited', updated_at = NOW()
        WHERE lifecycle_status = 'retired' AND exit_date IS NOT NULL AND status != 'exited'
    """)
    n = cur.rowcount
    if n > 0:
        logging.info(f'  retired (has exit_date) → exited: {n} rows')
        total_updated += n

    cur.execute("""
        UPDATE ashare_watchlist
        SET status = 'expired', updated_at = NOW()
        WHERE lifecycle_status = 'retired' AND exit_date IS NULL AND status != 'expired'
    """)
    n = cur.rowcount
    if n > 0:
        logging.info(f'  retired (no exit_date) → expired: {n} rows')
        total_updated += n

    if dry_run:
        conn.rollback()
        logging.info(f'DRY RUN: would update {total_updated} rows — rolled back.')
    else:
        conn.commit()
        logging.info(f'Synced {total_updated} rows.')

    cur.close()
    return total_updated


def main():
    setup_logging()
    parser = argparse.ArgumentParser(description='Sync lifecycle_status to legacy status')
    parser.add_argument('--date', type=str, help='Trade date YYYYMMDD (for logging)')
    parser.add_argument('--dry_run', action='store_true', help='No DB write')
    args = parser.parse_args()

    trade_date = args.date or datetime.now().strftime('%Y%m%d')
    logging.info(f'=== Sync Legacy Status start | date={trade_date} dry_run={args.dry_run} ===')

    conn = get_db_conn()
    updated = sync(conn, args.dry_run)
    conn.close()

    summary = f'SYNC_LEGACY DONE | date={trade_date} | updated={updated}'
    logging.info(f'=== {summary} ===')
    print(summary)


if __name__ == '__main__':
    main()
