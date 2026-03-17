#!/usr/bin/env python3
"""
market_breadth_update.py
每日更新 ashare_market_breadth 表
- 计算当日：total_stocks, up/down/flat, adr, up3/up5/down3/down5, net_strong
- 计算涨跌停：排除BJ、ST，科创板/创业板±20%，主板±10%
- 计算评分：ADR×0.4 + td_ratio×0.35 + up5×0.25（基于全历史PERCENT_RANK）
- UPSERT进 ashare_market_breadth
"""

import argparse
import logging
import sys
import os
import psycopg2

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

def get_db_conn():
    return psycopg2.connect(
        host=os.environ["ASHARE_DB_HOST"],
        port=int(os.environ.get("ASHARE_DB_PORT", 5432)),
        dbname=os.environ["ASHARE_DB_NAME"],
        user=os.environ["ASHARE_DB_USER"],
        password=os.environ["ASHARE_DB_PASS"],
    )

UPSERT_SQL = """
WITH

-- day prices + prev_close (LAG)
_price AS (
    SELECT
        trade_date,
        ts_code,
        close,
        high,
        low,
        LAG(close) OVER (PARTITION BY ts_code ORDER BY trade_date) AS prev_close
    FROM ashare_daily_price
    WHERE ts_code NOT LIKE '%%%%BJ'
      AND ts_code NOT IN (
          SELECT ts_code FROM ashare_stock_basic WHERE name LIKE '%%%%ST%%%%'
      )
      AND trade_date BETWEEN (DATE %(trade_date)s - INTERVAL '10 days') AND %(trade_date)s
),

_base AS (
    SELECT
        ts_code,
        close,
        high,
        low,
        CASE WHEN prev_close > 0
             THEN (close / prev_close - 1) * 100
        END AS pct_chg
    FROM _price
    WHERE trade_date = %(trade_date)s
      AND prev_close IS NOT NULL
      AND prev_close > 0
),

_flags AS (
    SELECT
        ts_code,
        CASE WHEN pct_chg > 0  THEN 1 ELSE 0 END AS is_up,
        CASE WHEN pct_chg < 0  THEN 1 ELSE 0 END AS is_down,
        CASE WHEN pct_chg = 0  THEN 1 ELSE 0 END AS is_flat,
        CASE WHEN pct_chg > 3  THEN 1 ELSE 0 END AS is_up3,
        CASE WHEN pct_chg > 5  THEN 1 ELSE 0 END AS is_up5,
        CASE WHEN pct_chg < -3 THEN 1 ELSE 0 END AS is_down3,
        CASE WHEN pct_chg < -5 THEN 1 ELSE 0 END AS is_down5,
        CASE
            WHEN ts_code LIKE '688%%%%' OR ts_code LIKE '300%%%%' OR ts_code LIKE '301%%%%'
                THEN CASE WHEN close = high AND pct_chg > 18 THEN 1 ELSE 0 END
            ELSE CASE WHEN close = high AND pct_chg > 9 THEN 1 ELSE 0 END
        END AS is_limit_up,
        CASE
            WHEN ts_code LIKE '688%%%%' OR ts_code LIKE '300%%%%' OR ts_code LIKE '301%%%%'
                THEN CASE WHEN close = low AND pct_chg < -18 THEN 1 ELSE 0 END
            ELSE CASE WHEN close = low AND pct_chg < -9 THEN 1 ELSE 0 END
        END AS is_limit_down,
        CASE
            WHEN ts_code LIKE '688%%%%' OR ts_code LIKE '300%%%%' OR ts_code LIKE '301%%%%'
                THEN CASE WHEN pct_chg > 18 THEN 1 ELSE 0 END
            ELSE CASE WHEN pct_chg > 9 THEN 1 ELSE 0 END
        END AS is_touch_up
    FROM _base
),

_today AS (
    SELECT
        COUNT(*)                             AS total_stocks,
        SUM(is_up)                           AS up_stocks,
        SUM(is_down)                         AS down_stocks,
        SUM(is_flat)                         AS flat_stocks,
        SUM(is_up3)                          AS up3_stocks,
        SUM(is_up5)                          AS up5_stocks,
        SUM(is_down3)                        AS down3_stocks,
        SUM(is_down5)                        AS down5_stocks,
        SUM(is_up5) - SUM(is_down5)          AS net_strong,
        SUM(is_limit_up)                     AS limit_up,
        SUM(is_limit_down)                   AS limit_down,
        SUM(is_touch_up)                     AS touch_up,
        SUM(is_touch_up) - SUM(is_limit_up)  AS broken_up
    FROM _flags
)

INSERT INTO ashare_market_breadth (
    trade_date, total_stocks,
    up_stocks, down_stocks, flat_stocks, adr,
    up3_stocks, up5_stocks, down3_stocks, down5_stocks, net_strong,
    limit_up, limit_down, touch_up, broken_up, td_ratio,
    updated_at
)
SELECT
    %(trade_date)s,
    total_stocks,
    up_stocks, down_stocks, flat_stocks,
    ROUND(up_stocks::numeric / NULLIF(total_stocks, 0), 4),
    up3_stocks, up5_stocks, down3_stocks, down5_stocks, net_strong,
    limit_up, limit_down, touch_up, broken_up,
    ROUND(limit_up::numeric / NULLIF(limit_down, 0), 4),
    NOW()
FROM _today
ON CONFLICT (trade_date) DO UPDATE SET
    total_stocks = EXCLUDED.total_stocks,
    up_stocks    = EXCLUDED.up_stocks,
    down_stocks  = EXCLUDED.down_stocks,
    flat_stocks  = EXCLUDED.flat_stocks,
    adr          = EXCLUDED.adr,
    up3_stocks   = EXCLUDED.up3_stocks,
    up5_stocks   = EXCLUDED.up5_stocks,
    down3_stocks = EXCLUDED.down3_stocks,
    down5_stocks = EXCLUDED.down5_stocks,
    net_strong   = EXCLUDED.net_strong,
    limit_up     = EXCLUDED.limit_up,
    limit_down   = EXCLUDED.limit_down,
    touch_up     = EXCLUDED.touch_up,
    broken_up    = EXCLUDED.broken_up,
    td_ratio     = EXCLUDED.td_ratio,
    updated_at   = NOW();
"""

