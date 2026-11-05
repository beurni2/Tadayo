# The first 38 breakages (mut/run.py, mut/run2.py) again, on the migrations as the review left them; two of run3.py's redone in valid jsonpath; and each TRUNCATE trigger turned off with WHEN (false): each change disables one guard (or one clause of one);
# a test named for the rule must then fail. A change that stops a migration applying, or the
# runner loading, is reported as BROKEN, never as caught.
import os, re, shutil, subprocess, sys, json
REPO = "/home/user/tadayo-contract"
SCR = os.path.dirname(os.path.abspath(__file__))  # the folder holding these files
BACKUP = SCR + "/backup"
M = "db/migrations/"
R = "tools/ops/src/migrate.ts"
MUT = [tuple(m) for m in json.load(open(SCR + "/run4-list.json"))]
FILES = sorted({f for _, f, _, _ in MUT})
shutil.rmtree(BACKUP, ignore_errors=True)
os.makedirs(BACKUP)
for f in FILES:
    shutil.copy(os.path.join(REPO, f), os.path.join(BACKUP, f.replace("/", "__")))
def restore():
    for f in FILES:
        shutil.copy(os.path.join(BACKUP, f.replace("/", "__")), os.path.join(REPO, f))
env = {**os.environ, "PATH": "/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"]}
results = []
only = sys.argv[1:]
try:
    for name, f, old, new in MUT:
        if only and not any(o in name for o in only):
            continue
        restore()
        p = os.path.join(REPO, f)
        s = open(p).read()
        n = s.count(old)
        if n != 1:
            results.append({"name": name, "file": f, "verdict": f"BAD MUTATION ({n} matches)", "failed": []}); print(results[-1], flush=True)
            continue
        open(p, "w").write(s.replace(old, new))
        out = ""
        if f == R:
            u = subprocess.run(["pnpm", "--filter", "@tadayo/ops", "exec", "vitest", "run"], cwd=REPO, env=env, capture_output=True, text=True)
            out += u.stdout + u.stderr
        r = subprocess.run(["bash", SCR + "/dbtest.sh"], env={**env, "FRESH": "1"}, capture_output=True, text=True)
        out += r.stdout + r.stderr
        failed = sorted(set(re.findall(r"^\s*FAIL\s+(?:src/\S+|\S+\.test\.ts)\s+>\s+(.*)$", out, re.M)))
        startup = "Startup Error" in out or "No test files found" in out
        verdict = "CAUGHT" if failed else ("BROKEN" if startup else "MISSED")
        results.append({"name": name, "file": f, "verdict": verdict, "failed": failed}); print(json.dumps(results[-1]), flush=True)
finally:
    restore()
json.dump(results, open(SCR + "/run4-results.json", "w"), indent=1)
print("\n==== SUMMARY")
for r in results:
    print(f"{r['verdict']:8} {r['name']}: {'; '.join(r['failed'])[:240]}")
