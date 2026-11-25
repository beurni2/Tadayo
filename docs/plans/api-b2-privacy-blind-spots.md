# api/b2-privacy-blind-spots: the outside audit's A14, part 1: T9's conditions in the matrix, and one module

The outside audit of 2026-11-24, finding A14 (Medium): "Four blind spots in the privacy tests". This slice closes
the second of them, T9's conditions that have no matrix cell, with Home's judge untested and the predicate's "one
module" only a convention, and the fourth, a device time under a name the harness doesn't send, for the code that
decides who sees what and where an add goes by the time: the read predicate, the day choice and the add-target
policy, which take only the clock's sample. The fourth stays open for the functions that take a plain instant
(`server_now`'s builders, the slot counter, the leave's withdrawal check, generation, devices): a request's time
reaches those with no cast, so the third slice, `api/b2-server-time-types`, makes them take the clock's sample too
(round 2, R2-3; section 5). The other two points, the scanner's whitelist stopping at the card and nothing reading
the real routes' logs, are the second slice, `api/b2-scanner-blind-spots` (section 5).

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
  nobody leaves. No command makes this today: a block ends every club the two shared (D11), and whether it can be
  undone is FQ72's. But a block stands in every club after it (FQ88) and the schema lets both be members of a club
  later; the predicate denies it either way, so the matrix must hold every route to that. `reads: false`. The block
  names Ben's interval in the matrix's club; one made in another club is section 1.3's (round 1, P2).
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
  author has blocked Cleo and left by the block, the two states that take the star away leave nobody else with both
  (the star gone has left; the star deleting has no session, though Ana's membership is still active), so the table
  stops at the second link in those six cells, which are counted (`alone`) and pinned after the roles, and the
  table's own counts (`invitations`, `otherAnswers`) are held to the cells where it ran. The second link's token is
  kept back from every later answer in every cell, those six included, where the link stays live (round 1, G1);
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
the author's account, a block either way, the reveal, and a viewer back in the club under an interval the audience
doesn't hold); `pageFor` orders the star's drops first, then friends', by commit time and then id byte by byte
(COLLATE "C"), from a world whose order disagrees at every step, and refuses a page with a reaction, a comment, a
favourite or more than 36 drops; `recentFor` lists newest first from a world written oldest first, picks D08's cover
and keeps six; `homeFor` gives each mode in the contract's order (the open day before a next one, a next day before
a pause) and the neutral not-found to anyone not an active member (round 1, P4 and G3).

1.3. **The viewer who blocked the author, on Home's page** (`tests/src/db/home.test.ts`): Cleo blocks Ben while both
stay members, and the open day's page leaves Ben's drop out; and Ben blocking Cleo does the same for Cleo. Each again
with the block naming the blocked person's interval in another club (`world.ts` `intervalElsewhere`), so a block
keyed by the interval rather than the account fails; and the same, both ways, on both paths of the predicate in
every phase and read (`tests/src/db/authorization.test.ts`, "hides each one's drops from the other when the block was
made in another club, both still members here"; round 1, P2).

1.4. **One module reads the audience and the blocks** (`packages/domain/src/authorization/one-module.test.ts`): no
product file outside `packages/domain/src/authorization/` names `app.drop_audience` or `app.blocks`, but lines kept
by name with their reason (`drops/commit.ts`'s `INSERT INTO app.drop_audience`, which writes the sealed audience at
commit, T8). It scans what `one-clock.test.ts` scans (packages, services, `apps/web`, `tools/ops`, a line at a
time) and `db/` too, `bootstrap.sql` and the migrations: there the lines that define the two tables, their foreign
keys, indexes, row security and trigger, and the guard functions' lines that read them as last guards, are kept by
file and line with their reason, so a view or a function a later migration adds that reads them fails (round 1,
P3). `app.blocks` is caught in any case; a bare `blocks` only after an uppercase SQL keyword (`FROM`, `JOIN`, `INTO`,
`UPDATE`, `TABLE`), so prose about blocks isn't (G5). It catches the ordinary ways of naming them, not a deliberate
way round it (a table name built from parts).

1.5. **Server time only from the time module, for the code that decides by it** (`packages/domain/src/time/one-clock.test.ts`,
three tests beside the clock reads): the read predicate, the day choice and the add-target policy take only a
`ServerNow`, and no product file outside the time module makes one without a clock. Since round 2 the check reads the
server's TypeScript (packages, services, `tools/ops`; `apps/web` is the browser's and runs none of it) through the
TypeScript compiler, as one program with `tsconfig.base.json`'s settings, so it follows a type through its names
however the code is laid out (`nowMints`). It reports:
- a cast (`as`, or angle brackets, which `erasableSyntaxOnly` refuses anyway) to a type a value of which, or a part of
  which, is a `ServerNow`: through an alias, a renamed import or the module's namespace, a wrapper (`Readonly<…>`,
  `NonNullable<…>`), a union, a promise or an array, a function's answer, and the fields of a type the server's code
  declares; and a cast to `any` or `never`;
