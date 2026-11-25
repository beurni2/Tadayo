"""results-final.json: the first pass, with B7's runs taken from the second pass (its matrix words fixed to the output's escaping)."""
import json, pathlib
D = pathlib.Path("/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/a14/brk")
first = json.loads((D / "out/results.json").read_text())
b7 = json.loads((D / "out-b7/results.json").read_text())
assert [r["name"] for r in b7] == ["B7", "B7"], b7
out = []
for r in first:
    if r["name"] == "B7":
        continue
    out.append(r)
i = next(k for k, r in enumerate(out) if r["name"] == "B8")
out[i:i] = b7
(D / "results-final.json").write_text(json.dumps(out, indent=1))
print([(r["name"], r["verdict"]) for r in out if r["verdict"] != "caught"] or "all caught", len(out))
