# Deliberate breakages of `api/b2-spike-prepare` at `df6f7f2`

Spike S2's server half, the worker's photo preparation (`docs/plans/api-b2-spike-prepare.md`), at its second
commit, which fixes round 1 of PR #111's review. 48 breakages, one change each, run with `breakages.py` on the
tree this commit holds, before it was committed: the first commit's 36 (`../../913144a/breakages/`), their anchors
moved where round 1 changed the code, and 12 for round 1's fixes.

For each: the change alone (`<code>.patch`), the suite registered for it, and its output (`<code>.txt`). A breakage
is caught when the suite fails and a failing test's name holds the words registered for it in `breakages.py`.
`run.log` has every verdict: 48 of 48 caught. `before.sha` and `after.sha` hash the code's `git diff` and new files
(docs left out, as the records were written meanwhile): the same, so every file was restored.

- O01 to O15, the outbox (`services/worker/src/outbox.ts`): `tests/src/db/worker-outbox.test.ts`, and O12
  `services/worker/src/outbox.test.ts`. New in round 1: O06 now breaks the dead claim's code (always
  `lease_lapsed`, R1-3); O13 and O14 write a failure over a newer claim (R1-7); O15 writes the lines only when the
  pass ends (R1-2).
- P01 to P09, the preparation (`services/worker/src/prepare.ts`, `packages/domain/src/media/prepare.ts`):
  `tests/src/db/worker-prepare.test.ts`. New in round 1: P08 doesn't see a lapse under the lock (R1-5); P09 reads
  the record's clock before its lock (R1-6).
- I01 to I16, the checks and renditions (`services/worker/src/image.ts`): `services/worker/src/image.test.ts`.
  New in round 1 (R1-1, FQ138): I11 checks nothing a decode would hold; I12 counts one JPEG component; I13 counts a
  16-bit PNG's samples as one byte; I14 counts nothing for an interlaced PNG; I15 leaves out a JPEG's padding to
  whole MCUs; I16 raises the budget to 512 MiB.
- M01, the same check as I11 removed, caught by `services/worker/src/image-memory.test.ts` alone (each decoder's
  worst case prepared in a fresh process, its peak memory measured).
- S01 to S04, the worker's Storage client (`services/worker/src/storage.ts`): `services/worker/src/storage.test.ts`.
- W01, the worker's start (`services/worker/src/start.ts`): `services/worker/src/start.test.ts`.
- R01 and R02, the probe's worker checks (`tools/ops/src/supabase-probe.ts`): `tools/ops/src/supabase-probe.test.ts`.