- a guard (`is`, `asserts … is`) that says a value is one;
- a call, a `new` or a tagged template whose answer holds one through a type parameter none of its parameters names:
  a typed query, whether its row type is written inline, named, laid across lines by prettier, or given by the
  variable the rows go into with no type argument at all, and a generic cast (`function cast<T>(value: unknown): T`),
  a class's included;
- a signature with no body that answers one (an overload, a method's overload, a `declare function`), which the
  compiler doesn't hold to an implementation, and an ambient variable (`declare const`, `declare global`) that holds
  one;
- `@ts-expect-error`, `@ts-ignore` or `@ts-nocheck` anywhere.

A first test checks that the program compiles without an error, so no type the check follows is an unknown one. The
"catches" test compiles 32 planted files beside the server's, each of which must compile cleanly (but the
angle-bracket cast, which the compiler refuses) and be reported; the "leaves alone" test 7 more, which name the type
for a parameter, a field and an answer, keep the clock's samples in containers and pass them on, type a query that
holds none, give the predicate the clock's sample, and cast to other types. Left to others: a value typed `any` is the
lint's (`strictTypeChecked`'s `no-unsafe-*` rules); TypeScript's unsound corners (a write through a wider alias of a
mutable field or array; a call through `Function`, as `Reflect.apply` makes) are a deliberate way round. Tests may make
a `ServerNow`. Until round 2 it read lines (round 1, P1 and G2), which missed a named row type and one laid across
lines (R2-1), an alias, an overload, a wrapper and a silenced line (R2-2).

1.6. **Two more names in the harness** (`manipulations`): the query parameter `t` and the header
`If-Modified-Since`, beside the others, so the audit's two survivors are sent to every route.

## 2. Tests first

Each new test is run against `main`'s code first:
- the matrix with the new role and states: it must pass on `main` (the predicate is right) once the judges model
  the conditions; it fails on the breakages of section 3;
- `home.test.ts` and the Home case in `db/home.test.ts`: pass on `main`, fail on the breakages;
- `one-module.test.ts` and the `ServerNow` check: pass on `main`, and each catches the planted code of its own
  "catches" test (a `FROM app.blocks` in a route, a `JOIN app.drop_audience` in Home; for the time, section 1.5's
  32 planted files).

## 3. Breakages

