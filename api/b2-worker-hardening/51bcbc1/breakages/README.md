# Deliberate breakages of PR #118's fifth commit (51bcbc1): the audit's A6

PR #118, `api/b2-worker-hardening`: the worker kept out of a photo process's reach (ADR-038,
`docs/plans/api-b2-worker-hardening.md`), and, after the outside audit's finding A6, the image failing closed. In the
image (`NODE_ENV=production`, or the marker `/etc/tadayo-built-image` the Dockerfile writes), the worker goes on only
when it was started as `fly.toml`'s worker command starts it (`services/worker/src/privileges.ts` `photoUserFor`,
`startedAsFly`), the API refuses root by its real or its effective user (`services/api/src/start.ts` `refuseRoot`), and a
photo's process never starts without the photo's user (`services/worker/src/image-process.ts` `NoPhotoUser`). The
photo user's name moved from `fly.toml`'s `[env]` into the Dockerfile.

Each breakage changes one place, runs the suite registered for it, and counts as caught only when a test whose name
holds the registered words fails. The file is restored after each (`brk-run.log`'s last line: only the commit's own
changes left).

## The run (`breakages_a6r3.py`, `brk-run.log`, `out/`)

28 breakages, A01 to A28, all 28 caught: the image's rule dropped or narrowed (A01 to A05, A16, A19, A25), the API's
refusal dropped, narrowed or widened (A06 to A09, A17), a photo's process allowed with no user (A10, A26), the
Dockerfile and `fly.toml` (A11 to A13, A18), the worker's mode by its user alone (A20), each fact of `fly.toml`'s start
read back wrongly (A21 to A24), and the root harness (A14, A15, A27, A28). `out/<code>.patch` is each change and
`out/<code>.txt` its suite's whole output.

The tree it ran on was the fourth commit's (`e2b0359`) with the fifth commit's twelve code and test files laid on it
(the Dockerfile, `fly.toml`, `services/api/src/start.ts` and its test, `services/worker/src/image-process.ts`,
`privileges.ts`, `privileges-harness.ts`, `start.ts` and their tests, `tools/ops/src/deploy-files.test.ts`). Each of
the twelve was checked byte for byte against `git show 51bcbc1:<file>` after the run: all the same. The merge of
`main` (`8957854`) touched none of them. No breakage changes the sweep, so `privileges.test.ts` (which runs the root
harness in a mount namespace of its own) ran on the session's machine.

The full suites ran green on the fifth commit's tree before it was committed: format, lint, typecheck, copy lint,
OpenAPI, unit (web 47, contracts 250, domain 509, ops 476, api 407, worker 148), tools tests, web, guards, boot,
database tests (929) and the privacy matrix (491).
