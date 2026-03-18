#!/usr/bin/env python3
"""Fix daily_pipeline.sh: comment out deprecated steps, remove stale variable references."""

path = "/opt/daily_pipeline.sh"
with open(path, "r", encoding="utf-8", errors="replace") as f:
    lines = f.readlines()

new_lines = []
i = 0
changes = 0

while i < len(lines):
    line = lines[i]
    stripped = line.strip()

    # 1. Comment out scan_snapshot step (still active, not yet commented)
    if 'run_py_maybe_date_logged "scan_snapshot"' in stripped and not stripped.startswith('#'):
        new_lines.append('# [DEPRECATED 2026-03-19] scan_snapshot: old pool system, replaced by vol_surge_scanner\n')
        new_lines.append('#  ' + line.lstrip())
        changes += 1
        i += 1
        continue

    # 2. Remove RUNNER and CONT_UPSERT variable definitions (files moved to deprecated)
    if stripped.startswith('RUNNER="/opt/pool_daily_runner.py"'):
        new_lines.append('# [DEPRECATED 2026-03-19] pool_daily_runner moved to /opt/deprecated/\n')
        new_lines.append('# ' + line.lstrip())
        changes += 1
        i += 1
        continue

    if stripped.startswith('CONT_UPSERT="/opt/continuation_pool_upsert.py"'):
        new_lines.append('# [DEPRECATED 2026-03-19] continuation_pool_upsert moved to /opt/deprecated/\n')
        new_lines.append('# ' + line.lstrip())
        changes += 1
        i += 1
        continue

    # 3. Fix the need_file loop to exclude $RUNNER and $CONT_UPSERT
    if 'for f in "$DAILY_PRICE" "$DAILY_BASIC" "$ADJ" "$INDEX_UPD" "$INTRA5M" "$RETENTION_SQL" "$RUNNER" "$CONT_UPSERT" "$EXPORTER" "$MAILER" "$HC"' in stripped:
        new_lines.append('for f in "$DAILY_PRICE" "$DAILY_BASIC" "$ADJ" "$INDEX_UPD" "$INTRA5M" "$RETENTION_SQL" "$EXPORTER" "$MAILER" "$HC"; do\n')
        changes += 1
        i += 1
        continue

    # 4. The pool_export step uses vol_surge_exporter (EXPORTER), which is still production.
    #    But the step name "pool_export" references old naming. The actual script is fine.
    #    Don't touch it.

    # Everything else: pass through unchanged
    new_lines.append(line)
    i += 1

with open(path, "w") as f:
    f.writelines(new_lines)

print(f"daily_pipeline.sh: {changes} changes applied")
