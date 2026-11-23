"""Deliberate breakages of the worker's hardening, its first part (api/b2-worker-hardening): the child's messages on a
pipe of the worker's own (docs/plans/api-b2-worker-hardening.md section 1). Built from S2's runner (s2brk6).

Deliberate breakages of spike S2's server half, the worker's photo preparation (api/b2-spike-prepare), one
change each, on the tree its fifth commit holds (round 4 of PR #111's review): the fourth commit's 87
(../../7037f3d/breakages/), with the anchors and test names round 4 moved, and the new ones for round 4's fixes
(I35 to I37, X16 to X27, P13, M05).

For each: change the one place, run the suite registered for it, and check that a test whose name holds the
pre-registered words fails. The file is restored after each. Nothing else may use the local database meanwhile.

  breakages.py --check        count every anchor, change nothing
  breakages.py O01 P02 ...    only these
"""

import difflib
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get("BREAK_ROOT", "/home/user/tadayo-share"))
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(SP) / "v2brk1/out"
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
OUTBOX = "services/worker/src/outbox.ts"
PREPARE = "services/worker/src/prepare.ts"
DPREP = "packages/domain/src/media/prepare.ts"
IMAGE = "services/worker/src/image.ts"
PROCESS = "services/worker/src/image-process.ts"
CHILD = "services/worker/src/image-child.ts"
FRAMES = "services/worker/src/image-frames.ts"
STORAGE = "services/worker/src/storage.ts"
START = "services/worker/src/start.ts"
PROBE = "tools/ops/src/supabase-probe.ts"

DB = ["npx", "vitest", "run", "--config", "vitest.db.config.ts"]
W = ["npx", "vitest", "run"]
SUITES = {
    "outbox": ("tests", [*DB, "src/db/worker-outbox.test.ts"]),
    "prepare": ("tests", [*DB, "src/db/worker-prepare.test.ts"]),
    "outboxu": ("services/worker", [*W, "src/outbox.test.ts"]),
    "image": ("services/worker", [*W, "src/image.test.ts"]),
    "storage": ("services/worker", [*W, "src/storage.test.ts"]),
    "start": ("services/worker", [*W, "src/start.test.ts"]),
    "probe": ("tools/ops", [*W, "src/supabase-probe.test.ts"]),
    "memory": ("services/worker", [*W, "src/image-memory.test.ts"]),
    "process": ("services/worker", [*W, "src/image-process.test.ts"]),
    "prepu": ("services/worker", [*W, "src/prepare.test.ts"]),
    "frames": ("services/worker", [*W, "src/image-frames.test.ts"]),
}


FR_ROUND = "come back as they were sent, ready then each kind of answer, whole or a byte at a time"
FR_AFTER = "read nothing after the answer, though more bytes come in the same read or after it"
FR_CAPS = "take a header of HEADER_BYTES, and a message of MESSAGE_BYTES, and keep only what each length allows"
FR_LENGTH = "is a header's length of 0, past HEADER_BYTES, or of 4 GiB, refused at its fourth byte with nothing kept"
FR_KIND = "is a header that isn't a JSON object of one of the child's kinds"
FR_ORDER = "is a message out of order: an answer before ready, or a second ready"
FR_REND = "is a prepared answer whose renditions aren't a list of at most two, each with a length that fits"
PX_BROKEN = "fails, to be tried again, when the child sends anything but ready and then its answer, and ends it at once"
PX_HUGE = "fails at once on a length past its cap, the worker holding none of what the child goes on writing (C5-1)"
PX_FIRST = "keeps the first answer, and reads nothing after it"
PX_LINGERS = "ends a child that answered at once, though it would never exit, and keeps its answer"
PX_ESCAPES = "closes its ends of the child's pipes as it settles, though a process the child started outside its group holds them mid-message"
PX_ENV = "goes first to the kernel's out-of-memory killer, and starts with an empty environment"
PX_ORPHAN = "ends with the worker: a worker killed while its photo is decoded leaves no process behind"
PX_SAME = "answers as prepareImage does in this process, rendition for rendition, byte for byte"
PO_FAILED = "throws ImageProcessFailed when it ended before it was ready, of its own accord or by another signal without answering, or its code threw"

