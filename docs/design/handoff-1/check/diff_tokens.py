import json, sys
a = json.load(open(sys.argv[1])); b = json.load(open(sys.argv[2]))
def flat(d, p=""):
    out = {}
    if isinstance(d, dict):
        for k, v in d.items():
            out.update(flat(v, f"{p}.{k}" if p else k))
    else:
        out[p] = d
    return out
fa, fb = flat(a), flat(b)
for k in sorted(set(fa) | set(fb)):
    if k not in fa: print("ADDED  ", k, "=", fb[k])
    elif k not in fb: print("REMOVED", k, "=", fa[k])
    elif fa[k] != fb[k]: print("CHANGED", k, ":", fa[k], "->", fb[k])