SCORE_SQL = """
WITH
_scores AS (
    SELECT
        trade_date,
        ROUND(PERCENT_RANK() OVER (ORDER BY adr)::numeric * 100, 1)        AS adr_score,
        CASE
            WHEN limit_down = 0 THEN 100.0
            ELSE ROUND(PERCENT_RANK() OVER (ORDER BY td_ratio)::numeric * 100, 1)
        END                                                                  AS tdr_score,
        ROUND(PERCENT_RANK() OVER (ORDER BY up5_stocks)::numeric * 100, 1) AS up5_score
    FROM ashare_market_breadth
    WHERE trade_date >= '2020-01-02'
),
_composite AS (
    SELECT
        trade_date,
        adr_score,
        tdr_score,
        up5_score,
        ROUND(adr_score * 0.40 + tdr_score * 0.35 + up5_score * 0.25, 1) AS composite_score
    FROM _scores
)
UPDATE ashare_market_breadth m
SET
    metric_a      = c.adr_score,
    metric_b      = c.tdr_score,
    metric_c      = c.up5_score,
    market_regime = CASE
                        WHEN c.composite_score >= 80 THEN 'strong'
                        WHEN c.composite_score >= 60 THEN 'bullish'
                        WHEN c.composite_score >= 35 THEN 'neutral'
                        WHEN c.composite_score >= 20 THEN 'bearish'
                        ELSE 'weak'
                    END,
    updated_at    = NOW()
FROM _composite c
WHERE m.trade_date = c.trade_date;
"""

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="YYYYMMDD")
    args = parser.parse_args()

    from datetime import datetime
    trade_date = datetime.strptime(args.date, "%Y%m%d").date()
    log.info(f"market_breadth_update | trade_date={trade_date}")

    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(UPSERT_SQL, {"trade_date": trade_date})
            cur.execute(SCORE_SQL)
        conn.commit()
        log.info(f"market_breadth_update | DONE trade_date={trade_date}")
    except Exception as e:
        conn.rollback()
        log.error(f"market_breadth_update | FAILED: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    main()
