"""
state_machine.py — 全生命周期状态机 & 事件日志公共模块
被其他脚本 import 使用，不可独立运行。

功能：
  1. validate_transition(entity_type, from_status, to_status) — 校验状态跳转合法性
  2. log_lifecycle_event(...) — 幂等写入 lifecycle_log 表
  3. get_db_conn() — 标准 DB 连接
"""

import json
import logging
import os

import psycopg2

log = logging.getLogger(__name__)

# ─── Transition Whitelists ───────────────────────────────────────────────────

WATCHLIST_TRANSITIONS = {
    'candidate': ['blocked', 'approved'],
    'approved': ['signaled', 'retired'],
    'signaled': ['handed_off', 'retired'],
    'handed_off': ['retired'],
}

PORTFOLIO_TRANSITIONS = {
    'pending_fill': ['held', 'closed'],
    'held': ['exit_pending', 'closed'],
    'exit_pending': ['closed'],
    'closed': ['archived'],
}

_ENTITY_MAP = {
    'watchlist': WATCHLIST_TRANSITIONS,
    'portfolio': PORTFOLIO_TRANSITIONS,
}


# ─── Validation ──────────────────────────────────────────────────────────────

def validate_transition(entity_type, from_status, to_status, strict=False):
    """Validate whether a status transition is allowed.

    Args:
        entity_type: 'watchlist' or 'portfolio'
        from_status: current status
        to_status:   target status
        strict:      if True, raise ValueError on illegal transition;
                     if False (default), log warning and return False.

    Returns:
        True if transition is valid, False otherwise.
    """
    transitions = _ENTITY_MAP.get(entity_type)
    if transitions is None:
        msg = f'Unknown entity_type: {entity_type}'
        if strict:
            raise ValueError(msg)
        log.warning(msg)
        return False

    allowed = transitions.get(from_status, [])
    if to_status in allowed:
        return True

    msg = (f'Invalid {entity_type} transition: {from_status} -> {to_status} '
           f'(allowed from {from_status}: {allowed})')
    if strict:
        raise ValueError(msg)
    log.warning(msg)
    return False


# ─── Lifecycle Event Logging ─────────────────────────────────────────────────

def log_lifecycle_event(conn, ts_code, event_type, from_status, to_status,
                        event_source, watchlist_id=None, portfolio_id=None,
                        event_payload_json=None, trade_date=None):
    """Write a lifecycle event to ashare_trade_lifecycle_log (idempotent).

    Args:
        conn:               psycopg2 connection
        ts_code:            stock code
        event_type:         e.g. 'WATCHLIST_ENTRY', 'BUY_SIGNAL', 'ORDER_FILLED'
        from_status:        status before transition
        to_status:          status after transition
        event_source:       script name, e.g. 'watchlist_entry'
        watchlist_id:       optional FK
        portfolio_id:       optional FK
        event_payload_json: optional dict (will be serialized to JSON)
        trade_date:         YYYY-MM-DD string for idempotency key

    Returns:
        True if a new row was inserted, False if duplicate (skipped).
    """
    idempotency_key = f'{trade_date}:{ts_code}:{event_type}:{event_source}:{to_status}'

    payload = None
    if event_payload_json is not None:
        payload = json.dumps(event_payload_json, ensure_ascii=False, default=str)

    cur = conn.cursor()
    cur.execute("""
        INSERT INTO ashare_trade_lifecycle_log
            (watchlist_id, portfolio_id, ts_code, event_type,
             from_status, to_status, event_source, event_payload_json, idempotency_key)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (idempotency_key) DO NOTHING
    """, (watchlist_id, portfolio_id, ts_code, event_type,
          from_status, to_status, event_source, payload, idempotency_key))
    inserted = cur.rowcount > 0
    conn.commit()
    cur.close()
    return inserted


# ─── DB Connection ───────────────────────────────────────────────────────────

def get_db_conn():
    """Standard DB connection from environment variables."""
    return psycopg2.connect(
        host=os.environ.get('ASHARE_DB_HOST', 'localhost'),
        dbname=os.environ.get('ASHARE_DB_NAME', 'ashare'),
        user=os.environ.get('ASHARE_DB_USER', 'ashare_user'),
        password=os.environ.get('ASHARE_DB_PASS', ''),
    )
