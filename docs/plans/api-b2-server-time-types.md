# api/b2-server-time-types: the outside audit's A14, part 3: the time an action happens at is the clock's sample

The outside audit of 2026-11-24, finding A14 (Medium): "Four blind spots in the privacy tests". Its fourth point was a
device time under a name the harness doesn't send. Part 1 (`api/b2-privacy-blind-spots`, PR #136, merged as
`270c3db`) closed it for the code that takes a `ServerNow`, the clock's sample: the read predicate, the day choice and
the add-target policy, with a check, read through the TypeScript compiler, that no product code makes a `ServerNow`
without a clock. It left open every function that takes a plain `Temporal.Instant` and decides, writes or answers by
it: a request's time reaches one of those with no cast at all (PR #136's review, round 2, R2-3; its plan's sections 4
and 5; breakage B15, registered as missed by every suite). This slice gives each of them a `ServerNow`, so the
compiler holds every caller to the clock, and adds a check that lists every plain instant the server's code still
takes, each with its reason, so a new one fails until someone says why it isn't the clock's sample. Part 2
(`api/b2-scanner-blind-spots`, PR #137) is the audit's first and third points.

Sources: the audit's A14; T1 (server time decides: "Reveal, cutoff, Home placement and access are computed at read
time from `reveal_at`, `close_at` and the server's clock"), T3 (the clock sampled after the locks), T16 (the client's
clock and parameters move nothing), T18 (a reservation lapses at its time); TECH-DESIGN section 5 ("Nothing else
reads the system clock"); `docs/plans/api-b2-privacy-blind-spots.md` sections 1.5, 4 and 5.

## 0. What the audit's point leaves, re-checked on `main` at `60770d5`, and again at `f5000a3`

0.1. **Twenty-five places take the time an action happens at as a plain instant.** A program over the server's
TypeScript (`packages`, `services`, `tools/ops`, and since the first review the time module, but tests and the tests'
clock), compiled with `tsconfig.base.json`'s settings, finds 86 parameters and fields on `main` whose type, alone or in
a union, is an instant and not a `ServerNow` (section 1.2's `plainInstants`; 80 before the time module was read).
Twenty-five of them are the time the action happens at, which is always the clock's sample in today's callers
(twenty-one found before the review, and four the review found: section 5):
- `server_now`, which the app's countdowns run from (T1): `services/api/src/clubs/home.ts` `homeBody(now)`,
  `list.ts` `clubListBody(now)`, `members.ts` `membersBody(now)`, `club.ts` `withServerNow(now)` and
  `schedule/routes.ts` `scheduleBody(now)`;
- whether a slot lapsed, and when a slot is held, given back or used (T18): `packages/domain/src/drops/counter.ts`
  `settleLapsed(at)`, `holdSlot(slot).at`, `freeSlot(at)` and `consumeSlot(at)`, and when it lapses,
  `drops/reserve.ts` `reservationExpiry(at)`;
- when an upload lapses: `media/object.ts` `uploadExpiry(at)`;
- when a request's receipt is made: `idempotency/receipt.ts` `reserveReceipt(at)` and `reserveAsMember(at)`;
- whether a leave withdraws before the reveal (T18, T23): `clubs/leave-club.ts` `settleContributions(at)`;
- when a revision is made, sealed and approved: `clubs/apply-roster.ts` `NewRevision.at`;
- when a sign-in ended, and which ended ones are old enough to go: `identity/devices.ts` `purgeEnded(now)` and
  `endSignIn(now)`;
- which days a club is owed, and a day's first date, at least 24 hours after its confirmation (FQ79, FQ130):
  `schedule/generate.ts` `daysToMake(now)`, `first-date.ts` `firstDate(confirmedAt)` and `change.ts`
  `newMemberFirstDate(confirmedAt)`;
- when an outbox event is done: `services/worker/src/outbox.ts` `finishEvent(at)`;
- when spike S5's run writes its club, and the club's first day: `tools/ops/src/spike-time.ts` `startDay(now)` and
  `firstDate(now)`, given `dev`'s clock's sample in the club's transaction (`writeClub`); `startDay` refuses outside
  06:45 to 06:57 by it, and the club's rows hold the date it picks (the first review's G1);
- the time an action happened at that its answer reports: `clubs/leave-club.ts` `LeftClub.leftAt` and
  `identity/devices.ts` `DeviceRegistration.registeredAt`, each the command's own sample, as `create-club.ts`
  `CreatedClub.at` already was (G3).

Part 1's plan listed twelve of them (its section 4); the program found nine more, and the review four. At `f5000a3`
(PR #137 merged: the scanner, the API's logging and records) the program found the same 80 as at `60770d5` (section
3.1, T0 there). None takes a request's time today:
every product caller passes the clock's sample (section 3.1, the typecheck after the change). B15, Home's
`server_now` from `?since=` with no cast, passes every suite on `main`.

0.2. **The other 63 aren't the time of an action**: 61 the program finds on `main`, and `notBeforeReveal`'s two
parameters, which `main` types `unknown` and the slice types as the facts they are (section 1.1). A time a row holds,
or a day's own time from its date and zone, a fact that a decision compares with the sample or with another fact, or
copies into a row it writes (a day's `reveal_at`, a star's `left_at`, a reservation's day's reveal, an assignment's
`confirmed_at`, the time module's `DayInstants`); an expiry, computed from the sample or read back from its row; an
answer's expiry; a helper's own instants (`before(a, b)`, `wholeSecond`, and the time module's `wholeMicroseconds`,
`databaseInstant` and `contractInstant`); the database connection's instant type (`INSTANT_TYPE`'s and each
connection's); and `tools/ops`, run by hand on `dev` (the dev clock's target and report, and spike S5's run, which
reads the server's time from its answers as a client does). Holds: section 1.2 lists each.

## 1. The change

### 1.1. The time an action happens at takes a `ServerNow`

Each of section 0.1's 25 takes `ServerNow` (`packages/domain/src/time/clock.ts`) in place of `Temporal.Instant`, its
module importing the type. No product caller changes: each already passes the clock's sample, so the program compiles
as it is. A time derived from the sample stays a plain instant, computed from one: `reservationExpiry` and
`uploadExpiry` take a `ServerNow` and answer a plain expiry, which `holdSlot(slot).expiresAt` and the upload's rows
carry (part 1's plan, section 5).

Tests that call these with an instant of their own give it the type, as part 1's tests do for the predicate (a local
`sample` helper, or `as ServerNow`): `reserve.test.ts`, `object.test.ts`, `change.test.ts`, `first-date.test.ts` and
`generate.test.ts` in `packages/domain`; `club.test.ts`, `home.test.ts`, `list.test.ts`, `members.test.ts` and
`schedule/routes.test.ts` in `services/api`; `tests/src/db/members.test.ts`, `ops-spike-time.test.ts` and
`worker-outbox.test.ts`; and since the first review `services/api/src/clubs/leave.test.ts`, `identity/devices.test.ts`
and `tools/ops/src/spike-time.test.ts`. No expectation changes. Tests may make a `ServerNow` (`one-clock.test.ts`'s
header).

Since the first review, `packages/domain/src/authorization/read.ts` `notBeforeReveal` takes `Temporal.Instant | null`
and `Temporal.Instant`, the facts its three callers pass (`DropReadFacts`', `DayFacts`' and the add-target day's
`starLeftAt`, `starDeletionRequestedAt` and `revealAt`), in place of `unknown`, its check at run time kept, so the list
sees what it compares (the review's PR2).

### 1.2. Every plain instant left is kept with its reason (`packages/domain/src/time/one-clock.test.ts`)

- `plainInstants(program, file)`: each parameter, and each field of a type the file declares (an interface's, a type
  literal's, a class's), whose type, alone or as a member of a union (an optional field's `| undefined` included), is
  an instant and not a `ServerNow`, named by its owners: `settleLapsed(at)`, `holdSlot(slot).at`, `DayFacts.revealAt`.
  Since the first review it asks the compiler, not a name: a type is an instant when it is assignable to
  `Temporal.Instant` (through an alias, read only, with a brand of its own, a type parameter whose constraint is one)
  and is a `ServerNow` when it is assignable to `ServerNow` (the two types read from `ServerNow`'s declaration in
  `clock.ts`, `instantTypes`), where the first commit matched the name `Instant` and skipped every intersection (the
  review's G2 and PR2). It reads the same program as part 1's compiler check, compiled once.
- The files it reads: the server's TypeScript and, since the first review, the time module's own (`timeModule`: every
  file of `packages/domain/src/time/` but the tests and the tests' clock, `testing.ts`), which the clock-read scan
  leaves out (PR2).
- `PLAIN_INSTANTS`: section 0.2's 63, by reason: a fact a row holds (21), an expiry (8), an answer's expiry (4), a
  helper's instants (8), the connection's type (6), `tools/ops` (16).
- Test "finds each plain instant the server's code takes on PLAIN_INSTANTS, and nothing there that it doesn't take":
  the program's plain instants, sorted, equal the list's, so a new one fails, and so does an entry whose parameter or
  field has gone; each reason is written.
- Test "finds a plain instant a parameter or a field takes, alone, in a union, optional, through an alias, branded or as
  a constraint, and leaves a ServerNow alone": eight planted files, compiled beside the server's, each compiling
  cleanly: a parameter, an arrow function's parameter that may be null, an optional field, a field of a parameter's
  own type, a class's field, a parameter typed through an alias, and (since the first review) an instant with a brand
  of its own, one read only and a type parameter whose constraint is an instant, each found by its name; and a
  `ServerNow` alone, in a union, as a field and as a type parameter's constraint, and an array of instants, none
  found. The cases are compared all at once, so a failure names every case, not only
  the first (since the first run of P6 and P7: section 3.1).
- The header's last paragraph says the time an action happens at never reaches code as a plain instant, what the check
  leaves to review (section 4), and points here.

### 1.3. The matrix sends the other names a time might come under (`tests/src/privacy/harness.ts`)

Since the first review (its PR1). `manipulations` sends each cell's request, in the collecting phase, with the client's
clock and parameters moved past the reveal, one name at a time (`now`, `t`, `at`, `as_of`, `server_now`, and the
others). It now sends one request more, with every other name a time might come under set at once to the claimed
instant (`TIME_NAMES`: `since`, `before`, `after`, `until`, `from`, `date`, `day`, `time`, `ts`, `timestamp`,
`client_time`), none of them a parameter of the contract's, so a route that reads one and answers by it answers that
request otherwise than the cell's own, which the matrix reports. One request, not eleven, since the privacy step runs
near the `postgres` job's 20-minute limit on `ci` (section 4). `harness.test.ts`: the manipulations' count (15 to 16),
"sends every other name a time might come under in one request, none of them a parameter of the contract's", and the
planted routes that answer otherwise for `since` and for `client_time` in the query.

## 2. Tests first

Written before the code (section 1.1) and run on `main`'s code, where the list test fails, naming the 21 of section
0.1 and nothing else (section 3.1, T0); the planted test passes there, since it reads only its own files. After the
first review, run again so: the list test fails naming the 25 and nothing else found, and kept but not found only
`notBeforeReveal`'s two, which `main` types `unknown` (section 3.1, run2's T0).

## 3. Breakages, registered before they are run

Each applied to the slice's tree in a detached scratch worktree (a copy of the slice's code and tests on `main`, made
before the commit), run against the suites registered for it, and every file restored from its own copy and checked
after; caught means the run fails, its output holds every pattern
registered for it and none registered as absent. The control runs are on a worktree at `main` (`60770d5`, and again at
`f5000a3`), with `main`'s tests.

- T0 (tests first): the slice's `one-clock.test.ts` on `main`'s code: the list test fails, naming each of section
  0.1's 21 (`settleLapsed(at)`, `homeBody(now)`, `finishEvent(at)`, …).
- C0 (control): `main`'s `one-clock.test.ts` on `main`'s code, which takes all 21 as plain instants: passes. That is
  the control of P1 to P4, each of which puts one of the 21 back as `main` has it.
- B15 (part 1's, registered then as missed by every suite): Home's `server_now` from `?since=`, with no cast
  (`services/api/src/clubs/home.ts`): caught by `one-clock.test.ts`, its compile test ("compiles the server's
  TypeScript without an error", `not assignable to parameter of type 'ServerNow'`); the matrix as the member in the
  audience registered as missing it, since no manipulation sends `since`. Control: `main`'s `one-clock.test.ts`
  misses it.
- P1: `settleLapsed` takes a plain instant again (`counter.ts`): the list test (`settleLapsed(at)`).
- P2: `homeBody` takes a plain instant again, and B15 with it: the list test (`homeBody(now)`), the compile test
  passing (registered as absent: its failure). (Its edit takes `home.ts`'s import of `ServerNow` out too, as `main`
  has it: a correction after the first run, section 3.1.)
- P3: `NewRevision.at` a plain instant again, a field (`apply-roster.ts`): the list test (`NewRevision.at`).
- P4: `daysToMake` takes `ServerNow | Temporal.Instant`, a union (`generate.ts`): the list test (`daysToMake(now)`).
- P5: a kept parameter renamed, `wholeSecond(moment)` (`invitation.ts`): the list test, both ways
  (`wholeSecond(moment)` found and not kept; `wholeSecond(instant)` kept and not found).
- P6: `plainInstants` reads a whole type only, no union: the planted test (`late(at)`, `Asked.at`) and the list test
  (`DayFacts.starLeftAt`, a field that may be null).
- P7: `plainInstants` reads parameters only, no fields: the planted test (`Asked.at`, `held(slot).at`, `Counter.at`)
  and the list test (`DayFacts.revealAt`).

After the first review (section 5), registered before run2 (`breakages/run2.py` on `evidence`), on the second commit's
code and tests, besides P1 to P7 again (P6's edit now on the compiler's reading of a union's members):
- T0 again: the slice's `one-clock.test.ts` on `main`'s code: the list test fails, its received list holding exactly
  section 0.1's 25 more than `PLAIN_INSTANTS`, and missing exactly `notBeforeReveal(at)` and `notBeforeReveal(revealAt)`,
  which `main` types `unknown`; the runner checks both sets, not only that the names appear. C0 again: passes.
- B15, now caught by the matrix too, as the member in the audience, on the manipulated request that sends `since`
  (`getHome, manipulated {"query":{…"since":…`), besides `one-clock.test.ts`'s compile test. Control: `main`'s
  matrix, whose manipulations don't send `since`, misses it.
- B16 (the review's PR1, its variant (a)): Home answers `server_now` from `?since=`'s text, put over `homeBody`'s
  answer, with no instant at all (`services/api/src/clubs/home.ts`): `one-clock.test.ts` misses it (registered: no
  instant, no cast); the matrix as the member in the audience catches it on the request that sends `since`. Control:
  `main`'s matrix misses it.
- P8: `plainInstants` matches the name `Instant` again and skips every intersection, as the first commit did: the
  planted test (`stamped(at)`, `fixed(at)`, `chosen(at)`), the list test passing (registered as absent: its failure),
  since the server's code has none of those shapes.
- P9: the list test leaves the time module out again: the list test (`civil.ts: DayInstants.revealAt`,
  `instant.ts: contractInstant(instant)`, `instant.ts: INSTANT_TYPE.serialize(value)`, kept and not found).
- P10: `notBeforeReveal` takes `unknown` again: the list test (`notBeforeReveal(at)`, `notBeforeReveal(revealAt)`).
- P11: spike S5's `startDay` takes a plain instant again (`tools/ops/src/spike-time.ts`): the list test
  (`spike-time.ts: startDay(now)`).
- P12: `LeftClub.leftAt` a plain instant again: the list test (`LeftClub.leftAt`).
- P13: the matrix's manipulations without the request of time names (`tests/src/privacy/harness.ts`):
  `harness.test.ts`, four tests (the planted routes for `since` and `client_time`, "sends every other name a time might
  come under…", and the step counts' 16).

### 3.1. As run

On 2026-11-26 in the session, with Node 26.13.0, three times: twice on `main` at `60770d5`, where the slice began, and
once more on `f5000a3`, once PR #137 had merged and the slice had moved onto it. Each time, the slice's runs on a
detached worktree at that commit holding a copy of the slice's code and tests, made before the commit, whose code and
tests the commit holds unchanged; the control runs on a worktree at the same commit of `main`, with `main`'s tests. Each
file a breakage edits was copied before it, restored from that copy after and checked equal to the tree's own; both
trees were checked after the runs. Every output, patch and verdict is on `evidence` under
`api/b2-server-time-types/<the first commit's short sha>/breakages/` (`f5000a3/`, `60770d5/` and `first-run/`).

On `f5000a3`, the slice as committed:
- T0, caught: the slice's `one-clock.test.ts` on `main`'s code failed in the list test alone (1 failed, 11 passed),
  its received list holding each of section 0.1's 21 more than `PLAIN_INSTANTS` and nothing else, and nothing kept
  missing.
- C0, passed (missed), as registered: `main`'s `one-clock.test.ts` on `main`'s code, 10 tests.
- B15, caught by `one-clock.test.ts` alone (1 failed, 11 passed): its compile test ("compiles the server's TypeScript
  without an error", `not assignable to parameter of type 'ServerNow'`). The matrix as the member in the audience
  passed (1 passed, 28 skipped), the miss registered beforehand, since no manipulation sends `since`. Its control,
  `main`'s `one-clock.test.ts` on `main`'s code with the same edit, passed (missed).
- P1 to P5, caught, each in the list test alone, naming its own: `settleLapsed(at)`; `homeBody(now)`, with the compile
  test passing (B15 compiles when `homeBody` takes a plain instant); `NewRevision.at`; `daysToMake(now)`;
  `wholeSecond(moment)` found and not kept, and `wholeSecond(instant)` kept and not found.
- P6, caught: the planted test (`late(at)`, `Asked.at`) and the list test (`DayFacts.starLeftAt`, with every field that
  may be null and `tools/ops`' optional ones, 10 of the 59).
- P7, caught: the planted test (`Asked.at`, `held(slot).at`, `Counter.at`) and the list test (`DayFacts.revealAt`, with
  every field kept, 43 of the 59).

On `60770d5`, the second run: T0, C0, B15's control and P1 to P7 the same, each as above (B15 itself was run on
`f5000a3` only). The first run there was not as registered for three breakages, each failing for a reason of the run's
own making, not the check's:
- P2 failed the compile test too: its edit put `homeBody`'s parameter back but left `home.ts`'s import of `ServerNow`,
  which `noUnusedLocals` then refused, a tree `main` never had. The edit now takes the import out too, as `main` has it.
- P6 and P7 failed the planted test, but it stopped at its first failing case (`late(at)`; `Asked.at`), so the later
  cases' names registered for them weren't printed. The planted test now compares every case at once, so a failure
  names each case it reaches (section 1.2); `one-clock.test.ts` passes as before (12 tests).

After the first review (run2, `breakages/run2.py`), on 2026-11-26 in the session, on a detached worktree at `f5000a3`
holding a copy of the second commit's code and tests, the controls on `main` at `f5000a3` with `main`'s tests; every
output, patch and verdict on `evidence` under `api/b2-server-time-types/<the second commit's short sha>/breakages/`:
- T0, caught: the slice's `one-clock.test.ts` on `main`'s code failed in the list test alone (1 failed, 11 passed); the
  runner read both sides of its difference: exactly section 0.1's 25 found and not kept, and only `notBeforeReveal(at)`
  and `notBeforeReveal(revealAt)` kept and not found. C0, passed (missed), as registered.
- P1 to P5, caught as before, each in the list test alone, naming its own.
- P6, caught: the planted test (`late(at)`, `Asked.at`) and the list test (`DayFacts.starLeftAt`, with every field and
  parameter that may be null or undefined, 13 of the 63).
- P7, caught: the planted test (`Asked.at`, `held(slot).at`, `Counter.at`) and the list test (`DayFacts.revealAt`, with
  every field kept, 46 of the 63).
- P8, caught: the planted test alone (`stamped(at)`, `fixed(at)`, `chosen(at)` not found), the list test passing as
  registered: the server's code has none of the shapes the first commit's reading missed.
- P9, caught: the list test (the time module's six kept and not found, `DayInstants.revealAt`,
  `contractInstant(instant)` and `INSTANT_TYPE.serialize(value)` among them).
- P10, P11 and P12, caught, each in the list test alone: `notBeforeReveal(at)` and `notBeforeReveal(revealAt)`;
  `spike-time.ts: startDay(now)`; `LeftClub.leftAt`.
- P13, caught: `harness.test.ts`, the four tests registered (4 failed, 94 passed).
- B15, caught: `one-clock.test.ts`'s compile test (`not assignable to parameter of type 'ServerNow'`), as before, and now
  the matrix as the member in the audience (1 failed, 28 skipped), on the manipulated request that sends the time names
  (`getHome, manipulated {"query":{"since":…`): Home's `server_now` was the request's `2026-11-08T06:59:59Z`, not the
  clock's `2026-11-07T06:59:59Z`, in each of the ten drop states the test walks. Controls: `main`'s compile test and
  `main`'s matrix passed (missed), as registered.
- B16, caught by the matrix as the member in the audience in the same way (1 failed, 28 skipped, the same ten), with
  `one-clock.test.ts` passing, the miss registered beforehand. Control: `main`'s matrix passed (missed).
- B15 and B16's matrix runs were at first not as registered, for a reason of the runner's own making: each failed as the
  member in the audience on the request that sends `since`, but the runner judged its words missing, since they had the
  request's quotes bare and vitest prints the failing list as JSON, the quotes escaped (`{\"query\":{\"since\":…`). The
  runner's words were changed to the escaped form, and nothing else, and both were run again on the slice; the first
  run's outputs are kept beside the second's (`first-run-B15-B16/`).

## 4. What it leaves to others, and what it costs

- An instant inside an array, a tuple, a map, a mapped type or a promise isn't read, nor a variable: a function deciding
  by a list of times isn't a shape the server has, and a variable takes no caller's value. A value typed `any` stays
  the lint's, and TypeScript's unsound corners a deliberate way round (part 1's plan, section 1.5).
- A parameter typed `unknown` isn't read: it takes anything, an instant among them. The server's code takes `unknown`
  where it checks a value at run time before it decides by it (the predicate's `checkRead`, whose callers take a
  `ServerNow`; the row readers, which read a query's columns); `notBeforeReveal`, which compared two facts so typed,
  takes their types since the first review (section 1.1).
- A time that is a string or a number (an ISO text, epoch milliseconds) isn't a `Temporal.Instant` and isn't read. A
  route could read one from a request and bind it into a query as text (`${since}::pg_catalog.timestamptz`), or put it
  in an answer (B16), with no instant at all; the first commit's sentence here, that it would have to make an instant,
  was wrong (the first review's PR1). Today no handler reads `request.query`, and every request body is a contract's
  strict object with no time in it (the review traced each route). The matrix's manipulations send every name a time
  might come under (section 1.3), so a route that answers by one answers otherwise than the cell, which the matrix
  reports (B15, B16); a route that wrote by one and answered the same isn't seen. The contract's query schemas take
  keys they don't name (plain `z.object`); refusing those would change every route's contract, and isn't done here.
- A date isn't read either. A club's today, a `Temporal.PlainDate`, decides where a new week starts and which
  announced days a change cancels (`packages/domain/src/schedule/change.ts` `nextMonday`, `nextWeekStart`;
  `generate.ts` `windowEnd`), and a request's date would reach those helpers with no cast (the first review's PR3).
  Each command computes it from the clock's sample just before (`settle-change.ts`, `confirm-days.ts`,
  `generate.ts` `daysToMake`, `change.ts` `newMemberFirstDate`, each taking a `ServerNow`); and every day's own date
  is a `PlainDate`, a fact everywhere, so a list of dates would be every day's. Review keeps it.
- The list's reasons are a reviewer's to keep true: the test holds the names, not the meaning. A field moved from a
  row's fact to the time of an action keeps its name and passes; review reads the list in the diff.
- Time: the compiled program is part 1's, read once more; the file's tests take about 6 seconds here. The matrix's one
  request more per cell in the collecting phase adds to the privacy step, which already runs near the `postgres`
  job's 20-minute limit on `ci` (PR #141's first `ci` run was cancelled at it, and the ios lane's PR #140 since: section
  5); the limit is a CI-configuration PR's (T58), the api lane's next.

## 5. Review

Two fresh reviewers read the first commit, `2c701b3` (PR #141), as `docs/GITHUB.md` step 3 asks, since it touches
time: a general reviewer and a privacy and security reviewer, each with the code, not this plan's conclusions. One
medium finding and six low ones; none high. Each is fixed or answered in the second commit.

General review:
- G1 (medium), fixed: `tools/ops/src/spike-time.ts` `firstDate(now)` and `startDay(now)` were kept under `tools/ops`'
  reason ("reads the server's time from its answers … as a client does"), which wasn't true of them: `writeClub` gives
  them `dev`'s clock's sample in the club's transaction, `startDay` refuses by it, and the club's rows hold the date it
  picks. Both take a `ServerNow` (section 0.1); `spike-time.test.ts` gives its instants the type through a `sample`
  helper, no expectation changed; the counts move (21 to 25 typed, 59 to 63 kept with the review's other changes).
- G2 (low), fixed: `plainInstants` skipped every intersection, not only a `ServerNow`, and matched the name `Instant`, so
  `Temporal.Instant & { … }`, `<T extends Temporal.Instant>(at: T)` and `Readonly<Temporal.Instant>` went unseen. It
  asks the compiler now (section 1.2); three planted cases, and a `ServerNow` as a constraint left alone. P8.
- G3 (low), fixed: `LeftClub.leftAt` and `DeviceRegistration.registeredAt` are always the command's sample and are
  answered (`left_at`, `registered_at`), as `CreatedClub.at`, typed `ServerNow`, is. Both take a `ServerNow`; the
  answers' reason now covers expiries only. P12.
- G4 (low), fixed: the audit map's T18 row now says that `reservationExpiry` and `settleLapsed` take only the clock's
  sample and that the list test holds it; the T16 row names the matrix's new request (section 1.3).
- The review's smaller points: `LatestAssignment.confirmedAt` is copied into new rows, not compared with the sample, so
  the facts' reason now says "or copies into a row it writes"; the planted array of instants stays, its gap section 4's.

Privacy and security review:
- PR1 (low), fixed and answered: a time as text reaches a decision or an answer with no instant (bound into SQL as
  text, or put over `server_now`), so section 4's sentence that a route would have to make an instant was wrong, and
  the matrix sent no `since`, B15's own name. The matrix sends every other name a time might come under (section 1.3);
  B15 and B16, the reviewer's variant (a), are caught by the matrix as the member in the audience; section 4 says what
  stays unseen. Answered: refusing query keys the contract doesn't name changes every route's contract, and isn't done
  here (section 4). The reviewer's variant (b), `since` threaded into the read predicate's SQL, wasn't run as a
  breakage: it needs a new parameter through `readHome`, `pageDrops` and `readableDrops`.
- PR2 (low), fixed and answered: shapes `plainInstants` missed: a constrained type parameter, `Readonly`, an
  intersection (fixed with G2); the time module, which the list test didn't read (read now: six more kept, P9);
  `notBeforeReveal(at: unknown, revealAt: unknown)`, which compares two facts (typed now, two more kept, P10).
  Answered: a mapped type's field, a tuple and an `unknown` parameter stay unread, named in section 4 and the header.
- PR3 (low), answered: a club's today, a `Temporal.PlainDate`, decides where a new week starts and which announced days
  a change cancels, and a request's date would reach `nextMonday`, `nextWeekStart` and `windowEnd` with no cast. No
  path does: each command computes it from its `ServerNow` just before, and every day's own date is a `PlainDate`, so
  a list of dates would hold every day's. Section 4 names it; review keeps it.

What the reviewers checked and found sound (their reports): no client time reaches a decision today (no handler reads
`request.query`; every body a strict object with no time; the headers read are `idempotency-key`, `authorization` and
`origin`); each of the 21 retyped functions is passed the clock's sample in its own transaction; each kept reason but
G1's two and G3's two; no `ServerNow` made outside the clocks in product code; no test expectation changed or case
dropped; every edit in the api lane's parts; the journal's counts and facts (PR #137's merge, its runs, T0's 80
against 59, P6's 10 and P7's 43 missing).

The ios lane said since (PR #140, `ci` run 45789901674) that its privacy step was cancelled at the `postgres` job's
20-minute limit on a slower runner too, with nothing of its own under `services/`, `tests/`, `db/` or `packages/`: the
limit, raised in its own CI-configuration PR under a freeze (T58), is the api lane's next step after this PR.
