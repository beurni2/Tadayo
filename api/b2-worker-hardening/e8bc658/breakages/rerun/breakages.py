"""Deliberate breakages of the worker's hardening at its third commit (api/b2-worker-hardening, PR #118): each photo
under a user of its own (docs/plans/api-b2-worker-hardening.md section 2; ADR-038), with round 1's fixes (the
inspector off, the sweep's loop and cleanup, the sweep at start, the group's kill refused or after reap, a
rendition's bytes, prlimit). Built from the second commit's runner (v2brk2), its anchors moved to the code as it is.

For each: change the one place, run the suite registered for it, and check that a test whose name holds the
pre-registered words fails. The file is restored after each. Nothing else may use the local database meanwhile.
The privileges suite starts its harness as root (the session is root).

  breakages.py --check        count every anchor, change nothing
  breakages.py P01 X02 ...    only these
"""

import difflib
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get("BREAK_ROOT", "/home/user/tadayo-share"))
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(SP) / "v2brk4/out"
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
PRIV = "services/worker/src/privileges.ts"
PROCESS = "services/worker/src/image-process.ts"
PREPARE = "services/worker/src/prepare.ts"
START = "services/worker/src/start.ts"
MAIN = "services/worker/src/main.ts"
DOCKER = "Dockerfile"
FLY = "fly.toml"

DB = ["npx", "vitest", "run", "--config", "vitest.db.config.ts"]
W = ["npx", "vitest", "run"]
SUITES = {
    "priv": ("services/worker", [*W, "src/privileges.test.ts"]),
    "start": ("services/worker", [*W, "src/start.test.ts"]),
    "process": ("services/worker", [*W, "src/image-process.test.ts"]),
    "prepare": ("tests", [*DB, "src/db/worker-prepare.test.ts"]),
    "startup": ("tests", [*DB, "src/db/startup.test.ts"]),
    "deploy": ("tools/ops", [*W, "src/deploy-files.test.ts"]),
    # In a container of the image, root in a PID namespace and a cgroup of its own: for a breakage whose harness run
    # would act as root on the whole machine (a sweep as root sends SIGKILL to every process there; a photo process
    # as root forks past any process limit). Twice a run of W01 on the machine itself ended every process of the
    # session's container.
    "privbox": ("services/worker", ["docker", "run", "--rm", "--pids-limit", "1024", "--memory", "3g",
                                     "-e", "NO_COLOR=1", "-v", f"{ROOT}:{ROOT}", "-w", f"{ROOT}/services/worker",
                                     "--entrypoint", "", "tadayo-api-dev:hardening6",
                                     "node", f"{ROOT}/node_modules/vitest/vitest.mjs", "run", "src/privileges.test.ts"]),
}

U_NONE = "is none, photos prepared in the worker's own user, when neither the variable nor the start asks for one"
U_NAMED = "is the user the variable names, from /etc/passwd, when the worker was started as fly.toml starts it"
U_HALF = "stops the worker when only one half is there: the variable without the start, or the start without it"
U_WHOLE = "refuses a name that isn't a user's, matching whole names only"
U_ROOT = "refuses root, root's group, the worker's own user and the worker's own group"
A_REFUSE = "asRoot refuses, and runs nothing"
S_REFUSE = "the sweep refuses root, root's group, and this process's own user and group, before it starts anything"
S_PROGRAM = "the sweep's program sends SIGKILL to every process its user may signal, never as root, and counts finding none as done"
H_START = "ran as root, with the photo's user and the worker's unused, and ended with nothing of the photo's user left"
H_REFUSE = "asRoot refuses a process that is only root, and the sweep refuses root, the worker's user and its group"
H_PROBE = "a photo's process is the photo's user alone, with no capability, and can't reach the worker"
H_ESCAPE = "a process the photo's process started in a session of its own has ended once the photo's end settles"
H_GROUP = "the sweep runs with the worker's group, not the photo user's, so a process left behind can't attach to it"
H_FORKS = "so has every process of a forking loop, caught mid-fork"
H_MEMORY = "a process past its memory is still killed by the worker at once, not left to the sweep after GRACE_MS"
H_DEADLINE = "a process past its deadline is still killed by the worker at once"
H_TIMEOUT = "a sweep that doesn't finish in time stops the worker: a process of the photo's user may be alive"
H_FAILS = "a sweep that exits other than 0, or is killed by a signal, is never done: a process left behind may have killed it"
ST_HALF = "stops before it connects when TADAYO_PHOTO_USER is set but it wasn't started as root with its own user effective"
PR_USER = "prepares the photo as that user: a worker not started as root can take none, so the photo fails, to be tried again"
SU_LINE = "starts with prod and stays up, making days, until it is told to stop"
D_DROP = "starts, in the stage that is the image, as root only to drop, in production, with the dependencies copied once as pnpm laid them"
D_USER = "makes the photo user, tadayo-image, with uid and gid 10001, no home, no shell and no password, and nothing else"
D_PROC = "has the two process groups, each dropping root with its setpriv line and running a file that is there, and no other"
D_ENV = "has only public values in [env]: the project's URL and publishable key, as the iOS app's Dev build has them, and the photo user's name"
D_CMD = "puts the ops entry where the runner starts it, and the API's command where a bare run starts it"
H_USR1 = "a process left behind can't open the sweep's inspector: SIGUSR1 stays blocked, opens nothing, and the sweep runs to its own end"
H_HOARDS = "what a photo's process left in memory or on disk is gone once its end settles: files, read-only folders, System V objects"
H_STARTSWEEP = "the worker's start ends a process of the photo's user before anything else, so none waits from before a restart"
H_STARTFAILS = "a sweep that can't finish as the worker starts stops it there, before it connects to the database"
H_REAPED = "sends no group kill once Node has reaped the photo's process, when its group's number may be another's"
K_GROUP = "is done when the group has ended, and stops the worker when the kill is refused, as the processes may still run"
J_TAKE = "takes prepareImage's own renditions, and the baseline JPEG they are laid out as, restarts and stuffed bytes in its scan"
J_REFUSE = "refuses metadata, a thumbnail or a comment, another kind of frame, another size, a second frame or scan, and anything after its end"
J_ANSWER = "throws ImageProcessFailed for an answer that isn't one rendition of each kind, a JPEG inside its box, or a rejection's code"

