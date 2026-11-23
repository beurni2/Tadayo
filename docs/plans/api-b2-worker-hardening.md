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
   it can open the next photo's process's pipes through `/proc` (the next person's photo on its way in, its
   renditions on their way out) or stop the worker with `SIGSTOP`. Neither was in the records before this plan.

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

## 2. Each photo under a user of its own (ADR-038, proposed)

- **The image** creates a system user and group `tadayo-image`, uid and gid 10001, with no home, no shell and no
  password, and ends without `USER node`: each process group's command starts as root and drops at once with
  `setpriv`, so no Node code runs as root.
- **The API** (`fly.toml`'s `api`, and the Dockerfile's `CMD`, which a bare run starts):
  `setpriv --reuid=node --regid=node --init-groups --inh-caps=-all --bounding-set=-all --no-new-privs -- node
  services/api/src/main.ts`. It runs as `node` with no capability and no way back, as it does today.
- **The worker** (`fly.toml`'s `worker`): `setpriv --euid=node --egid=node --groups=node
  --bounding-set=-all,+setuid,+setgid,+kill --no-new-privs -- node services/worker/src/main.ts`. It works as `node`;
  its real uid stays 0, which makes it non-dumpable, so its `/proc` files are the kernel's and no process of another
  user can read its environment or memory, open its pipes, attach to it or signal it. It keeps three capabilities,
  usable only for an instant at a time.
- **`fly.toml`'s `[env]`** gains `TADAYO_PHOTO_USER = "tadayo-image"` (public, like the rest of `[env]`).
- **`services/worker/src/privileges.ts`** (new) knows the worker's mode. With `TADAYO_PHOTO_USER` set, the worker
  must have been started as above (real uid 0, effective uid not 0), finds the user's uid and gid in `/etc/passwd`,
  refuses one that is 0 or its own, and prepares photos isolated: `asRoot(fn)` takes effective uid 0 for `fn` alone
  and returns to `node`, and is used three times, nowhere else: to start the photo's process with the user's uid and
  gid (Node's `spawn` then clears its groups and sets both ids before the child's program runs), to kill its process
  group, and to start the sweep below. Without `TADAYO_PHOTO_USER` (the tests, CI's runner, the session), it prepares
  photos as it does today, in the worker's own user, and its start line says so. Either without the other (the
  variable but not the start, or the start but not the variable) stops the worker as it starts: neither half alone
  isolates anything.
- **The sweep.** As the child's end settles, after the group's kill, the worker starts one more process as
  `tadayo-image`, which calls `kill(-1, SIGKILL)`: Linux sends it to every process that user may signal, which is every
  process of `tadayo-image` but the sweep itself, in one pass under the kernel's task list lock, so a process forking as
  fast as it can is caught too. It runs `node -e`, the one program the image is sure to have. The photo's end settles
  once the sweep has exited; a sweep that fails to start or doesn't exit within 5 s fails the photo as
  `ImageProcessFailed`. Photos are prepared one at a time (`outbox.ts`, one event at a time), so no other photo's
  process is alive then. The sweep's uid is checked to be neither 0 nor the worker's own before it starts.
- **What a taken-over decoder can still do:** use the network (no namespace of its own: nothing it can reach is the
  worker's, as it holds no key), write to `/tmp` and use the CPU until its deadline. Each is noted in
  `docs/LIMITATIONS.md`'s row, which this PR closes for the four points of section 0.

## 3. Tests first

`services/worker/src/image-frames.test.ts` (new), no process: a round trip of each message; every broken input above
refused, byte by byte where it splits across reads; a declared length of 4 GiB refused after its four bytes, with
nothing allocated (the reader's held bytes stay under 64 KiB); a header of 4 KiB plus one byte refused; bytes after the
answer never read.

`services/worker/src/image-process.test.ts`:

- The existing tests, the fake children rewritten for the new pipe. "ignores a message that isn't one of the child's,
  and a second ready" becomes "fails, to be tried again, when the child sends anything but ready and its answer".
- New: a child that sends a frame declaring 4 GiB fails the photo within a second, the worker's peak (`VmHWM` of
  `self`) unmoved within 8 MiB; a child that sends a header that isn't JSON fails it, and the worker keeps running; a
  process the child started in a session of its own that holds fd 3 and writes a frame slowly after the child's end is
  read no more once the end settles (the worker's end of fd 3 closed, as C5-2's test checks for stdin).
- "starts with an empty environment" expects 0 variables, not at most 1.

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
- `asRoot` refuses outside the worker's mode, and the sweep refuses uid 0 and the worker's own.

`tools/ops/src/deploy-files.test.ts`: the image test reads "starts as root only to drop: each process group's command
begins with its `setpriv` line, exactly", the user `tadayo-image` is made with uid and gid 10001 and no shell, and the
Dockerfile's `CMD` is fly's `api` command.

## 4. Verified where

- The session: every test above; the image built with Docker and run as fly runs it, both commands, with the worker
  preparing a photo under `tadayo-image` and the checks of section 3's harness run inside it.
- CI: the same tests (the harness through `sudo -n`).
- `dev`, once its worker runs (`ops` `worker-scale`, on the founder's yes): the worker's start line saying it isolates
  photos, a preparation's line, and an `ops` check (`flyctl ssh console` as root) of the worker's `/proc` owner and
  uids. Fly's kernel may differ from the session's: Yama, `suid_dumpable`, the `/.fly/api` socket's mode (a socket a
  photo's user could open would be a way to Fly's API) are read there and recorded.

## 5. Records and review

`docs/LIMITATIONS.md` (the row of 2026-11-23 on a photo's process closed for what this PR fixes, and a row for what's
left), `docs/DECISIONS.md` ADR-038, `docs/plans/api-b0-deploy.md` (the runtime stage's user), the journal (block 1.2,
the audit's T52 and T56 rows, table 4.1, a log entry per commit), `docs/PROGRESS.md`. A full-depth review by a fresh
subagent (`docs/GITHUB.md`): it changes how the worker runs and touches T52 and T56. Breakages of `image-frames.ts`,
`image-process.ts` and `privileges.ts`, each caught by a named test.
