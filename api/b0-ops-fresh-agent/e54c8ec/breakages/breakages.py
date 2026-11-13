#!/usr/bin/env python3
"""api/b0-ops-fresh-agent's deliberate breakages: each makes exact changes of text in
tools/ops/src/fly.ts or on-machine.ts, runs fly.test.ts and on-machine.test.ts with vitest, and is
caught only when the run fails and its output names the registered test (a name prefix), or, for
an entry that registers several, every one of them.
An entry marked "pin" makes a change a real run can't tell apart (an equivalent mutant: flyctl reads
the word the same, or the real spawn ignores the key): the test it is caught by pins the design's
literal, and it isn't counted as a defect caught.
usage: breakages.py <repository root> <out dir> [only these names...]
Every changed file is put back after each entry, and the run stops if one can't be; the folders the
tests make under the temporary folder (tadayo-flyctl-*, tadayo-test-home-*) and an entry leaves are
removed after it, and listed in its output."""
import glob, os, shutil, subprocess, sys, tempfile

root, out = sys.argv[1], sys.argv[2]
only = set(sys.argv[3:])
F, O = "tools/ops/src/fly.ts", "tools/ops/src/on-machine.ts"

OWN = '{ ...childEnv, FLY_CONFIG_DIR: ownAgent, FLY_AGENT_ISOLATED: "1" }'
MAKE = '''  const folders = input.agentFolder ?? AGENT_FOLDER;
  let folder: string;
  try {
    folder = await folders.make();
  } catch (error) {
    throw new OpsError(
      `${label}: couldn't make a folder for flyctl's agent (${wordsOf(error)}), so no SSH session is started`,
    );
  }
'''
NOTE = '''  note(
    `${label}: the SSH session makes a WireGuard peer in ${org}, which this run removes after it; if the run is cancelled or cut off first, ${byHandFor(org, host)}`,
  );
'''
REMOVE = '''    await folders.remove(folder).catch((error: unknown) => {
      note(`${label}: the folder of flyctl's agent couldn't be removed: ${wordsOf(error)}`);
    });
'''
MKDTEMP = 'make: () => mkdtemp(join(tmpdir(), "tadayo-flyctl-")),'
IMPORT = 'import { mkdtemp, rm } from "node:fs/promises";'
CALL = "  let result: Spawned;\n  try {\n    result = await fly.run("

T_FLY_OWN = "gives a call with an agent of its own that agent's folder and the word that runs it"
T_FLY_PLAIN = "gives flyctl the token and HOME, the call's own directory, and two minutes"
T_FLY_REL = "refuses an agent's folder that isn't an absolute path, before it runs anything"
T_NEW = "makes a new empty folder only the runner's user may read (mode 0700), gives it and FLY_AGENT_ISOLATED=1 to the SSH"
T_ANY = "removes the folder only once the session's call has ended, whatever it did"
T_THROW = "removes the folder when the SSH call is refused or can't be started"
T_SECOND = "gives a second session on the same runner a new folder and agent"
T_ENV = "gives the session the tunnel's bound, the connection and the command's time, and flyctl the token"
T_UNMADE = "starts no session when the folder can't be made, and says why"
T_KEPT = "says a folder it couldn't remove, and goes on to remove the peer"

B = [
 # fly.ts: what a call with an agent of its own is given
 ("fly-config-dir-dropped", F, [(OWN, '{ ...childEnv, FLY_AGENT_ISOLATED: "1" }')], T_FLY_OWN),
 ("fly-isolated-dropped", F, [(OWN, "{ ...childEnv, FLY_CONFIG_DIR: ownAgent }")], T_FLY_OWN),
 ("fly-isolated-true", F, [(OWN, '{ ...childEnv, FLY_CONFIG_DIR: ownAgent, FLY_AGENT_ISOLATED: "true" }')], T_FLY_OWN, "pin"),
 ("fly-own-agent-ignored", F, [(f"      const env =\n        ownAgent === undefined ? childEnv : {OWN};", "      const env = childEnv;")], T_FLY_OWN),
 ("fly-isolated-for-every-call", F, [("ownAgent === undefined ? childEnv :", 'ownAgent === undefined ? { ...childEnv, FLY_AGENT_ISOLATED: "1" } :')], T_FLY_PLAIN),
 ("fly-option-spawned", F, [("{ env, timeoutMs: QUICK_MS, ...rest }", "{ env, timeoutMs: QUICK_MS, ...options }")], T_FLY_OWN, "pin"),
 ("fly-relative-taken", F, [("if (ownAgent !== undefined && !isAbsolute(ownAgent)) {", "if (ownAgent === null) {")], T_FLY_REL),
 ("fly-empty-taken", F, [("!isAbsolute(ownAgent)", 'ownAgent !== "" && !isAbsolute(ownAgent)')], T_FLY_REL),
 # on-machine.ts: the session's folder
 ("om-folder-not-given", O, [("{ timeoutMs: SESSION_MS, ownAgent: folder }", "{ timeoutMs: SESSION_MS }")], [T_SECOND, T_ENV]),
 ("om-one-folder", O, [(IMPORT, 'import { mkdir, mkdtemp, rm } from "node:fs/promises";'),
                       (MKDTEMP, 'make: async () => { const path = join(tmpdir(), "tadayo-flyctl-shared"); await mkdir(path, { recursive: true, mode: 0o700 }); return path; },')], T_SECOND),
 ("om-folder-readable", O, [(IMPORT, 'import { chmod, mkdtemp, rm } from "node:fs/promises";'),
                            (MKDTEMP, 'make: async () => { const path = await mkdtemp(join(tmpdir(), "tadayo-flyctl-")); await chmod(path, 0o755); return path; },')], T_NEW),
 ("om-folder-relative", O, [(MKDTEMP, 'make: () => mkdtemp("tadayo-flyctl-"),')], T_NEW),
 ("om-folder-kept", O, [(REMOVE, "")], T_NEW),
 ("om-folder-removed-only-after-success", O, [(REMOVE, "    if (result?.code === 0)\n" + REMOVE)], T_ANY),
 ("om-remove-during-session", O, [(CALL, "  let pending: Promise<Spawned>;\n  try {\n    pending = fly.run("),
                                  (REMOVE + "  }\n", REMOVE + "  }\n  const result = await pending;\n")], T_ANY),
 ("om-remove-after-one-tick", O, [(CALL, "  let pending: Promise<Spawned>;\n  try {\n    pending = fly.run("),
                                  ("      { timeoutMs: SESSION_MS, ownAgent: folder },\n    );\n  } finally {\n",
                                   "      { timeoutMs: SESSION_MS, ownAgent: folder },\n    );\n    pending.catch(() => undefined);\n    await Promise.resolve();\n  } finally {\n"),
                                  (REMOVE + "  }\n", REMOVE + "  }\n  const result = await pending;\n")], T_ANY),
 ("om-no-finally", O, [(CALL, "  let result: Spawned;\n  {\n    result = await fly.run("), ("  } finally {\n", "  }\n  {\n")], T_THROW),
 ("om-remove-only-with-result", O, [(REMOVE, '    if (typeof result !== "undefined")\n' + REMOVE)], T_THROW),
 ("om-rm-not-recursive", O, [("rm(path, { recursive: true, force: true })", "rm(path, { force: true })")], T_NEW),
 ("om-remove-failure-fails", O, [(REMOVE, "    await folders.remove(folder);\n")], T_KEPT),
 ("om-remove-failure-silent", O, [("      note(`${label}: the folder of flyctl's agent couldn't be removed: ${wordsOf(error)}`);\n", "      void error;\n")], T_KEPT),
 ("om-make-error-uncaught", O, [(MAKE, "  const folders = input.agentFolder ?? AGENT_FOLDER;\n  const folder = await folders.make();\n")], T_UNMADE),
 ("om-note-before-make", O, [(MAKE + NOTE, NOTE + MAKE)], T_UNMADE),
]

