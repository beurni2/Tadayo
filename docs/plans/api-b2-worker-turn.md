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
  Fly's kernel is older. That is why the same command passed every test and was refused on Fly.
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
  euid and egid 0) and `startedAsFly(status)` holds, it takes `WORKER_USER`'s (`node`, from `/etc/passwd`) effective
  group, then its effective user (`process.setegid`, then `process.seteuid`; glibc sets both for every thread), and
  checks that the ids are then the real uid 0 and `node`'s effective uid and group. That is the worker's mode
  (`inWorkerMode`), the state `setpriv --euid --egid` left on a later kernel, and Linux clears the effective set as the
  effective uid leaves 0, keeping setuid, setgid and kill in the permitted set (the real uid is 0). In the image
  (Docker on this machine, fly.toml's drop and then the turn), `/proc/self/status` then reads `Uid: 0 1000 0 1000`,
  `Gid: 0 1000 0 1000`, `CapPrm 00000000000000e0`, `CapEff 0000000000000000` and `NoNewPrivs 1`: the saved ids stay
  0, which gives nothing the real ids, 0, don't already. `/proc/self/environ` is then root's: Linux makes a process whose
  effective ids change non-dumpable, as ADR-038 counts on. The root harness has always taken the worker's mode this
  way, in process (`privileges-harness.ts` `takeWorkersMode`), and there a photo's process finds the worker's
  environment, memory and standard output `EACCES` ("a photo's process is the photo's user alone, with no capability,
  and can't reach the worker"). Any other start is left as it is, for `photoUserFor` to judge as now. It throws, and the worker stops before anything else, when
  `node` isn't a user in `/etc/passwd` with an id and group of its own, neither root's, or when the ids after aren't
  the ones asked for.
- `services/worker/src/turn.ts`, new, calls it, and on a throw writes the message alone and exits 1 (`stopWorker`).
  `services/worker/src/main.ts` imports it first (`import "./turn.ts";`): Node evaluates a module's imports in order,
  each with its own imports first, and `turn.ts` imports only `./privileges.ts`, which imports only Node's own
  modules, so no other module of the worker's, and no package it uses, runs before the turn (measured with Node
  26.13.0: a first side-effect import runs before a later import's CommonJS dependency).
- `photoUserFor`, `startedAsFly`, `inWorkerMode`, `asRoot` and the sweep don't change. The refusal's text doesn't
  either.
- What this gives up, for ADR-038 to say (its consequence "No Node code runs as root: `setpriv` drops before Node
  starts"): from the exec of `node` until `turn.ts` runs, Node's own start-up runs as root (euid 0), with setuid,
  setgid and kill alone effective, no new privileges, and reads the worker's modules from the image. It reads no
  setting, no photo and no network in that time. ADR-038 gets a note, "As found on Fly", for the founder's answer with
  the PR.

## 2. Tests (seen failing first on `main`'s code)

- `privileges.test.ts`, describe "the worker's own user, taken as it starts (turnToWorkerUser)":
  - "takes node's effective group, then its effective user, when started as fly.toml starts it": the calls in that
    order, the ids after are the worker's mode, `photoUserFor` then takes `tadayo-image`, and the kernel's four
    spacings of `Groups` all count.
  - "leaves any other start as it is, for photoUserFor to judge, and reads no /etc/passwd for it": 17 starts, none
    calling anything: the worker's mode already; root alone; a user alone; root's real ids with another's effective
    uid or group; a real uid not root's; and root's ids with each of `startedAsFly`'s facts changed or missing
    (`NoNewPrivs` 0 or missing, three other bounding sets or none, an inheritable capability or none, root's group
    first or last, no `Groups`).
  - "stops the worker, changing nothing, when node isn't a user of its own in /etc/passwd": no `node`, `node` as root
    or in root's group, a uid that isn't a number, a group of -1, an entry short of seven fields.
  - "stops the worker when the ids after aren't the real uid 0 and node's effective uid and group": either call
    ignored, and a call the kernel refuses (`EPERM`).
  - "is the worker's first act: main.ts imports turn.ts before any other module, and turn.ts reaches only Node's own":
    `main.ts`'s first import is `./turn.ts`, `turn.ts` imports only `./privileges.ts`, and `privileges.ts` only `node:`
    modules.
- The root harness (`privileges-harness.ts`, `real-child-inside`): fly.toml's worker command now runs exactly as
  fly.toml has it, with `/etc/passwd` and `/etc/group` given a `node` of the harness's unused id (64998), each bound
  read-only over the original in its own mount namespace, where it changed the command's user name before. "in the
  image, fly.toml's worker command itself goes past the photo user's check, and each start short of it stops there":
  the start goes on to `DATABASE_URL`, its first setting, so the turn happened (the start is root's, and `photoUserFor`
  takes only the worker's mode); each of the six starts short of it is refused, its line naming what the kernel says
  of the flag left out or widened, now with uid, euid and egid 0.
- `tools/ops/src/deploy-files.test.ts`: the worker's command as above, and a new test, "changes no id at the exec of
  either group's Node, so no kernel puts one back under no new privileges": the API's `setpriv` sets exactly
  `--reuid=node --regid=node`, and the worker's sets no user or group id (nothing matching `--uid=`, `--euid=`,
  `--ruid=`, `--reuid=` or their `gid` forms), keeping `--no-new-privs` and `--groups=node`.

## 3. After the merge

One `ops` `worker-scale --to started` from `main`, only on the founder's yes, with `dev` claimed through the
coordinator (and `--to stopped` if it fails). It should print `worker: started, … each photo under a user of its own`.
Then spikes S1's and S2's device runs can go ahead.

## 4. Breakages

Each run against `privileges.test.ts`, `start.test.ts` and `deploy-files.test.ts`, with the file restored and checked
after (a script in the session's scratch folder, not committed). All eleven were caught.

| | Breakage | Caught by |
|---|---|---|
| K01 | `turnToWorkerUser` turns any root start, not only `startedAsFly`'s | 7 tests: "leaves any other start as it is …", five of `start.test.ts`'s and the harness's fly start, whose root starts short of fly.toml's were then taken for the turn (stopping at it, as the session has no `node` in `/etc/passwd`, or turned) instead of reaching their own check |
| K02 | `seteuid` before `setegid` | "takes node's effective group, then its effective user …", "stops the worker when the ids after aren't …", and the harness's fly start (the effective uid, no longer 0, can't set the group) |
| K03 | No check of the ids after | "stops the worker when the ids after aren't …" |
| K04 | `main.ts` doesn't import `turn.ts` | "is the worker's first act …", and the harness's fly start (refused as root) |
| K05 | `main.ts` imports `turn.ts` after `generation.ts` | "is the worker's first act …" |
| K06 | No refusal of a `node` that is root or in root's group | "stops the worker, changing nothing, when node isn't a user of its own …" |
| K07 | fly.toml's worker command sets `--euid=node --egid=node` again | three of `deploy-files.test.ts`'s, among them "changes no id at the exec of either group's Node …", and the harness's fly start |
| K08 | A call that throws isn't turned into the worker's own line | "stops the worker when the ids after aren't …" (the `EPERM` case) |
| K09 | `privileges.ts` imports a module of the worker's (`./safety.ts`) | "is the worker's first act …" |
| K10 | An entry short of seven fields is taken | "stops the worker, changing nothing, when node isn't a user of its own …" |
| K11 | No check that the entry's uid and gid are ids | "stops the worker, changing nothing, when node isn't a user of its own …" |
