-- ============================================================
-- retoc2_v3_signals.sql
-- Retoc2 v3: 观察池(第3次异动) + 触发信号(第4~5次异动)
-- 过滤: ret10 0~6%, turnover 3~10%, close<MA5, pct 0~5%,
--        MA20>=MA60, 排除ST/退/北交所
-- 用法: sudo -u postgres psql -d ashare -f retoc2_v3_signals.sql
-- ============================================================

\set ON_ERROR_STOP on

-- ============================================================
-- 1. 建表（首次执行时创建，已存在则跳过）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ashare_retoc2_v3_watch (
    trade_date      DATE NOT NULL,
    ts_code         VARCHAR(12) NOT NULL,
    name            VARCHAR(30),
    anom_trigger    INT,            -- 第几次触发（固定=3）
    total_bars_10   INT,            -- 10日窗口内总异动bar数
    ret10           NUMERIC(8,4),
    turnover_rate   NUMERIC(8,4),
    pct_chg         NUMERIC(8,4),
    close           NUMERIC(12,4),
    ma5             NUMERIC(12,4),
    ma20            NUMERIC(12,4),
    ma60            NUMERIC(12,4),
    amount_yi       NUMERIC(12,4),
    circ_mv_yi      NUMERIC(12,4),
    cnt_bars        INT,            -- 当日异动bar数
    PRIMARY KEY (trade_date, ts_code)
);

CREATE TABLE IF NOT EXISTS public.ashare_retoc2_v3_trigger (
    trade_date      DATE NOT NULL,
    ts_code         VARCHAR(12) NOT NULL,
    name            VARCHAR(30),
    anom_trigger    INT,            -- 第几次触发（固定=4）
    total_bars_10   INT,            -- 10日窗口内总异动bar数
    grade           CHAR(1),        -- A=bar>=5, B=bar<5
    ret10           NUMERIC(8,4),
    turnover_rate   NUMERIC(8,4),
    pct_chg         NUMERIC(8,4),
    close           NUMERIC(12,4),
    ma5             NUMERIC(12,4),
    ma20            NUMERIC(12,4),
    ma60            NUMERIC(12,4),
    amount_yi       NUMERIC(12,4),
    circ_mv_yi      NUMERIC(12,4),
    cnt_bars        INT,            -- 当日异动bar数
    PRIMARY KEY (trade_date, ts_code)
);

-- ============================================================
-- 2. 视图：最新一天
-- ============================================================

CREATE OR REPLACE VIEW public.v_retoc2_v3_watch_latest AS
SELECT w.*,
       ROW_NUMBER() OVER (ORDER BY w.amount_yi DESC NULLS LAST) AS rk
FROM public.ashare_retoc2_v3_watch w
WHERE w.trade_date = (SELECT MAX(trade_date) FROM public.ashare_retoc2_v3_watch);

CREATE OR REPLACE VIEW public.v_retoc2_v3_trigger_latest AS
SELECT t.*,
       ROW_NUMBER() OVER (ORDER BY t.grade ASC, t.total_bars_10 DESC, t.amount_yi DESC NULLS LAST) AS rk
FROM public.ashare_retoc2_v3_trigger t
WHERE t.trade_date = (SELECT MAX(trade_date) FROM public.ashare_retoc2_v3_trigger);

-- 中文字段版（运维查看）
CREATE OR REPLACE VIEW public.v_retoc2_v3_trigger_latest_detail AS
SELECT t.trade_date  AS "日期",
       t.ts_code     AS "代码",
       t.name        AS "名称",
       t.grade       AS "级别",
       t.total_bars_10 AS "10日总bar",
       t.cnt_bars    AS "当日bar",
       ROUND(t.ret10 * 100, 2)   AS "ret10%",
       ROUND(t.turnover_rate, 2) AS "换手%",
       ROUND(t.pct_chg * 100, 2) AS "涨幅%",
       ROUND(t.close, 2)  AS "收盘",
       ROUND(t.ma5, 2)    AS "MA5",
       ROUND(t.ma20, 2)   AS "MA20",
       ROUND(t.ma60, 2)   AS "MA60",
       ROUND(t.amount_yi, 2) AS "成交亿",
       ROUND(t.circ_mv_yi, 2) AS "流通亿",
       ROW_NUMBER() OVER (ORDER BY t.grade ASC, t.total_bars_10 DESC, t.amount_yi DESC NULLS LAST) AS "排名"
