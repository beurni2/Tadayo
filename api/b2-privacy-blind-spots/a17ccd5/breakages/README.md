# api/b2-privacy-blind-spots at `a17ccd5`: round 2's breakages

The outside audit's A14, its first part (`docs/plans/api-b2-privacy-blind-spots.md` on the branch), its third
commit: `one-clock.test.ts`'s `ServerNow` check reads the server's code through the TypeScript compiler. Each breakage
is an edit to a file the slice doesn't change, applied in place, run against the suites registered for it beforehand,
and restored with `git checkout` and checked after. Every matrix run starts on a freshly made database.

Caught means the run exits non-zero and its output holds every word registered for it (`run.py`'s `words`). A run
"registered as a miss" is one written down beforehand as out of that suite's reach; it is as registered when it passes.

- `run.py`: the 37 breakages and the runner (`run.py <worktree> <out> [NAME ...] [--check] [--control]`); B9's words
  now name the compiler check's message for a typed query.
- `round2/`: B7 to B9 and B13 to B15 at this commit's tests (`<name>.patch`, `<name>.<i>.txt`, `results.json`). Each
  caught unit run fails only the scan test: the patched code still compiles without an error.
- `judge/`: J01 to J22 against this commit's `tests/src/privacy/home.test.ts`.
- `control-round1/`: B13 and B14 under round 1's tests (a worktree at `a43d484`, the line scan): both passed, missed.
- `control-main/`: B13 and B14 under `main`'s tests (`4c0ef93`): both passed, missed.
- `results-final3.json`, `control-final3.json`: round 1's results (`../../a43d484/breakages/`) with these runs in
  place of the old ones (`merge3.py`); B1 to B6 and B10 to B12 stand as run at `a43d484`, since this commit changes
  nothing they run.
- `brk3.md`: the table in the PR's body (`brkmd3.py`).
- `suites/`: this commit's `format`, `lint`, `typecheck`, `copy-lint`, `guards`, `unit` and `tools-tests` logs.
