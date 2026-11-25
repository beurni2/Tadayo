# B2: The `dev` worker's crash, printed by `ops` itself (`api/b2-worker-crash-report`)

PR #118 (the worker's hardening, ADR-038) merged as `dea360c` at 02:40 UTC on 2026-11-25. Its `deploy-dev` run, 45534683082, updated the API's Machine, then failed on the worker's: flyctl's smoke check said "smoke checks for 84ed273f616468 failed: the app appears to be crashing" and "Check its logs: here's the last lines below, or run 'fly logs -i 84ed273f616468'", and printed no line below it. The re-run passed, with the worker Machine stopped: `flyctl deploy` leaves a stopped Machine stopped, so it doesn't start it to smoke-check it. The worker has stayed stopped since. The image starts and runs in the session with `fly.toml`'s command (Docker, run as Fly runs it), so what fails on Fly is something the session doesn't have.

The founder chose on the card in the api thread at 03:45 UTC to fix it forward. Fly's log can't be read from the session (no `flyctl` runs here: `docs/LIMITATIONS.md`), so the founder was asked at 02:55 UTC for the worker Machine's lines. At 04:01 UTC the coordinator passed on that the founder is away, and asked for the `ops` run to print the crash's lines itself, keeping the ask to the founder as a fallback. That is this PR. It changes only `tools/ops`: no migration, no contract change, no workflow file, nothing the app or the API runs.

Sources: `docs/TECH-DESIGN.md` section 10 (what the session can and can't do), ADR-034 (`ops` on the API's Machine), `docs/plans/api-b0-deploy.md` section 6 (the made-up flyctl the tests use), T52 and T56 (what a log may hold, what an `ops` script may print), and flyctl 0.5.8's source, the version `ops` pins, for what it prints.

## 0. The readings

