# Breakages of the runner code that the narrow check of 435c0e7 changed: each one undoes one
# piece of a fix (a statement removed, a type left without its schema, a step moved); a test
# named for the rule must then fail. A change that stops a migration applying, or the runner
# loading, is reported as BROKEN, never as caught.
#
# Each entry of run6-list.json is [name, file, [[old, new], ...]]: every old text must occur once
# in the file, and all the replacements together are one breakage.
#
# Usage: python3 run6.py [words that pick breakages by name]. It reads run6-list.json beside it,
# runs dbtest.sh beside it (FRESH=1, so every breakage starts from a new server), runs the
# runner's own unit tests too, and writes run6-results.json beside it. Set REPO to your working
# tree; the files are put back after each breakage and at the end.
import json, os, re, shutil, subprocess, sys

REPO = os.environ.get("REPO", "/home/user/tadayo-contract")
HERE = os.path.dirname(os.path.abspath(__file__))
BACKUP = os.path.join(HERE, "backup")
RUNNER = "tools/ops/src/migrate.ts"
LIST = json.load(open(os.path.join(HERE, "run6-list.json")))
FILES = sorted({entry[1] for entry in LIST})
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
    for name, f, edits in LIST:
        if only and not any(o in name for o in only):
            continue
        restore()
        path = os.path.join(REPO, f)
        text = open(path).read()
        bad = [old for old, _ in edits if text.count(old) != 1]
        if bad:
            results.append({"name": name, "file": f, "verdict": f"BAD BREAKAGE ({len(bad)} edits don't match once)", "failed": []})
            print(json.dumps(results[-1]), flush=True)
            continue
        for old, new in edits:
            text = text.replace(old, new)
        open(path, "w").write(text)
        out = ""
        if f == RUNNER:
            unit = subprocess.run(["pnpm", "--filter", "@tadayo/ops", "exec", "vitest", "run"], cwd=REPO, env=env, capture_output=True, text=True)
            out += unit.stdout + unit.stderr
        run = subprocess.run(["timeout", "900", "bash", os.path.join(HERE, "dbtest.sh")], env={**env, "FRESH": "1"}, capture_output=True, text=True)
        out += run.stdout + run.stderr
        failed = sorted(set(re.findall(r"^\s*FAIL\s+(?:src/\S+|\S+\.test\.ts)\s+>\s+(.*)$", out, re.M)))
        startup = "Startup Error" in out or "No test files found" in out
        verdict = "CAUGHT" if failed else ("BROKEN" if startup else "MISSED")
        results.append({"name": name, "file": f, "verdict": verdict, "failed": failed})
        print(json.dumps(results[-1]), flush=True)
finally:
    restore()
json.dump(results, open(os.path.join(HERE, "run6-results.json"), "w"), indent=1)
print("\n==== SUMMARY")
for r in results:
    print(f"{r['verdict']:8} {r['name']}: {'; '.join(r['failed'])[:240]}")
