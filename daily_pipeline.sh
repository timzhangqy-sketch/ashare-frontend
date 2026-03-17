#!/usr/bin/env bash
# defaults (avoid set -u unbound)

ENV_FILE=${ENV_FILE:-/opt/ashare_env.sh}

PY=/opt/ashare_venv/bin/python

LOG_DIR=${LOG_DIR:-/var/log/ashare}

set -euo pipefail

# ABORT_TRAP_V1
CURRENT_STEP="${CURRENT_STEP:-bootstrap}"
trap 'set +e; rc=$?; if [[ $rc -ne 0 ]]; then echo "===== $(date "+%F %T") PIPELINE ABORT rc=$rc step=$CURRENT_STEP ====="; fi; exit $rc' EXIT

# ---- AUTO: trap abort summary ----
CURRENT_STEP="init"
#trap 'set +e; rc=$?; if [[ $rc -ne 0 ]]; then echo "===== $(date "+%F %T") PIPELINE ABORT rc=$rc step=$CURRENT_STEP ====="; fi; exit $rc' EXIT
# -------------------------------


# =========================
# AUTO-ADDED: trade-day guard + pipeline runlog
# =========================
# Ensure env available even if caller forgets
source /opt/ashare_env.sh >/dev/null 2>&1 || true
source /opt/pipeline_runlog.sh

PIPELINE_TRADE_DATE="$(pipeline_resolve_date "$@")"
export PIPELINE_TRADE_DATE

# Guard: skip non-trading day; fail if trading day but data not ready
pipeline_guard_or_exit "$PIPELINE_TRADE_DATE"

# Wrap existing runner (keep behavior)
run_py_maybe_date_logged() {
  local step="$1"
  CURRENT_STEP="$step"
  local script="$2"
  shift 2
  # step-level DB runlog
  run_step "$PIPELINE_TRADE_DATE" "$step" run_py_maybe_date "$step" "$script" "$@"
}
# =========================


# =========================================================
# Daily Pipeline (Ashare) - v3 (Single Entry)
# - includes: daily_update + daily_basic + adj_factor + index_daily
#            + pool + continuation_upsert + exporter + mailer + healthcheck
# - auto latest trade day (TuShare trade_cal -> DB fallback)
# - robust: if a script doesn't support --date, fallback to no-date
# Logs:
#   - master: /var/log/ashare/pipeline.log
#   - steps : /var/log/ashare/*.log
# =========================================================

LOG_DIR="/var/log/ashare"
mkdir -p "$LOG_DIR"

# master pipeline log (tee)
mkdir -p "$LOG_DIR"
if command -v tee >/dev/null 2>&1; then
if [[ -t 1 ]]; then
  exec > >(tee --output-error=warn-nopipe -a "$LOG_DIR/pipeline.log") 2>&1
fi
else
  : # noop
fi
# scripts
DAILY_PRICE="/opt/daily_update.py"
DAILY_BASIC="/opt/daily_basic_update.py"
ADJ="/opt/adj_factor_update.py"
INDEX_UPD="/opt/index_daily_update.py"
RUNNER="/opt/pool_daily_runner.py"
CONT_UPSERT="/opt/continuation_pool_upsert.py"
EXPORTER="/opt/vol_surge_exporter.py"
MAILER="/opt/ashare_daily_mailer.py"
INTRA5M="/opt/intraday_5m_update.py"
RETENTION_SQL="/opt/sql/intraday_5m_retention_60d.sql"




HC="/opt/healthcheck_ashare.py"

DEFAULT_TO="${SMTP_TO:-timzhangqy@126.com}"

ts() { date "+%F %T"; }
die() { echo "�?$(ts) | $*" >&2; exit 1; }
need_file() { [[ -f "$1" ]] || die "missing file: $1"; }
need_exec() { [[ -x "$1" ]] || die "not executable: $1 (try: sudo chmod +x $1)"; }
is_yyyymmdd() { [[ "${1:-}" =~ ^[0-9]{8}$ ]]; }

