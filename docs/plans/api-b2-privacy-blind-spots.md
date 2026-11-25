# api/b2-privacy-blind-spots: the outside audit's A14, part 1: T9's conditions in the matrix, and one module

The outside audit of 2026-11-24, finding A14 (Medium): "Four blind spots in the privacy tests". This slice closes
two of them: T9's conditions that have no matrix cell, with Home's judge untested and the predicate's "one module"
only a convention (the audit's second point), and a device time under a name the harness doesn't send (its fourth).
The other two, the scanner's whitelist stopping at the card and nothing reading the real routes' logs, are the
second slice, `api/b2-scanner-blind-spots` (section 5).

Sources: the audit's A14; T1 (server time), T9 (one read predicate, in one authorization module), T10, T14, T16
(the client's clock and parameters move nothing), T27 (a deleting account); FQ63 (a day whose star left before it
opened is held); D11 (a block); TECH-DESIGN section 5 (the authorization module, the SQL fragments) and section 8
(the privacy matrix, the scanner).

## 0. What the audit found, re-checked on `main` at `4c0ef93`

0.1. **Three of T9's conditions have no matrix cell.** `packages/domain/src/authorization/read-sql.ts`
`readableDrops` and `dropReadFacts` (and `read.ts` `mayRead`) deny a drop when its author's account isn't active,
when its day's star left or asked to delete their account before the reveal (`starKeepsDay`, FQ63, T27), and when
the viewer and the author blocked each other either way. The matrix (`tests/src/matrix.ts` `ROLES`, `STATES`) has no
role or state where the first two, or the viewer's own block of the author, is the only reason to deny: no state
touches the author's account or the star, and of its two block roles, the one where Cleo blocks the author has Cleo
leave the club by the block, so the membership check denies on its own. The other, FQ88's, has the author block Cleo
and leave, keeping the drop, so there the author's block of the viewer is the only denial. Relaxing the author's
account, either of the star's clauses or the viewer's own block in the fragments passes the whole matrix; only
`tests/src/db/authorization.test.ts` catches them. Dropping the block altogether is caught by FQ88's role. Holds (the
control runs of section 3).

0.2. **Home's judge has no test of its own.** `tests/src/privacy/home.ts` (`mayView`, `pageFor`, `recentFor`,
`homeFor`) is judged only through the matrix; every other row's judge has a `*.test.ts` beside it. Holds.

