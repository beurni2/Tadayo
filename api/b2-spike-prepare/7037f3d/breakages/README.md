# Deliberate breakages of `api/b2-spike-prepare` at `7037f3d`

Spike S2's server half, the worker's photo preparation (`docs/plans/api-b2-spike-prepare.md`), at its fourth
commit, which fixes round 3 of PR #111's review. 87 breakages, one change each, run with `breakages.py` on the
tree this commit holds, before it was committed: round 2's 59 (`../../eaf7c98/breakages/`), their anchors moved
where round 3 changed the code, and 28 for round 3's fixes.

For each: the change alone (`<code>.patch`), the suite registered for it, and its output (`<code>.txt`). A breakage
is caught when the suite fails and a failing test's name holds the words registered for it in `breakages.py`.
`run.log` has every verdict: 87 of 87 caught. `before.sha` and `after.sha` hash the code's `git diff` and new files (docs
left out, as the records were written meanwhile): the same, so every file was restored.

- O01 to O15, the outbox (`services/worker/src/outbox.ts`): `tests/src/db/worker-outbox.test.ts`, and O12
  `services/worker/src/outbox.test.ts`.
- P01 to P12, the preparation (`services/worker/src/prepare.ts`, `packages/domain/src/media/prepare.ts`):
  `tests/src/db/worker-prepare.test.ts`. New in round 3: P11 has the worker decode the photo itself, not through
  its own process (R3-1, R3-3, R3-4), and P12 makes the content version from the upload's id and the bytes (R3-7).
- I01 to I34, the checks and renditions (`services/worker/src/image.ts`): `services/worker/src/image.test.ts`. New
  in round 3: I25 counts an animation of one page as none (R3-2); I26 reads a WebP's coding past its RIFF's end
  (R3-2); I27 and I28 leave a RIFF size that isn't the file's length unchecked; I29 and I30 the WebP chunks' cap
  and its end; I31 to I34 the JPEG scans' cap and its walk (R3-6): no cap, a segment not passed over by its length,
  a stuffed byte taken for a marker, scans past the EOI counted.
- M01 to M04, caught by `services/worker/src/image-memory.test.ts` alone (each photo through `prepareIsolated`, as
  the worker sends it, its process's peak read from Linux's `VmHWM`): M01 removes the budget's check, M02 counts
  nothing for an animated WebP, M03 nothing for a lossy WebP with alpha; new in round 3, M04 walks no structure.
- X01 to X15, the photo's own process (`services/worker/src/image-process.ts`, `image-child.ts`), all new in round
  3: `services/worker/src/image-process.test.ts`. The memory not watched, the deadline killing nothing, a reported
  peak past the cap taken, a SIGKILL the worker didn't send refusing nothing, a crash tried again, an end before
  ready refusing the photo, the answer not checked, the worker's environment given to the child, the child not
  going first to the out-of-memory killer, the cap at 512 MiB, a code's error refusing the photo, a decode's timeout
  a failure, the renditions not made Buffers, the child outliving its worker, and the child leaving by `process.exit`
  when its worker goes (which waits for its decode).
- S01 to S04, the worker's Storage client (`services/worker/src/storage.ts`): `services/worker/src/storage.test.ts`.
- W01, the worker's start (`services/worker/src/start.ts`): `services/worker/src/start.test.ts`.
- R01 and R02, the probe's worker checks (`tools/ops/src/supabase-probe.ts`): `tools/ops/src/supabase-probe.test.ts`.

**The first run, and what changed.** A first run of 85 (`run-first.log`, before X14 was written) caught 81 by
their registered tests. Two were caught, but by another test than the one registered: I25 and X13, now registered
to the tests that pin their rules. Two were missed:

- I34, scans past the EOI counted: the test's bytes after the EOI happened to read as a huge segment length, so the
  walk passed over the scans anyway. `image.test.ts` now puts two bytes after the EOI that read as a short length,
  then two scans, and expects one.
- X01, the child's memory not watched: the kill test's photo answered with a peak past the test's cap, and the
  child that reports a peak past the cap is refused the same way, so the test passed without the watch. It now
  also bounds the peak under 200 MiB, which only a child killed as it passed 100 MiB meets.

**The second run, and what changed.** A second run of all 86 (`run-second.log`, X14 added: a worker killed
mid-decode leaves no process behind) caught 85 and missed X14: with the child's `disconnect` handler removed, the
test still passed. It took the child as soon as it passed 64 MiB, which it does as it starts, before its decode;
killing the worker then cut the photo's bytes short, and the child ended of that whether or not it ended with its
worker. With the decode under way (past 200 MiB), the child outlived its killed worker by 2.3 s even with the
handler: `process.exit` waits for a decode in progress to finish, and two decodes could take two minutes. So the
child now kills itself (SIGKILL) when its channel to the worker closes, the test waits until the child passes
200 MiB, and X15 puts `process.exit` back, which the test now catches as it catches X14.

This run, `run.log`, is on the final tree with those changes.