FROM public.ashare_retoc2_v3_trigger t
WHERE t.trade_date = (SELECT MAX(trade_date) FROM public.ashare_retoc2_v3_trigger);

-- ============================================================
-- 3. 查询函数
-- ============================================================

CREATE OR REPLACE FUNCTION public.ashare_retoc2_v3_watch_topN(
    p_date DATE DEFAULT NULL, p_limit INT DEFAULT 20
) RETURNS TABLE(
    trade_date DATE, ts_code VARCHAR, name VARCHAR,
    total_bars_10 INT, ret10 NUMERIC, turnover_rate NUMERIC,
    pct_chg NUMERIC, close NUMERIC, ma5 NUMERIC,
    amount_yi NUMERIC, cnt_bars INT, rk BIGINT
) LANGUAGE sql STABLE AS $$
    SELECT w.trade_date, w.ts_code, w.name,
           w.total_bars_10, w.ret10, w.turnover_rate,
           w.pct_chg, w.close, w.ma5, w.amount_yi, w.cnt_bars,
           ROW_NUMBER() OVER (ORDER BY w.amount_yi DESC NULLS LAST)
    FROM public.ashare_retoc2_v3_watch w
    WHERE w.trade_date = COALESCE(p_date,
        (SELECT MAX(trade_date) FROM public.ashare_retoc2_v3_watch))
    ORDER BY w.amount_yi DESC NULLS LAST
    LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.ashare_retoc2_v3_trigger_topN(
    p_date DATE DEFAULT NULL, p_limit INT DEFAULT 20
) RETURNS TABLE(
    trade_date DATE, ts_code VARCHAR, name VARCHAR,
    grade CHAR, total_bars_10 INT, ret10 NUMERIC, turnover_rate NUMERIC,
    pct_chg NUMERIC, close NUMERIC, ma5 NUMERIC,
    amount_yi NUMERIC, cnt_bars INT, rk BIGINT
) LANGUAGE sql STABLE AS $$
    SELECT t.trade_date, t.ts_code, t.name,
           t.grade, t.total_bars_10, t.ret10, t.turnover_rate,
           t.pct_chg, t.close, t.ma5, t.amount_yi, t.cnt_bars,
           ROW_NUMBER() OVER (ORDER BY t.grade ASC, t.total_bars_10 DESC, t.amount_yi DESC NULLS LAST)
    FROM public.ashare_retoc2_v3_trigger t
    WHERE t.trade_date = COALESCE(p_date,
        (SELECT MAX(trade_date) FROM public.ashare_retoc2_v3_trigger))
    ORDER BY t.grade ASC, t.total_bars_10 DESC, t.amount_yi DESC NULLS LAST
    LIMIT p_limit;
$$;

-- ============================================================
-- 4. 信号计算
-- ============================================================

DO $$
DECLARE
    v_target_date DATE;
    v_watch_cnt   INT;
    v_trigger_cnt INT;
BEGIN

-- 4a. 目标日期 = 5分钟数据最新日
SELECT MAX(trade_date) INTO v_target_date FROM public.ashare_intraday_5m;
IF v_target_date IS NULL THEN
    RAISE NOTICE 'retoc2_v3: 无5分钟数据，跳过';
    RETURN;
END IF;
RAISE NOTICE 'retoc2_v3: 目标日期 = %', v_target_date;

-- 4b. 交易日历编号（10日窗口）
DROP TABLE IF EXISTS _v3_cal;
CREATE TEMP TABLE _v3_cal AS
SELECT cal_date AS trade_date,
       ROW_NUMBER() OVER (ORDER BY cal_date) AS rn
FROM public.ashare_trade_calendar
WHERE is_open = true
  AND cal_date BETWEEN v_target_date - 30 AND v_target_date;
CREATE INDEX ON _v3_cal(trade_date);
CREATE INDEX ON _v3_cal(rn);

