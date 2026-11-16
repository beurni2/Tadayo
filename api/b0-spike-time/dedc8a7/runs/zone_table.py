"""Prints spike S5's zone table from packages/domain/src/time/civil.test.ts' ZONE_TABLE, as Markdown.

Usage: python3 -I zone_table.py <path to civil.test.ts>
Each row is the test's own five values, read from the file, so the report's table and the test can't
differ at the commit the file is read at. Fails unless it finds exactly the rows the array holds.
"""
import datetime
import re
import sys

text = open(sys.argv[1], encoding="utf-8").read()
start = text.index("const ZONE_TABLE")
body = text[text.index("] = [", start) + 5 : text.index("\n];", start)]
ROW = re.compile(r'^\s*\["([^"]+)", "(\d{4}-\d{2}-\d{2})", "([^"]+)", "([^"]+)", (\d+)\],\s*$')
rows = []
for line in body.splitlines():
    if not line.strip() or line.strip().startswith("//"):
        continue
    m = ROW.match(line)
    if not m:
        sys.exit(f"zone_table: a line of ZONE_TABLE isn't a row: {line!r}")
    rows.append(m.groups())
if len(rows) != body.count('["'):
    sys.exit("zone_table: rows and brackets differ")
print("| Zone | Day | Weekday | `reveal_at` | `close_at` | Hours |")
print("|---|---|---|---|---|---|")
for zone, day, reveal, close, hours in rows:
    weekday = datetime.date.fromisoformat(day).strftime("%A")
    print(f"| {zone} | {day} | {weekday} | `{reveal}` | `{close}` | {hours} |")
print(f"\n{len(rows)} rows", file=sys.stderr)
