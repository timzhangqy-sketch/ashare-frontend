#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
统一策略参数配置（点火榜 v3 / 延续榜 v1 / 邮件展示）

只需要改这里：
- pool_excel_exporter.py 读取点火榜/延续榜参数与标题
- continuation_pool_upsert.py 读取点火榜参数（把点火Top写入延续池）
"""


# =========================
# 榜单规模（展示/邮件/Excel 的截断用）
# =========================
TOP_N_IGNITION = 20  # 历史兼容项；点火榜展示上限现统一由 IGNITE_LIMIT_FINAL 控制
TOP_N_CONTINUATION = 20  # 注意：延续榜 SQL 函数本身没有 limit 参数，这里只用于展示截断
TOP_N_POOL = 50

# =========================
# Excel 标题（Exporter / Mailer 用）
# =========================
TITLE_IGNITION = "点火榜 Top20（今日新异动：强放量 + 趋势健康 + RS强于创业板 + 换手甜区）"
TITLE_CONTINUATION = "延续榜 Top20（观察池：择时/退榜监控）"
TITLE_POOL50 = "入池Top50（全量参考：以当日入池顺序展示）"

# =========================
# 邮件展示
# =========================
MAIL_TABLE_LIMIT = 20
MAIL_TOP5_FROM = "ignition"  # ignition / continuation / pool50


# ==========================================================
# 点火榜 v3 STRICT3（SQL 函数：ashare_ignite_rank_v3_strict3）
# - Universe：当天入池 Top50（entry_date=p_trade_date, entry_rank<=50）
# - Candidate：VR + MV 加成（同 VR，市值更大得分更高）
# - Turnover：甜区 [low, high] = 100，离开甜区余弦平滑衰减（p_turn_decay 控制）
# - ret20：中心 0.20；0.30~0.40 加速扣分，不再硬归零
# - RS：days 线性映射 + excess 判断，70/30 合成
# ==========================================================
# 点火链路关键配置总览：函数（主流程/校验）+ 展示上限
# 主流程点火函数：使用精简签名（供 exporter / continuation 等读取）
IGNITE_FN = "ashare_ignite_rank_v3_strict3"
# Sanity 校验函数：使用 full-args 签名（供 ignite_sanity_check 读取）
IGNITE_FN_SANITY = "ashare_ignite_rank_v3_strict3_full"
# 展示截断（SQL 参数 p_limit_final）
IGNITE_LIMIT_FINAL = TOP_N_IGNITION

# --- 门槛（strict3：amount 只做门槛） ---
IGNITE_AMT_MIN_YI = 1.0            # 成交额(亿元) >= 1

# --- 换手甜区 + 衰减 ---
IGNITE_TURN_LOW = 10.0
IGNITE_TURN_HIGH = 25.0
IGNITE_TURN_DECAY = 18.0           # ✅你定稿：只调衰减速度，不改甜区

# --- 权重（sum=1）✅你定稿 ---
IGNITE_W_CANDIDATE = 0.15
IGNITE_W_TURN = 0.20
IGNITE_W_RET20 = 0.40
IGNITE_W_RS = 0.15
IGNITE_W_MA5 = 0.10

# --- RS ---
IGNITE_RS_WINDOW = 20              # 最近 N 天
IGNITE_INDEX_TS_CODE = "399006.SZ" # 创业板指数

# 传给 SQL 的参数（必须与 ashare_ignite_rank_v3_strict3 签名一致）
# p_trade_date 由调用方单独传入，这里不放
IGNITE_ARGS_V3 = {
    "p_limit_final": IGNITE_LIMIT_FINAL,

    "p_amt_min_yi": IGNITE_AMT_MIN_YI,

    "p_turn_low": IGNITE_TURN_LOW,
    "p_turn_high": IGNITE_TURN_HIGH,
    "p_turn_decay": IGNITE_TURN_DECAY,

    "w_candidate": IGNITE_W_CANDIDATE,
    "w_turn": IGNITE_W_TURN,
    "w_ret20": IGNITE_W_RET20,
    "w_rs": IGNITE_W_RS,
    "w_ma5": IGNITE_W_MA5,

    "p_rs_window": IGNITE_RS_WINDOW,
    "p_index_ts_code": IGNITE_INDEX_TS_CODE,
}

# 纯日志提示（可选）
IGNITE_LOG_HINTS = {
    "thresholds": (
        f"amt_min_yi={IGNITE_AMT_MIN_YI}, "
        f"turn_sweet={IGNITE_TURN_LOW}~{IGNITE_TURN_HIGH}, turn_decay={IGNITE_TURN_DECAY}, "
        f"rs_window={IGNITE_RS_WINDOW}, idx={IGNITE_INDEX_TS_CODE}"
    ),
    "weights": (
        f"w_candidate={IGNITE_W_CANDIDATE}, w_turn={IGNITE_W_TURN}, w_ret20={IGNITE_W_RET20}, "
        f"w_rs={IGNITE_W_RS}, w_ma5={IGNITE_W_MA5}"
    ),
}


# ==========================================================
# 延续榜 v1（SQL 函数：ashare_continuation_rank_v1）
# 注意：该函数签名没有 p_limit_final / p_allow_reentry
# ==========================================================
CONT_FN = "ashare_continuation_rank_v1"

# --- 量能基准：Anchor（入池时刻）+ Roll20（自适应）混合 ---
CONT_VOL_BASE_W_ANCHOR = 0.7
CONT_VOL_BASE_W_ROLL = 0.3

# --- RS窗口：近N个交易日里强于指数的天数 + 强度（差值均值） ---
CONT_RS_WINDOW = 20
CONT_RS_W_DAYS = 0.6
CONT_RS_W_STRENGTH = 0.4
CONT_INDEX_TS_CODE = "399006.SZ"

# --- 计算稳定性：不足数据向后补（用自然日回看） ---
CONT_MIN_N_EFF = 15
CONT_LOOKBACK_DAYS = 60

# --- 换手甜区（延续榜同口径） ---
CONT_TURN_LOW = 10.0
CONT_TURN_HIGH = 25.0
CONT_TURN_PENALTY_PER_1PCT = 6.0
CONT_TURN_FLOOR = 0.0

# --- 退榜规则（硬退） ---
CONT_EXIT_MA20_STREAK = 3
CONT_EXIT_VR_LOW = 0.70
CONT_EXIT_VR_STREAK = 3
CONT_EXIT_GAIN_MAX = 0.60

# --- 买点信号（v1：两类） ---
CONT_SIG_PULLBACK_VR_MAX = 0.90
CONT_SIG_REHEAT_VR_MIN = 1.20
CONT_SIG_REHEAT_PREV_VR_MAX = 0.90

# --- 延续榜打分权重（结构分 + 择时分） ---
CONT_W_TREND = 0.35
CONT_W_VR = 0.20
CONT_W_RS = 0.20
CONT_W_TURN = 0.15
CONT_W_TIMING = 0.10

# 传给 SQL 的参数（必须与 ashare_continuation_rank_v1 签名一致）
# p_trade_date 由调用方单独传入，这里不放
CONT_ARGS_V1 = {
    "p_rs_window": CONT_RS_WINDOW,
    "p_rs_w_days": CONT_RS_W_DAYS,
    "p_rs_w_strength": CONT_RS_W_STRENGTH,

    "p_min_n_eff": CONT_MIN_N_EFF,
    "p_lookback_days": CONT_LOOKBACK_DAYS,

    "p_vol_base_w_anchor": CONT_VOL_BASE_W_ANCHOR,
    "p_vol_base_w_roll": CONT_VOL_BASE_W_ROLL,

    "p_sig_pullback_vr_max": CONT_SIG_PULLBACK_VR_MAX,
    "p_sig_reheat_vr_min": CONT_SIG_REHEAT_VR_MIN,
    "p_sig_reheat_prev_vr_max": CONT_SIG_REHEAT_PREV_VR_MAX,

    "p_exit_ma20_streak": CONT_EXIT_MA20_STREAK,
    "p_exit_vr_low": CONT_EXIT_VR_LOW,
    "p_exit_vr_streak": CONT_EXIT_VR_STREAK,
    "p_exit_gain_max": CONT_EXIT_GAIN_MAX,

    "p_turn_low": CONT_TURN_LOW,
    "p_turn_high": CONT_TURN_HIGH,
    "p_turn_penalty_per_1pct": CONT_TURN_PENALTY_PER_1PCT,
    "p_turn_floor": CONT_TURN_FLOOR,

    "w_trend": CONT_W_TREND,
    "w_vr": CONT_W_VR,
    "w_rs": CONT_W_RS,
    "w_turn": CONT_W_TURN,
    "w_timing": CONT_W_TIMING,

    "p_index_ts_code": CONT_INDEX_TS_CODE,
}

# exporter 打印用的可读提示（非 SQL 参数）
CONT_LOG_HINTS = {
    "vol_base_mix": f"{CONT_VOL_BASE_W_ANCHOR}*anchor + {CONT_VOL_BASE_W_ROLL}*roll20",
    "rs": f"window={CONT_RS_WINDOW}, days_w={CONT_RS_W_DAYS}, strength_w={CONT_RS_W_STRENGTH}, idx={CONT_INDEX_TS_CODE}",
    "exit": f"ma20_streak={CONT_EXIT_MA20_STREAK}, vr_low={CONT_EXIT_VR_LOW}*{CONT_EXIT_VR_STREAK}, gain_max={CONT_EXIT_GAIN_MAX}",
    "signal": f"pullback_vr<={CONT_SIG_PULLBACK_VR_MAX}, reheat_vr>={CONT_SIG_REHEAT_VR_MIN} with prev_vr<={CONT_SIG_REHEAT_PREV_VR_MAX}",
}

# ── Pattern T2UP9 v2 参数（回测验证版，2026-03-04）──────────────────────
# 回测表现：T+5=+6.01% 胜率73.5% T+10=+8.03% 胜率81.4% 日均3.5只
PAT_MIN_RET_T2   = 0.09   # T-2最小涨幅（>9%）
PAT_MAX_RET_2D   = 0.02   # 两日累计最大涨幅（<2%，v1为5%）
PAT_MAX_RET20    = 0.20   # 近20日最大涨幅（<=20%，底部启动）
PAT_MIN_AMOUNT_K = 20000  # 最小成交额（千元，即2000万）
