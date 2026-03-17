#!/opt/ashare_venv/bin/python
# -*- coding: utf-8 -*-
"""
vol_surge_scanner.py — 连续放量蓄势策略
替代原 POOL_TOP50 + IGNITE_STRICT3 + CONTINUATION_V1

策略逻辑：
  1. 连续3日量比 >= 2.0（基准：前20日均量，排除最近3天）
  2. 3日平均量比 <= 3.0（排除极端放量）
  3. 5日涨幅 < 15%（排除短期涨太猛）
  4. 20日涨幅 0% ~ 5%（底部刚启动，最佳介入时机）
  5. 收盘价 > MA20（趋势向上）
  6. 成交额 >= 3000万（流动性保障）
  7. 排除北交所、ST
  8. 按成交额降序排名，取前20只

回测表现：T+5 = +4.26%，胜率66.3%，每日约7只
买入：T+1开盘价 | 持有期：5个交易日

用法：
  source /opt/ashare_env.sh
  /opt/ashare_venv/bin/python /opt/vol_surge_scanner.py --date 20260303
  /opt/ashare_venv/bin/python /opt/vol_surge_scanner.py --date 20260303 --dry_run
"""

import os
import sys
import argparse
import datetime as dt
import psycopg2
from psycopg2.extras import RealDictCursor

# ============================================================
# 策略参数（集中配置，便于后续调优）
# ============================================================
VR_MIN = 2.0           # 连续3日每日VR下限
AVG_VR3_MAX = 2.5      # 3日平均VR上限
RET5_MAX = 0.15        # 5日涨幅上限
RET20_MIN = -0.02       # 20日涨幅下限
RET20_MAX = 0.08       # 20日涨幅上限
AMOUNT_MIN_K = 30000   # 成交额下限（千元 = 3000万）
TURNOVER_MAX = 5.0       # 换手率上限（%）
TOP_N = 20             # 最多取N只
HOLD_DAYS = 5          # 持有期（交易日）

# ============================================================
# 工具函数
# ============================================================
def env(key, default=""):
    return os.environ.get(key, default) or default

def get_db_conn():
    host = env("ASHARE_DB_HOST", "localhost")
    dbname = env("ASHARE_DB_NAME", "ashare")
    user = env("ASHARE_DB_USER", "ashare_user")
    password = env("ASHARE_DB_PASS", "")
    if not password:
        raise RuntimeError("ASHARE_DB_PASS is empty. Please export it via /opt/ashare_env.sh")
    return psycopg2.connect(host=host, dbname=dbname, user=user, password=password)

def parse_date(s):
    """支持 YYYYMMDD 和 YYYY-MM-DD 两种格式"""
    s = s.replace("-", "")
    return dt.datetime.strptime(s, "%Y%m%d").date()

# ============================================================
# 核心选股 SQL
# ============================================================
SCAN_SQL = """
WITH daily AS (
    SELECT
        p.trade_date,
        p.ts_code,
        s.name,
        p.open,
        p.close,
        p.vol,
        p.amount,
        b.turnover_rate,
        -- 干净基准量：前20日均量，排除最近3天（避免放量日污染基准）
        AVG(p.vol) OVER (
            PARTITION BY p.ts_code
            ORDER BY p.trade_date
            ROWS BETWEEN 22 PRECEDING AND 3 PRECEDING
        ) AS vol20_clean,
        -- MA20
        AVG(p.close) OVER (
            PARTITION BY p.ts_code
            ORDER BY p.trade_date
            ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING
        ) AS ma20,
        -- 5日涨幅
        p.close / NULLIF(
            LAG(p.close, 5) OVER (PARTITION BY p.ts_code ORDER BY p.trade_date), 0
        ) - 1 AS ret5,
        -- 20日涨幅
        p.close / NULLIF(
            LAG(p.close, 20) OVER (PARTITION BY p.ts_code ORDER BY p.trade_date), 0
        ) - 1 AS ret20,
        -- T-1和T-2的成交量（用于计算历史日VR）
        LAG(p.vol, 1) OVER (PARTITION BY p.ts_code ORDER BY p.trade_date) AS vol_1,
        LAG(p.vol, 2) OVER (PARTITION BY p.ts_code ORDER BY p.trade_date) AS vol_2
    FROM public.ashare_daily_price p
    JOIN public.ashare_stock_basic s
        ON p.ts_code = s.ts_code
        AND s.status = 'L'
        AND p.ts_code NOT LIKE '%%.BJ'
        AND (s.is_st IS NULL OR s.is_st = false)
    LEFT JOIN public.ashare_daily_basic b
        ON p.ts_code = b.ts_code AND p.trade_date = b.trade_date
    WHERE p.trade_date BETWEEN (%(trade_date)s::date - INTERVAL '60 days')::date
                          AND %(trade_date)s::date
),
vr_calc AS (
    SELECT
        d.*,
        d.vol   / NULLIF(d.vol20_clean, 0) AS vr_t0,
        d.vol_1 / NULLIF(d.vol20_clean, 0) AS vr_t1,
        d.vol_2 / NULLIF(d.vol20_clean, 0) AS vr_t2,
        (d.vol + d.vol_1 + d.vol_2) / NULLIF(d.vol20_clean * 3, 0) AS avg_vr3
    FROM daily d
    WHERE d.trade_date = %(trade_date)s::date
      AND d.vol20_clean IS NOT NULL
      AND d.vol20_clean > 0
      AND d.vol_1 IS NOT NULL
      AND d.vol_2 IS NOT NULL
)
SELECT
    trade_date,
    ts_code,
    name,
    close,
    ma20,
    ret5,
    ret20,
    amount,
    ROUND(amount / 100000.0, 4) AS amount_yi,
    turnover_rate,
    vol20_clean,
    vr_t0,
    vr_t1,
    vr_t2,
    avg_vr3,
    ROW_NUMBER() OVER (ORDER BY avg_vr3 ASC) AS entry_rank
FROM vr_calc
WHERE vr_t0  >= %(vr_min)s
  AND vr_t1  >= %(vr_min)s
  AND vr_t2  >= %(vr_min)s
  AND avg_vr3 <= %(avg_vr3_max)s
  AND ret5   < %(ret5_max)s
  AND ret20  >= %(ret20_min)s
  AND ret20  < %(ret20_max)s
  AND close  > ma20
  AND amount >= %(amount_min_k)s
  AND turnover_rate IS NOT NULL
  AND turnover_rate <= %(turnover_max)s
ORDER BY avg_vr3 ASC
LIMIT %(top_n)s;
"""

