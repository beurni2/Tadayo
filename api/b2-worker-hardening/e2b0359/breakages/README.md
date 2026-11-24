# Deliberate breakages of PR #118's fourth commit (e2b0359)

PR #118, `api/b2-worker-hardening`: the worker kept out of a photo process's reach (ADR-038,
`docs/plans/api-b2-worker-hardening.md`), with round 2 of its review fixed or answered: the sweep removes files
through `find`, `chmod -R` and `rm -rf` (names as bytes, trees of any depth) and reads each folder again, removes
System V objects through `spawnSync` 500 at a time, reads each thread of a process, exits 3 when what the user left
couldn't all be removed (with its own stop line and start message), runs in a session of its own, and the worker's
command adds `--core=1 --msgqueue=0` and `--inh-caps=-all`.

Each breakage changes one place in the code, runs the suite registered for it, and counts as caught only when a test
whose name holds the registered words fails. The file is restored after each; `tree-before.txt` and `tree-after.txt`
are a hash of every tracked file before and after the run, and they match. Every breakage whose suite is
`privileges.test.ts` ran in a container of the image (`privbox` in `breakages.py`), so that a broken sweep never ran
as root on the session's machine.

## The run (`breakages.py`, `run.sh`, `run.log`, `out/`)

92 breakages: round 1's 76, their anchors moved to the code as it is, and 16 new (V01 to V14, D16, D17). 86 caught.
`worker-suite.log` (141 tests, run in the image) and `deploy-suite.log` (19) are the two suites, green, on the tree
before the run.

Six not caught:

| Id | The change | Why no test catches it |
| --- | --- | --- |
| J05 | a second frame taken | As in round 1: the scan already needs exactly one frame before it, and the scan ends the parse, so no frame after it is ever read. |
| J08 | a segment past the bytes taken | As in round 1: once a segment runs past the end, the parse can't reach a scan's end, so the JPEG is refused anyway. |
| W12 | one `kill(-1)`, no second look | As in round 1: `kill(-1)` signals every process under the task list's lock, and a fork either joins the list first (and is killed) or fails on its parent's pending `SIGKILL`, so one kill ends a forking loop. |
| V11 | `ipcrm` given every object in one call | One call fits under Linux's 2 MiB for a program's arguments for every count a namespace with the kernel's default limits allows at five-digit ids: by hand (`v11/`), the image's `many.sh` (32,000 queues and 32,000 semaphore sets) with V11 in, swept all 64,000 in one call (1.6 MB of arguments). The batches keep the margin as ids grow to ten digits; no run here reaches the limit. |
| V12 | an `ipcrm` that fails taken as done | Changes nothing on its own: `ipcrm` is given only objects the sweep's user owns or made, which that user may always remove, once no process of the user is left to remove them first. It would show only with a call past the argument limit, which the batches prevent (V11). |
| V13 | a process alive only if its first thread is | No test here can make the case: a process whose first thread has ended while others run needs a program that ends one thread alone, and the image has no compiler, Node and Perl end the whole process with the first thread, and its Perl has no threads module. Recorded as not verified. |

## V08 again (`run-v08-final.log`, `privileges-final.log`)

The test V08 must fail ("a process left behind may lower the sweep's scheduling group, but it is the sweep's own: the
worker's stays as it was") was changed after the run had started, so that it no longer needs the worker's group to
read exactly `nice 0` (a runner may start the worker at another priority) but needs it unchanged and not at the
leftover's 19. With the final test: `privileges.test.ts` 25 of 25 in the image, and V08 caught.
