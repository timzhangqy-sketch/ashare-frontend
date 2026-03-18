#!/usr/bin/env python3
"""
Split main.py (3742 lines) into modular router files.

Reads the current main.py, extracts each endpoint group into its own router module,
creates common.py with shared utilities, and writes a minimal new main.py.
"""

import os
import re

BASE = "/opt/ashare-api"
SRC = os.path.join(BASE, "main.py")

with open(SRC, "r", encoding="utf-8") as f:
    lines = f.readlines()

total = len(lines)
print(f"Read {total} lines from {SRC}")

def get_lines(start, end):
    """Get lines[start-1:end] (1-indexed inclusive)."""
    return ''.join(lines[start-1:end])

def get_lines_stripped(start, end):
    """Get lines, removing leading/trailing blank lines."""
    block = lines[start-1:end]
    while block and block[0].strip() == '':
        block = block[1:]
    while block and block[-1].strip() == '':
        block = block[:-1]
    return ''.join(block)

# ============================================================
# common.py
# ============================================================
common_py = '''import psycopg2
import psycopg2.extras
import os
import decimal as _decimal_mod
import json as _json_mod
from datetime import datetime, timezone, timedelta


def get_db(timeout=30):
    conn = psycopg2.connect(
        host=os.environ.get("ASHARE_DB_HOST", "localhost"),
        dbname=os.environ.get("ASHARE_DB_NAME", "ashare"),
        user=os.environ.get("ASHARE_DB_USER", "ashare_user"),
        password=os.environ.get("ASHARE_DB_PASS", ""),
        options=f'-c statement_timeout=120000'
    )
    return conn


def _dec(v):
    """Convert Decimal/numeric to float, None stays None."""
    if v is None:
        return None
    if isinstance(v, _decimal_mod.Decimal):
        return float(v)
    return v


def _serialize_row(row):
    """Serialize a single RealDictRow: Decimal→float, date/datetime→str."""
    if row is None:
        return None
    d = {}
    for k, v in (row.items() if hasattr(row, 'items') else dict(row).items()):
        if isinstance(v, _decimal_mod.Decimal):
            d[k] = float(v)
        elif hasattr(v, 'isoformat'):
            d[k] = v.isoformat()
        else:
            d[k] = v
    return d


def _serialize_rows(rows):
    """Serialize a list of RealDictRows."""
    return [_serialize_row(r) for r in rows]


def _resolve_trade_date(cur, trade_date_str=None):
    """Resolve to nearest valid trade date (from ashare_trade_calendar)."""
    if trade_date_str:
        cur.execute("SELECT MAX(cal_date) AS td FROM ashare_trade_calendar WHERE cal_date <= %s AND is_open = true", (trade_date_str,))
    else:
        cur.execute("SELECT MAX(cal_date) AS td FROM ashare_trade_calendar WHERE cal_date <= CURRENT_DATE AND is_open = true")
    row = cur.fetchone()
    return row["td"] if row and row["td"] else None


def _prev_trade_date(cur, td):
    """Get previous trade date before td."""
    cur.execute("SELECT MAX(trade_date) AS td FROM ashare_daily_price WHERE trade_date < %s", (td,))
    row = cur.fetchone()
    return row["td"] if row and row["td"] else None


def _now_cn():
    """Current time ISO8601 +08:00."""
    tz8 = timezone(timedelta(hours=8))
    return datetime.now(tz8).strftime('%Y-%m-%dT%H:%M:%S+08:00')


# Strategy Chinese name mapping (single source of truth)
STRATEGY_CN = {
    "VOL_SURGE": "连续放量蓄势",
    "RETOC2": "第4次异动",
    "PATTERN_T2UP9": "T-2大涨蓄势",
    "WEAK_BUY": "弱市吸筹",
}
'''

# ============================================================
# Now extract each router's endpoints from the original file.
# We'll replace @app.xxx with @router.xxx in the extracted code.
# ============================================================

def extract_and_routerize(code_block):
    """Replace @app.get/post/put/delete with @router equivalents."""
    code_block = code_block.replace('@app.get(', '@router.get(')
    code_block = code_block.replace('@app.post(', '@router.post(')
    code_block = code_block.replace('@app.put(', '@router.put(')
    code_block = code_block.replace('@app.delete(', '@router.delete(')
    return code_block


# ============================================================
# health.py — line 79-86
# ============================================================
health_body = extract_and_routerize(get_lines(79, 86))
health_py = f'''from fastapi import APIRouter
from common import get_db

router = APIRouter()

{health_body}
'''