Each run against the suites that should catch it, with the file restored and checked after:
- `readableDrops` and `dropReadFacts` without `au.state = 'active'`; without `starKeepsDay`'s left clause; without
  its deletion clause; with a one-way block (the viewer's own block of the author dropped); with no block at all.
  Before this slice only `db/authorization.test.ts` caught them; now the matrix must too (run with that test out).
- The audit's inline Home: `packages/domain/src/clubs/home.ts` filtering by its own statement with a one-way block,
  in place of `readableDrops`.
- Home reading `?t=` into a `ServerNow` by a cast; Home reading `If-Modified-Since` the same way.
- The judges: `mayView` without each condition (caught by `home.test.ts`).
- Added in round 1: Home's time from `?t=` by a typed query, with no cast (B9; `one-clock.test.ts` and the matrix);
  a block keyed by the blocked person's interval in both fragments (B10; the cross-club cases of section 1.3, while
  the matrix's role, whose block names Ben's interval in its own club, is registered beforehand as missing it); a
  view of the audience made in a migration (B11; `one-module.test.ts`); `readableDrops` alone without
  `starKeepsDay` (B12; `db/authorization.test.ts`, the matrix registered as missing it, since Home reads drops only
  from days the day choice keeps, which holds the clause itself: P6); and the judge's rejoined case, recentFor's
  order, pageFor's byte order, and the modes' order (J17 to J21; `home.test.ts`).
- Added in round 2: Home's time from `?since=` by a typed query whose row is a named type, so the query's line never
  says `ServerNow` (B13), and by a query whose rows are typed by the variable they go into, with no type argument
  (B14), each caught by `one-clock.test.ts`, the matrix registered beforehand as missing both, since no manipulation
  sends `since`; Home's `server_now` from `?since=`, with no cast, registered beforehand as missed by both, since
  `homeBody` takes a plain instant (B15: R2-3, the third slice's); and the modes' order with a suspended club that
  hasn't started (J22; `home.test.ts`). B9's words now name the check's own message for a typed query.

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

As run again at the second commit (round 1), on freshly made databases: all 33 breakages as registered. B1 to B12 each
caught by every suite registered for it, with its words, but for the two matrix runs registered beforehand as misses,
which passed: B10's (the matrix's block names Ben's interval in its own club, so a block keyed by the interval still
denies there; the cross-club cases of section 1.3 catch it) and B12's (Home reads drops only from days the day choice
keeps; `db/authorization.test.ts` catches it). J01 to J21 each caught by `home.test.ts`. B9 was first written binding
the query's string, which the API's instant type refuses, so the route answered 500; written to bind a
`Temporal.Instant`, the matrix fails on the moved time itself (Home's `club_today`, `next`, `recent_days` and
`server_now`), and `one-clock.test.ts` names the line. Under `main`'s tests, B9 and B10 passed (missed).

As run at the third commit (round 2), with the compiler check: B7 to B9, B13 and B14 each caught by `one-clock.test.ts`,
only its scan test failing (the patched code still compiles without an error; B9's words now name the check's message
for a typed query), and B7 to B9 by the matrix as before; B13's and B14's matrix runs and both of B15's, registered
beforehand as misses, passed; J01 to J22 each caught by `home.test.ts`. Round 1's line scan (a worktree at `a43d484`)
and `main`'s tests each missed B13 and B14. B1 to B6 and B10 to B12 stand as run at the second commit, since the third
changes nothing they run.

## 4. What this gives up, and what it costs

- The new role and states run every table of the matrix: 13 roles in 10 states where there were 12 in 7, about 55%
  more cells. The `privacy` step of `ci`'s `postgres` job took 12m26s at the first commit (run 45628657560), against
  6m51s on `main` at `4c0ef93` (run 45596123033), about 81% longer; here, on the session's machine, a whole run takes
  about 22 minutes.
- The one-module scan reads lines, like the clock reads: it catches the ordinary ways, not a deliberate way round.
  The `ServerNow` check reads through the compiler (section 1.5); it compiles the server's 161 TypeScript files once,
  and the file's tests take about 5 seconds on the session's machine. A check at run time would catch the corners the
  compiler can't see: the time module keeping each instant its clocks return in a private `WeakSet`, and `checkNow`
  (which `readableDrops`, `mayReadDrop`, `daysByClub` and `recentDays` call) refusing any other. It would change the
  predicate's entry points and about 58 casts to `ServerNow` in 23 test files, so it is left out (round 1, P1).
