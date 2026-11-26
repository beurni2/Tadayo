# PR #137, round 4's breakages, runs and measurements (commit 9950e24)

The plan, `docs/plans/api-b2-scanner-blind-spots.md` on the branch `api/b2-scanner-blind-spots`, registers these in
section 5.11 and records how they ran in section 5.12; section 5.10 gives the measurements. `run.py` is the runner:
each breakage is a text edit, applied, run and undone; its `.patch` is the edit, its `.0.txt` the run's output.

- `branch/`: K21 to K27 (the scanner's and the log's unit tests), on the branch's tree with round 4's fixes before it
  was committed. `results.json` holds each verdict: K21, K22 and K24 to K27 caught; K23 passed, as registered (the
  exact run index alone is held by measurement, not by a test).
- `runs/`: `chain.sh` and `chain-status.txt` (what ran, in order, with exit codes and times); `unit`, `tools-tests`,
  `db-tests` (951 of 951, 125 s, on a fresh cluster) and `privacy` (543 of 543, 1,300 s, on another fresh cluster;
  `privacy-rss.txt` is the step's largest process, in kB); `format`, `lint`, `typecheck` and `copy-lint`.
- `probes/`: `time.mts` times `Needles` with the review's load (42,000 texts in 3,000 worlds worded alike): an honest
  value, a leaking 1,220-character value with `within` and with `holds`, 200,000 random request ids, and the heap.
  `time-9950e24.txt` is this commit's scanner, `time-49c3abf.txt` the fourth commit's, and `time-stop-only.txt` this
  commit's with the stop at the first but the fourth commit's lookup in place of the exact index (`stop-only.patch`).
  These are a second run, after the commit; the plan's figures are from the first, before it (0.02 ms, 480 ms, 1.7 ms,
  207 MB against 86 MB), and agree within the spread of one machine. `keys.mts` reads the 174 property keys in
  `packages/contracts/openapi.yaml` and the schema files and compares this commit's `neverKey` with the fourth
  commit's: `keys.txt`, no key changes its verdict.