usage() {
  cat <<'USAGE'
Usage:
  /opt/daily_pipeline.sh
  /opt/daily_pipeline.sh YYYYMMDD
  /opt/daily_pipeline.sh YYYYMMDD --to you@example.com
  /opt/daily_pipeline.sh --to you@example.com

Options:
  --to EMAIL           override recipient
  --force-refresh      pass --force_refresh to pool_daily_runner
  --skip-index         skip index_daily_update
  --skip-cont          skip continuation_pool_upsert
  --skip-mail          skip pool_mailer
  --skip-hc            skip healthcheck
  -h, --help           show help

Notes:
- If no date is given, it auto-detects latest trade day (TuShare trade_cal -> DB fallback).
- SMTP_* env vars are required only if mail step is enabled.
USAGE
}

# -------------------------
# Args
# -------------------------
DATE_ARG=""
TO_ARG=""
FORCE_REFRESH_FLAG="0"
SKIP_INDEX="0"
SKIP_CONT="0"
SKIP_MAIL="0"
SKIP_HC="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --to) shift; [[ $# -gt 0 ]] || die "missing email after --to"; TO_ARG="$1"; shift ;;
    --to=*) TO_ARG="${1#--to=}"; shift ;;
    --force-refresh) FORCE_REFRESH_FLAG="1"; shift ;;
    --skip-index) SKIP_INDEX="1"; shift ;;
    --skip-cont) SKIP_CONT="1"; shift ;;
    --skip-mail) SKIP_MAIL="1"; shift ;;
    --skip-hc) SKIP_HC="1"; shift ;;
    --*) die "unknown option: $1 (use --help)" ;;
    *)
      if [[ -z "$DATE_ARG" ]]; then
        DATE_ARG="$1"; shift
      else
        : # noop
        die "too many positional args. only one date is allowed (use --help)"
      fi
      ;;
  esac
done

if [[ -n "$DATE_ARG" ]]; then
  is_yyyymmdd "$DATE_ARG" || die "invalid date: '$DATE_ARG' (expected YYYYMMDD)"
fi

echo "===== $(ts) PIPELINE START ====="
echo "whoami=$(whoami) | pwd=$(pwd)"
echo

# -------------------------
# Load env
# -------------------------
ENV_FILE=${ENV_FILE:-/opt/ashare_env.sh}
need_file "$ENV_FILE"
# shellcheck disable=SC1090
source "$ENV_FILE"
echo "env loaded: $ENV_FILE"

# -------------------------
# Basic validation
# -------------------------
PY=/opt/ashare_venv/bin/python
need_file "$PY"; need_exec "$PY"
# -------------------------
# Strategy config (CFG) reader
# -------------------------
CFG_PY="/opt/pool_strategy_config.py"
cfg_get(){ local k="$1"; local d="${2:-}"; "$PY" -c "import importlib.util, sys; p=sys.argv[1]; k=sys.argv[2]; d=sys.argv[3]; s=importlib.util.spec_from_file_location('cfg', p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(getattr(m, k, d))" "$CFG_PY" "$k" "$d"; }


[[ -n "${ASHARE_DB_HOST:-}" ]] || die "ASHARE_DB_HOST is empty (check $ENV_FILE)"
[[ -n "${ASHARE_DB_NAME:-}" ]] || die "ASHARE_DB_NAME is empty (check $ENV_FILE)"
[[ -n "${ASHARE_DB_USER:-}" ]] || die "ASHARE_DB_USER is empty (check $ENV_FILE)"
[[ -n "${ASHARE_DB_PASS:-}" ]] || die "ASHARE_DB_PASS is empty (check $ENV_FILE)"
[[ -n "${TUSHARE_TOKEN:-}" ]]  || die "TUSHARE_TOKEN is empty (check $ENV_FILE)"

for f in "$DAILY_PRICE" "$DAILY_BASIC" "$ADJ" "$INDEX_UPD" "$INTRA5M" "$RETENTION_SQL" "$RUNNER" "$CONT_UPSERT" "$EXPORTER" "$MAILER" "$HC"; do
  need_file "$f"
done

