"""Deliberate breakages of api/b2-worker-crash-report: each changes one thing in tools/ops/src,
runs the three test files, and puts the file back. A breakage is caught when vitest fails."""
import hashlib, subprocess, sys
from pathlib import Path

ROOT = Path(sys.argv[1])  # the worktree's tools/ops
FILES = ["src/worker-scale.test.ts", "src/deploy-branch.test.ts", "src/fly.test.ts"]

B = [
 ("K01", "src/worker-scale.ts", ".filter((exit) => exit !== undefined && !exit.requested);", ".filter((exit) => exit !== undefined);", "an exit Fly was asked for counts as a failed start"),
 ("K02", "src/worker-scale.ts", ".filter((row) => !before.has(row))\n", "\n", "the exits from before the start count too"),
 ("K03", "src/worker-scale.ts", "const WATCH_POLLS = 6;", "const WATCH_POLLS = 1;", "the watch is 5 seconds, not 30"),
 ("K04", "src/worker-scale.ts", "state = (await machines(fly)).find((machine) => machine.id === id)?.state ?? \"gone\";", "await machines(fly);", "the watch doesn't look at the state"),
 ("K05", "src/worker-scale.ts", "  if (!stopping) for (const line of await machineReport(fly, worker.id, LABEL)) say(line);\n", "", "a start never seen as started prints no report"),
 ("K06", "src/worker-scale.ts", "  for (const line of reportOf(id, LABEL, events, await machineLog(fly, id))) say(line);\n", "  await machineLog(fly, id);\n", "the watch prints no report"),
 ("K07", "src/worker-scale.ts", "  if (first !== undefined) {", "  if (first !== undefined && false) {", "a fresh crash and restart passes"),
 ("K08", "src/fly.ts", 'requested: found[3] === "true"', "requested: false", "an exit is never read as asked for"),
 ("K09", "src/fly.ts", "export const MACHINE_ID = /^[0-9a-f]{14}$/;", "export const MACHINE_ID = /^/;", "an id that isn't a Machine's is passed to flyctl"),
 ("K10", "src/fly.ts", "const LOG_LINES = 60;", "const LOG_LINES = 600;", "the log keeps more than its last 60 lines"),
 ("K11", "src/deploy-branch.ts", "    if (!/fail/i.test(line)) continue;\n", "", "every Machine a deploy names is reported, not only those whose line failed"),
 ("K12", "src/deploy-branch.ts", "      for (const line of await machineReport(fly, id, \"deploy-branch\")) say(line);\n", "", "a failed deploy prints no report"),
 ("K13", "src/fly.ts", '.replace(/\\n/g, " ")', "", "an entry with a line break in it is printed on two lines"),
 ("K14", "src/fly.ts", "const LINE_CHARS = 400;", "const LINE_CHARS = 4000;", "a long line isn't cut"),
 ("K15", "src/fly.ts", "entries.push(plain(`", "entries.push((`", "a log line's colours and control characters reach the run's log"),
 ("K16", "src/fly.ts", '.replace(CONTROLS, "")', "", "control characters reach the run's log"),
 ("K17", "src/fly.ts", "return lines.slice(title + 1).filter(", "return lines.filter(", "the VM table's time is taken for an event"),
]

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()

results = []
for key, rel, old, new, what in B:
    path = ROOT / rel
    text = path.read_text()
    if text.count(old) != 1:
        results.append((key, "NOT APPLIED", what)); continue
    before = digest(path)
    try:
        path.write_text(text.replace(old, new))
        run = subprocess.run(["npx", "vitest", "run", *FILES], cwd=ROOT, capture_output=True, text=True)
        out = run.stdout + run.stderr
        failed = [l.strip() for l in out.splitlines() if l.strip().startswith(("×", "✗", "FAIL"))][:4]
        results.append((key, "caught" if run.returncode != 0 else "NOT CAUGHT", what, failed))
    finally:
        path.write_text(text)
        assert digest(path) == before
for r in results:
    print(f"{r[0]} {r[1]}: {r[2]}")
    for l in (r[3] if len(r) > 3 else []): print(f"    {l}")