def main():
    names = [b[0] for b in B]
    assert len(set(names)) == len(names), "names repeat"
    os.makedirs(out, exist_ok=True)
    vitest = ["npx", "vitest", "run", "src/fly.test.ts", "src/on-machine.test.ts"]
    caught = missed = 0
    summary = []
    pins = 0
    tmp = tempfile.gettempdir()
    made = lambda: set(glob.glob(os.path.join(tmp, "tadayo-flyctl-*")) + glob.glob(os.path.join(tmp, "tadayo-test-home-*")))
    for name, path, pairs, words, *kind in B:
        pin = kind == ["pin"]
        if only and name not in only:
            continue
        full = os.path.join(root, path)
        original = open(full, encoding="utf-8").read()
        text = original
        for old, new in pairs:
            if text.count(old) != 1:
                sys.exit(f"{name}: its text occurs {text.count(old)} times in {path}")
            text = text.replace(old, new)
        before = made()
        try:
            open(full, "w", encoding="utf-8").write(text)
            patch = subprocess.run(["git", "diff", "--", path], cwd=root, capture_output=True, text=True).stdout
            run = subprocess.run(vitest, cwd=os.path.join(root, "tools/ops"), capture_output=True, text=True,
                                 env={**os.environ, "NO_COLOR": "1", "FORCE_COLOR": "0"}, timeout=300)
        finally:
            open(full, "w", encoding="utf-8").write(original)
        if open(full, encoding="utf-8").read() != original:
            sys.exit(f"{name}: {path} couldn't be put back")
        stray = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all", "--", "tools/ops"],
                               cwd=root, capture_output=True, text=True).stdout
        stray = [l for l in stray.splitlines() if l.startswith("??")]
        left = sorted(made() - before)
        for folder in left:
            shutil.rmtree(folder, ignore_errors=True)
        output = run.stdout + run.stderr
        # Vitest names only the tests that failed, each on a line marked × or FAIL.
        registered = [words] if isinstance(words, str) else list(words)
        failed = [line for line in output.splitlines() if "×" in line or "FAIL" in line]
        ok = run.returncode != 0 and all(any(w in line for line in failed) for w in registered)
        words = " + ".join(registered)
        caught += ok and not pin
        pins += ok and pin
        missed += not ok
        verdict = ("pinned" if pin else "caught") if ok else ("MISSED (passed)" if run.returncode == 0 else "MISSED (words not found)")
        summary.append(f"{verdict}\t{name}\t{path}\texit {run.returncode}\t{words}" + (f"\tSTRAY {stray}" if stray else "") + (f"\tLEFT {len(left)} temporary folder(s), removed" if left else ""))
        open(os.path.join(out, f"{name}.patch"), "w").write(patch)
        open(os.path.join(out, f"{name}.txt"), "w").write(f"breakage: {name}\nregistered: {words}\nexit: {run.returncode}\nverdict: {verdict}\nleft: {left}\n\n{output}")
        print(summary[-1], flush=True)
    total = f"{caught} caught, {pins} pinned (equivalent mutants, not counted as caught), {missed} missed, of {caught + pins + missed}"
    open(os.path.join(out, "summary.txt"), "w").write("\n".join(summary + [total]) + "\n")
    print(total)
    return 1 if missed else 0

if __name__ == "__main__":
    sys.exit(main())
