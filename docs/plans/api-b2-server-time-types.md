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

0.1. **Twenty-one places take the time an action happens at as a plain instant.** A program over the server's
TypeScript (`packages`, `services`, `tools/ops`, but tests and the time module), compiled with `tsconfig.base.json`'s
settings, finds 80 parameters and fields whose type is a plain `Temporal.Instant`, alone or in a union (section 1.2's
`plainInstants`). Twenty-one of them are the time the action happens at, which is always the clock's sample in
today's callers:
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
- when an outbox event is done: `services/worker/src/outbox.ts` `finishEvent(at)`.

Part 1's plan listed twelve of them (its section 4); the program finds nine more. At `f5000a3` (PR #137 merged: the
scanner, the API's logging and records) the program finds the same 80 (section 3.1, T0 there). None takes a request's time today:
every product caller passes the clock's sample (section 3.1, the typecheck after the change). B15, Home's
`server_now` from `?since=` with no cast, passes every suite on `main`.

0.2. **The other 59 aren't the time of an action.** A time a row holds, or a day's own time from its date and zone,
read as a fact that a decision compares with the sample (a day's `reveal_at`, a star's `left_at`, a reservation's
day's reveal); an expiry, computed from the sample or read back from its row; an answer's field; a helper's own
instants (`before(a, b)`, `wholeSecond`); the database connection's instant type; and `tools/ops`, run by hand on
`dev` (the dev clock's target and report, and spike S5's run, which reads the server's time from its answers as a
client does). Holds: section 1.2 lists each.

## 1. The change

### 1.1. The time an action happens at takes a `ServerNow`

Each of section 0.1's 21 takes `ServerNow` (`packages/domain/src/time/clock.ts`) in place of `Temporal.Instant`, its
module importing the type. No product caller changes: each already passes the clock's sample, so the program compiles
as it is. A time derived from the sample stays a plain instant, computed from one: `reservationExpiry` and
`uploadExpiry` take a `ServerNow` and answer a plain expiry, which `holdSlot(slot).expiresAt` and the upload's rows
carry (part 1's plan, section 5).

Tests that call these with an instant of their own give it the type, as part 1's tests do for the predicate (a local
`sample` helper, or `as ServerNow`): `reserve.test.ts`, `object.test.ts`, `change.test.ts`, `first-date.test.ts` and
`generate.test.ts` in `packages/domain`; `club.test.ts`, `home.test.ts`, `list.test.ts`, `members.test.ts` and
`schedule/routes.test.ts` in `services/api`; `tests/src/db/members.test.ts`, `ops-spike-time.test.ts` and
`worker-outbox.test.ts`. No expectation changes. Tests may make a `ServerNow` (`one-clock.test.ts`'s header).

### 1.2. Every plain instant left is kept with its reason (`packages/domain/src/time/one-clock.test.ts`)

- `plainInstants(program, file)`: each parameter, and each field of a type the file declares (an interface's, a type
  literal's, a class's), whose type is a plain `Temporal.Instant` alone or in a union (an optional field's
  `| undefined` included, and through an alias), and not a `ServerNow`, named by its owners: `settleLapsed(at)`,
  `holdSlot(slot).at`, `DayFacts.revealAt`. It reads the same program as part 1's compiler check, compiled once.
- `PLAIN_INSTANTS`: section 0.2's 59, by reason: a fact a row holds (17), an expiry (8), an answer's field (6), a
  helper's instants (5), the connection's type (5), `tools/ops` (18).
- Test "finds each plain instant the server's code takes on PLAIN_INSTANTS, and nothing there that it doesn't take":
  the program's plain instants, sorted, equal the list's, so a new one fails, and so does an entry whose parameter or
  field has gone; each reason is written.
- Test "finds a plain instant a parameter or a field takes, alone, in a union, optional or through an alias, and leaves
  a ServerNow alone": seven planted files, compiled beside the server's, each compiling cleanly: a parameter, an
  arrow function's parameter that may be null, an optional field, a field of a parameter's own type, a class's field
  and a parameter typed through an alias, each found by its name; and a `ServerNow` alone, in a union and as a field,
  and an array of instants, none found. The cases are compared all at once, so a failure names every case, not only
  the first (since the first run of P6 and P7: section 3.1).
- The header's last paragraph says the time an action happens at never reaches code as a plain instant, and points
  here.

## 2. Tests first

Written before the code (section 1.1) and run on `main`'s code, where the list test fails, naming the 21 of section
0.1 and nothing else (section 3.1, T0); the planted test passes there, since it reads only its own files.

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

## 4. What it leaves to others, and what it costs

- An instant inside an array, a map or a promise isn't read, nor a variable: a function deciding by a list of times
  isn't a shape the server has, and a variable takes no caller's value. A value typed `any` stays the lint's, and
  TypeScript's unsound corners a deliberate way round (part 1's plan, section 1.5).
- A time that is a string or a number (an ISO text, epoch milliseconds) isn't a `Temporal.Instant` and isn't read:
  the server's code passes times as `Temporal.Instant` (the connections' `INSTANT_TYPE`, the contract's
  `contractInstant`), and a route that read a time from a request as text and decided by it would have to make an
  instant, which the clock-read scan and the matrix's manipulations cover only in part.
- The list's reasons are a reviewer's to keep true: the test holds the names, not the meaning. A field moved from a
  row's fact to the time of an action keeps its name and passes; review reads the list in the diff.
- Time: the compiled program is part 1's, read once more; the file's tests take about 6 seconds here.

## 5. Review

To come.
