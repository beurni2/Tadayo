# api · B2 · worker-turn: the worker takes its own user itself, so it starts on Fly

Branch `api/b2-worker-turn`, from `main` at `1bc0f8a` (PR #132's merge, `2c00d6e`, then the ios lane's PR #129).
`services/worker`, `fly.toml`, `tools/ops/src/deploy-files.test.ts` and the records: no migration, no contract change,
no workflow file, nothing the API runs.

## 0. What happened

- PR #132 made the worker's refusal of a start say what it found. The one start after its merge (`ops` run
  45580733751, 08:57 UTC on 2026-11-25, on the founder's "Merge and start once" at 08:41 UTC) printed, at each of the
  four runs Fly gave the Machine:

  > worker: in production it starts only as fly.toml's worker command starts it, root turned to its own user, never
  > as root alone or as one user alone (it found uid 0, euid 0, egid 0, NoNewPrivs 1, CapBnd 00000000000000e0, CapInh
  > 0000000000000000, Groups 1000)

  The stop run (45581038712) found the worker Machine already stopped.
- Every fact `startedAsFly` reads is as fly.toml's command leaves it: `setpriv` ran, set `node`'s group as the only
  group, emptied the inheritable set, cut the bounding set to setuid, setgid and kill, and set no new privileges. Only
  the effective user and group are root's, where `setpriv --euid=node --egid=node` had made them `node`'s.
- That is Linux's own rule for a set-id program under no new privileges. At an exec, `security/commoncap.c`
  `cap_bprm_creds_from_file` takes the new program for a set-id one when its effective uid differs from the real one
  (`__is_setuid`: `new->euid` against `old->uid`), and with no new privileges it then puts the effective ids back to
  the real ones (`new->euid = new->uid; new->egid = new->gid`). The worker's real uid is root's on purpose (ADR-038),
  so on Fly the exec of `node` that ends `setpriv` gives back uid 0, euid 0, egid 0. A later change, "security/commoncap:
  don't assume "setid" if all ids are identical" (Max Kellermann, proposed in March 2025;
  `https://patchwork.kernel.org/series/940907/mbox`), downgrades only when the exec itself changes an id, and a kernel
  with it keeps the ids `setpriv` set: this session's (Linux 6.18) does, as `setpriv --euid=1000 --egid=1000
  --groups=1000 --inh-caps=-all --bounding-set=-all,+setuid,+setgid,+kill --no-new-privs -- grep … /proc/self/status`
  shows here (`Uid: 0 1000 1000 1000`), and so did Docker on this machine (`docs/plans/api-b2-worker-crash-report.md`).
  The change is first in Linux 6.17 (`security/commoncap.c` in 6.16 still has `is_setid = __is_setuid(new, old) ||
  __is_setgid(new, old)`; 6.17 and 6.18 have `id_changed`; round 1 of PR #135's review). Fly's kernel evidently lacks
  it: its version wasn't read, only what it did. That is why the same command passed every test and was refused on
  Fly.
- Nothing `setpriv` can do avoids it: any exec under no new privileges with an effective id other than the real one
  is downgraded on such a kernel, so the effective ids can be taken only after the last exec, by Node itself. The
  API isn't touched by it: its command (`setpriv --reuid=node --regid=node …`) sets the real, effective and saved ids
  together, so its exec changes no id, and the API has run on Fly since ADR-038.

## 1. The change

- `fly.toml`'s worker command loses `--euid=node --egid=node`; everything else stays:
  `prlimit --core=1 --msgqueue=0 --nproc=256 -- setpriv --groups=node --inh-caps=-all
  --bounding-set=-all,+setuid,+setgid,+kill --no-new-privs -- node --disable-sigusr1 services/worker/src/main.ts`.
  The exec of `node` then changes no id, so every kernel gives the same start: uid, euid and egid 0, `node`'s group as
  the only group, no new privileges, the bounding set setuid, setgid and kill (as root's exec, the permitted and
  effective sets are that set), no inheritable capability.
- `services/worker/src/privileges.ts` `turnToWorkerUser(ids, status, passwd, calls)`: when the ids are root's (uid,
  euid and egid 0) and `startedAsFly(status)` holds, it reads `WORKER_USER` (`node`) from `/etc/passwd` (a whole name,
  seven fields, a uid and a gid that are ids, neither 0), requires the start's groups to be `node`'s group alone, as
  `--groups=node` leaves them, and takes `node`'s effective group, then its effective user (`process.setegid`, then
  `process.seteuid`; glibc sets both for every thread). Then it reads every thread's status (`threadStatuses`, from
  `/proc/self/task`) and requires each to be the worker's mode exactly (`turnedAsFly`): `startedAsFly`'s facts still;
  `Uid` and `Gid` `0 <node> 0 <node>`; `node`'s group alone; no capability effective or ambient; setuid, setgid and kill
  permitted (`FLY_BOUNDING_SET`). Linux leaves exactly that as the effective uid leaves 0 with the real one 0, unless a
  start set `SECBIT_NO_SETUID_FIXUP`, which no `/proc` field shows and which would leave the three effective (round 1
  of PR #135's review); the check catches that too. While a thread isn't, it reads them all again, 10 ms apart, up to
  `TURN_READINGS` (100) readings in all, about a second (`pauseFor`, an `Atomics.wait`), and only a thread still wrong
  at the last stops the worker: glibc's calls change every thread but one that is ending, which leaves
  `/proc/self/task` once it has gone (section 6). A reading counts only when it holds as many statuses as the kernel
  counts threads (`threadCount`, the `Threads` field of `/proc/self/status`), read before the listing and after: a
  listing of that folder can leave out a live thread while one ahead of it is released (round 2 of the review, R2-8).
  In the image, a start already in the worker's mode (as `setpriv --euid --egid` leaves it on a kernel that keeps
  them) is refused at the turn, with the line "worker: in production it starts as root, as fly.toml's worker command
  leaves it, and takes node's effective group and user itself, never started with them (it found …)": it would pass
  `photoUserFor` without the turn's checks (R2-2). In the image (Docker on this machine, fly.toml's drop and then the
  turn), `/proc/self/status` then reads `Uid: 0 1000 0 1000`, `Gid: 0 1000 0 1000`, `CapPrm 00000000000000e0`,
  `CapEff 0000000000000000` and `NoNewPrivs 1`. The saved ids stay 0, which gives nothing the real ids, 0, don't
  already, and takes one thing away: a process running as `node` can no longer signal the worker, as Linux compares a
  sender's ids with the target's real and saved uid (`kernel/signal.c` `kill_ok_by_cred`). Nor can it read the worker's
  environment or memory, or attach to it: Linux's `ptrace_may_access` compares the caller's ids with every one of
  the worker's, its real and saved uid 0 among them, whatever `fs.suid_dumpable` says. `/proc/self/environ` is
  also root's unless that setting is 1: Linux makes a process whose effective ids change non-dumpable then
  (`commit_creds`) and gives a non-dumpable process's `/proc` files to root (`task_dump_owner`). The setting is the
  kernel's, 0 in the session and in Docker here; Fly's isn't read (round 2 of the review, section 7; section 8). The
  root harness has always taken the worker's mode this way, in process (`privileges-harness.ts` `takeWorkersMode`),
  and there a photo's process finds the worker's environment, memory and standard output `EACCES` ("a photo's process
  is the photo's user alone, with no capability, and can't reach the worker"). Any other start is left as it is, for
  `photoUserFor` to judge as now. It throws, changing nothing, when `/etc/passwd` can't be read, when `node` isn't a
  user of its own there, or when the groups aren't `node`'s alone; and throws when a call fails, saying its error code
  alone (`EPERM`), or when a thread isn't then as required, saying what that thread's status holds (its ids, groups and
  capability sets, each value kept to what a field holds, as PR #132's refusal does). Each line is the worker's own.
- `services/worker/src/turn.ts`, new, calls `turnOrStop` (in `privileges.ts`, so the tests can call it), which calls
  `turnToWorkerUser` and on a throw writes the line alone, or a fixed line of its own for anything not the worker's,
  and exits 1 (`stopWorker`). `services/worker/src/main.ts` imports it first
  (`import "./turn.ts";`): Node evaluates a module's imports in order, each with its own imports first, and `turn.ts`
  imports only `./privileges.ts`, which imports only Node's own modules, so no other module of the worker's, and no
  package it uses, runs before the turn (measured with Node 26.13.0: a first side-effect import runs before a later
  import's CommonJS dependency, a top-level await and a local `.cjs`; both reviewers of round 1 measured it again, one
  in the worker itself with a line at the top of `generation.ts`, `connection.ts` and `packages/domain/src/index.ts`;
  and since round 2, a test runs `main.ts` with a load hook that records each module's code as it starts and the end
  of the turn). That holds for the worker's modules and its packages', not for Node's own: Node loads each module of
  its own that any of them names as it links the graph, before any of theirs runs, so their code runs as root before
  the turn, and `node:tls`, named by `postgres`, starts a thread there that reads the system's root certificates and
  ends about 3 ms after the turn (round 2 of the review, R2-7; section 6).
- `photoUserFor`, `startedAsFly`, `inWorkerMode`, `asRoot` and the sweep don't change. The refusal's text doesn't
  either.
- What this gives up, for ADR-038 to say (its consequence "No Node code runs as root: `setpriv` drops before Node
  starts"): from the exec of `node` until `turn.ts` runs, Node's own start-up runs as root (euid 0), with setuid,
  setgid and kill alone effective, no new privileges, reads the worker's modules from the image and loads every module
  of Node's own that they name, among them `node:tls`, whose thread reads the system's root certificates. It reads no
  photo and no network in that time. As no id changes at that exec, the kernel doesn't mark it secure (`AT_SECURE` 0), so
  Node honours the settings it reads from its environment (`NODE_OPTIONS`, which could load code before `turn.ts`,
  `NODE_EXTRA_CA_CERTS`, `OPENSSL_CONF`) and glibc its own (`LD_*`, `GLIBC_TUNABLES`), as root (round 1 of PR #135's
  review, measured there with a `NODE_OPTIONS=--import` file). The image's `ENV` and fly.toml's `[env]` set none of
  them: `deploy-files.test.ts` holds each to its names ("makes the photo user, tadayo-image, …" and "has only public
  values in [env] …"); the rest of the environment is Fly's secrets, which the founder sets, and whoever could set one
  could already run code as root through `LD_PRELOAD` into `prlimit` or `setpriv`, so nothing new is reachable. ADR-038
  gets a note, "As found on Fly", for the founder's answer with the PR.

## 2. Tests (seen failing first on `main`'s code; the second commit's after round 1 of the review)

- `privileges.test.ts`, describe "the worker's own user, taken as it starts (turnToWorkerUser)", whose fake calls
  (`recordedCalls`) give back each thread's status as Linux would leave it:
  - "takes node's effective group, then its effective user, when started as fly.toml starts it": the calls in that
    order; the status after is the worker's mode, which `photoUserFor` then takes, naming `tadayo-image`; a `node`
    whose uid and gid differ (1000 and 1001: the group's id to `setegid`, the user's to `seteuid`); `Groups` with or
    without the kernel's trailing space.
  - "reads the threads' statuses again while one is ending, as glibc's calls leave it, and turns once it has gone"
    (the third commit): a second thread with `node`'s effective group and root's effective user, there for 1, 2 and 99
    readings, then gone, turns, with that many pauses of 10 ms; one there at the 100th reading stops the worker with
    what it found; and `pauseFor` blocks. Since round 2: a listing short of the kernel's count by a live thread (for
    1, 2 and 99 readings) or by one that ended while it was read (1 and 3) turns after that many pauses, and one still
    short at the 100th stops the worker, saying the counts ("it read 1 threads' statuses where the process had 2, then
    2 threads").
  - "leaves any other start as it is, for photoUserFor to judge, and reads no /etc/passwd for it, but in the image one
    already in the worker's mode" (named so since round 2): outside the image, 17 starts, none
    calling anything: the worker's mode already; root alone; a user alone; root's real ids with another's effective
    uid or group; a real uid not root's; and root's ids with each of `startedAsFly`'s facts changed or missing
    (`NoNewPrivs` 0 or missing, three other bounding sets or none, an inheritable capability or none, root's group
    first or last, no `Groups`); in the image, the same 17 are still left to `photoUserFor` (and whether it is the
    image isn't asked of them) but the worker's mode, which throws the line in section 1, calling nothing.
  - "reads each thread's status from the task folder, leaving out a thread that has gone and throwing on anything else,
    and the kernel's count of them" (round 2, R2-1): this process's own statuses, more than one, each with a `Pid` of a
    listed thread and the `Tgid` of this process; a folder made like `/proc/self/task` where one thread has no status
    (left out) and then a status that is a folder (`EISDIR`, thrown), and a missing folder (`ENOENT`, thrown); the
    calls the worker makes are Node's `setegid` and `seteuid`, `threadStatuses`, `threadCount` and `pauseFor`
    (`processTurnCalls`); `threadCount` is this process's number of statuses, reads `Threads`, and throws when it is
    missing, empty, longer than seven digits, negative or not a number.
  - "stops the worker, changing nothing, when node isn't a user of its own in /etc/passwd or its groups aren't node's
    group alone": no `node`, `nodejs` alone (whole names only), `node` as root or in root's group, a uid that isn't a
    number, a group of -1, an entry short of seven fields, an `/etc/passwd` that can't be read (the worker's line, not
    the error's), and six other groups (none, a blank, `node`'s and another, another alone, either order).
  - "stops the worker, saying what it found, when a call fails or a thread isn't then the worker's mode exactly":
    either call ignored; the real uid changed with the effective one; the file system uid or gid left 0, and a thread
    whose `NoNewPrivs`, `CapInh` or `CapBnd` changed (round 2, R2-4); the effective set kept (as under
    `SECBIT_NO_SETUID_FIXUP`), with the whole line; a second thread whose ids didn't change; another permitted set, an
    ambient capability, no `CapAmb`; a value with other characters (each a `?`), and one longer than 64 characters,
    cut there (R2-4); the kernel's count that can't be read; a call refused with `EPERM` (its code
    alone, never the error's message), one whose code isn't an errno's, one with none; threads that can't be read, and
    none.
  - "as the worker's first act, stops it with the turn's own line, or a fixed one for any other error, never its
    words" (`turnOrStop`): nothing stops after a turn or no turn; a line of the worker's is written as it is; Node's
    own message, one holding a database URL, one that starts with a space or `Worker`, a string and nothing thrown
    each give the fixed line.
  - "is the worker's first act: main.ts imports turn.ts before any other module, and turn.ts reaches only Node's own":
    every static module request (an import, a re-export, one with attributes): `main.ts`'s first is `./turn.ts`,
    `turn.ts`'s only one `./privileges.ts`, and `privileges.ts`'s all `node:` modules; and no `import(`, `require(` or
    `createRequire` in either, but the sweep's own program, a string run in a process of its own; and, since round 2,
    `turn.ts`'s code past its comments is the import and `turnOrStop();` alone.
  - "and every module Node resolves as it runs turn.ts is Node's own, but turn.ts and privileges.ts": `node --import`
    a resolve hook (`module.registerHooks`), which sees every import, re-export and `require`, then `turn.ts` itself.
  - "and as main.ts runs, no code of the worker's or of its packages' but privileges.ts's and turn.ts's runs before the
    turn has ended" (round 2, R2-3): `node --import` a load hook that puts a line first in each module it loads (which
    records the module as its code starts) and one last in `turn.ts` (the turn's end), then `main.ts`, which stops at
    `DATABASE_URL`: the records before the turn's end are `privileges.ts` and `turn.ts`, in that order; every module
    loaded had a source to change; the rest include `start.ts` and packages, with `main.ts` last. Node's own modules
    aren't recorded, as they load as Node links the graph (section 1). Since the fifth commit (section 8, N4) the hook
    changes ES modules alone, putting its line after a `#!` line where one comes first; a CommonJS module, whose
    `"use strict"` a line put first would undo, is listed apart with any module that has no source, and none is (a
    scratch run of the same hook lists a `.cjs` module apart and records an ES module that starts with `#!`).
- The root harness (`privileges-harness.ts`, `real-child-inside`): fly.toml's worker command runs exactly as fly.toml
  has it, with `/etc/passwd` and `/etc/group` given a `node` of the harness's unused id (64998), each bound read-only
  over the original in its own mount namespace, where it changed the command's user name before. "in the image,
  fly.toml's worker command itself goes past the photo user's check, and each start short of it stops there": the
  words it ran are fly.toml's own (the harness reports them); the start goes on to `DATABASE_URL`, its first setting,
  so the turn happened (the start is root's, and `photoUserFor` takes only the worker's mode); the same command with
  no `node` in `/etc/passwd` stops with the turn's line alone; each of the six starts short of it is refused, its line
  naming what the kernel says of the flag left out or widened, now with uid, euid and egid 0. Since round 2, two more
  starts: fly.toml's command with `--securebits=+no_setuid_fixup` before `--no-new-privs` stops with the turn's line
  and the whole status, `CapEff 00000000000000e0` (R2-1), and fly.toml's command before this PR
  (`--euid=node --egid=node` before `--groups=node`), kept on this kernel, is refused at the turn with the line of
  section 1 (R2-2).
- `tools/ops/src/deploy-files.test.ts`: the worker's command as above, and a new test, "changes no id at the exec of
  either group's Node, so no kernel puts one back under no new privileges": the API's `setpriv` sets exactly
  `--reuid=node --regid=node`, and the worker's sets no user or group id (nothing matching `--uid=`, `--euid=`,
  `--ruid=`, `--reuid=` or their `gid` forms), keeping `--no-new-privs` and `--groups=node`. The tests that hold the
  image's `ENV` and fly.toml's `[env]` to their names now say why it matters here too (section 1, what this gives up).

## 3. After the merge

One `ops` `worker-scale --to started` from `main`, only on the founder's yes, with `dev` claimed through the
coordinator (and `--to stopped` if it fails). It should print `worker: started, … each photo under a user of its own`.
Then spikes S1's and S2's device runs can go ahead.

## 4. Breakages

Each run against `privileges.test.ts`, `start.test.ts` and `deploy-files.test.ts`, with the file restored and checked
after (a script in the session's scratch folder, not committed). All eleven were caught. K12 to K30 are round 1's
(section 5), run the same way at the second commit; all were caught, K22 only once `turnOrStop` moved into
`privileges.ts` and had its own test (it survived its first run, when the line's choice was in `turn.ts`). K31 to K34
are the third commit's (section 6), each caught by the unit tests named; the root harness's tests also failed in those
runs, but another run of the harness was going on in the session at the same time (round 2's reviewer, with the same
users), so those failures aren't counted. K35 to K50 are round 2's (section 7), run at the fourth commit's tree with no
other harness running: all were caught, K43 only once the file system uid and gid had a case each (it survived its
first run, when one case left both at 0 and the gid's check caught it alone). K51 is the fifth commit's (section 8),
run with K35 to K50 again at its tree, with no other harness running: all seventeen were caught.

| | Breakage | Caught by |
|---|---|---|
| K01 | `turnToWorkerUser` turns any root start, not only `startedAsFly`'s | 7 tests: "leaves any other start as it is …", five of `start.test.ts`'s and the harness's fly start, whose root starts short of fly.toml's were then taken for the turn (stopping at it, as the session has no `node` in `/etc/passwd`, or turned) instead of reaching their own check |
| K02 | `seteuid` before `setegid` | "takes node's effective group, then its effective user …", "stops the worker when the ids after aren't …", and the harness's fly start (the effective uid, no longer 0, can't set the group) |
| K03 | No check of the ids after | "stops the worker when the ids after aren't …" |
| K04 | `main.ts` doesn't import `turn.ts` | "is the worker's first act …", and the harness's fly start (refused as root) |
| K05 | `main.ts` imports `turn.ts` after `generation.ts` | "is the worker's first act …" |
| K06 | No refusal of a `node` that is root or in root's group | "stops the worker, changing nothing, when node isn't a user of its own …" |
| K07 | fly.toml's worker command sets `--euid=node --egid=node` again | three of `deploy-files.test.ts`'s, among them "changes no id at the exec of either group's Node …", and the harness's test, though not at its fly start, which this session's kernel lets through: at its `withoutNoNewPrivs` start, whose line then shows `euid 64998` (round 1 of PR #135's review) |
| K08 | A call that throws isn't turned into the worker's own line | "stops the worker when the ids after aren't …" (the `EPERM` case) |
| K09 | `privileges.ts` imports a module of the worker's (`./safety.ts`) | "is the worker's first act …" |
| K10 | An entry short of seven fields is taken | "stops the worker, changing nothing, when node isn't a user of its own …" |
| K11 | No check that the entry's uid and gid are ids | "stops the worker, changing nothing, when node isn't a user of its own …" |
| K12 | `turnedAsFly` doesn't check `CapEff` | "stops the worker, saying what it found, …" |
| K13 | `turnedAsFly` doesn't check `CapAmb` | "stops the worker, saying what it found, …" |
| K14 | `turnedAsFly` doesn't check `CapPrm` | "stops the worker, saying what it found, …" |
| K15 | `turnedAsFly` checks the effective uid alone, not all four of `Uid` | "stops the worker, saying what it found, …" |
| K16 | The turn checks the first thread's status alone | "stops the worker, saying what it found, …" |
| K17 | No check of the groups before the turn | "stops the worker, changing nothing, when node isn't a user of its own … or its groups aren't …" |
| K18 | `setegid` given `node`'s uid | "takes node's effective group, then its effective user, …" (the `node` of 1000 and 1001) |
| K19 | The entry's uid and gid read the other way round | "takes node's effective group, then its effective user, …" |
| K20 | A user whose name starts with `node` is taken | "stops the worker, changing nothing, …" (`nodejs`) |
| K21 | A failed call's line says the error's message, not its code | "stops the worker, saying what it found, …" |
| K22 | `turnOrStop` passes on any error's message | "as the worker's first act, stops it with the turn's own line, …" |
| K23 | `turn.ts` doesn't call `turnOrStop` | the harness's fly start (refused as root), with no `node` in `/etc/passwd` |
| K24 | An `/etc/passwd` that can't be read throws Node's own error | "stops the worker, changing nothing, …" |
| K25 | `privileges.ts` re-exports from `./safety.ts` | "is the worker's first act …" and "and every module Node resolves …" |
| K26 | `turn.ts` re-exports everything from `./safety.ts` | "is the worker's first act …" and "and every module Node resolves …" |
| K27 | The harness runs fly.toml's command with another group | the harness's test (the words it ran aren't fly.toml's) |
| K28 | No check that any thread's status was read | "stops the worker, saying what it found, …" |
| K29 | `turnOrStop` catches the error and stops nothing | "as the worker's first act, stops it …" and the harness's start with no `node` in `/etc/passwd` |
| K30 | `turnOrStop`'s fixed line says the error | "as the worker's first act, stops it …" |
| K31 | No second reading: a thread wrong at the first stops the worker | "reads the threads' statuses again …" and "stops the worker, saying what it found, …" |
| K32 | One reading more than `TURN_READINGS` | "reads the threads' statuses again …" and "stops the worker, saying what it found, …" |
| K33 | No pause between readings | "reads the threads' statuses again …" and "stops the worker, saying what it found, …" |
| K34 | `pauseFor` doesn't block | "reads the threads' statuses again …" (`pauseFor` timed) |
| K35 | No refusal of a start already in the worker's mode in the image | "leaves any other start as it is, … but in the image one already in the worker's mode" and the harness's fly start (`alreadyTurned` goes on) |
| K36 | That refusal outside the image too | "leaves any other start as it is, …" |
| K37 | The turn's own test of the image always says no | the harness's fly start (`alreadyTurned`): the unit tests pass the image's test themselves |
| K38 | `threadStatuses` throws when a thread's status has gone (`ENOENT`) | "reads each thread's status from the task folder, …" |
| K39 | `threadStatuses` swallows every error | "reads each thread's status from the task folder, …" (`EISDIR`) |
| K40 | `threadStatuses` reads the process's status for each thread | "reads each thread's status from the task folder, …" (each `Pid` a listed thread's) |
| K41 | `turnedAsFly` doesn't hold each thread to `startedAsFly`'s facts | "stops the worker, saying what it found, …" (`NoNewPrivs`, `CapInh`, `CapBnd`) |
| K42 | The turn's line doesn't cut a value at 64 characters | "stops the worker, saying what it found, …" |
| K43 | `turnedAsFly` doesn't check the file system uid | "stops the worker, saying what it found, …" (once the uid had a case of its own) |
| K44 | `main.ts` imports `turn.ts` after `generation.ts` (K05 again) | "is the worker's first act …" and "and as main.ts runs, no code of the worker's … runs before the turn has ended" |
| K45 | `turn.ts` defers the turn (`setImmediate`) | "is the worker's first act …" (`turn.ts`'s code) and the harness's fly start (refused as root) |
| K46 | The harness's `alreadyTurned` start is fly.toml's own | the harness's fly start |
| K47 | No check of the kernel's count of threads | "reads the threads' statuses again …" |
| K48 | The count read after the listing alone | "reads the threads' statuses again …" (a thread that ended while it was read) |
| K49 | The worker's count taken from the listing itself | "reads each thread's status from the task folder, …" (`processTurnCalls`) |
| K50 | `turnedAsFly` doesn't check the file system gid | "stops the worker, saying what it found, …" |
| K51 | A status with no thread count stopped with the line for a status that couldn't be read | "stops the worker, saying what it found, …" (`threadCount` on a status with no `Threads`) |

## 5. Review, round 1 (PR #135, at `0784c35`)

Two fresh subagents that hadn't seen the work, given the code and the tests: one on privacy and security (the
kernel's rules, read in its source for 5.4, 6.1, 6.16, 6.17 and 6.18, and measured in the session and in the pinned
base image), one on correctness and the tests' power (23 mutations of its own, an `strace` of fly.toml's command, a
line at the top of three of the worker's modules). Neither found a blocker, a high or a way past the isolation: the
exec of `node` changes no id on any kernel, a photo's process reaches nothing new, and all ten of the worker's threads
(V8's and libuv's among them) change together. Each finding, fixed in the second commit or answered:

- S-L1 (low): a failed turn said nothing of what it found, where PR #132 was written because a refusal said nothing.
  Fixed: the line says the failed call's error code alone, or what the thread's status holds.
- S-L2 (low): only the ids were checked after the turn. A start with `SECBIT_NO_SETUID_FIXUP`, which no `/proc` field
  shows, kept setuid, setgid and kill effective (measured). Fixed: every thread's status is checked (`turnedAsFly`).
- S-L3 (low): as no id changes at the exec, Node honours `NODE_OPTIONS` and the like as root before `turn.ts` (measured
  with a `--import` file), which the records' "no package runs before the turn" and "it reads no setting" left out.
  Answered in section 1, `turn.ts`'s header, ADR-038's note and two tests' comments: the image and fly.toml set none,
  each held to its names; Fly's secrets are the founder's; nothing new is reachable.
- S-N1 and E-M2 (nit, medium): the first-act test saw only `import` lines, so a re-export from `./safety.ts` passed.
  Fixed: every static module request, no dynamic `import(` or `require(`, and the graph as Node resolves it.
- S-N2 and E-L6 (nit, low): the comment said `node`'s group was the only group, which nothing checked. Fixed: the turn
  requires it, before and after.
- S-N3 (nit): the kernel change is first in 6.17; the saved uid 0 also takes away a process of `node`'s signalling the
  worker. Fixed in section 0, section 1 and `docs/LIMITATIONS.md`.
- E-M1 (medium): `node`'s uid and gid were the same in every test, so a mix-up passed. Fixed: a `node` of 1000 and 1001.
- E-M3 (medium): `turn.ts`'s failure path had no test. Fixed: the harness runs fly.toml's command with no `node` in
  `/etc/passwd` and expects the turn's line alone, and the line's choice, now `turnOrStop` in `privileges.ts`, has a
  test of its own (K22 found the choice untested while it was in `turn.ts`).
- E-L4 (low): the check of the real uid after the turn was never exercised. Fixed: a call that changes it too.
- E-L5 (low): whole-name matching was untested. Fixed: `nodejs` alone is no one.
- E-L7 (low): section 4's K07 row overstated what the harness's fly start catches. Fixed (above).
- E-L8 (low): an unreadable `/etc/passwd` or status would put Node's own message in the line. Fixed: `turnToWorkerUser`
  says its own line, and `turnOrStop` passes on only a line of the worker's.
- E-N9 (nit): stale comments on how the worker reaches its mode. Fixed in the tests, the harness and fly.toml.
- E-N10 (nit): "Fly's kernel is older" was inferred. Fixed: "evidently lacks it; its version wasn't read".
- E-N11 (nit): the harness couldn't show it ran fly.toml's command unchanged. Fixed: it reports the words, which the
  test compares with fly.toml's.

The breakages K12 to K30 are this round's: each a wrong version a finding named, run as K01 to K11 were (section 4).

## 6. `ci` at the second commit (`11b1b75`)

`ci`'s run 45594413681 failed in the root harness's fly start: "worker: it couldn't take node's effective group and
user as it started (it found Uid 0 0 0 0, Gid 0 64998 0 64998, Groups 64998, NoNewPrivs 1, …, CapEff
00000000000000e0, …)". One thread had taken `node`'s effective group but not its user. glibc's `setegid` and `seteuid`
change each thread through a signal, and skip a thread marked as exiting (`nptl/nptl_setxid.c`, `setxid_mark_thread`):
such a thread runs none of the worker's code again, but keeps its ids, and stays in `/proc/self/task`, until it has
gone. One that began ending between the two calls is exactly what `ci` found. Reproduced in the image (as root, Node
26.13.1, threads of `node:worker_threads` started and ending as `setegid` and `seteuid` ran): in 400 rounds two threads
showed `Uid 0 0 0 0` with `Gid 0 1000 0 1000`, and in 1,500 more, eight threads were wrong at the first reading and each
was gone by the second, 10 ms later. So the turn reads the statuses again while one is wrong, up to about a second
(section 1), and K31 to K34 (section 4) hold that. Which thread ended on `ci`'s runner wasn't found at this commit;
round 2's reviewer found it (R2-7, section 7): besides the main thread, `DelayedTaskScheduler` and four `V8Worker`s,
Node has a thread that reads the system's root certificates, which `node:tls` starts as it is loaded (Node's source:
"Start loading root certificates in a separate thread as early as possible once the tls module is loaded";
`strace -k` showed it made by `node::crypto::StartLoadingCertificatesOffThread` about 140 ms before the turn, and
ending about 3 ms after it). Node loads `node:tls`, named by `postgres`, as it links the worker's graph, so before the
turn. Seen again at the fourth commit, in the image under fly.toml's drop: at the top of `privileges.ts`, `main.ts`'s
graph has seven threads, the seventh a second "node-MainThread" (a thread takes its maker's name), and `turn.ts`
alone has six. A thread still wrong at the last reading stops the worker, as before.

## 7. Review, round 2 (PR #135, at `11b1b75`, then `ff9c85f`)

A fresh reviewer, at full depth, read the second commit and then the third. Each finding is fixed or answered in the
fourth commit; K35 to K50 (section 4) are its breakages.

- R2-1 (medium): `threadStatuses` had no test, and no start set `SECBIT_NO_SETUID_FIXUP` for real. Fixed: it takes its
  folder as an argument, and a test reads this process's threads and a folder made like `/proc/self/task` (section
  2); the harness runs fly.toml's command with `--securebits=+no_setuid_fixup`, and the turn stops it, finding
  `CapEff 00000000000000e0` in a thread.
- R2-2 (low): in the image, a start already in the worker's mode (fly.toml's old command, on a kernel that keeps the
  ids, as Docker's here) skipped the turn and passed `photoUserFor`, without the turn's checks. Fixed: the turn refuses
  it in the image (section 1), with a unit test and the harness's `alreadyTurned` start.
- R2-3 (low): the order of the worker's modules was held only by reading their source. Fixed: a test runs `main.ts`
  with a load hook and holds what runs before the turn has ended, and `turn.ts`'s code is held to its import and call.
- R2-4 (nit): `startedAsFly` inside `turnedAsFly`, the file system ids and the 64-character cut had no case. Fixed
  (section 2).
- R2-5 (nit): the records said the worker is non-dumpable because its effective ids changed; that holds only where
  `fs.suid_dumpable` is 0 (0 in the image and the session; Fly's isn't read). Fixed in `privileges.ts`'s header, the
  Dockerfile, section 1 and ADR-038's note: what keeps a process of another user from the worker's environment and
  memory, and from attaching to it or signalling it, is its real and saved uid 0, which `ptrace_may_access` and
  `kill_ok_by_cred` compare whatever that setting is; the `/proc` files are root's only where it is 0.
- R2-6 (nit): ADR-038's note named the saved uid and not the saved gid, also 0. Fixed.
- libuv's rings (the reviewer's remark, not a finding): rings Node sets up before the turn (io_uring, with no polling
  thread of the kernel's) take the credentials of the thread that submits each request, so after the turn they act as
  `node`. No change.
- R2-7 (medium, records): the thread that ended on `ci` is Node's certificate loader, and the claim that nothing but
  `privileges.ts` and `turn.ts` runs before the turn holds for the worker's modules and its packages', not Node's
  own, which load as Node links the graph. Fixed in `turn.ts`'s header, `privileges.ts` (`TURN_READINGS`), sections
  1 and 6, ADR-038's note and `docs/LIMITATIONS.md`.
- R2-8 (low, defence in depth): a listing of `/proc/self/task` can leave out a live thread when one ahead of it is
  released while it is read (the reviewer measured 891 of 300,000 listings in this session's kernel, Linux 6.18), and
  re-reading gives that up to 100 chances at the moment a thread ends. No harm at this commit (the thread ending is the
  newest, so none comes after it, and glibc leaves no live thread wrong), but the first clean listing won. Fixed: a
  listing counts only when it holds as many statuses as the kernel's `Threads` count, read before it and after
  (`threadCount`); one still short at the last reading stops the worker, saying the counts.
- R2-9 (nit, records): a thread ended by `pthread_exit` or cancelled is marked as exiting before its cleanup runs,
  which would run with the ids glibc skipped; Node's binary uses `pthread_exit`, but no such thread is there at the
  turn. Recorded at `TURN_READINGS`. And section 6 named the session's Node for the image's: 26.13.1. Fixed.

## 8. Fresh check of the fourth commit (PR #135, at `1e263d7`)

A fresh reviewer read `git diff ff9c85f..1e263d7` for the worker, the Dockerfile and fly.toml: the count check, the
refusal in the image, the new tests and the lines the worker writes (T52). No high or medium finding; four nits, each
fixed in the fifth commit, with K51 (section 4) its breakage.

- N1 (nit): the count check finds every live thread while none is created during a reading. A release during it lowers
  the count read after it, so a missed thread could hide only behind as many threads created as released (two
  released, one as the listing passed it, and two created after the first count). None is created at the turn: under
  `strace`, the last thread `main.ts`'s start creates before the turn's reads comes as Node links `postgres`, and a
  25-second churn of threads made and ended (`node:worker_threads`) gave no reading taken that missed one. Fixed:
  `threadCount`'s comment says the bound and why it holds at the turn. No change to the code.
- N2 (nit): `privileges.ts`'s header said the worker's `/proc` files are root's where `fs.suid_dumpable` is 0 "as in
  the image". The setting is the kernel's, not the image's, and `task_dump_owner` gives a non-dumpable process's files
  to root for 2 as for 0. Fixed there, in section 1 and in ADR-038's note: root's unless the setting is 1 (0 in the
  session and in Docker here; Fly's isn't read). R2-5's words in section 7 stay as round 2 left them.
- N3 (nit): a status with no thread count stopped the worker with "its threads' status couldn't be read: no error
  code". Fixed: `threadCount` throws `NO_THREAD_COUNT`, and the turn's line then says "its status had no thread
  count"; the unit test runs the real `threadCount` on a status with no `Threads` field (K51).
- N4 (nit): the order test's hook put its line first in CommonJS modules too, which would undo a `"use strict"`, and
  before a `#!` line, which would not parse. Neither happens today (every module before the stop is an ES module: 76
  TypeScript ones and 10 of `postgres`'s). Fixed: section 2.
- What held, as the reviewer checked it: `Threads` is the kernel's `signal->nr_threads`, changed with the thread list
  under the same locks and read under `siglock`; a listing stops or skips only when a thread is released and never
  lists one twice; a normal start can't be refused forever (live threads' statuses are readable, and Node 26 makes no
  `iou-wrk` threads by default); the refusal in the image comes first and asks the image only of a start already in
  the worker's mode, and every other start there is left to `photoUserFor`, which refuses it; in Docker
  (`tadayo-api-dev:wturn3`) fly.toml's command reached `DATABASE_URL` three times in three, and the old command met the
  refusal; nothing else in the repository starts `main.ts` with `--euid` or `--egid`; Vitest 5.0.5's `toEqual` holds
  functions by identity; the order test caught a `main.ts` that imports `./safety.ts` before `./turn.ts`; the
  `unlisted` and `exitsDuring` cases reach the count check; no assertion was weakened; `alreadyTurned` needs a kernel
  that keeps the ids `setpriv` sets (Linux 6.17 or later) and fails, not skips, on an older one; and the new lines
  carry only the status's facts or numbers (T52).