-- 4c. 异动日表（有5分钟bar涨幅>=2%的）
DROP TABLE IF EXISTS _v3_anom;
CREATE TEMP TABLE _v3_anom AS
SELECT i.trade_date, i.ts_code,
    SUM(CASE WHEN i.open > 0
         AND (i.close::numeric / NULLIF(i.open::numeric,0) - 1) >= 0.02
         THEN 1 ELSE 0 END)::int AS cnt_bars
FROM public.ashare_intraday_5m i
WHERE i.ts_code NOT LIKE '%.BJ'
  AND i.trade_date IN (SELECT trade_date FROM _v3_cal)
GROUP BY i.trade_date, i.ts_code
HAVING SUM(CASE WHEN i.open > 0
         AND (i.close::numeric / NULLIF(i.open::numeric,0) - 1) >= 0.02
         THEN 1 ELSE 0 END) >= 1;
CREATE INDEX ON _v3_anom(ts_code, trade_date);

-- 4d. 当天异动 + 10日窗口统计
DROP TABLE IF EXISTS _v3_today;
CREATE TEMP TABLE _v3_today AS
WITH today_anom AS (
    SELECT a.ts_code, a.cnt_bars, c.rn
    FROM _v3_anom a
    JOIN _v3_cal c ON c.trade_date = a.trade_date
    WHERE a.trade_date = v_target_date
),
window_anom AS (
    SELECT a.ts_code, a.cnt_bars, c.rn
    FROM _v3_anom a
    JOIN _v3_cal c ON c.trade_date = a.trade_date
)
SELECT t.ts_code, t.cnt_bars,
    -- 前10日（不含当天）的异动天数
    (SELECT COUNT(*) FROM window_anom w
     WHERE w.ts_code = t.ts_code AND w.rn BETWEEN t.rn - 9 AND t.rn - 1) AS anom_days_before,
    -- 10日窗口含当天的总bar数
    (SELECT COALESCE(SUM(w.cnt_bars), 0) FROM window_anom w
     WHERE w.ts_code = t.ts_code AND w.rn BETWEEN t.rn - 9 AND t.rn) AS total_bars_10
FROM today_anom t;

-- 4e. 日线特征（MA5, MA20, MA60, ret10, pct_chg）
DROP TABLE IF EXISTS _v3_feat;
CREATE TEMP TABLE _v3_feat AS
SELECT d.ts_code, d.trade_date,
    d.close::numeric AS close,
    d.amount::numeric AS amount,
    AVG(d.close::numeric) OVER w5p AS ma5,
    AVG(d.close::numeric) OVER w20p AS ma20,
    AVG(d.close::numeric) OVER (PARTITION BY d.ts_code ORDER BY d.trade_date
        ROWS BETWEEN 60 PRECEDING AND 1 PRECEDING) AS ma60,
    LAG(d.close::numeric, 10) OVER w AS close_10ago,
    LAG(d.close::numeric, 1) OVER w AS close_1ago
FROM public.ashare_daily_price d
WHERE d.ts_code NOT LIKE '%.BJ'
  AND d.ts_code IN (SELECT ts_code FROM _v3_today)
  AND d.trade_date BETWEEN v_target_date - 120 AND v_target_date
WINDOW w AS (PARTITION BY d.ts_code ORDER BY d.trade_date),
       w5p AS (PARTITION BY d.ts_code ORDER BY d.trade_date ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING),
       w20p AS (PARTITION BY d.ts_code ORDER BY d.trade_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING);

-- 只保留目标日期的特征
DROP TABLE IF EXISTS _v3_feat_uniq;
CREATE TEMP TABLE _v3_feat_uniq AS
SELECT ts_code, close, amount, ma5, ma20, ma60,
       CASE WHEN close_10ago > 0 THEN close / close_10ago - 1 END AS ret10,
       CASE WHEN close_1ago > 0 THEN close / close_1ago - 1 END AS pct_chg
FROM _v3_feat
WHERE trade_date = v_target_date;

