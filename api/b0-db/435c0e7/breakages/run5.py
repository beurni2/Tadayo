# Breakages of the guards and the runner that the check of PR #17's review fixes changed: each
# change turns off one guard or one clause of one (or puts back cc62976's version of a rule the
# check found too strict); a test named for the rule must then fail. A change that stops a
# migration applying, or the runner loading, is reported as BROKEN, never as caught.
#
# Usage: python3 run5.py [words that pick breakages by name]. It reads run5-list.json beside it,
# runs dbtest.sh beside it, and writes run5-results.json beside it. Set REPO to your working tree.
import os, re, shutil, subprocess, sys, json
REPO = "/home/user/tadayo-contract"
HERE = os.path.dirname(os.path.abspath(__file__))
BACKUP = os.path.join(HERE, "backup")
R = "tools/ops/src/migrate.ts"
MUT = [tuple(m) for m in json.load(open(os.path.join(HERE, "run5-list.json")))]
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
        r = subprocess.run(["bash", os.path.join(HERE, "dbtest.sh")], env={**env, "FRESH": "1"}, capture_output=True, text=True)
        out += r.stdout + r.stderr
        failed = sorted(set(re.findall(r"^\s*FAIL\s+(?:src/\S+|\S+\.test\.ts)\s+>\s+(.*)$", out, re.M)))
        startup = "Startup Error" in out or "No test files found" in out
        verdict = "CAUGHT" if failed else ("BROKEN" if startup else "MISSED")
        results.append({"name": name, "file": f, "verdict": verdict, "failed": failed}); print(json.dumps(results[-1]), flush=True)
finally:
    restore()
json.dump(results, open(os.path.join(HERE, "run5-results.json"), "w"), indent=1)
print("\n==== SUMMARY")
for r in results:
    print(f"{r['verdict']:8} {r['name']}: {'; '.join(r['failed'])[:240]}")
