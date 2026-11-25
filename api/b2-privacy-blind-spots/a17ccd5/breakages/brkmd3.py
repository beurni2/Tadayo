"""The breakages' markdown for the PR body and the journal, at the third commit (round 2).
Usage: brkmd.py <results.json> <control.json>... --out <out.md>
A run registered beforehand as a miss ("registered as a miss") is good when it passed."""
import json, pathlib, sys
from collections import OrderedDict

args = sys.argv[1:]
out = pathlib.Path(args[args.index("--out") + 1])
res = json.loads(pathlib.Path(args[0]).read_text())
ctl = [r for f in args[1:args.index("--out")] for r in json.loads(pathlib.Path(f).read_text())]

def short(run):
    kind, _, what = run.partition(": ")
    miss = what.endswith(" (registered as a miss)")
    what = what.removesuffix(" (registered as a miss)")
    text = f"the matrix as \"{what}\"" if kind == "matrix" else f"`{what.split('/')[-1]}`"
    return text + (", registered beforehand as a miss" if miss else "")

GOOD = {"caught", "passed, a miss registered beforehand"}
rows = OrderedDict()
for r in res:
    rows.setdefault(r["name"], {"what": r["what"], "runs": [], "control": []})["runs"].append(r)
for r in ctl:
    if r["name"] in rows:
        rows[r["name"]]["control"].append(r)

def verdict(r):
    return "passed, as registered" if r["verdict"] == "passed, a miss registered beforehand" else r["verdict"]

lines = ["| | Breakage | On this branch | Control (`main`'s tests, or round 1's) |", "|---|---|---|---|"]
bad = []
for name, row in rows.items():
    if not name.startswith("B"):
        continue
    on = "; ".join(f"{short(r['run'])}: {verdict(r)} (exit {r['exit']})" for r in row["runs"])
    where = lambda r: "round 1's tests (`a43d484`), " if r.get("where") == "round 1" else ("`main`'s tests, " if any(c.get("where") == "round 1" for c in row["control"]) else "")
    off = "; ".join(f"{where(r)}{short(r['run'])}: {r['verdict'] if r['verdict'] != 'failed' else 'failed, so caught already'}" for r in row["control"]) or "none"
    lines.append(f"| {name} | {row['what']} | {on} | {off} |")
    bad += [f"{name} {r['run']}: {r['verdict']}" for r in row["runs"] if r["verdict"] not in GOOD]
lines.append("")
lines.append("B5 under `main`'s tests failed, so `main` already caught it: FQ88's role has the author block Cleo and leave, "
             "keeping the drop, so the author's block of the viewer is that cell's only denial. B10's and B12's matrix runs "
             "were registered beforehand as misses: the matrix's block role names Ben's interval in its own club, and Home "
             "reads drops only from days its day choice keeps, which holds `starKeepsDay` itself (the plan's section 4). "
             "B9 to B12 are round 1's (section 6); B11 has no control, since `main` has no scan of the module to run. "
             "B13 to B15 are round 2's: B13's and B14's matrix runs were registered beforehand as misses, since no manipulation "
             "sends `since`, and round 1's line scan missed both (its control); B15 was registered beforehand as missed by both "
             "suites, since `homeBody` takes a plain instant (R2-3; the third slice's, the plan's section 5). "
             "B7 to B9 and B13 to B15 ran against the compiler check; B1 to B6 and B10 to B12 are as run at the second commit, "
             "since the third changes nothing they run. "
             "B9 was first written binding the query's string, which the API's instant type refuses, so the route answered 500 "
             "and the matrix failed for that; written to bind a `Temporal.Instant`, as here, the matrix fails on the moved time "
             "itself (Home's `club_today`, `next`, `recent_days` and `server_now`). The first run is kept under `b9-first/`.")
judges = [(n, row) for n, row in rows.items() if n.startswith("J")]
caught = [n for n, row in judges if all(r["verdict"] == "caught" for r in row["runs"])]
bad += [f"{n}: {r['verdict']}" for n, row in judges for r in row["runs"] if r["verdict"] != "caught"]
lines.append("")
lines.append(f"Home's judge (`tests/src/privacy/home.ts`) without each of its rules in turn: {len(caught)} of {len(judges)} "
             f"caught by `tests/src/privacy/home.test.ts` (Home's judge had no test of its own on `main`):")
for n, row in judges:
    r = row["runs"][0]
    lines.append(f"- {n}, {row['what']}: {r['verdict']} (exit {r['exit']})")
out.write_text("\n".join(lines) + "\n")
print("\n".join(bad) or "all as registered")
