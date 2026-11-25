"""results-final.json at the second commit: out2/ (all 33), with B9's runs taken from out2-b9/ (the instant bound as a
Temporal.Instant; the first B9 bound the query's string, which the API's instant type refuses, so the route answered 500)."""
import json, pathlib
D = pathlib.Path("/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/a14/brk")
first = json.loads((D / "out2/results.json").read_text())
b9 = json.loads((D / "out2-b9/results.json").read_text())
assert [r["name"] for r in b9] == ["B9", "B9"], b9
out = []
for r in first:
    if r["name"] == "B9":
        if not any(x["name"] == "B9" for x in out):
            out.extend(b9)
        continue
    out.append(r)
(D / "results-final2.json").write_text(json.dumps(out, indent=1))
ctl = json.loads((D / "control/control.json").read_text()) + json.loads((D / "control2/control.json").read_text())
(D / "control-final2.json").write_text(json.dumps(ctl, indent=1))
print(len(out), [(r["name"], r["verdict"]) for r in out if r["verdict"] not in ("caught", "passed, a miss registered beforehand")] or "all as registered", len(ctl))
