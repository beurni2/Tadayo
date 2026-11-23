# Deliberate breakages of `api/b2-worker-hardening` at `11270f0`

The worker's hardening against a decoder taken over (`docs/plans/api-b2-worker-hardening.md`), its first commit: the
photo's process's messages on a pipe of the worker's own, not Node's channel (section 1). 26 breakages, each one change
to `services/worker/src/image-frames.ts` (F01 to F15), `image-process.ts` (X30 to X38) or `image-child.ts` (C01, C02),
run with `breakages.py` on the tree this commit holds, before it was committed. A breakage is caught when the suite
fails and a failing test's name holds the words registered for it in `breakages.py`.

- 24 caught by the test registered for them.
- F13 (the reader no longer refuses every byte after a broken answer) was caught by another test of the same file, "is
  a header's length of 0, past HEADER_BYTES, or of 4 GiB, refused at its fourth byte with nothing kept", not by the one
  registered ("is a header that isn't a JSON object …"): after a broken header the reader's state happens to refuse
  the next message anyway, as an empty header isn't JSON; after a broken length it doesn't, and `readUInt32BE` throws a
  `RangeError` where a `BrokenAnswer` is expected.
- X35 (`settle` no longer closes the worker's end of the child's standard input) is **not caught, and can't be**, as
  X28 of `api/b2-spike-prepare` at `0834e54` wasn't: Node destroys a child's standard input itself as the child exits
  (`ChildProcess`'s `onexit` in `lib/internal/child_process.js`), so `settle`'s close counts only where the end settles
  before the child's exit (the grace after a kill the child outlasts, or a spawn's error). The line stays for those.

For each: the change alone (`out/<code>.patch`) and the suite's output (`out/<code>.txt`). `run.log` has every verdict.
`before.sha` and `after.sha` hash the code's `git diff` and new files (docs left out, as the records were written
meanwhile): the same, so every file was restored.