0.3. **Home could re-state the predicate.** The audit's reviewer rewrote the predicate inline in Home's page
(`packages/domain/src/clubs/home.ts`) with a one-way block; it survived the unit, database and matrix suites, and a
probe showed Cleo, who had blocked Ben, getting Ben's drop. `tests/src/db/home.test.ts` has no case of a viewer who
blocked the author, and nothing checks that only `authorization/` reads `drop_audience` and `blocks` (T9's "one
module"). Holds: today only `read-sql.ts` reads them, and `drops/commit.ts` writes the audience.

0.4. **Device time under another name.** The harness (`tests/src/privacy/harness.ts` `manipulations`) sends nine
query names and four headers; Home taking its time from `?t=` or `If-Modified-Since` survived, `X-Client-Time` is
caught. Nothing forbids a cast to `ServerNow` outside the time module, which is how such a time would reach the
predicate (`readableDrops` takes a `ServerNow`). Holds: today only `time/clock.ts` and `time/testing.ts` cast, in
product code.

## 1. The change

1.1. **The matrix's world** (`tests/src/matrix.ts`), so each of T9's conditions is the only denial in some cell:
- A role, "blocked: Cleo blocked the author, both still members": a block row from Cleo to Ben's interval, and
  nobody leaves. No command makes this today (a block ends every club the two shared, D11), but a block has no
  unblock and the schema lets both be members of a club later; the predicate denies it either way, so the matrix
  must hold every route to that. `reads: false`.
- Three states of the drop, each `denies: true`, `endsTheDrop: false`:
  - "its author's account being deleted": Ben's account `deleting`, asked at `STATE_AT` (T27);
  - "its star gone before the reveal": Ana's interval ends at `STATE_AT`, before the reveal, keeping her drops
    (FQ63);
  - "its star's deletion asked before the reveal": Ana's account `deleting`, asked at `STATE_AT` (T27, FQ63).
- A state that puts the viewer's own account in deletion changes what the gate makes of it: the author's in the
  first, the star's in the third. A state names that account (`deleting`), and the matrix expects `deleting` for a
  viewer whose account it is, and the role's own session otherwise.

Every table of the matrix (the roster, the leave, the reservations, the devices, the uploads, the commit, Home and
the rest) judges from the world's rows, so the new cells test each judge too: where a judge doesn't model a
condition, the cell fails, and the judge is fixed to the rule its row states, never the route to the judge.

As built: every judge already modelled the three conditions and the block (the first full run found no answer
judged wrong in any new cell). What changed in `tests/src/privacy/matrix.test.ts` is what counted the old world:
- each role's cells are `STATES.length` states, not 7, times its phases times the 89 requests;
- the invitation's table needs another member with a session and an active account, to decline at the end; once the
  author has blocked Cleo and left by the block, the two states that take the star away leave Cleo alone in the club,
  so the table doesn't run in those six cells, which are counted (`alone`) and pinned after the roles, and the
  table's own counts (`invitations`, `otherAnswers`) are held to the cells where it ran;
- the tables' hand counts after the roles (the roster, the leave, the contributions settled, the slots, the limits,
  Cleo's lapsed slot, the devices, the uploads, the commit, Home with a comment) are recounted by hand for ten states
  and thirteen roles, each comment saying why: the author's deletion is a day that takes slots for everyone but the
  author, whom the gate refuses; a held day takes nothing new (MEMBERSHIP_CHANGED, whatever the time) but gives a slot
  back; Cleo who blocked the author and stayed adds, holds and leaves as the member in the audience, and sees none of
  Ben's drops. Each recount is reasoned from the world and the rules, then held to the run's values, which matched
  every one; none is taken from a run alone.

1.2. **Home's judge, judged**: `tests/src/privacy/home.test.ts`, on worlds written out by hand with no database, as
`club.test.ts` does: `mayView` refuses on each of its conditions alone (the account, the audience, a left interval,
each drop state, the day's status, the club's suspension, the star gone or deleting before the reveal and not after,
the author's account, a block either way, the reveal); `pageFor` orders the star's drops first, then friends', by
commit time and id, and refuses a page with a reaction, a comment, a favourite or more than 36 drops; `recentFor`
picks D08's cover and keeps six; `homeFor` gives each mode in the contract's order and the neutral not-found to
anyone not an active member.

1.3. **The viewer who blocked the author, on Home's page** (`tests/src/db/home.test.ts`): Cleo blocks Ben while both
stay members, and the open day's page leaves Ben's drop out; and Ben blocking Cleo does the same for Cleo.

1.4. **One module reads the audience and the blocks** (`packages/domain/src/authorization/one-module.test.ts`): no
product file outside `packages/domain/src/authorization/` names `app.drop_audience` or `app.blocks`, but lines kept
by name with their reason (`drops/commit.ts`'s `INSERT INTO app.drop_audience`, which writes the sealed audience at
commit, T8). It scans what `one-clock.test.ts` scans (packages, services, tools, a line at a time), without the
migrations, which define the tables. It catches the ordinary ways of naming them, not a deliberate way round it
(a table name built from parts).

1.5. **Server time only from the time module** (`packages/domain/src/time/one-clock.test.ts`, a new test beside the
clock reads): no product file outside the time module casts to `ServerNow` (`as ServerNow`, `as unknown as
ServerNow`, `<ServerNow>`) or declares a guard that makes one (`is ServerNow`). Tests may.

1.6. **Two more names in the harness** (`manipulations`): the query parameter `t` and the header
`If-Modified-Since`, beside the others, so the audit's two survivors are sent to every route.

## 2. Tests first

Each new test is run against `main`'s code first:
- the matrix with the new role and states: it must pass on `main` (the predicate is right) once the judges model
  the conditions; it fails on the breakages of section 3;
- `home.test.ts` and the Home case in `db/home.test.ts`: pass on `main`, fail on the breakages;
- `one-module.test.ts` and the cast test: pass on `main`, and each catches the planted lines of its own "catches"
  test (a `FROM app.blocks` in a route, a `JOIN app.drop_audience` in Home, an `as ServerNow` in a route).

## 3. Breakages

Each run against the suites that should catch it, with the file restored and checked after:
- `readableDrops` and `dropReadFacts` without `au.state = 'active'`; without `starKeepsDay`'s left clause; without
  its deletion clause; with a one-way block (the viewer's own block of the author dropped); with no block at all.
  Before this slice only `db/authorization.test.ts` caught them; now the matrix must too (run with that test out).
- The audit's inline Home: `packages/domain/src/clubs/home.ts` filtering by its own statement with a one-way block,
  in place of `readableDrops`.
- Home reading `?t=` into a `ServerNow` by a cast; Home reading `If-Modified-Since` the same way.
- The judges: `mayView` without each condition (caught by `home.test.ts`).

As run, on the slice's tree and freshly made databases: every breakage caught by every suite registered for it, with
the words registered for it (B1 to B8, J01 to J16). B7's matrix run failed on the first pass with the manipulation
named, but its words had been written without the backslashes the matrix's output puts before a quote; written as
the output has them, the run again was caught. The control runs, the same breakages under `main`'s tests:
- the matrix as the member in the audience missed B1, B2, B3, B7 and B8, and no cell of `main`'s matrix could catch
  B1 to B3, since none has an author's account in deletion or a star gone or deleting;
- the matrix as Cleo who blocked the author and left by the block, and `main`'s `tests/src/db/home.test.ts`, missed
  B4 and B6, and no other cell of `main`'s matrix could catch them, since the only block there that is a cell's
  only denial is the author's block of the viewer (FQ88's role), which both keep;
- B5 (no block at all) was caught on `main` already, by FQ88's role, where the author's block of the viewer is the
  only denial (section 0.1).

## 4. What this gives up, and what it costs

- The new role and states run every table of the matrix: 13 roles in 10 states where there were 12 in 7, about 55%
  more cells, so the `privacy` step of `ci`'s `postgres` job grows from about 7 minutes to about 11 (here, on the
  session's machine, a whole run takes about 22 minutes).
- The static checks read lines, like `one-clock.test.ts`: they catch the ordinary ways, not a deliberate way round.

## 5. The second slice (`api/b2-scanner-blind-spots`)

The audit's first and third points, each re-checked on `main` before it is built:
- the scanner's own key lists for every schema reachable before the reveal (the contract's tests pin `UpcomingDay`,
  `ViewerDay`, `Occurrence` and `ClubRef` since, but the scanner's own whitelist still stops at the caption card),
  and camelCase-aware never-words, with the audit's additions where they don't name a key the contract already
  serves for a reason (`reveal_at`, `close_at`, `expires_at`, `member_count`, `position`);
- the matrix's app logging at its production level into a capture, each line scanned as the scanner scans answers,
  and redaction made recursive.
