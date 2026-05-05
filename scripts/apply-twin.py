#!/usr/bin/env python3
"""Apply a Twin SQL file one statement at a time.

HR's Cloudflare WAF rejects multi-statement bodies on POST /api/v2/twin/sql,
so each statement needs its own HTTP request. Files in `data/` use one of two
boundary conventions:

- `-- === STATEMENT BREAK ===` markers (calls_log, bookings)
- Plain `;` line terminators (loads, seed)

This script auto-detects which one and POSTs each statement individually.

Usage:
    python3 scripts/apply-twin.py data/twin_schema_loads.sql

Env:
    HR_KEY    HappyRobot API key (sk_live_...)
    HR_BASE   https://platform.happyrobot.ai/api/v2  (or platform.eu.* for EU)
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

if len(sys.argv) != 2:
    sys.exit("usage: apply-twin.py <file.sql>")

path = sys.argv[1]
hr_key = os.environ.get("HR_KEY")
hr_base = os.environ.get("HR_BASE")
if not hr_key:
    sys.exit("ERR: HR_KEY env var not set")
if not hr_base:
    sys.exit("ERR: HR_BASE env var not set")

with open(path, encoding="utf-8") as f:
    sql = f.read()

# Strip line comments so they don't leak into the JSON body.
sql = re.sub(r"^[ \t]*--[^\n]*$", "", sql, flags=re.MULTILINE)

if "STATEMENT BREAK" in sql:
    parts = re.split(r"===\s*STATEMENT BREAK\s*===", sql)
else:
    parts = re.split(r";[ \t]*\n", sql)

statements = [p.strip().rstrip(";").strip() for p in parts if p.strip()]
print(f"{path}: {len(statements)} statement(s)")

for i, stmt in enumerate(statements, 1):
    preview = " ".join(stmt.split())[:80]
    print(f"  [{i}/{len(statements)}] {preview}...")
    body = json.dumps({"query": stmt}).encode("utf-8")
    req = urllib.request.Request(
        f"{hr_base.rstrip('/')}/twin/sql",
        data=body,
        headers={
            "Authorization": f"Bearer {hr_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")[:300]
        sys.exit(f"ERR: HTTP {e.code} on statement {i}: {err}")
    except urllib.error.URLError as e:
        sys.exit(f"ERR: network failure on statement {i}: {e}")
print(f"OK: {path}")