- The fourth point is closed only where the code takes a `ServerNow`. A function that takes a plain
  `Temporal.Instant` and decides by it takes a request's time with no cast at all: `server_now`, which the app's
  countdowns run from (T1), is built from one in `services/api/src/clubs/home.ts` `homeBody`, `list.ts`
  `clubListBody`, `members.ts` `membersBody`, `club.ts` `withServerNow` and `schedule/routes.ts` `scheduleBody`; and
  `packages/domain/src/drops/counter.ts` `settleLapsed` and `freeSlot` (whether a slot lapsed), `clubs/leave-club.ts`
  `settleContributions` (whether a withdrawal falls before the reveal, T18), `schedule/generate.ts` `daysToMake`, `identity/devices.ts`
  `purgeEnded` and `endSignIn`, and `services/worker/src/outbox.ts` `finishEvent` take one. None takes a request's
  time today; B15 shows the matrix and the check both missing one that did (round 2, R2-3). The third slice gives each
  a `ServerNow` (section 5), which the check then covers, rather than R2-3's other choice, a harness that records which
  query keys and headers a handler reads: the type holds every caller, a job's and a script's included, and not only
  the routes the matrix sends.
- The viewer's own account is still the only denial in no cell: the gate (`services/api/src/session.ts`) refuses a
  viewer whose account isn't active before any route runs, so only `db/authorization.test.ts` holds the predicate's
  `u.state = 'active'`. That is harmless for routes behind the gate; the job, push and widget slices (B5 onwards),
  which don't pass it, each need a check where the account is the only denial (round 1, P5).
- The two star states hold `readableDrops`' star clauses only through the day choice: Home reads drops only from days
  `placeableDay` keeps (`packages/domain/src/authorization/days.ts`), which holds `starKeepsDay` itself, so B2 and B3
  were caught because they changed the shared fragment. B12 shows the matrix missing the clause dropped from
  `readableDrops` alone; `db/authorization.test.ts` catches it. The drop routes of B3 onwards make those cells count
  (round 1, P6).
- The matrix's block role names Ben's interval in the matrix's own club: a second club holding Ben would change what
  the matrix's other tables see of Ben, so a block made in another club is held on Postgres, on both paths of the
  predicate and on Home's page (section 1.3), and not in the matrix (round 1, P2).

## 5. The later slices

The second slice, `api/b2-scanner-blind-spots`: the audit's first and third points, each re-checked on `main` before
it is built:
- the scanner's own key lists for every schema reachable before the reveal (the contract's tests pin `UpcomingDay`,
  `ViewerDay`, `Occurrence` and `ClubRef` since, but the scanner's own whitelist still stops at the caption card),
  and camelCase-aware never-words, with the audit's additions where they don't name a key the contract already
  serves for a reason (`reveal_at`, `close_at`, `expires_at`, `member_count`, `position`);
- the matrix's app logging at its production level into a capture, each line scanned as the scanner scans answers,
  and redaction made recursive.

The third slice, `api/b2-server-time-types`: the rest of the audit's fourth point (section 4). Each function there
that decides by the server's time takes a `ServerNow`, the clock's sample, and each caller is read again to give it
one, so the compiler check of section 1.5 covers it: a request's time reaches it only through a mint the check reports. A time
derived from the sample, such as `uploadExpiry` or `reservationExpiry`, stays a plain instant, computed from one. Done
when B15 is caught by `one-clock.test.ts` and every suite is green.

## 6. Review

Round 1, at `24efb67`, two fresh reviewers: one on privacy and security (P1 to P6), one on the tests' correctness and
the records (G1 to G6). Each finding fixed or answered in the second commit:
- **P1 (medium) and G2 (low): the `ServerNow` scan missed ordinary forms**: a typed query whose row says it holds a
  `ServerNow`, with no cast (product code already types rows this way, and with `INSTANT_TYPE` the row holds a real
  `Temporal.Instant`); `<ServerNow>` after `return`, `=>`, `yield` or `case`; `as never`; `as clock.ServerNow`, `as
  import(...).ServerNow`, `as (ServerNow)`. Fixed: section 1.5's forms, each in the test's "catches" list, and the
  type's ordinary names in its "leaves alone" list; breakage B9. The run-time check P1 offers first is given up
  (section 4).