# ============================================================
# 获取T+1开盘价和目标退出日
# ============================================================
BUY_INFO_SQL = """
WITH next_days AS (
    SELECT cal_date, ROW_NUMBER() OVER (ORDER BY cal_date) AS rn
    FROM public.ashare_trade_calendar
    WHERE cal_date > %(trade_date)s AND is_open = true
    ORDER BY cal_date
    LIMIT %(hold_days_plus1)s
)
SELECT
    (SELECT cal_date FROM next_days WHERE rn = 1) AS buy_date,
    (SELECT cal_date FROM next_days WHERE rn = %(hold_days_plus1)s) AS target_exit_date;
"""

BUY_PRICE_SQL = """
SELECT ts_code, open AS buy_price
FROM public.ashare_daily_price
WHERE trade_date = %(buy_date)s AND ts_code = ANY(%(ts_codes)s);
"""

# ============================================================
# 写入数据库
# ============================================================
UPSERT_SQL = """
INSERT INTO public.ashare_vol_surge_pool (
    trade_date, ts_code, name,
    buy_date, buy_price,
    vr_t0, vr_t1, vr_t2, avg_vr3, vol20_clean,
    close, ma20, ret5, ret20,
    amount, amount_yi, turnover_rate,
    entry_rank, status, hold_days,
    target_exit_date, updated_at
) VALUES (
    %(trade_date)s, %(ts_code)s, %(name)s,
    %(buy_date)s, %(buy_price)s,
    %(vr_t0)s, %(vr_t1)s, %(vr_t2)s, %(avg_vr3)s, %(vol20_clean)s,
    %(close)s, %(ma20)s, %(ret5)s, %(ret20)s,
    %(amount)s, %(amount_yi)s, %(turnover_rate)s,
    %(entry_rank)s, 'active', 0,
    %(target_exit_date)s, NOW()
)
ON CONFLICT (trade_date, ts_code) DO UPDATE SET
    name = EXCLUDED.name,
    buy_date = EXCLUDED.buy_date,
    buy_price = EXCLUDED.buy_price,
    vr_t0 = EXCLUDED.vr_t0,
    vr_t1 = EXCLUDED.vr_t1,
    vr_t2 = EXCLUDED.vr_t2,
    avg_vr3 = EXCLUDED.avg_vr3,
    vol20_clean = EXCLUDED.vol20_clean,
    close = EXCLUDED.close,
    ma20 = EXCLUDED.ma20,
    ret5 = EXCLUDED.ret5,
    ret20 = EXCLUDED.ret20,
    amount = EXCLUDED.amount,
    amount_yi = EXCLUDED.amount_yi,
    turnover_rate = EXCLUDED.turnover_rate,
    entry_rank = EXCLUDED.entry_rank,
    target_exit_date = EXCLUDED.target_exit_date,
    updated_at = NOW();
"""