# SMTP only required if not skipping mail
if [[ "$SKIP_MAIL" != "1" ]]; then
  [[ -n "${SMTP_HOST:-}" ]] || die "SMTP_HOST is empty (check $ENV_FILE)"
  [[ -n "${SMTP_PORT:-}" ]] || die "SMTP_PORT is empty (check $ENV_FILE)"
  [[ -n "${SMTP_USER:-}" ]] || die "SMTP_USER is empty (check $ENV_FILE)"
  [[ -n "${SMTP_PASS:-}" ]] || die "SMTP_PASS is empty (check $ENV_FILE)"
  [[ -n "${SMTP_FROM:-}" ]] || die "SMTP_FROM is empty (check $ENV_FILE)"
fi

# -------------------------
# Latest trade day helper
# -------------------------
get_latest_trade_day() {
  cd / && sudo -u postgres -H psql -d ashare -qtAX -c "SELECT to_char(MAX(trade_date), 'YYYYMMDD') FROM public.ashare_daily_price;"
}


# Force all steps to use the guarded pipeline trade day
TRADE_DAY="${PIPELINE_TRADE_DATE//-/}"

TO="${TO_ARG:-$DEFAULT_TO}"
if [[ "$SKIP_MAIL" != "1" ]]; then
  [[ -n "$TO" ]] || die "TO is empty (set SMTP_TO or pass --to)"
fi

FORCE_REFRESH="${FORCE_REFRESH:-0}"
if [[ "$FORCE_REFRESH_FLAG" == "1" ]]; then
  FORCE_REFRESH="1"
fi

echo "RUN trade_day=${TRADE_DAY} | to=${TO:-<skip-mail>}"
echo "flags: FORCE_REFRESH=${FORCE_REFRESH} SKIP_INDEX=${SKIP_INDEX} SKIP_CONT=${SKIP_CONT} SKIP_MAIL=${SKIP_MAIL} SKIP_HC=${SKIP_HC}"
echo

# -------------------------
# helpers
# -------------------------
run_step_plain () {
  local name="$1"; shift
  local step_log="$LOG_DIR/${name}.log"

  echo "----- $(ts) START ${name} -----"
  echo "log: $step_log"
  echo "cmd: $*"

  set +e
    "$@" >> "$step_log" 2>&1
  local rc=$?
  set -e

  if [[ $rc -ne 0 ]]; then
    echo "!!!!! $(ts) FAIL ${name} (exit=$rc) !!!!!"
    echo "Last 120 lines of ${step_log}:"
    tail -n 120 "$step_log" || true
    echo "===== $(ts) PIPELINE ABORT ====="
    exit $rc
  fi

  echo "===== $(ts) OK   ${name} ====="
  echo
}

# run /opt/ashare_venv/bin/python with --date if supported; fallback if script rejects --date
run_py_maybe_date () {
  local step="$1"; shift
  local script="$1"; shift

  local step_log="$LOG_DIR/${step}.log"
  local tmp_err
  tmp_err="$(mktemp)"

  echo "----- $(ts) START ${step} -----"
  echo "log: $step_log"

  set +e
    "$PY" "$script" --date "$TRADE_DAY" "$@" >> "$step_log" 2>&1
  local rc=$?
  set -e

  if [[ $rc -eq 0 ]]; then
    echo "cmd: $PY $script --date $TRADE_DAY $*"
    echo "===== $(ts) OK   ${step} ====="
    # echo exporter summary (pool_export)
    if [[ "$step" == "pool_export" ]]; then
      last="$(grep -F '�?Excel updated:' "$step_log" | tail -n 1 || true)"
      [[ -n "$last" ]] && echo "$last"
    fi

    echo
    rm -f "$tmp_err" || true
    return 0
  fi

  # If it failed because --date is unknown, retry without --date
  if tail -n 80 "$step_log" | grep -qE "unrecognized arguments: --date|unknown option --date|error: unrecognized arguments: --date"; then
    echo "⚠️  $(ts) ${step}: script doesn't accept --date, retrying without it"
    run_step_plain "$step" "$PY" "$script" "$@"
    rm -f "$tmp_err" || true
    return 0
  fi

  echo "!!!!! $(ts) FAIL ${step} (exit=$rc) !!!!!"
  echo "Last 120 lines of ${step_log}:"
  tail -n 120 "$step_log" || true
  echo "===== $(ts) PIPELINE ABORT ====="
  rm -f "$tmp_err" || true
  exit $rc
}

