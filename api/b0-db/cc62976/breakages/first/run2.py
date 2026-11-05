# Breakage runs: each mutation disables one guard; a db test must then fail.
import os, re, shutil, subprocess, sys
ROOT = "/home/user/tadayo-contract/db/migrations"
SCR = "/tmp/claude-0/-home-user-Tadayo/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s4"
BACKUP = SCR + "/mut/backup"
MUTATIONS = [
 ("T7 join needs every approval", "0004_rosters.sql", "     OR EXISTS (SELECT FROM app.roster_revision_members m\n", "     OR false AND EXISTS (SELECT FROM app.roster_revision_members m\n"),
 ("T25 removal written once (update)", "0008_safety.sql", "CREATE TRIGGER drop_removals_written_once BEFORE UPDATE OR DELETE ON app.drop_removals\n  FOR EACH ROW", "CREATE TRIGGER drop_removals_written_once BEFORE DELETE ON app.drop_removals\n  FOR EACH ROW"),
 ("T25 removal written once (delete)", "0008_safety.sql", "CREATE TRIGGER drop_removals_written_once BEFORE UPDATE OR DELETE ON app.drop_removals\n  FOR EACH ROW", "CREATE TRIGGER drop_removals_written_once BEFORE UPDATE ON app.drop_removals\n  FOR EACH ROW"),
 ("T28 tombstone never deleted", "0008_safety.sql", "CREATE TRIGGER deletion_tombstones_no_delete BEFORE DELETE ON app.deletion_tombstones\n  FOR EACH ROW", "CREATE TRIGGER deletion_tombstones_no_delete BEFORE DELETE ON app.deletion_tombstones\n  FOR EACH ROW WHEN (false)"),
]
BACKUP = SCR + "/mut/backup2"
shutil.rmtree(BACKUP, ignore_errors=True)
shutil.copytree(ROOT, BACKUP)
def restore():
    for f in os.listdir(BACKUP):
        shutil.copy(os.path.join(BACKUP, f), os.path.join(ROOT, f))
results = []
only = sys.argv[1:]
try:
    for name, f, old, new in MUTATIONS:
        if only and not any(o in name for o in only):
            continue
        restore()
        p = os.path.join(ROOT, f)
        s = open(p).read()
        n = s.count(old)
        if n != 1:
            results.append((name, f"BAD MUTATION ({n} matches)", ""))
            continue
        open(p, "w").write(s.replace(old, new))
        r = subprocess.run(["bash", SCR + "/dbtest.sh"], env={**os.environ, "FRESH": "1"}, capture_output=True, text=True)
        out = r.stdout + r.stderr
        failed = re.findall(r"^\s*(?:FAIL|×) (.*)$", out, re.M)
        summary = re.search(r"Tests\s+(.*)", out)
        caught = bool(re.search(r"\d+ failed", out)) or "Error" in out and "passed" not in (summary.group(1) if summary else "")
        results.append((name, "CAUGHT" if caught else "MISSED", (summary.group(1) if summary else out[-300:]) + " | " + "; ".join(failed[:3])))
        print(results[-1], flush=True)
finally:
    restore()
print("\n==== SUMMARY")
for name, verdict, detail in results:
    print(f"{verdict:8} {name}: {detail[:300]}")