# ============================================================
# strategy.py — retoc2, pool, vol_surge, t2up9, weak_buy, trade-dates, pipeline
# Lines: 89-107 (pool), 109-129 (retoc2), 131-143 (pipeline), 145-156 (trade-dates),
#         157-172 (t2up9), 175-225 (weak_buy), 615-630 (vol_surge)
# ============================================================
strategy_body = extract_and_routerize(
    get_lines(89, 225) + '\n\n' + get_lines(615, 630)
)
strategy_py = f'''from fastapi import APIRouter
import psycopg2.extras
from common import get_db

router = APIRouter()

{strategy_body}
'''

# ============================================================
# watchlist.py — all /api/watchlist endpoints
# Lines: 228-345 (active, signals, stats, exited)
#         634-688 (watchlist, cross_strategies)
#         3259-3356 (pre_check)
# ============================================================
watchlist_body = extract_and_routerize(
    get_lines(228, 345) + '\n\n' + get_lines(634, 688) + '\n\n' + get_lines(3259, 3356)
)
watchlist_py = f'''from fastapi import APIRouter
import psycopg2.extras
from common import get_db, _serialize_rows, _serialize_row, _dec, STRATEGY_CN

router = APIRouter()

{watchlist_body}
'''

# ============================================================
# portfolio.py — all /api/portfolio endpoints (except /api/portfolio/transactions at line 3428)
# Lines: 347-611 (get/add/close/transactions_by_id/add_position/delete)
#         1191-1347 (summary)
#         3361-3426 (concentration)
# ============================================================
portfolio_body = extract_and_routerize(
    get_lines(347, 611) + '\n\n' + get_lines(1191, 1347) + '\n\n' + get_lines(3361, 3426)
)
portfolio_py = f'''from fastapi import APIRouter
import psycopg2.extras
from common import get_db, _dec, _serialize_rows, _serialize_row, STRATEGY_CN
import decimal as _decimal_mod

router = APIRouter()

{portfolio_body}
'''

# ============================================================
# signals.py — /api/signals/buy, /api/signals/sell
# Lines: 1108-1188
# ============================================================
signals_body = extract_and_routerize(get_lines(1108, 1188))
signals_py = f'''from fastapi import APIRouter
import psycopg2.extras
from common import get_db, _serialize_rows
import decimal as _decimal_mod

router = APIRouter()

{signals_body}
'''

# ============================================================
# dashboard.py — /api/dashboard/summary, /api/dashboard/action_list
# Lines: 1350-1686 (summary)
#         3129-3254 (action_list)
# ============================================================
dashboard_body = extract_and_routerize(
    get_lines(1350, 1686) + '\n\n' + get_lines(3129, 3254)
)
dashboard_py = f'''from fastapi import APIRouter
import psycopg2.extras
from datetime import datetime, timezone, timedelta
from common import get_db, _dec, _now_cn, _resolve_trade_date, STRATEGY_CN

router = APIRouter()

{dashboard_body}
'''

# ============================================================
# context.py — /api/context/stock endpoints + helper functions
# Lines: 1690-2614
# Includes: _fetch_risk_block, _fetch_lifecycle_block, _risk_level, _risk_explanation
# ============================================================
context_body = extract_and_routerize(get_lines(1690, 2614))
context_py = f'''from fastapi import APIRouter
import psycopg2.extras
import json as _json_mod
from common import get_db, _dec, _serialize_row, _resolve_trade_date, _prev_trade_date, _now_cn
import decimal as _decimal_mod

router = APIRouter()

{context_body}
'''

# ============================================================
# risk.py — /api/risk endpoints
# Lines: 2617-2728
# ============================================================
risk_body = extract_and_routerize(get_lines(2617, 2728))
risk_py = f'''from fastapi import APIRouter
import psycopg2.extras
from common import get_db, _serialize_row, _serialize_rows, _resolve_trade_date
import decimal as _decimal_mod

router = APIRouter()

{risk_body}
'''

# ============================================================
# system.py — /api/system endpoints + /api/system/audit
# Lines: 2731-2908 (pipeline_runs, data_coverage, version, runlog, api_health)
#         3078-3106 (audit)
# ============================================================
system_body = extract_and_routerize(
    get_lines(2731, 2908) + '\n\n' + get_lines(3078, 3106)
)
system_py = f'''from fastapi import APIRouter
import psycopg2.extras
from common import get_db, _serialize_rows, _resolve_trade_date, _now_cn

router = APIRouter()

{system_body}
'''