# ensure report dir exists (exporter writes here)
mkdir -p /opt/reports

# -------------------------
# Pipeline (Data -> Strategy -> Report -> Mail)
# -------------------------

# 1) daily price
run_py_maybe_date_logged "daily_price" "$DAILY_PRICE"

# 2) daily basic
run_py_maybe_date_logged "daily_basic" "$DAILY_BASIC"

# 3) adj factor
run_py_maybe_date_logged "adj_factor" "$ADJ"

# 4) index daily (399006.SZ) for RS
if [[ "$SKIP_INDEX" == "1" ]]; then
  echo "⏭️  $(ts) SKIP index_daily_update"
  runlog_mark_skipped "$PIPELINE_TRADE_DATE" "index_daily"
  echo
else
  : # noop
  run_py_maybe_date_logged "index_daily" "$INDEX_UPD"
fi

  # NOTE: override fetch size by env: INTRA5M_LIMIT=500/1000/5000...
    # intraday_5m (full market) �?skip on rerun if already loaded
      STEP_LOG="$LOG_DIR/intraday_5m.log"
      echo "===== $(ts) intraday_5m step START | trade_date=${PIPELINE_TRADE_DATE} | include_bj=${INTRA5M_INCLUDE_BJ:-0} | force_refresh=${FORCE_REFRESH:-0} =====" | tee -a "$STEP_LOG"

    if [[ "${FORCE_REFRESH:-0}" != "1" ]]; then
      EXPECT_CODES="$(cd / && sudo -u postgres -H psql -d ashare -qtAX -c "select count(*) from public.ashare_daily_basic where trade_date = to_date('${TRADE_DAY}','YYYYMMDD') AND ts_code NOT LIKE '%.BJ';")"
      HAVE_CODES="$(cd / && sudo -u postgres -H psql -d ashare -qtAX -c "select count(*) from (select ts_code from public.ashare_intraday_5m where trade_date = to_date('${TRADE_DAY}','YYYYMMDD') AND ts_code NOT LIKE '%.BJ' group by ts_code having count(*)>=48 and coalesce(sum(vol),0)>0) t;")"
      MIN_BP="${INTRA5M_COVERAGE_MIN_BP:-9950}"
      if [[ "$EXPECT_CODES" -gt 0 ]]; then RATIO_BP=$(( HAVE_CODES * 10000 / EXPECT_CODES )); else RATIO_BP=0; fi
      echo "intraday_5m precheck: have=${HAVE_CODES} expect=${EXPECT_CODES} ratio_bp=${RATIO_BP} min_bp=${MIN_BP}" | tee -a "$STEP_LOG"
        if [[ "$RATIO_BP" -ge "$MIN_BP" ]]; then
          echo "⏭️  $(ts) SKIP intraday_5m (already loaded)" | tee -a "$STEP_LOG"
          echo "===== $(ts) intraday_5m step END   | trade_date=${PIPELINE_TRADE_DATE} | status=SKIP =====" | tee -a "$STEP_LOG"

          echo

        else
          run_py_maybe_date_logged "intraday_5m" "$INTRA5M" --include-bj "${INTRA5M_INCLUDE_BJ:-0}" --limit "${INTRA5M_LIMIT_OVERRIDE:-${INTRA5M_LIMIT:-0}}" --min-bars "${INTRA5M_MIN_BARS_OVERRIDE:-${INTRA5M_MIN_BARS:-49}}" --workers "${INTRA5M_WORKERS_OVERRIDE:-${INTRA5M_WORKERS:-2}}" --min-interval "${INTRA5M_MIN_INTERVAL:-0.12}" --retries "${INTRA5M_RETRIES:-6}" --retry-sleep "${INTRA5M_RETRY_SLEEP:-0.5}" --commit-every "${INTRA5M_COMMIT_EVERY:-50}" --day-min-bp "${INTRA5M_DAY_MIN_BP_OVERRIDE:-${INTRA5M_DAY_MIN_BP:-0}}"
            echo "===== $(ts) intraday_5m step END   | trade_date=${PIPELINE_TRADE_DATE} | status=RAN =====" | tee -a "$STEP_LOG"

        fi

    else
            echo "===== $(ts) intraday_5m step END   | trade_date=${PIPELINE_TRADE_DATE} | status=RAN =====" | tee -a "$STEP_LOG"

    fi


  run_step "$PIPELINE_TRADE_DATE" "intraday_retention_60d" bash -lc "cd / && sudo -u postgres -H psql -d ashare -v ON_ERROR_STOP=1 --set=trade_date=$PIPELINE_TRADE_DATE -f ${RETENTION_SQL}"

  run_py_maybe_date_logged "scan_snapshot" "/opt/scan_snapshot_upsert.py" --back_days 120
