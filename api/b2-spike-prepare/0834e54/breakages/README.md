# Deliberate breakages of `api/b2-spike-prepare` at `0834e54`

Spike S2's server half, the worker's photo preparation (`docs/plans/api-b2-spike-prepare.md`), at its sixth commit,
which answers the short fresh check of its fifth commit (`60013d0`). The sixth commit changes one test file
(`services/worker/src/image-process.test.ts`: the check's C5-2 test, and the fake children's processes ended after each
test) and comments of `services/worker/src/image-process.ts`, besides the records. So the breakages run again here are
the 29 that file catches: the fifth commit's X01 to X27 (`../../60013d0/breakages/`) and two new ones, run with
`breakages.py` on the tree this commit holds, before it was committed.

- X28: `settle` no longer destroys the child's standard input. **Not caught, and can't be:** Node destroys a child's
  standard input itself as the child exits (`ChildProcess`'s `onexit` in `lib/internal/child_process.js`, read in Node
  26.13.0 with `--expose-internals`), so `settle`'s destroy counts only where the end settles before the child's exit
  (the grace after a kill that the child outlasts, as a process in uninterruptible sleep can, or a spawn's error). The
  line stays for those paths.
- X29: `settle` no longer disconnects the child's channel. Caught by "closes its ends of the child's pipes as it
  settles, though a process the child started outside its group holds them".

For each: the change alone (`out/<code>.patch`), and the suite's output (`out/<code>.txt`). A breakage is caught when
the suite fails and a failing test's name holds the words registered for it in `breakages.py`. `run-x2.log` has every
verdict: 29 run, 28 caught by the test registered for each, X28 not caught (above). `before-x2.sha` and `after-x2.sha` hash the code's `git diff` and new files (docs left out, as the
records were written meanwhile): the same, so every file was restored.

`first/` is the run before the tests' cleanup moved to `afterEach`: the same verdicts, and two processes that fake
children started were left behind by breakages whose tests failed on their time limit, as their `finally` never ran.
After the final run, no such process was left.