# ============================================================
# research.py — /api/research endpoints + /api/backtest
# Lines: 2911-2990 (factor_ic, strategy_attribution, resonance_analysis)
#         999-1105 (backtest/summary, backtest/detail)
# ============================================================
research_body = extract_and_routerize(
    get_lines(2911, 2990) + '\n\n' + get_lines(999, 1105)
)
research_py = f'''from fastapi import APIRouter
import psycopg2.extras
from common import get_db, _serialize_rows
import decimal as _decimal_mod

router = APIRouter()

{research_body}
'''

# ============================================================
# execution.py — /api/sim endpoints + /api/portfolio/transactions (all records)
# Lines: 2993-3075 (sim/orders, sim/positions, sim/fills)
#         3428-3452 (portfolio/transactions all)
#         3457-3518 (sim/checks)
# ============================================================
execution_body = extract_and_routerize(
    get_lines(2993, 3075) + '\n\n' + get_lines(3428, 3518)
)
execution_py = f'''from fastapi import APIRouter
import psycopg2.extras
from common import get_db, _serialize_rows, _serialize_row, _resolve_trade_date
import decimal as _decimal_mod

router = APIRouter()

{execution_body}
'''

# ============================================================
# concept.py — /api/concept endpoints + Pydantic models
# Lines: 3521-3742
# ============================================================
concept_body = extract_and_routerize(get_lines(3521, 3742))
concept_py = f'''from fastapi import APIRouter
import psycopg2.extras
from pydantic import BaseModel
from typing import List, Optional
from common import get_db, _serialize_rows
import decimal as _decimal_mod

router = APIRouter()

{concept_body}
'''

# ============================================================
# stock.py — /api/stock_detail, /api/kline, /api/ai_analysis
# Lines: 691-994
# ============================================================
stock_body = extract_and_routerize(get_lines(691, 994))
stock_py = f'''from fastapi import APIRouter
import psycopg2.extras
from common import get_db, _dec, _serialize_rows
import decimal as _decimal_mod

router = APIRouter()

{stock_body}
'''

# ============================================================
# market.py — /api/market/regime
# Lines: 3109-3126
# ============================================================
market_body = extract_and_routerize(get_lines(3109, 3126))
market_py = f'''from fastapi import APIRouter
import psycopg2.extras
from common import get_db

router = APIRouter()

{market_body}
'''

# ============================================================
# New main.py
# ============================================================
new_main = '''from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import (
    health, strategy, watchlist, portfolio, signals,
    dashboard, context, risk, system, research,
    execution, concept, stock, market,
)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(strategy.router)
app.include_router(watchlist.router)
app.include_router(portfolio.router)
app.include_router(signals.router)
app.include_router(dashboard.router)
app.include_router(context.router)
app.include_router(risk.router)
app.include_router(system.router)
app.include_router(research.router)
app.include_router(execution.router)
app.include_router(concept.router)
app.include_router(stock.router)
app.include_router(market.router)
'''

# ============================================================
# Write all files
# ============================================================
router_dir = os.path.join(BASE, "routers")
os.makedirs(router_dir, exist_ok=True)

files = {
    os.path.join(BASE, "common.py"): common_py,
    os.path.join(router_dir, "__init__.py"): "",
    os.path.join(router_dir, "health.py"): health_py,
    os.path.join(router_dir, "strategy.py"): strategy_py,
    os.path.join(router_dir, "watchlist.py"): watchlist_py,
    os.path.join(router_dir, "portfolio.py"): portfolio_py,
    os.path.join(router_dir, "signals.py"): signals_py,
    os.path.join(router_dir, "dashboard.py"): dashboard_py,
    os.path.join(router_dir, "context.py"): context_py,
    os.path.join(router_dir, "risk.py"): risk_py,
    os.path.join(router_dir, "system.py"): system_py,
    os.path.join(router_dir, "research.py"): research_py,
    os.path.join(router_dir, "execution.py"): execution_py,
    os.path.join(router_dir, "concept.py"): concept_py,
    os.path.join(router_dir, "stock.py"): stock_py,
    os.path.join(router_dir, "market.py"): market_py,
    os.path.join(BASE, "main.py"): new_main,
}

for path, content in files.items():
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    line_count = content.count('\n')
    print(f"  Written: {path} ({line_count} lines)")

print(f"\nDone! Created {len(files)} files.")

# Quick verification: check all router files have at least one @router
for name in ["health", "strategy", "watchlist", "portfolio", "signals", "dashboard",
             "context", "risk", "system", "research", "execution", "concept", "stock", "market"]:
    path = os.path.join(router_dir, f"{name}.py")
    with open(path) as f:
        content = f.read()
    count = content.count('@router.')
    print(f"  {name}.py: {count} routes")

# Check main.py line count
with open(os.path.join(BASE, "main.py")) as f:
    main_lines = f.readlines()
print(f"\nNew main.py: {len(main_lines)} lines")
