# Deliberate breakages of PR #121's second commit (c80ed74): the outside audit's A3

PR #121, `api/b2-leave-withdraw`: leaving a club with "Withdraw my contributions" withdraws the leaving
membership's drops in the leave's own transaction, and every leave gives back the leaver's live reservations
(`packages/domain/src/clubs/leave-club.ts` `settleContributions`, step 5a; `docs/plans/api-b2-leave-withdraw.md`).
The second commit answers round 1 of the review: the drops are withdrawn in five statements whatever their number,
and two tests and two breakages (L20, L21) came with it.

Each breakage changes one place (or one rule written in two statements), runs the suite registered for it, and counts
as caught only when a test whose name holds the registered words fails. The file is restored after each
(`brk-run.log`'s last line: `git status` empty).

## The run (`breakages_a3.py`, `brk-run.log`, `out/`)

21 breakages, L01 to L21, all 21 caught, in a detached scratch worktree at `c80ed74` on a freshly made Postgres 16
cluster:

- the withdrawal skipped (L01, and L02 seen by the privacy matrix's judge), or done on keep too (L03);
- only revealed or only unrevealed drops withdrawn (L04, L05), a held drop left (L06), the removal's reason another (L07);
- the slot given back after the reveal (L08) or at its very instant (L21), not before it (L09), or a link's not as a
  link's (L10);
- the highlight left on a withdrawn drop (L11) or cleared before the drop's end (L20), the pending replacement kept (L12);
- reservations left live on keep (L13) or on withdraw (L14), a lapsed one released instead of expired (L16, and L15
  seen by the matrix's judge);
- every drop of the club withdrawn (L17), the leaver's own held day left (L18), the earlier membership's kept drops
  withdrawn too (L19, FQ142's default).

`out/<code>.patch` is each change and `out/<code>.txt` its suite's whole output. The suites are
`tests/src/db/leave-withdraw.test.ts` ("lw", 14 tests) and one role of `tests/src/privacy/matrix.test.ts`
("matrix": the member in the audience, whose leave withdraws and settles Cleo's lapsed slot).

What the matrix can't catch: its leave runs only in its last phase, a year on, so a slot left live (L13, L14) or a
slot given back before the reveal (L09) is the Postgres file's to catch, as here. L15 replaces the round's planned
"reservations left live on keep, seen by the matrix" for that reason.

The full suites ran green on the second commit's tree before it was committed: every `ci` step, `db-tests` 942 tests
in 48 files and `privacy` 500 in 15 (`docs/JOURNAL.md`, section 3.2, the entry stamped 2026-11-24 13:45 UTC).