# ============================================================
# VOL_SURGE: 连续放量蓄势策略（替代原 POOL_TOP50 + IGNITE + CONTINUATION）
# ============================================================
run_py_maybe_date_logged "SUPPLEMENT_DATA" "/opt/supplement_data_collector.py"
run_py_maybe_date_logged "ANN_COLLECT" "/opt/announcement_collector.py"
run_py_maybe_date_logged "EVENT_DETECT" "/opt/event_detector.py"
run_py_maybe_date_logged "RISK_SCORE" "/opt/risk_scorer.py"
run_py_maybe_date_logged "MARKET_BREADTH" "/opt/market_breadth_update.py"
# DEPRECATED 2026-03-14: 已由 MARKET_BREADTH 替代
# run_py_maybe_date_logged "MARKET_REGIME" "/opt/market_regime.py"
run_py_maybe_date_logged "VOL_SURGE:SCAN" "/opt/vol_surge_scanner.py"
run_py_maybe_date_logged "VOL_SURGE:TRACK" "/opt/vol_surge_tracker.py"

# 7) retoc2 + pattern（独立策略，保留不动）
  # DEPRECATED 2026-03-15: v1旧逻辑已废弃，统一到v3
  # run_step "$PIPELINE_TRADE_DATE" "retoc2_vr5_top20" bash -lc "cd / && sudo -u postgres -H psql -d ashare -v ON_ERROR_STOP=1 --set=trade_date=$PIPELINE_TRADE_DATE --set=retoc_pct=${RETOC_PCT:-0.02} --set=vr5_min=${VR5_MIN:-2.0} --set=ret10_cut=${RET10_CUT:-0.40} --set=k_cnt_all=${K_CNT_ALL:-500} --set=limit=${RETOC_LIMIT:-20} -qtAX -f /opt/sql/retoc2_cnt10_vr5_score_top20_v1.sql"
  run_step "$PIPELINE_TRADE_DATE" "retoc2_v3_signals" bash -lc "cd / && sudo -u postgres -H psql -d ashare -v ON_ERROR_STOP=1 -f /opt/sql/retoc2_v3_signals.sql"
  run_step "$PIPELINE_TRADE_DATE" "pattern_t2up9_2dup_lt5" bash -lc "cd / && sudo -u postgres -H psql -d ashare -v ON_ERROR_STOP=1 --set=trade_date=$PIPELINE_TRADE_DATE --set=min_ret_t2=${PAT_MIN_RET_T2:-0.09} --set=max_ret_2d=${PAT_MAX_RET_2D:-0.02} --set=max_ret20=${PAT_MAX_RET20:-0.20} --set=min_amount_k=${PAT_MIN_AMOUNT_K:-20000} -qtAX -f /opt/sql/pattern_t2up9_2dup_lt5_v2.sql"
  run_step "$PIPELINE_TRADE_DATE" "pattern_t2up9_watch" bash -lc "cd / && /opt/ashare_venv/bin/python /opt/pattern_t2up9_watch_update.py --date $PIPELINE_TRADE_DATE"
# [REPLACED by WEAK_BUY]   run_step "$PIPELINE_TRADE_DATE" "pattern_top10_green_10d" bash -lc "cd / && sudo -u postgres -H psql -d ashare -v ON_ERROR_STOP=1 --set=trade_date=$PIPELINE_TRADE_DATE -qtAX -f /opt/sql/pattern_top10_green_10d_v1.sql"
  run_py_maybe_date_logged "WEAK_BUY" "/opt/weak_buy_scanner.py"
  run_py_maybe_date_logged "WEAK_BUY_TRIGGER" "/opt/weak_buy_trigger.py"