1. **Print what Fly knows of the Machine, from the run that saw it fail.** Two things say why a process stopped: the Machine's events (`flyctl machine status <id>`, its "Event Logs" table, where each exit carries `exit_code=N,oom_killed=bool,requested_stop=bool`) and its last lines in Fly's log (`flyctl logs -a <app> --machine <id> --no-tail --json`, which prints what Fly's log buffer holds and returns). Both need only the token the `ops` jobs already have. Neither changes anything.
2. **Where: `worker-scale --to started`, and `deploy-branch` when flyctl fails a deploy.** The worker is stopped, so the next deploy won't start it; the run that will show the crash is the founder's `worker-scale` start, which is the step the founder approves before the worker runs on `dev` again in any case. `deploy-branch` (which `deploy-dev` runs on each merge) prints the same for each Machine its failure names, so the next crash at a deploy shows its cause in that run's log.
3. **A start is watched, not taken at its word.** `worker-scale` read the state back until it said `started`, and stopped there. A worker that exits as it starts shows as started first, and Fly restarts it on a failure (`fly.toml`'s `[[restart]]`), so a crash loop can show as started at every look. So once the Machine shows as started, the run watches it for 30 seconds (six looks, five seconds apart; three times flyctl's 10-second smoke check) and then reads its events: the start fails if the Machine is in any other state, or if an exit that Fly wasn't asked for (`requested_stop=false`) is among the events that weren't there before the start (read just before it). An exit Fly was asked for, such as a restart someone asked for, isn't a failure. Either way the run prints the events and the log lines first.
4. **What's printed is bounded and plain.** At most the last 60 log lines, each cut at 400 characters, on one line each, with colours and control characters taken out. Every line goes through the redactor in `tools/ops/src/main.ts` (`output.ts`), as every line an `ops` script says does: it holds back the run's own secret values and the shape of a connection string's user and password, a JSON Web Token, a Supabase secret key and the rest of its patterns. The worker's own lines never carry a secret (T52); a crash's might, which is why this matters.
5. **Nothing here can fail a run that would have passed.** Each read returns nothing, never throws, when flyctl fails, hangs (flyctl's own time limit) or prints what can't be read, and the run then says it couldn't read it. A Machine id that isn't one (14 hexadecimal digits) is never passed to flyctl. The one new way to fail is the watch, which fails a start that crashed, as it should.
6. **No clock.** The watch counts looks, with `sleep` from the entry, as the existing reads do; `ops` reads no clock (T1's one-clock test scans `tools/ops`).

## 1. What changes

- `tools/ops/src/fly.ts`: `MACHINE_ID`; `machineEvents(fly, id)`, the event table's rows (only the rows after its title that carry a time, so the VM table's time above it isn't taken for one); `exitOf(row)`, an exit's code and whether it was asked for or killed for memory; `machineLog(fly, id)`, the last 60 entries of the log, one line each (`time [level] message`); `machineReport(fly, id, label)` and `reportOf(...)`, the lines to print.
- `tools/ops/src/worker-scale.ts`: the refusal of a state that can't move comes before anything is read; a start reads the events first, then watches as reading 3 says (`watchStart`), and a start never seen as started prints the report before its existing error.
- `tools/ops/src/deploy-branch.ts`: `failedMachines(text)`, the Machine ids in the lines of flyctl's output that say something failed, each once; on a failed deploy, each one's report, then the existing error.
- `tools/ops/test/fake-fly.ts`: the worker's id as `deploy-dev` printed it, an event row, `flyctl machine status`'s output and `flyctl logs --json`'s, as flyctl 0.5.8's source prints them.

## 2. Tests

`tools/ops/src/fly.test.ts`, "machineReport: what Fly knows of a Machine's last runs, for a run's log" (8 tests): the calls and their arguments; only the event table's rows; an exit's fields; the log's entries once each, in order, the last 60; one line each, colours and control characters out, a long line cut; a secret a crash printed held back by the redactor; never throwing; nothing asked for an id that isn't a Machine's.

`tools/ops/src/worker-scale.test.ts`, "workerScale to started": a start that holds for 30 seconds, with the calls, the waits and the report; a crash that Fly restarted, which shows as started and fails; old exits from before the start, which don't; an exit Fly was asked for during the watch, which doesn't; a start that stops within the watch; a start never seen as started; flyctl unable to say the events or read the log.

`tools/ops/src/deploy-branch.test.ts`: a failed deploy prints the report of the Machine its failure names, and not of a Machine whose line says nothing failed (`failedMachines`).

## 3. Breakages

Each changes one thing in `tools/ops/src` and must make one of the tests above fail (`breakages_wr.py`, on `evidence` with its run):

- K01: an exit Fly was asked for counts as a failed start.
- K02: the exits from before the start count too.
- K03: the watch is 5 seconds, not 30.
- K04: the watch doesn't look at the state.
- K05: a start never seen as started prints no report.
- K06: the watch prints no report.
- K07: a fresh crash and restart passes.
- K08: an exit is never read as asked for.
- K09: an id that isn't a Machine's is passed to flyctl.
- K10: the log keeps more than its last 60 lines.
- K11: every Machine a deploy names is reported, not only those whose line failed.
- K12: a failed deploy prints no report.
- K13: an entry with a line break in it is printed on two lines.
- K14: a long line isn't cut.
- K15: a log line's colours and control characters reach the run's log.
- K16: control characters reach the run's log (the event rows too).
- K17: the VM table's time is taken for an event.

## 4. After the merge

On the founder's own yes, with `dev` claimed through the coordinator: one `ops` run, `worker-scale` with `to: started`, from `main`. If the worker crashes, the run fails and prints why. Fly restarts a process that failed (`fly.toml`'s `[[restart]]`, `on-failure`) until its retries run out, and then it stays stopped, as after `deploy-dev`; one `worker-scale --to stopped` run, which the founder's yes is asked to cover too, makes sure of it. The fix then follows forward on its own branch from `main`. If it holds for 30 seconds, the worker runs on `dev` again, and S1's and S2's device runs can go ahead.

What this can't show: a crash that takes longer than 30 seconds to come (the worker's first pass runs within a minute of its start); and what Fly's log buffer no longer holds.
