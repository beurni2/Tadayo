# Deliberate breakages of `api/b2-spike-prepare` at `eaf7c98`

Spike S2's server half, the worker's photo preparation (`docs/plans/api-b2-spike-prepare.md`), at its third
commit, which fixes round 2 of PR #111's review. 59 breakages, one change each, run with `breakages.py` on the
tree this commit holds, before it was committed: round 1's 48 (`../../df6f7f2/breakages/`), their anchors moved
where round 2 changed the code, and 11 for round 2's fixes.

For each: the change alone (`<code>.patch`), the suite registered for it, and its output (`<code>.txt`). A breakage
is caught when the suite fails and a failing test's name holds the words registered for it in `breakages.py`.
`run.log` has every verdict: 59 of 59 caught. The run stopped after the first 40 at the session's time limit for a
background command, leaving the 41st, M01, applied; it was put back by hand, the tree's hash checked against
`before.sha` (`before2.sha`), the database made again, and the last 19 run on the same tree. `run.log` joins the two
parts, `run-part1.log` and `run-part2.log`. `before.sha` and `after.sha` hash the code's `git diff` and new
files (docs left out, as the records were written meanwhile): the same, so every file was restored.

- O01 to O15, the outbox (`services/worker/src/outbox.ts`): `tests/src/db/worker-outbox.test.ts`, and O12
  `services/worker/src/outbox.test.ts`.
- P01 to P10, the preparation (`services/worker/src/prepare.ts`, `packages/domain/src/media/prepare.ts`):
  `tests/src/db/worker-prepare.test.ts`. New in round 2: P10 makes the content version from the scoped hash, and
  the new test that one owner's same photo gets two different versions catches it (R2-3, T21).
- I01 to I24, the checks and renditions (`services/worker/src/image.ts`): `services/worker/src/image.test.ts`.
  I11 and its kin now pass the bytes to `heldBytes(header, bytes)`. New in round 2 (R2-1, R2-2, FQ138): I17 counts
  nothing for an animated WebP; I18 nothing for a lossless one; I19 only the alpha plane for a lossy one with
  alpha; I20 nothing for a WebP whose coding can't be read; I21 leaves `ALPH` unseen; I22 stops `webpCoding`
  passing over chunks; I23 counts an animated WebP as two canvases, 8 bytes a pixel, not 10; I24 passes over
  libvips' pages, so the chunks alone decide.
- M01 to M03, caught by `services/worker/src/image-memory.test.ts` alone (each decoder's largest photo prepared in a
  fresh process, one at a time, its peak read from Linux's `VmHWM`): M01 removes the budget's check; new in round
  2, M02 counts nothing for an animated WebP and M03 nothing for a lossy WebP with alpha.
- S01 to S04, the worker's Storage client (`services/worker/src/storage.ts`): `services/worker/src/storage.test.ts`.
- W01, the worker's start (`services/worker/src/start.ts`): `services/worker/src/start.test.ts`.
- R01 and R02, the probe's worker checks (`tools/ops/src/supabase-probe.ts`): `tools/ops/src/supabase-probe.test.ts`.

**The first run, and what changed.** A first run of 58 (`run-first.log`) caught 56. The two it missed, I17 and M02
as first written, skipped the check of libvips' pages, and nothing failed: every real animation keeps its frames in
`ANMF` chunks, so `webpCoding` finds no image chunk and the count falls to 10 bytes a pixel anyway. The two guards
read one fact twice, and neither test could tell one gone. So `image.ts` now says why both are kept, and
`image.test.ts` asserts that more than one page counts as an animation whatever the chunks say, which I24 breaks.
I17 and M02 now break what their names say, the animation's count itself (0 bytes), and are caught by the WebP
budget test and the memory test. This run is on the tree with those changes.