WORKER_CMD = 'worker = "prlimit --core=0 --nproc=256 -- setpriv --euid=node --egid=node --groups=node --bounding-set=-all,+setuid,+setgid,+kill --no-new-privs -- node --disable-sigusr1 services/worker/src/main.ts"'
API_CMD = 'api = "setpriv --reuid=node --regid=node --init-groups --inh-caps=-all --bounding-set=-all --no-new-privs -- node --disable-sigusr1 services/api/src/main.ts"'
API_CMD_DOCKER = 'CMD ["setpriv", "--reuid=node", "--regid=node", "--init-groups", "--inh-caps=-all", "--bounding-set=-all", "--no-new-privs", "--", "node", "--disable-sigusr1", "services/api/src/main.ts"]'

B = [
    # photoUserFor: the mode and the variable, both or neither.
    ("P01 the worker's mode is any real root", PRIV,
     "  return ids.uid === 0 && ids.euid !== 0;", "  return ids.uid === 0;", "priv", U_HALF),
    ("P02 the start without the variable prepares in the worker's own user", PRIV,
     "  if (!named) {\n    throw new Error(\"worker: started to prepare each photo under a user of its own, but TADAYO_PHOTO_USER isn't set\");\n  }",
     "  if (!named) return undefined;", "priv", U_HALF),
    ("P03 the variable without the start is taken", PRIV,
     "  if (!started) {\n    throw new Error(", "  if (false) {\n    throw new Error(", "priv", U_HALF),
    ("P04 a name matches the start of a user's", PRIV,
     ".find((fields) => fields.length === 7 && fields[0] === name);",
     ".find((fields) => fields.length === 7 && (fields[0] ?? \"\").startsWith(name ?? \"\"));", "priv", U_WHOLE),
    ("P05 a line of six fields is read as an entry", PRIV,
     ".find((fields) => fields.length === 7 && fields[0] === name);", ".find((fields) => fields[0] === name);", "priv", U_ROOT),
    ("P06 a photo user of uid 0 is taken", PRIV,
     "  if (user.uid === 0 || user.gid === 0) throw", "  if (user.gid === 0) throw", "priv", U_ROOT),
    ("P07 a photo user in group 0 is taken", PRIV,
     "  if (user.uid === 0 || user.gid === 0) throw", "  if (user.uid === 0) throw", "priv", U_ROOT),
    ("P08 the worker's own user is taken as the photo user", PRIV,
     "  if (user.uid === ids.euid || user.gid === ids.egid) {", "  if (user.gid === ids.egid) {", "priv", U_ROOT),
    ("P09 the worker's own group is taken as the photo user's", PRIV,
     "  if (user.uid === ids.euid || user.gid === ids.egid) {", "  if (user.uid === ids.euid) {", "priv", U_ROOT),
    ("P10 a negative id is taken", PRIV,
     "/^\\d{1,10}$/.test(value)", "/^-?\\d{1,10}$/.test(value)", "priv", U_ROOT),
    ("P11 the variable alone, empty, counts as named", PRIV,
     "  const named = name !== undefined && name !== \"\";", "  const named = name !== undefined;", "priv", U_NONE),
    # asRoot.
    ("A01 asRoot runs outside the worker's mode", PRIV,
     "  if (!inWorkerMode(before)) {\n    throw new Error(\"worker: asRoot", "  if (false) {\n    throw new Error(\"worker: asRoot", "priv", A_REFUSE),
    ("A02 asRoot doesn't return to the worker's user", PRIV,
     "      calls.seteuid(before.euid);", "      void before;", "priv", H_START),
    ("A03 asRoot stays root and doesn't check it came back", PRIV,
     [("      calls.seteuid(before.euid);", "      void before;"),
      ("    if (calls.geteuid() !== before.euid) stopWorker(\"worker: couldn't return to its own user\");", "")],
     None, "priv", H_PROBE),
    # The sweep.
    # W01, W07 to W09: S_REFUSE runs as the session's root, whose own ids are root's, so it can't tell these apart
    # here; on CI's runner it does. The harness's case, in the worker's mode, tells them apart everywhere.
    ("W01 the sweep takes root", PRIV,
     "  if (user.uid === 0 || user.gid === 0 || user.uid === own.euid || user.gid === own.egid) {",
     "  if (user.gid === 0 || user.uid === own.euid || user.gid === own.egid) {", "privbox", H_REFUSE),
    ("W07 the sweep takes root's group", PRIV,
     "  if (user.uid === 0 || user.gid === 0 || user.uid === own.euid || user.gid === own.egid) {",
     "  if (user.uid === 0 || user.uid === own.euid || user.gid === own.egid) {", "priv", H_REFUSE),
    ("W08 the sweep takes the worker's own user", PRIV,
     "  if (user.uid === 0 || user.gid === 0 || user.uid === own.euid || user.gid === own.egid) {",
     "  if (user.uid === 0 || user.gid === 0 || user.gid === own.egid) {", "priv", H_REFUSE),
    ("W09 the sweep takes the worker's own group", PRIV,
     "  if (user.uid === 0 || user.gid === 0 || user.uid === own.euid || user.gid === own.egid) {",
     "  if (user.uid === 0 || user.gid === 0 || user.uid === own.euid) {", "priv", H_REFUSE),
    ("W02 the sweep runs with the photo user's group", PRIV,
     "          gid: own.egid,", "          gid: user.gid,", "priv", H_GROUP),
    ("W03 the sweep sends SIGTERM, which a process may ignore", PRIV,
     "process.kill(-1, \"SIGKILL\")", "process.kill(-1, \"SIGTERM\")", "priv", S_PROGRAM),
    ("W04 the sweep's time never runs out", PRIV,
     "      reject(new SweepFailed(\"time\"));", "      void 0;", "priv", H_TIMEOUT),
    ("W05 a sweep's exit not 0 is taken as done", PRIV,
     "      if (code === 0) resolve();\n      else reject(new SweepFailed(\"exit\"));", "      resolve();", "priv", H_FAILS),
    ("W11 a sweep killed by a signal is taken as done", PRIV,
     "      if (code === 0) resolve();", "      if (code === 0 || code === null) resolve();", "priv", H_FAILS),
    ("W06 the sweep is the photo's process group only, not every process of its user", PRIV,
     "process.kill(-1, \"SIGKILL\")", "process.kill(0, \"SIGKILL\")", "priv", H_ESCAPE),
    ("W10 the sweep's program doesn't check it isn't root", PRIV,
     '  "if (process.getuid() === 0) process.exit(2);",\n', "", "priv", S_PROGRAM),
    # The photo's process.
    ("X01 the photo's process runs as the worker, not the photo user", PROCESS,
     "          ...(user === undefined ? {} : { uid: user.uid, gid: user.gid }),", "", "privbox", H_PROBE),
    ("X02 the photo's process keeps the worker's group", PROCESS,
     "{ uid: user.uid, gid: user.gid }", "{ uid: user.uid }", "priv", H_PROBE),
    ("X03 the photo's process is started without root", PROCESS,
     "      child = privileged(() =>", "      child = ((fn) => fn())(() =>", "priv", H_PROBE),
    ("X04 the group's kill is sent without root", PROCESS,
     "      killGroupOf(pid, privileged);", "      killGroupOf(pid, (fn) => fn());", "priv", H_MEMORY),
    ("X05 no sweep: the end settles as the group's kill leaves it", PROCESS,
     "      if (user === undefined) finish();", "      if (user === undefined || true) finish();", "priv", H_ESCAPE),
    ("X06 a failed sweep fails only the photo", PROCESS,
     "        sweep(user, limits.sweepSeconds).then(finish, () => {\n          stopWorker();",
     "        sweep(user, limits.sweepSeconds).then(finish, () => {\n          finish();", "priv", H_TIMEOUT),
    # Where the photo user comes from and goes.
    ("S01 the worker reads no photo user as it starts", START,
     "  const photoUser = photoUserFor(env, idsOf(), passwd);", "  const photoUser = undefined as PhotoUser | undefined;", "start", ST_HALF),
    ("R01 the preparation is given no photo user", PREPARE,
     "      user: deps.photoUser,", "      user: undefined,", "prepare", PR_USER),
    ("M01 the start line says each photo is under a user of its own, always", MAIN,
     "${photoUser === undefined ? \"each photo in the worker's own user\" : \"each photo under a user of its own\"}",
     "${\"each photo under a user of its own\"}", "startup", SU_LINE),
    # The image and fly.toml.
    ("D01 the image runs as node again", DOCKER,
     "COPY tools/ops/src tools/ops/src\n", "COPY tools/ops/src tools/ops/src\nUSER node\n", "deploy", D_DROP),
    ("D02 the photo user is node's uid", DOCKER,
     "useradd --system --uid 10001", "useradd --system --uid 1000 --non-unique", "deploy", D_USER),
    ("D03 the photo user gets a shell", DOCKER,
     "--shell /usr/sbin/nologin tadayo-image", "--shell /bin/sh tadayo-image", "deploy", D_USER),
    ("D04 the worker keeps a fourth capability", FLY,
     WORKER_CMD, WORKER_CMD.replace("+kill", "+kill,+sys_ptrace"), "deploy", D_PROC),
    ("D05 the worker can gain privileges", FLY,
     WORKER_CMD, WORKER_CMD.replace(" --no-new-privs", ""), "deploy", D_PROC),
    ("D06 the worker's groups stay root's", FLY,
     WORKER_CMD, WORKER_CMD.replace(" --groups=node", ""), "deploy", D_PROC),
    ("D07 the API keeps its capabilities", FLY,
     API_CMD, API_CMD.replace(" --bounding-set=-all", ""), "deploy", D_PROC),
    ("D08 the API's real user stays root", FLY,
     API_CMD, API_CMD.replace("--reuid=node --regid=node", "--euid=node --egid=node"), "deploy", D_PROC),
    ("D09 no photo user is named", FLY,
     '  TADAYO_PHOTO_USER = "tadayo-image"\n', "", "deploy", D_ENV),
    ("D10 a bare run starts the API as root", DOCKER,
     API_CMD_DOCKER, 'CMD ["node", "services/api/src/main.ts"]', "deploy", D_CMD),
    # Round 1 of PR #118's review (the third commit).
    # The inspector off (F1/S1): SIGUSR1 opens nothing in the sweep or a photo's process.
    ("I01 the sweep's inspector left on", PRIV,
     "spawn(process.execPath, [NO_INSPECTOR, \"-e\", program], {", "spawn(process.execPath, [\"-e\", program], {",
     "priv", H_USR1),
    ("I02 a photo's process's inspector left on", PROCESS,
     "spawn(process.execPath, [NO_INSPECTOR, fileURLToPath(", "spawn(process.execPath, [fileURLToPath(", "priv", H_PROBE),
    ("I03 the flag another than --disable-sigusr1", PRIV,
     'export const NO_INSPECTOR = "--disable-sigusr1";', 'export const NO_INSPECTOR = "--no-warnings";', "priv", H_USR1),
    # The sweep's loop and what it leaves (S2, S3).
    ("W12 the sweep sends one SIGKILL to all and doesn't look again", PRIV,
     '  "} while (alive());",', '  "} while (false);",', "privbox", H_FORKS),
    ("W13 the sweep leaves the photo user's files", PRIV,
     """  '    if (String(stat.uid) === uid) remove(dir + "/" + name);',""", """  '    void stat;',""", "priv", H_HOARDS),
    ("W14 the sweep leaves System V objects", PRIV,
     """  'if (objects.length > 0) require("node:child_process").execFileSync("/usr/bin/ipcrm", objects, { stdio: "ignore" });',""",
     "", "priv", H_HOARDS),
    ("W15 the sweep can't empty a read-only folder", PRIV,
     '  "    fs.chmodSync(path, 0o700);",\n', "", "priv", H_HOARDS),
    ("W16 a System V object matched by its owner only, not its maker", PRIV,
     "row[owner] === uid || row[maker] === uid", "row[owner] === uid", "privbox", H_HOARDS),
    ("W17 a System V object matched by its maker only, not its owner", PRIV,
     "row[owner] === uid || row[maker] === uid", "row[maker] === uid", "privbox", H_HOARDS),
    # The sweep at the worker's start (F3).
    ("S02 no sweep as the worker starts", START,
     "      await sweep(photoUser);", "      void sweep;", "priv", H_STARTSWEEP),
    ("S03 a start sweep that fails is ignored", START,
     "      throw new Error(\"worker: the photo user's processes couldn't all be ended as it started\");", "      void 0;",
     "priv", H_STARTFAILS),
    # The group's kill (F4, S6).
    ("K01 a refused group kill is ignored", PROCESS,
     '    if ((error as NodeJS.ErrnoException).code !== "ESRCH") stopWorker(UNKILLABLE_LINE);', "    void error;",
     "process", K_GROUP),
    ("K02 a group that has ended stops the worker", PROCESS,
     '.code !== "ESRCH") stopWorker(UNKILLABLE_LINE);', '.code !== "ENOSUCHCODE") stopWorker(UNKILLABLE_LINE);',
     "process", K_GROUP),
    # Root's kill of a group whose leader was reaped may reach another group: in the box only.
    ("K03 the group killed after the photo's process was reaped", PROCESS,
     "      if (user !== undefined && (child.exitCode !== null || child.signalCode !== null)) return;\n", "",
     "privbox", H_REAPED),
    # A rendition's bytes (F2/S5): baselineJpeg and its use.
    ("J01 any marker taken", PROCESS,
     "    } else if (marker !== 0xdb && marker !== 0xc4) {\n      return false;\n    }", "    }", "process", J_REFUSE),
    ("J02 the frame's size not compared", PROCESS, "|| !sized ||", "||", "process", J_REFUSE),
    ("J03 bytes after the end taken", PROCESS,
     "return after === 0xd9 && next + 2 === bytes.length;", "return after === 0xd9;", "process", J_REFUSE),
    ("J04 12-bit samples taken", PROCESS,
     "bytes[at + 4] === 8 &&", "(bytes[at + 4] === 8 || bytes[at + 4] === 12) &&", "process", J_REFUSE),
    ("J05 a second frame taken", PROCESS, "if (frames > 1 || !sized", "if (!sized", "process", J_REFUSE),
    ("J06 a scan before the frame taken", PROCESS, "      if (frames !== 1) return false;\n", "", "process", J_REFUSE),
    ("J07 no start of image needed", PROCESS,
     "bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8", "bytes.length < 4", "process", J_REFUSE),
    ("J08 a segment past the bytes taken", PROCESS,
     " || at + 2 + length > bytes.length) return false;", ") return false;", "process", J_REFUSE),
    ("J09 a length shorter than its own bytes taken", PROCESS,
     "if (bytes[at] !== 0xff || length < 2 ||", "if (bytes[at] !== 0xff ||", "process", J_REFUSE),
    ("J10 four components taken", PROCESS,
     "(components !== 1 && components !== 3) || ", "", "process", J_REFUSE),
    ("J11 a frame's length not its components'", PROCESS,
     " || length !== 8 + 3 * components) {", ") {", "process", J_REFUSE),
    ("J12 a stuffed byte in the scan taken as its end", PROCESS,
     "if (after === 0x00 || (after >= 0xd0 && after <= 0xd7)) {", "if (after >= 0xd0 && after <= 0xd7) {",
     "process", J_TAKE),
    ("J13 a rendition's bytes not checked", PROCESS,
     "    height <= box.height &&\n    baselineJpeg(bytes, width, height)", "    height <= box.height", "process", J_ANSWER),
    # The image and fly.toml (prlimit, the flag).
    ("D11 the worker without prlimit", FLY,
     WORKER_CMD, WORKER_CMD.replace("prlimit --core=0 --nproc=256 -- ", ""), "deploy", D_PROC),
    ("D12 a worker's core file allowed", FLY,
     WORKER_CMD, WORKER_CMD.replace("--core=0", "--core=unlimited"), "deploy", D_PROC),
    ("D13 the worker's inspector left on", FLY,
     WORKER_CMD, WORKER_CMD.replace("node --disable-sigusr1", "node"), "deploy", D_PROC),
    ("D14 the API's inspector left on", FLY,
     API_CMD, API_CMD.replace("node --disable-sigusr1", "node"), "deploy", D_PROC),
    ("D15 a bare run's API with its inspector on", DOCKER,
     API_CMD_DOCKER, API_CMD_DOCKER.replace('"--disable-sigusr1", ', ""), "deploy", D_CMD),
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
