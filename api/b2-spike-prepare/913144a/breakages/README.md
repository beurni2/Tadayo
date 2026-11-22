# Deliberate breakages of `api/b2-spike-prepare` at `913144a`

Spike S2's server half, the worker's photo preparation (`docs/plans/api-b2-spike-prepare.md`). 36 breakages, one
change each, run with `breakages.py` on the tree the first commit holds, before it was committed (the commit was
amended afterwards only to change a fake service key in `tests/src/db/worker-generation.test.ts`, which GitHub's
push protection read as a real one; that file's test passed again with the new value).

For each: the change alone (`<code>.patch`), the suite registered for it, and its output (`<code>.txt`). A breakage
is caught when the suite fails and a failing test's name holds the words registered for it in `breakages.py`.
`run.log` has every verdict: 36 of 36 caught. `before.sha` and `after.sha` hash the code's `git diff` and new files
(docs left out, as the records were written meanwhile): the same, so every file was restored.

- O01 to O12, the outbox (`services/worker/src/outbox.ts`): `tests/src/db/worker-outbox.test.ts`, and O12
  `services/worker/src/outbox.test.ts`.
- P01 to P07, the preparation (`services/worker/src/prepare.ts`, `packages/domain/src/media/prepare.ts`):
  `tests/src/db/worker-prepare.test.ts`.
- I01 to I10, the checks and renditions (`services/worker/src/image.ts`): `services/worker/src/image.test.ts`.
- S01 to S04, the worker's Storage client (`services/worker/src/storage.ts`): `services/worker/src/storage.test.ts`.
- W01, the worker's start (`services/worker/src/start.ts`): `services/worker/src/start.test.ts`.
- R01 and R02, the probe's worker checks (`tools/ops/src/supabase-probe.ts`): `tools/ops/src/supabase-probe.test.ts`.