- **P2 (medium): no block named an interval outside the drop's club**, so a predicate keyed by the interval passed
  everything. Fixed on Postgres: section 1.3's cross-club cases; breakage B10. The matrix's role stays in one club
  (section 4).
- **P3 (low): the one-module scan skipped `db/`.** Fixed: section 1.4; breakage B11.
- **P4 (low): Home's judge had no rejoined case.** Fixed: section 1.2; J17.
- **P5 (low): the viewer's own account is the only denial in no cell.** Answered: section 4, for B5 onwards.
- **P6 (nit): the star states hold the drop filter only through the day choice.** Answered: section 4; B12 shows it.
- **G1 (low): the second link's token wasn't kept back in the six `alone` cells**, and `rows.ts` said every phase
  ends in a decline. Fixed: the token joins the canaries before the table's branch, in every cell, and `rows.ts`
  says where the table stops.
- **G3 (low): three orderings would pass with the rule removed.** Fixed: section 1.2; J18 to J21.
- **G4 (nit): stale lines.** Fixed: `matrix.test.ts`'s header and the roster test's "seven roles";
  `db/authorization.test.ts`'s header and describe ("ten states"); `rows.ts`' "six roles" that held slots and
  "seven roles" that made revisions; section 1.4's scope; the role's FQ72; the journal's T9 row and shared block, and
  `PROGRESS.md`.
- **G5 (nit): the blocks pattern flagged prose.** Fixed: section 1.4.
- **G6 (nit): the author's deletion against FQ88's role, and "alone".** Answered in a comment on the state in
  `tests/src/matrix.ts` (both deny; no condition rests on that cell alone); the wording fixed in section 1.1 and
  `matrix.test.ts`.

Round 2, at `a43d484`, a fresh reviewer at full depth (R2-1 to R2-7). Each finding fixed or answered in the third
commit:
- **R2-1 (medium): the `ServerNow` scan missed the usual ways of writing a typed query**: a named row type
  (`interface Asked { readonly now: ServerNow }`, then `` tx<Asked[]>`…` `` or a cast to `Asked`), and a long inline
  row type, which prettier lays across lines. Fixed: the check reads the code through the compiler (section 1.5),
  which follows a row type through its name and catches a query typed by its variable, with no type argument;
  breakages B13 and B14, which round 1's line scan missed (its control, at `a43d484`).
- **R2-2 (low): other forms with no token the scan looked for**: an overload signature, an alias or a renamed import,
  a wrapper (`Readonly<ServerNow>`), `@ts-expect-error`. Fixed by the same check; each is one of the 32 planted files.
- **R2-3 (medium): a request's time reaches the functions that take a plain instant with no cast.** Answered: the
  claim narrowed to the code that takes a `ServerNow` (the opening paragraph, section 1.5, section 4, the test's
  header, the journal's T1 row, `PROGRESS.md`); the rest is the third slice's (section 5); B15 registered as missed by
  both suites.
- **R2-4 (low): P5's follow-up was only in this plan.** Fixed: the journal's T9 row ("Still to come") and the api
  lane's Next, and `PROGRESS.md`, say that the job, push and widget slices each owe a check where the viewer's own
  account is the only denial.
- **R2-5 (nit): the rejoined fixture contradicted T8**: Cleo left before the drops were committed, yet the audience
  held Cleo's interval. Fixed: Cleo leaves after the commits and before the reveal (`2026-11-06T22:00Z`), and the
  comment says the audience holds the interval Cleo held at commit.
- **R2-6 (nit): `intervalElsewhere`'s comment said the club was one the two shared.** Fixed in the comment: the club
  holds only the blocked person, which the schema allows (`app.blocks`' foreign key asks only that the interval be the
  blocked person's) and the predicate never reads.
- **R2-7 (nit): the order of `unavailable` before `awaiting_activation` was untested.** Fixed: a club both suspended
  and not started is unavailable (`home.test.ts`, Home's modes); breakage J22.
