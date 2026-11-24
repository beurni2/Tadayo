# Deliberate breakages of PR #118's third commit (e8bc658)

PR #118, `api/b2-worker-hardening`: the worker kept out of a photo process's reach (ADR-038,
`docs/plans/api-b2-worker-hardening.md`), with round 1 of its review fixed: Node's inspector off in every process of
the image, the sweep's loop and cleanup, the sweep as the worker starts, a refused group kill, no group kill after the
reap, renditions kept only as baseline JPEGs, `prlimit` on the worker's command.

Each breakage changes one place in the code, runs the suite registered for it, and counts as caught only when a test
whose name holds the registered words fails. The file is restored after each; `tree-before.txt` and `tree-after.txt`
are a hash of every tracked file before and after the run, and they match.

## The first run (`breakages.py`, `run.log`, `out/`)

76 breakages (44 from the second commit, their anchors moved to the code as it is, and 32 new). 68 caught.
`worker-suite.log` (139 tests) and `deploy-suite.log` (19) are the two suites, green, on the tree before the run.

Eight not caught:

| Id | The change | What it showed |
| --- | --- | --- |
| J06 | the scan no longer needs its frame | A test was missing: a JPEG with no frame at all. Added ("no frame"). |
| J07 | no start of image needed | A test was missing: "no start" cut the first two bytes off, so the next segment's bytes were refused anyway. Added: "a start without its 0xFF", "another marker for its start". |
| J09 | a segment length under 2 taken | A test was missing: a scan whose length is shorter than its own two bytes. Added. |
| W16 | a System V object matched by its owner only | A test was missing: a segment the photo user made and gave to another user. Added to harness case `hoards`. |
| W17 | a System V object matched by its maker only | A test was missing: a segment root made and gave to the photo user. Added to harness case `hoards`. |
| J05 | a second frame taken | Changes nothing an input can show: the scan already needs exactly one frame before it, and the scan ends the parse, so no frame after it is ever read. |
| J08 | a segment past the bytes taken | Changes nothing an input can show: once a segment runs past the end, the parse can't reach a scan's end, so the JPEG is refused anyway. |
| W12 | one `kill(-1)`, no second look | Changes nothing on Linux: `kill(-1)` signals every process under the task list's lock, and a fork either joins the list first (and is killed) or fails on its parent's pending `SIGKILL`, so one kill ends a forking loop (harness case `forks` passes with the change in). The loop stays as the check that none is left. |

## The rerun (`rerun/`)

The eight again, on the tree with the new tests (`rerun/breakages.py`, `rerun/run.log`, `rerun/out/`): the five
caught, each by the case added for it; J05, J08 and W12 still not, for the reasons above. W12, W16 and W17 ran in a
container of the image (`privbox`), so that a breakage of the sweep never runs as root on the session's machine.