B = [
    # The reader (plan section 1).
    ("F01 a header's length past its cap is read", FRAMES,
     "      if (bytes > HEADER_BYTES) throw", "      if (bytes > 2 ** 32) throw", "frames", FR_LENGTH),
    ("F02 a message out of order is taken", FRAMES,
     '      if ((header.kind === "ready") !== (this.#seen === "nothing")) throw new BrokenAnswer("a message out of order");\n',
     "", "frames", FR_ORDER),
    ("F03 a second ready is taken", FRAMES,
     '      if ((header.kind === "ready") !== (this.#seen === "nothing")) throw',
     '      if (header.kind !== "ready" && this.#seen === "nothing") throw', "frames", FR_ORDER),
    ("F04 a header of no known kind is taken", FRAMES,
     '  if (kind !== "prepared" || !isRecord(header.prepared)) throw new BrokenAnswer("a header of no known kind");',
     '  if (kind !== "prepared" || !isRecord(header.prepared)) return [];', "frames", FR_KIND),
    ("F05 a header that isn't an object is taken", FRAMES,
     '      if (!isRecord(header)) throw new BrokenAnswer("a header that isn\'t an object");\n', "", "frames", FR_KIND),
    ("F06 more than two renditions are read", FRAMES,
     "  if (!Array.isArray(renditions) || renditions.length > MOST_RENDITIONS) {",
     "  if (!Array.isArray(renditions)) {", "frames", FR_REND),
    ("F07 a negative length is taken", FRAMES,
     "!Number.isSafeInteger(length) || length < 0)", "!Number.isSafeInteger(length))", "frames", FR_REND),
    ("F08 a length that isn't whole is taken", FRAMES,
     'if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0)',
     'if (typeof length !== "number" || length < 0)', "frames", FR_REND),
    ("F09 renditions past the message's cap are read", FRAMES,
     "  if (lengths.reduce((sum, length) => sum + length, 0) > left)", "  if (false)", "frames", FR_REND),
    ("F10 the header's own bytes aren't counted against the message's cap", FRAMES,
     "bodiesOf(header, MESSAGE_BYTES - LENGTH_BYTES - filled.length)", "bodiesOf(header, MESSAGE_BYTES)", "frames", FR_CAPS),
    ("F11 the reader reads on after the answer", FRAMES,
     "      while (!this.done) {", "      while (true) {", "frames", FR_AFTER),
    ("F12 the reader keeps its buffer after a broken answer", FRAMES,
     "      if (this.done || this.#broken) this.#into = Buffer.alloc(0);", "      if (this.done) this.#into = Buffer.alloc(0);",
     "frames", FR_LENGTH),
    ("F13 the reader reads on after a broken answer", FRAMES,
     '    if (this.#broken) throw new BrokenAnswer("bytes after a broken answer");\n', "", "frames", FR_KIND),
    ("F14 a rendition's bytes aren't sent", FRAMES,
     "    bodies = renditions.map((rendition) => rendition.bytes);\n", "", "frames", FR_ROUND),
    ("F15 a rendition's length stays in place of its bytes", FRAMES,
     "    const sent: Record<string, unknown> = { ...rendition, bytes: bodies[i] };",
     "    const sent: Record<string, unknown> = { ...rendition };", "frames", FR_ROUND),
    # The worker (plan section 1).
    ("X30 a broken answer doesn't end the child", PROCESS,
     "      } catch {\n        end(\"broken\");\n        return;\n      }", "      } catch {\n        killed ??= \"broken\";\n        return;\n      }",
     "process", PX_BROKEN),
    ("X31 a broken answer leaves the worker's end of the pipe open", PROCESS,
     '      if (why === "broken" || answer !== undefined) answers?.destroy();', '      if (answer !== undefined) answers?.destroy();',
     "process", PX_BROKEN),
    ("X32 the answer leaves the worker's end of the pipe open", PROCESS,
     '      if (why === "broken" || answer !== undefined) answers?.destroy();', '      if (why === "broken") answers?.destroy();',
     "process", PX_FIRST),
    ("X33 the answer doesn't end the child", PROCESS,
     "          answer = message;\n          end();", "          answer = message;", "process", PX_LINGERS),
    ("X34 the worker keeps its end of the child's pipe as the end settles", PROCESS,
     "      child.stdin?.destroy();\n      answers?.destroy();\n", "      child.stdin?.destroy();\n", "process", PX_ESCAPES),
    ("X35 the worker keeps its end of the child's standard input as the end settles", PROCESS,
     "      child.stdin?.destroy();\n      answers?.destroy();\n", "      answers?.destroy();\n", "process", PX_ESCAPES),
    ("X36 the child is given the worker's environment", PROCESS,
     "      env: {},\n      stdio:", "      env: process.env,\n      stdio:", "process", PX_ENV),
    ("X37 a broken answer is the child's to retry as anything", PROCESS,
     '  if (end.killed === "broken") throw new ImageProcessFailed();\n', "", "process", PO_FAILED),
    ("X38 the photo is never written", PROCESS,
     "          child.stdin?.end(bytes);", "          child.stdin?.end();", "process", PX_SAME),
    # The child (plan section 1).
    ("C01 the child lives on when the worker has gone", CHILD,
     'worker.on("end", gone);\n', "", "process", PX_ORPHAN),
    ("C02 the child sends no ready", CHILD,
     'await send({ kind: "ready" });\n', "", "process", PX_SAME),
]

