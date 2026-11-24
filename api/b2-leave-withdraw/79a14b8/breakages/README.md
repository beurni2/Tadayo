# Deliberate breakages of PR #121's third commit (79a14b8): the outside audit's A3

PR #121, `api/b2-leave-withdraw`: leaving a club with "Withdraw my contributions" withdraws the leaving
membership's drops in the leave's own transaction, and every leave gives back the leaver's live reservations
(`packages/domain/src/clubs/leave-club.ts` `settleContributions`, step 5a; `docs/plans/api-b2-leave-withdraw.md`).
The third commit answers round 2 of the review: the leaver's highlights are now found from the interval's drops,
through indexes (R2-2), and the rest is words. The second commit's run is under `../../c80ed74/breakages/`.

Each breakage changes one place (or one rule written in two statements), runs the suite registered for it, and counts
as caught only when a test whose name holds the registered words fails. The file is restored after each.

## Which tree

The run was made before the commit, in a detached scratch worktree at `c80ed74` with the third commit's code changes
applied (`applied-to-c80ed74.diff`: `leave-club.ts`, `counter.ts`, `clubs.ts` and `openapi.yaml`). After the commit,
`git diff 79a14b8 -- . ':!docs'` in that worktree was empty: every file of code was the third commit's. That is why
`brk-run.log`'s last line lists those four files as modified: they are the applied diff, not a breakage left behind.

## The run (`breakages_a3.py`, `brk-run.log`, `out/`)

21 breakages, L01 to L21, all 21 caught, on a freshly made Postgres 16 cluster, every vitest run with
`--fsModuleCache=false` (so no transformed module is reused between breakages, after round 2's note on Vitest 5's
file module cache):

- the withdrawal skipped (L01, and L02 seen by the privacy matrix's judge), or done on keep too (L03);
- only revealed or only unrevealed drops withdrawn (L04, L05), a held drop left (L06), the removal's reason another (L07);
- the slot given back after the reveal (L08) or at its very instant (L21), not before it (L09), or a link's not as a
  link's (L10);
- the highlight left on a withdrawn drop (L11, its anchor now the new statement's `WHERE`) or cleared before the
  drop's end (L20), the pending replacement kept (L12);
- reservations left live on keep (L13) or on withdraw (L14), a lapsed one released instead of expired (L16, and L15
  seen by the matrix's judge);
- every drop of the club withdrawn (L17), the leaver's own held day left (L18), the earlier membership's kept drops
  withdrawn too (L19, FQ142's default).

`out/<code>.patch` is each change and `out/<code>.txt` its suite's whole output. The suites are
`tests/src/db/leave-withdraw.test.ts` ("lw", 14 tests) and one role of `tests/src/privacy/matrix.test.ts`
("matrix": the member in the audience).

The full suites ran green on the same tree just before: every `ci` step, `db-tests` 942 tests in 48 files and
`privacy` 500 in 15 (`docs/JOURNAL.md`, section 3.2, the entry stamped 2026-11-24 14:10 UTC).