# ---- Unified Watchlist Pipeline ----
run_py_maybe_date_logged "WATCHLIST_ENTRY" "/opt/watchlist_entry.py"
run_py_maybe_date_logged "WATCHLIST_TRACK" "/opt/watchlist_tracker.py"
run_py_maybe_date_logged "WATCHLIST_SIGNAL" "/opt/watchlist_signal.py"
run_py_maybe_date_logged "POSITION_SIZE" "/opt/position_sizer.py"
run_py_maybe_date_logged "SELL_SIGNAL" "/opt/sell_signal_engine.py"
run_py_maybe_date_logged "SIM_ENGINE" "/opt/sim_engine.py"
run_py_maybe_date_logged "WATCHLIST_EXIT"  "/opt/watchlist_exit.py"
run_py_maybe_date_logged "PORTFOLIO_TRACK" "/opt/portfolio_tracker.py"
run_py_maybe_date_logged "pool_export" "$EXPORTER"
run_py_maybe_date_logged "FACTOR_IC" "/opt/factor_ic_analysis.py"
run_py_maybe_date_logged "PERF_ANALYZE" "/opt/perf_analyzer.py"
run_py_maybe_date_logged "SYNC_LEGACY" "/opt/sync_watchlist_legacy_status.py"
run_py_maybe_date_logged "DATA_AUDIT" "/opt/data_consistency_audit.py"

# 8) mailer
if [[ "$SKIP_MAIL" == "1" ]]; then
  echo "⏭️  $(ts) SKIP pool_mailer"
  runlog_mark_skipped "$PIPELINE_TRADE_DATE" "pool_mailer"
  echo
else
  : # noop
  run_py_maybe_date_logged "pool_mailer" "$MAILER" --to "$TO"
fi

# 9) healthcheck
  # DQ Gate (PASS/WARN/FAIL -> runlog)
  run_step_plain "dq_gate" bash -lc "cd / && sudo -u postgres -H psql -d ashare -v ON_ERROR_STOP=1 --set=DQ_WARN=${DQ_WARN:-0.97} --set=DQ_FAIL=${DQ_FAIL:-0.90} --set=trade_date=$PIPELINE_TRADE_DATE -qtAX -f /opt/sql/dq_gate.sql"

# Enforce DQ gate: FAIL -> stop pipeline
  DQ_GATE_STATUS="$(cd / && sudo -u postgres -H psql -d ashare -qtAX -c "SELECT status FROM public.ashare_pipeline_runs WHERE trade_date=DATE '$PIPELINE_TRADE_DATE' AND step='dq_gate' ORDER BY ended_at DESC LIMIT 1;")" 
echo "DQ_GATE_STATUS=$DQ_GATE_STATUS"
if [ -z "$DQ_GATE_STATUS" ]; then
  echo "�?DQ gate status empty -> abort pipeline"
  exit 2
fi
if [ "$DQ_GATE_STATUS" = "fail" ]; then
  echo "DQ gate FAIL -> abort pipeline"
  exit 2
fi

if [[ "$SKIP_HC" == "1" ]]; then
  echo "⏭️  $(ts) SKIP healthcheck"
  runlog_mark_skipped "$PIPELINE_TRADE_DATE" "healthcheck"
  echo
else
  : # noop

run_py_maybe_date_logged "healthcheck" "$HC"
fi

  DQ_GATE_MSG="$(cd / && sudo -u postgres -H psql -d ashare -qtAX -c "SELECT message FROM public.ashare_pipeline_runs WHERE trade_date=DATE '$PIPELINE_TRADE_DATE' AND step='dq_gate' ORDER BY ended_at DESC LIMIT 1;" )"
  echo "===== $(ts) PIPELINE END SUMMARY | ${DQ_GATE_MSG:-dq=N/A} ====="
run_py_maybe_date_logged "strategy_snapshot" "/opt/strategy_snapshot.py"

echo "===== $(ts) PIPELINE END (SUCCESS) ====="
