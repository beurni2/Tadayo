# B2: The worker kept out of a photo process's reach (`api/b2-worker-hardening`)

Step (v2) of the api lane's block (`docs/JOURNAL.md` section 1.2), its own PR before Gate A. It closes what PR #111's
round 4 (R4-2, R4-3's framing) and the check of its fifth commit (C5-1, C5-3) left open, all recorded in
`docs/LIMITATIONS.md`'s row of 2026-11-23 on a photo's process: code that a stranger's bytes took over in a decoder,
running in the photo's own process (`services/worker/src/image-child.ts`), can still reach the worker.

## 0. What it can reach today, and what this PR changes

The photo's process runs as the worker's user (`node`), and answers over Node's channel. So code that took over a
decoder can:

1. read `/proc/<worker>/environ`, which holds the database URL and Storage's service key (T56), and attach to the
   worker or read its memory where the kernel's Yama module doesn't stop it (R4-2; Fly's kernel unchecked; the
   session's kernel has no Yama);
2. open `/proc/<worker>/fd/1` and write into the worker's log (C5-3);
3. end the worker with a frame that isn't Node's serialization, or grow it by up to 4 GiB with a frame that declares a
   huge length, which Node buffers outside any code of the worker's (R4-3, C5-1);
4. start a process in a session of its own, outside the group the worker kills, which outlives the photo (C5-1). While
   it holds the channel mid-frame, Node keeps reading (C5-1). And it stays as the worker's user after the photo, so
   it can attach to the next photo's process, or take its pipes with `pidfd_getfd`, where Yama allows (the next
   person's photo on its way in, its renditions on their way out), or stop the worker with `SIGSTOP`. Neither was in
   the records before this plan. (This plan first said it could open those pipes through `/proc`; they are socket
   pairs, which `/proc/<pid>/fd` won't reopen (`ENXIO`), as round 1's review of PR #118 found.)

This PR closes all four, in two parts:

- **The answer on a pipe of its own (section 1).** No part of this needs the founder: it changes no rule of the image.
- **Each photo under a user of its own (section 2).** The image starts as root so the worker can do this, which is a
  departure from `docs/plans/api-b0-deploy.md` (the image's `USER node`) and from the test that holds it
  (`tools/ops/src/deploy-files.test.ts`, "runs, in the stage that is the image, as an unprivileged user …"). So it is
  ADR-038, proposed, and built only once the founder answers (`CLAUDE.md`, "Sources of truth").

What was measured in the session before this plan (root, Linux 6.18, Node 26.13.0, the pinned base image in Docker):

- A process with real uid 0 and effective uid 64998 (as `process.seteuid` leaves it) has its `/proc` files owned by
  root (`environ` 0400, `fd` 0500). A child it started as uid 64999 got `EACCES` reading its `environ`, `EACCES`
  opening its `fd/1`, `EACCES` reading its `mem`, and `EPERM` signalling it.
- That child started a process with `detached: true` (a session of its own). A process started as 64999 that called
  `kill(-1, SIGKILL)` ended it; nothing of 64999 was left but the zombie its parent hadn't reaped.
- In the pinned base image (`node:26.13.1-trixie-slim`), `setpriv` (util-linux) is at `/usr/bin/setpriv`.
  `setpriv --euid=node --egid=node --groups=node --bounding-set=-all,+setuid,+setgid,+kill --no-new-privs -- node …`
  gives a process with real uid 0, effective uid 1000, no effective capabilities, permitted `CAP_SETUID`, `CAP_SETGID`
  and `CAP_KILL` (0xe0) and nothing else, `NoNewPrivs` 1, and `/proc/self/environ` owned by root. After
  `process.seteuid(0)` its effective set is those three; a process it starts with `{ uid: 10001, gid: 10001 }` runs as
  10001 with no capability at all (permitted, effective and ambient 0) and `NoNewPrivs` 1.
- `setpriv --reuid=node --regid=node --init-groups --inh-caps=-all --bounding-set=-all --no-new-privs` gives uid and
  gid 1000 throughout, every capability set empty, `NoNewPrivs` 1.

## 1. The answer on a pipe of its own

`services/worker/src/image-process.ts` starts the photo's process with `spawn`, not `fork`: no Node channel, its fd 3 a
pipe of the worker's (`stdio: ["pipe", "ignore", "ignore", "pipe"]`), the environment empty (no `NODE_CHANNEL_FD`
either). A new module, `services/worker/src/image-frames.ts`, writes and reads its messages:

- A message is a 4-byte big-endian length, then that many bytes of a JSON object (its header), then the bytes its
  header names. The header is at most `HEADER_BYTES` (4 KiB), and a whole message at most `MESSAGE_BYTES` (32 MiB).
  The largest renditions `image.ts` can make, of noise at quality 80, are 3.97 MiB (`full`, 2560 by 2560) and 2.01 MiB
  (`display`, 1290 by 2560), measured in the session; 32 MiB is five times both.
- A prepared answer's header lists its renditions as `{ kind, width, height, length }`, and their bytes follow in that
  order. No other message carries bytes. JSON over a header of 4 KiB, and bytes copied as they are, replace
  `v8.deserialize`, which builds whatever objects a frame describes: a frame of 32 MiB of small objects would take the
  worker past its Machine, so decoding it in a `try` (the records' first plan) wasn't enough.
- The child sends `ready`, then exactly one of `prepared`, `timeout` or `failed`. The worker reads with a small state
  machine that holds at most one message, never more than `MESSAGE_BYTES` plus one read, and allocates a rendition's
  buffer only once its length is checked against what is left of the message.
- Anything else is a broken answer: a length of 0 or over the caps, a header that isn't a JSON object of one of the
  four kinds with its fields, a message before `ready` or after the answer, a second `ready`, bytes the header doesn't
  name. The worker stops reading at once (it destroys its end of the pipe), kills the child and fails the photo as
  `ImageProcessFailed`, which the outbox tries again (`MAX_ATTEMPTS`, 5). Before, a message that wasn't one of the
  child's kinds, and a second `ready`, were ignored; with the worker's own framing, anything off it means the child
  isn't running the child's code.
- Once the answer is in, the worker stops reading and kills the child's group: it has all it needs, and nothing it
  reads after can change it. The answer stands (`outcomeOf` reads the answer before the signal).
- As the child's end settles, the worker destroys its ends of both pipes, as it does today (C5-2), so a process the
  child started that holds one mid-message is read no more.
- The child (`image-child.ts`) writes its messages to fd 3 and reads it too: the worker never writes there, so the
  end of that read means the worker has gone, and the child kills itself, as Node's `disconnect` does today.

What the child's answer may say doesn't change (`wellFormed`: one rendition of each kind, a JPEG inside its box, or a
rejection's code), nor what a child's end comes to (`outcomeOf`), but for the broken answer above.

## 2. Each photo under a user of its own (ADR-038, approved by the founder at 21:09 UTC on 2026-11-23)

- **The image** creates a system user and group `tadayo-image`, uid and gid 10001, with no home, no shell and no
  password, and ends without `USER node`: each process group's command starts as root and drops at once with
  `setpriv`, so no Node code runs as root.
- **The API** (`fly.toml`'s `api`, and the Dockerfile's `CMD`, which a bare run starts):
  `setpriv --reuid=node --regid=node --init-groups --inh-caps=-all --bounding-set=-all --no-new-privs -- node
  --disable-sigusr1 services/api/src/main.ts`. It runs as `node` with no capability and no way back, as it does today.
- **The worker** (`fly.toml`'s `worker`): `prlimit --core=0 --nproc=256 -- setpriv --euid=node --egid=node
  --groups=node --bounding-set=-all,+setuid,+setgid,+kill --no-new-privs -- node --disable-sigusr1
  services/worker/src/main.ts`. It works as `node`; its real uid stays 0, which makes it non-dumpable, so its `/proc`
  files are the kernel's and no process of another user can read its environment or memory, open its pipes, attach to
  it or signal it. It keeps three capabilities, usable only for an instant at a time. `prlimit` gives it, and every
  process it starts, no core file and at most 256 processes per real user: the kernel doesn't hold root's processes to
  that, so it holds only `tadayo-image`'s (a photo's process can't fill the Machine's process table).
- **No inspector on a signal.** Every Node process of the image (the API, the worker, the photo's process and the
  sweep) runs with `--disable-sigusr1`. Without it, `SIGUSR1` opens Node's inspector on `127.0.0.1:9229`, with no
  password, to anyone on the Machine. A process of `tadayo-image` may signal the photo's process and the sweep, which
  run as that user; round 1's review of PR #118 showed a process left behind doing so to the sweep, then telling it,
  through the inspector, to skip its `kill` and exit 0, which the worker took as done (both reviewers, independently:
  the blocking finding). With the flag, Node keeps `SIGUSR1` blocked in every thread: sent, it stays pending and does
  nothing. The API and the worker can't be signalled by that user, but nothing of them needs it.
- **`fly.toml`'s `[env]`** gains `TADAYO_PHOTO_USER = "tadayo-image"` (public, like the rest of `[env]`).
- **`services/worker/src/privileges.ts`** (new) knows the worker's mode. With `TADAYO_PHOTO_USER` set, the worker
  must have been started as above (real uid 0, effective uid not 0), finds the user's uid and gid in `/etc/passwd`,
  refuses one that is 0 or its own, and prepares photos isolated: `asRoot(fn)` takes effective uid 0 for `fn` alone
  and returns to `node`, and is called from three places, nowhere else: to start the photo's process with the user's
  uid and gid (Node's `spawn` then clears its groups and sets both ids before the child's program runs), to kill its
  process group (once the answer is in, and again as its end settles, unless the child has been reaped by then), and to
  start the sweep below. So it is taken at least four times for each photo, each for one system call. Without `TADAYO_PHOTO_USER` (the tests, CI's runner, the session), it prepares
  photos as it does today, in the worker's own user, and its start line says so. Either without the other (the
  variable but not the start, or the start but not the variable) stops the worker as it starts: neither half alone
  isolates anything.
- **The group's kill, refused.** The worker kills the group as root, so the kernel can refuse it only if something
  is badly wrong; a refusal (anything but `ESRCH`, the group already gone) stops the worker (`killGroupOf`). Once Node
  has reaped the child, the worker doesn't kill the group at all: Linux keeps a pid's number while any process still
  uses it as its group, so the number can't have been reused while one of the group is alive, but once the group is
  empty it may be, and a kill as root then could reach some other process. The sweep reaches what is left.
- **The sweep.** As the child's end settles, after the group's kill, the worker starts one more process as
  `tadayo-image`, which calls `kill(-1, SIGKILL)` until no process of that user is left but itself and zombies (it reads
  `/proc`, each process's `Uid` and `State`): Linux sends it to every process that user may signal, which is every
  process of `tadayo-image` but the sweep itself, in one pass under the kernel's task list lock, so a process forking as
  fast as it can is caught too, and a process with that signal pending never runs another instruction of its own. It
  runs `node -e`, the one program the image is sure to have, with an empty environment. It runs with the worker's own
  group, not `tadayo-image`'s: Linux lets a process attach to another (ptrace, `/proc/<pid>/mem`) only when every user
  and group id of the two match, so a process the photo's process left behind can't take the sweep over that way, and
  with `--disable-sigusr1` it can't open Node's inspector in it either (above). It can still
  stop or kill the sweep, as it may signal any process of its user; so a sweep that fails to start, exits other than 0
  or doesn't exit within 5 s (`SWEEP_SECONDS`) stops the worker (`stopWorker`: one line on standard error, exit 1).
  Fly's `[[restart]]` policy `on-failure` restarts the Machine, and every process on it ends with it; the photo in hand
  comes back once its lease has passed, its attempt counted (`outbox.ts`). Failing only the photo would have left a
  process of `tadayo-image` alive beside the next one. Photos are prepared one at a time (`outbox.ts`, one event at a
  time), so no other photo's process is alive then. The sweep refuses, starting nothing, uid 0, gid 0, and the worker's
  own uid and gid; and its program checks its own user first and exits 2 as root, since `kill(-1)` as root would end
  every process on the Machine (the breakage run found it: with the refusal removed, the harness, run as root, ended
  every process of the session's container, twice; that breakage and one that starts the photo's process as root now
  run in a container of the image, with a process limit of its own).
- **What the sweep leaves.** Once no process of the user is left, the sweep removes what the user owns in `/tmp`,
  `/var/tmp`, `/dev/shm`, `/dev/mqueue` and `/run/lock` (each folder made writable first, so a folder left read-only
  can't keep its files), and every System V shared memory segment, semaphore set and message queue it owns or made
  (`/proc/sysvipc`, then `ipcrm`). Round 1's security review found a process left behind could otherwise pin hundreds
  of MiB in `/dev/shm` or a shared memory segment, so later photos would end past their memory and be refused as
  `too_many_pixels`, with the worker running on.
- **The sweep at start.** The worker sweeps once as it starts, before it connects to the database: a Machine restarted
  by a stop above, or a process left from a run before, has none of that user's processes left before the first photo.
  If that sweep fails, the worker doesn't start.
- **What a photo's process sends back is checked, not trusted.** A rendition is the child's work, so code that took it
  over can send any bytes. The worker keeps a rendition only if it is a baseline JPEG and nothing else
  (`baselineJpeg`): its start, only quantization and Huffman tables besides one 8-bit frame of 1 or 3 components whose
  size is the size the answer states (inside the kind's box), one scan after it whose data holds no marker but stuffed
  bytes and restarts, and its end as the last two bytes. No EXIF, no ICC profile, no comment, no second picture.
  `image.ts` writes exactly that (sharp's `jpeg` with metadata dropped). The picture inside is still the child's: a
  taken-over child could send another picture than the one screened. B3's media route and the iOS app treat
  renditions as untrusted input, and FQ8's screening, when it is built, screens the renditions as stored.
- **What a taken-over decoder can still do:** use the network (no namespace of its own: nothing it can reach is the
  worker's, as it holds no key), write to `/tmp` until the sweep removes it, and use the CPU until its deadline. It can
  also stop or slow the sweep, which stops the worker: the Machine restarts, up to five times for one photo before the
  outbox gives it up, and the day's generation, which runs in the same worker, waits meanwhile. Fly retries a Machine
  that fails a set number of times (`[[restart]]`'s `max_retries`, read on `dev`); past it, the worker stays down until
  someone starts it. Each is noted in
  `docs/LIMITATIONS.md`'s row, which this PR closes for the four points of section 0.

## 3. Tests first

`services/worker/src/image-frames.test.ts` (new), no process: a round trip of each message; every broken input above
refused, byte by byte where it splits across reads; a declared length of 4 GiB refused after its four bytes, with
nothing allocated (the reader's held bytes stay under 64 KiB); a header of 4 KiB plus one byte refused; bytes after the
answer never read.

`services/worker/src/image-process.test.ts`:

- The existing tests, the fake children rewritten for the new pipe. "ignores a message that isn't one of the child's,
  and a second ready" becomes "fails, to be tried again, when the child sends anything but ready and its answer".
- New: a child that sends a frame declaring 4 GiB fails the photo within `GRACE_MS` (2 s), the worker's peak (`VmHWM` of
  `self`) unmoved within 8 MiB; a child that sends a header that isn't JSON fails it, and the worker keeps running; a
  process the child started in a session of its own that holds fd 3 and writes a frame slowly after the child's end is
  read no more once the end settles (the worker's end of fd 3 closed, as C5-2's test checks for stdin).
- "starts with an empty environment" expects one variable, `VIPSHOME`, which `sharp` sets in its own process as it
  loads, and none of the worker's (this plan first said 0).
- A rendition as `prepareImage` writes it is accepted, of each kind and from JPEG, WebP and PNG; and each way out of a
  baseline JPEG is refused: EXIF, JFIF, an ICC profile, a comment, a restart interval, a progressive frame, a second
  frame or scan, 12-bit or four components, a frame of the wrong length or size, a scan before the frame, a fill byte,
  bytes after the end, a second JPEG, no end, a segment longer or shorter than its bytes, no start.
- `killGroupOf`: `ESRCH` is done; any other error stops the worker with its line.

`services/worker/src/privileges.test.ts` (new), and a harness that must run as root: the test file starts it as root
directly when it is root (the session), and through `sudo -n` when it isn't (CI's runner has password-less sudo); a
runner with neither fails the test, never skips it. The harness imports the worker's modules as root, then takes the
worker's mode itself (`process.setgroups`, `setegid`, `seteuid` to an unused uid, 64998), and runs `prepareIsolated`
with the photo user an unused uid (64999) and fake children written to a fresh folder it can read. Each case reports
back as one line of JSON:

- the child can't read `/proc/<worker>/environ` or `mem`, can't open `/proc/<worker>/fd/1`, and can't signal the
  worker (`EACCES`, `EACCES`, `EPERM`);
- a process the child started in a session of its own has ended once the photo's end settles, and so has one that
  forked again and again;
- a child past its memory and a child past its deadline are still killed (the group's kill needs `asRoot`: without it
  `EPERM` would be swallowed and the child would live on);
- the worker's effective uid is back to 64998 after each photo, whatever the photo did;
- `asRoot` refuses outside the worker's mode, and the sweep refuses uid 0, gid 0, and the worker's own uid and gid;
- a sweep that doesn't exit in time (`sweepSeconds` 0.001) stops the worker with its line and exit 1, and the photo's
  end never settles;
- a sweep that exits 3, or is killed by SIGKILL (as a process left behind could kill it), fails with `exit`, never done,
  and one that exits 0 is done (the harness gives `sweep` a program of its own for this: the breakage run found that a
  sweep taking any exit as done passed every other test);
- the sweep runs with the worker's group: a process left behind, watching for it, sees the photo user's uid and the
  worker's gid, and can't open its `/proc/<pid>/mem` (`EACCES`);
- the sweep and the photo's process don't catch `SIGUSR1` (its bit, `0x200`, of `SigCgt` clear); with
  `--disable-sigusr1` Node keeps it blocked in every thread (the bit set in `SigBlk`), so a `SIGUSR1` sent to a sweep
  that waits 3 s stays pending, opens nothing on port 9229, and the sweep exits 0 on its own;
- a child that leaves 1 MiB files and read-only folders in `/tmp` and `/dev/shm`, a shared memory segment, a
  semaphore set and a message queue, and a second segment it gave to another user (the photo user only its maker), is
  prepared, and none of them is left once its end settles, nor a segment root gave to the photo user before the photo
  (the photo user only its owner);
- `startWorker` with the photo user set ends a process of that user left from before, as it starts, before it reaches
  the database; and when its sweep can't finish (a folder of the user's holding a file of root's, which it can neither
  empty nor remove), it stops there, before it connects;
- under a photo user, no group kill once Node has reaped the photo's process: every group `SIGKILL` sent as root is noted
  with whether the group's leader still had its `/proc` entry (alive, or a zombie not yet reaped), and none is sent
  after the reap.

`image-process.test.ts`, with no root: `killGroupOf` is done on `ESRCH` and stops the worker on `EPERM`; `baselineJpeg`
takes `prepareImage`'s own renditions from JPEG, WebP and PNG inputs, restarts and stuffed bytes, and refuses 23
malformed JPEGs (metadata, a thumbnail or a comment, a restart interval, a progressive frame, a second frame or scan,
12-bit samples, four components, a frame's length not its components', a scan before its frame, no frame, a fill byte,
bytes or another JPEG after the end, no end, no start, a start without its `0xFF` or with another marker, a segment
longer than the bytes or shorter than its length, a scan's among them), and two frames of another size than the one
stated; an answer whose rendition isn't one fails.

`photoUserFor`'s rules, with no process: neither half gives none; either half alone throws; a name matches whole
`/etc/passwd` entries only; root, root's group, the worker's own user or group, and ids that aren't numbers are
refused. `start.test.ts`: the worker stops as it starts when `TADAYO_PHOTO_USER` is set and it wasn't started as root.

`tools/ops/src/deploy-files.test.ts`: the image test reads "starts as root only to drop: each process group's command
begins with its `setpriv` line, exactly", the user `tadayo-image` is made with uid and gid 10001 and no shell, and the
Dockerfile's `CMD` is fly's `api` command.

## 4. Verified where

- The session: every test above; the image built with Docker and run as fly runs it, both commands, with the worker
  preparing a photo under `tadayo-image` and the checks of section 3's harness run inside it. Done at 2026-11-23
  ~21:50 UTC, and again at ~22:50 UTC with the tree as committed (the sweep's program refusing root, the harness's
  failing-sweep case): the evidence branch's `api/b2-worker-hardening/<sha>/image/` holds the probes, the photo's run
  and the harness's lines. The harness file ships in the image, as `testing.ts` does (`.dockerignore` leaves out `*.test.ts`
  only); it does anything only when root runs it, and root can do anything already.
- CI: the same tests (the harness through `sudo -n`).
- `dev`, once its worker runs (`ops` `worker-scale`, on the founder's yes): the worker's start line saying it isolates
  photos, a preparation's line, and an `ops` check (`flyctl ssh console` as root) of the worker's `/proc` owner and
  uids. Fly's kernel may differ from the session's, so these are read there, as `tadayo-image` where it matters
  (`setpriv` from a root shell), and recorded, file names and modes only: Yama's `ptrace_scope`, `suid_dumpable`,
  `core_pattern`; whether that user can open `/.fly/api` (a way to Fly's API), read `/.fly` or `/fly`, reach an
  abstract socket or a listener on the loopback, open a console device, make a user namespace or use `io_uring`; the
  worker's limits (`core` 0, `nproc` 256); that a worker that exits takes every process of `tadayo-image` with it (the
  Machine restarts); and Fly's restart policy's retry cap. Round 1's security review gave the commands; what it finds
  open is closed in the image (a folder's mode, `kernel.shm_rmid_forced`, `user.max_user_namespaces`) or recorded,
  before Gate A.

## 5. Records and review

`docs/LIMITATIONS.md` (the row of 2026-11-23 on a photo's process closed for what this PR fixes, and a row for what's
left), `docs/DECISIONS.md` ADR-038, `docs/plans/api-b0-deploy.md` (the runtime stage's user), the journal (block 1.2,
the audit's T52 and T56 rows, table 4.1, a log entry per commit), `docs/PROGRESS.md`. A full-depth review by a fresh
subagent (`docs/GITHUB.md`): it changes how the worker runs and touches T52 and T56. Breakages of `image-frames.ts`,
`image-process.ts` and `privileges.ts`, each caught by a named test.

As run, 2026-11-23: 44 breakages of this part (`photoUserFor`, `asRoot`, the sweep, the photo's process, `start.ts`,
`prepare.ts`, `main.ts`, the Dockerfile and `fly.toml`), each caught by the test it names, the tree's hash the same
before and after. One went uncaught at first (W05, a sweep's exit not 0 taken as done) and has its test now, with W11
(an exit by a signal taken as done). The refusal's four (W01, W07 to W09) are caught by the harness's case in the
session, where the unit test's own ids are root's; on CI's runner the unit test catches them too. The two that would
run something as root without the worker's mode (W01, X01) run in a container of the image with a process limit of
its own. The list and its log go on the evidence branch beside the image's.