def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


def remake():
    a = run(["bash", SP + "/s4/pgci.sh"])
    b = run(["python3", "tools/ci/ci_steps.py", "db-bootstrap"])
    return a.returncode, b.returncode, (b.stdout + b.stderr)[-400:]


def swap(text, old, new):
    assert text.count(old) == 1, (old[:70], text.count(old))
    return text.replace(old, new)


def edit(text, old, new):
    if isinstance(old, list):
        for a, b in old:
            text = swap(text, a, b)
        return text
    return swap(text, old, new)


def main():
    args = sys.argv[1:]
    codes = [name.split()[0] for name, *_ in B]
    assert len(set(codes)) == len(codes), "a code used twice"
    if args == ["--check"]:
        bad = 0
        for name, path, old, new, suite, words in B:
            text = (ROOT / path).read_text()
            try:
                ok = edit(text, old, new) != text and suite in SUITES and len(words) > 6
            except AssertionError as e:
                ok = False
                print("  ", e)
            if not ok:
                bad += 1
                print("BAD", name)
        print(len(B), "entries,", bad, "bad")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    dirty = False
    for name, path, old, new, suite, words in B:
        code = name.split()[0]
        if args and code not in args:
            continue
        p = ROOT / path
        orig = p.read_text()
        try:
            broken = edit(orig, old, new)
            p.write_text(broken)
            # The breakage alone: the file as it stands before against the file broken.
            (OUT / f"{code}.patch").write_text(
                "".join(difflib.unified_diff(orig.splitlines(True), broken.splitlines(True), f"a/{path}", f"b/{path}"))
            )
            note = ""
            if suite == "mig":
                dirty = True
                made = remake()
                note = f" (database made again: {made[0]} {made[1]})"
                if made[1] != 0:
                    note += " " + made[2].replace("\n", " | ")
            elif dirty:
                p.write_text(orig)
                made = remake()
                dirty = False
                p.write_text(edit(orig, old, new))
            cwd, cmd = SUITES[suite]
            r = run(cmd, cwd=ROOT / cwd)
            out = r.stdout + r.stderr
            (OUT / f"{code}.txt").write_text(out)
            failed = sorted({l.strip()[2:].strip()[:260] for l in out.splitlines() if l.strip().startswith("×")})
            summary = [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")]
            caught = any(words[:105] in f for f in failed)
            verdict = "CAUGHT" if caught else ("CAUGHT BY ANOTHER TEST" if failed else ("NO RESULT" if not summary else "NOT CAUGHT"))
            print(f"== {name} [{suite}]: {verdict}; exit {r.returncode} {summary}{note}", flush=True)
            for f in failed[:6]:
                print("    ×", f, flush=True)
            if not summary:
                print("   ", out[-500:].replace("\n", "\n    "), flush=True)
        finally:
            p.write_text(orig)
    if dirty:
        print("database made again from the true migration:", remake()[:2], flush=True)
    print("restored:", repr(run(["git", "status", "--short"]).stdout), flush=True)


if __name__ == "__main__":
    main()