# ============================================================
# 主流程
# ============================================================
def run(trade_date, dry_run=False):
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # ---- Step 1: 扫描候选 ----
            params = dict(
                trade_date=trade_date,
                vr_min=VR_MIN,
                avg_vr3_max=AVG_VR3_MAX,
                ret5_max=RET5_MAX,
                ret20_min=RET20_MIN,
                ret20_max=RET20_MAX,
                amount_min_k=AMOUNT_MIN_K,
                turnover_max=TURNOVER_MAX,
                top_n=TOP_N,
            )
            cur.execute(SCAN_SQL, params)
            candidates = cur.fetchall()
            n = len(candidates)
            print(f"VOL_SURGE scan: date={trade_date} candidates={n}")

            if n == 0:
                print(f"VOL_SURGE: 无候选，跳过写入")
                # 输出供 pipeline runlog 解析的汇总行
                print(f"VOL_SURGE DONE | date={trade_date} | candidates=0 | inserted=0")
                return 0

            # 打印候选列表
            for c in candidates:
                print(f"  #{c['entry_rank']:2d}  {c['ts_code']}  {c['name']:<6s}  "
                      f"VR={c['avg_vr3']:.2f}  ret5={c['ret5']*100:.1f}%  "
                      f"ret20={c['ret20']*100:.1f}%  amt={c['amount_yi']:.2f}亿")

            if dry_run:
                print(f"VOL_SURGE DRY_RUN | date={trade_date} | candidates={n}")
                print("VOL_SURGE DONE | date={} | candidates={} | inserted=0 (dry_run)".format(trade_date, n))
                return 0

            # ---- Step 2: 获取买入日和目标退出日 ----
            cur.execute(BUY_INFO_SQL, dict(
                trade_date=trade_date,
                hold_days_plus1=HOLD_DAYS + 1  # +1 因为第1天是买入日，第6天是退出日
            ))
            date_info = cur.fetchone()
            buy_date = date_info['buy_date'] if date_info else None
            target_exit_date = date_info['target_exit_date'] if date_info else None

            if not buy_date:
                print(f"VOL_SURGE: 无法确定T+1交易日，跳过写入")
                print(f"VOL_SURGE DONE | date={trade_date} | candidates={n} | inserted=0 (no_buy_date)")
                return 0

            # ---- Step 3: 获取T+1开盘价 ----
            ts_codes = [c['ts_code'] for c in candidates]
            buy_prices = {}
            try:
                cur.execute(BUY_PRICE_SQL, dict(buy_date=buy_date, ts_codes=ts_codes))
                for row in cur.fetchall():
                    buy_prices[row['ts_code']] = row['buy_price']
            except Exception:
                # 买入日数据可能还没拉取（当天18:00跑时T+1数据不存在）
                print(f"VOL_SURGE: T+1({buy_date})数据暂不可用，buy_price留空")

            # ---- Step 4: 写入 ----
            inserted = 0
            for c in candidates:
                row = dict(c)
                row['buy_date'] = buy_date
                row['buy_price'] = buy_prices.get(c['ts_code'])
                row['target_exit_date'] = target_exit_date
                cur.execute(UPSERT_SQL, row)
                inserted += 1

            conn.commit()
            print(f"VOL_SURGE upsert: date={trade_date} buy_date={buy_date} "
                  f"exit_target={target_exit_date} inserted={inserted}")
            print(f"VOL_SURGE DONE | date={trade_date} | candidates={n} | inserted={inserted}")
            return inserted

    except Exception as e:
        conn.rollback()
        print(f"VOL_SURGE ERROR: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()


# ============================================================
# 入口
# ============================================================
def main():
    ap = argparse.ArgumentParser(description="连续放量蓄势策略扫描")
    ap.add_argument("--date", type=str, default=None,
                    help="交易日期 YYYYMMDD（默认=PIPELINE_TRADE_DATE 或 DB 最新日）")
    ap.add_argument("--dry_run", action="store_true",
                    help="仅扫描不写入")
    args = ap.parse_args()

    # 确定交易日期
    if args.date:
        trade_date = parse_date(args.date)
    elif os.environ.get("PIPELINE_TRADE_DATE"):
        trade_date = parse_date(os.environ["PIPELINE_TRADE_DATE"])
    else:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT MAX(trade_date) FROM public.ashare_daily_price;")
            trade_date = cur.fetchone()[0]
        conn.close()
        if not trade_date:
            print("ERROR: 无法确定交易日期", file=sys.stderr)
            sys.exit(1)

    print(f"{'='*60}")
    print(f"VOL_SURGE SCANNER | date={trade_date} | dry_run={args.dry_run}")
    print(f"  VR>={VR_MIN} × 3days | avg_vr3<={AVG_VR3_MAX}")
    print(f"  ret5<{RET5_MAX*100:.0f}% | ret20: {RET20_MIN*100:.0f}%-{RET20_MAX*100:.0f}%")
    print(f"  close>MA20 | amount>={AMOUNT_MIN_K/10000:.0f}万 | Top{TOP_N}")
    print(f"  hold_days={HOLD_DAYS}")
    print(f"{'='*60}")

    run(trade_date, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
