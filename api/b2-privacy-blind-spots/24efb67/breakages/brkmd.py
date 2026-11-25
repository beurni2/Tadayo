"""The breakages' markdown for the PR body and the journal. Usage: brkmd.py <results.json> <control.json> <out.md>"""
import json, pathlib, sys
from collections import OrderedDict

res = json.loads(pathlib.Path(sys.argv[1]).read_text())
ctl = json.loads(pathlib.Path(sys.argv[2]).read_text())

def short(run):
    kind, _, what = run.partition(": ")
    if kind == "matrix":
        return f"the matrix as \"{what}\""
    return f"`{what.split('/')[-1]}`" if kind == "db" else f"`{what.split('/')[-1]}`"

rows = OrderedDict()
for r in res:
    rows.setdefault(r["name"], {"what": r["what"], "runs": [], "control": []})["runs"].append(r)
for r in ctl:
    rows.setdefault(r["name"], {"what": r["what"], "runs": [], "control": []})["control"].append(r)

lines = ["| | Breakage | On this branch | `main`'s tests (control) |", "|---|---|---|---|"]
bad = []
for name, row in rows.items():
    if not name.startswith("B"):
        continue
    on = "; ".join(f"{short(r['run'])}: {r['verdict']} (exit {r['exit']})" for r in row["runs"])
    off = "; ".join(f"{short(r['run'])}: {r['verdict'] if r['verdict'] != 'failed' else 'failed, so caught already'}" for r in row["control"]) or "none"
    lines.append(f"| {name} | {row['what']} | {on} | {off} |")
    bad += [f"{name} {r['run']}: {r['verdict']}" for r in row["runs"] if r["verdict"] != "caught"]
lines.append("")
lines.append("B7's matrix run was judged twice: on the first pass it failed with the manipulation named "
             "(`getHome, manipulated {\"query\":{\"t\":…}}`), but its words had been registered without the backslash the "
             "matrix's output puts before each quote, so the runner said words missing; with the words written as the output "
             "has them, the second pass was caught. B5 under `main`'s tests failed, so `main` already caught it: FQ88's role "
             "has the author block Cleo and leave, keeping the drop, so the author's block of the viewer is that cell's only denial.")
judges = [(n, row) for n, row in rows.items() if n.startswith("J")]
caught = [n for n, row in judges if all(r["verdict"] == "caught" for r in row["runs"])]
bad += [f"{n}: {r['verdict']}" for n, row in judges for r in row["runs"] if r["verdict"] != "caught"]
lines.append("")
lines.append(f"Home's judge, `mayView` in `tests/src/privacy/home.ts`, without each of its conditions in turn: "
             f"{len(caught)} of {len(judges)} caught by `tests/src/privacy/home.test.ts` (Home's judge had no test of its own on `main`):")
for n, row in judges:
    r = row["runs"][0]
    lines.append(f"- {n}, {row['what'].removeprefix('mayView without ')}: {r['verdict']} (exit {r['exit']})")
pathlib.Path(sys.argv[3]).write_text("\n".join(lines) + "\n")
print("\n".join(bad) or "all caught")
