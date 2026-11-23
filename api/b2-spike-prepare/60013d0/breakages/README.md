# Deliberate breakages of `api/b2-spike-prepare` at `60013d0`

Spike S2's server half, the worker's photo preparation (`docs/plans/api-b2-spike-prepare.md`), at its fifth
commit, which fixes round 4 of PR #111's review. 104 breakages, one change each, run with `breakages.py` on the
tree this commit holds, before it was committed: the fourth commit's 87 (`../../7037f3d/breakages/`), their anchors
and registered test names moved where round 4 changed the code, and 17 for round 4's fixes.

For each: the change alone (`<code>.patch`), the suite registered for it, and its output (`<code>.txt`). A breakage
is caught when the suite fails and a failing test's name holds the words registered for it in `breakages.py`.
`run.log` has every verdict: 104 run, 104 caught by the test registered for each. `before.sha` and `after.sha` hash the code's `git diff` and new files (docs
left out, as the records were written meanwhile): the same, so every file was restored.

After that run, the whole unit step failed one test of `image-process.test.ts` on Vitest's default time limit of
5 s, under the load of every package's tests at once (5,341 ms; 1,593 ms with the file alone), so each test there that
starts a process got a limit of its own, as its neighbours had (the commit's journal entry). That is the only change
to the code since the run. X01 to X27, the breakages that file catches, were run again on the committed tree:
`run-x.log`, 27 run, 27 caught; `before-x.sha` and `after-x.sha` the same. Their outputs in `X*.txt` are the second run's.

- O01 to O15, the outbox (`services/worker/src/outbox.ts`): `tests/src/db/worker-outbox.test.ts`, and O12
  `services/worker/src/outbox.test.ts`.
- P01 to P13, the preparation (`services/worker/src/prepare.ts`, `packages/domain/src/media/prepare.ts`):
  `tests/src/db/worker-prepare.test.ts`. New in round 4: P13 starts a process for an original past 20 MiB (R4-8).
- I01 to I37, the checks and renditions (`services/worker/src/image.ts`; I07 now in `image-process.ts`, where the
  rendition boxes moved): `services/worker/src/image.test.ts`. New in round 4: I35 refuses no reserved JPEG marker,
  I36 stops the reserved range at 0x7F, I37 lets the checks take a JPEG whose walk found one (R4-1).
- M01 to M05, caught by `services/worker/src/image-memory.test.ts` alone (each photo through `prepareIsolated`, its
  process's peak read from Linux's `VmHWM`). New in round 4: M05 refuses a photo past the budget by another code,
  which the test now catches by the code it expects (R4-6).
- X01 to X27, the photo's own process (`services/worker/src/image-process.ts`, `image-child.ts`):
  `services/worker/src/image-process.test.ts`. New in round 4 (R4-3 to R4-5): X16 reads any message as the child's,
  X17 takes a second ready for the answer, X18 waits for the channel to close, X19 kills the child alone, X20 forks
  it with no group of its own, X21 never kills a child that answered, X22 refuses the photo when the child exits of
  its own accord, X23 to X26 loosen `wellFormed` (any number of renditions, no box, any bytes, any rejection), X27
  tries again a decode's timeout past the memory. X05 and X07 moved with the code; X07 is now registered to the
  strict answer's test.
- S01 to S04, the worker's Storage client (`services/worker/src/storage.ts`): `services/worker/src/storage.test.ts`.
- W01, the worker's start (`services/worker/src/start.ts`): `services/worker/src/start.test.ts`.
- R01 and R02, the probe's worker checks (`tools/ops/src/supabase-probe.ts`): `tools/ops/src/supabase-probe.test.ts`.