-- 4f. 合并信号
DROP TABLE IF EXISTS _v3_signals;
CREATE TEMP TABLE _v3_signals AS
SELECT
    v_target_date AS trade_date,
    t.ts_code,
    COALESCE(b.name, '') AS name,
    t.anom_days_before + 1 AS anom_trigger,  -- 前N天+今天=第N+1次
    t.total_bars_10,
    t.cnt_bars,
    f.ret10,
    f.pct_chg,
    f.close,
    f.ma5,
    f.ma20,
    f.ma60,
    f.amount / 100000.0 AS amount_yi,
    bas.turnover_rate::numeric AS turnover_rate,
    bas.circ_mv::numeric / 10000.0 AS circ_mv_yi
FROM _v3_today t
JOIN _v3_feat_uniq f ON f.ts_code = t.ts_code
LEFT JOIN public.ashare_stock_basic b ON b.ts_code = t.ts_code
LEFT JOIN public.ashare_daily_basic bas
  ON bas.trade_date = v_target_date AND bas.ts_code = t.ts_code
WHERE
    -- 排除ST/退
    (b.name IS NULL OR (b.name NOT LIKE '%ST%' AND b.name NOT LIKE '%退%'))
    -- 触发条件：第3次(before=2)或第4次(before=3)
    AND t.anom_days_before IN (2, 3, 4)
    -- 五重过滤
    AND f.ret10 >= 0 AND f.ret10 < 0.06
    AND bas.turnover_rate::numeric >= 3 AND bas.turnover_rate::numeric < 10
    AND f.close < f.ma5
    AND f.pct_chg BETWEEN 0 AND 0.05
    -- MA20 >= MA60
    AND f.ma20 > 0 AND f.ma60 > 0 AND f.ma20 >= f.ma60;

-- 4g. 写入观察池（第3次触发）
DELETE FROM public.ashare_retoc2_v3_watch WHERE trade_date = v_target_date;
INSERT INTO public.ashare_retoc2_v3_watch
    (trade_date, ts_code, name, anom_trigger, total_bars_10,
     ret10, turnover_rate, pct_chg, close, ma5, ma20, ma60,
     amount_yi, circ_mv_yi, cnt_bars)
SELECT trade_date, ts_code, name, anom_trigger, total_bars_10,
       ret10, turnover_rate, pct_chg, close, ma5, ma20, ma60,
       amount_yi, circ_mv_yi, cnt_bars
FROM _v3_signals
WHERE anom_trigger = 3;

GET DIAGNOSTICS v_watch_cnt = ROW_COUNT;

-- 4h. 写入触发信号（第4次触发）
DELETE FROM public.ashare_retoc2_v3_trigger WHERE trade_date = v_target_date;
INSERT INTO public.ashare_retoc2_v3_trigger
    (trade_date, ts_code, name, anom_trigger, total_bars_10, grade,
     ret10, turnover_rate, pct_chg, close, ma5, ma20, ma60,
     amount_yi, circ_mv_yi, cnt_bars)
SELECT trade_date, ts_code, name, anom_trigger, total_bars_10,
       CASE WHEN total_bars_10 >= 5 THEN 'A' ELSE 'B' END AS grade,
       ret10, turnover_rate, pct_chg, close, ma5, ma20, ma60,
       amount_yi, circ_mv_yi, cnt_bars
FROM _v3_signals
WHERE anom_trigger IN (4, 5);

GET DIAGNOSTICS v_trigger_cnt = ROW_COUNT;

-- 4i. 日志
RAISE NOTICE 'retoc2_v3 [%]: watch=% trigger=%', v_target_date, v_watch_cnt, v_trigger_cnt;

INSERT INTO public.ashare_pipeline_runs (trade_date, step, status, rowcount, message)
VALUES (v_target_date, 'retoc2_v3_signals', 'OK', v_watch_cnt + v_trigger_cnt,
        format('watch=%s trigger=%s', v_watch_cnt, v_trigger_cnt))
ON CONFLICT (trade_date, step)
DO UPDATE SET status = 'OK', rowcount = EXCLUDED.rowcount,
              message = EXCLUDED.message, updated_at = NOW();

-- 清理
DROP TABLE IF EXISTS _v3_cal, _v3_anom, _v3_today, _v3_feat, _v3_feat_today, _v3_feat_uniq, _v3_signals;

END $$;
