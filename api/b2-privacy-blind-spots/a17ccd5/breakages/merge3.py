"""The breakages as they stand at the third commit (round 2): round 1's results (results-final2.json) with B7 to B9 and
J01 to J21 taken from round 2's runs (out/ and out-j/), and B13 to B15 and J22 added; the controls with B13's and
B14's runs under round 1's tests (a43d484) and main's (4c0ef93) added, each marked with where it ran."""
import json, pathlib
SP = pathlib.Path("/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad")
r1 = json.loads((SP / "a14/brk/results-final2.json").read_text())
new = json.loads((SP / "a14r2/out/results.json").read_text()) + json.loads((SP / "a14r2/out-j/results.json").read_text())
redone = {r["name"] for r in new}
out = [r for r in r1 if r["name"] not in redone]
order = lambda r: (r["name"][0] != "B", int(r["name"][1:]))
out = sorted(out + new, key=order)
(SP / "a14r2/results-final3.json").write_text(json.dumps(out, indent=1))
ctl = [dict(r, where="main") for r in json.loads((SP / "a14/brk/control-final2.json").read_text())]
ctl += [dict(r, where="round 1") for r in json.loads((SP / "a14r2/control-r1/control.json").read_text())]
ctl += [dict(r, where="main") for r in json.loads((SP / "a14r2/control-main/control.json").read_text())]
(SP / "a14r2/control-final3.json").write_text(json.dumps(ctl, indent=1))
bad = [(r["name"], r["run"], r["verdict"]) for r in out if r["verdict"] not in ("caught", "passed, a miss registered beforehand")]
print(len(out), "runs;", len({r["name"] for r in out}), "breakages;", bad or "all as registered;", len(ctl), "control runs")
