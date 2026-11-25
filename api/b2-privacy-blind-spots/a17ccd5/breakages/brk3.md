| | Breakage | On this branch | Control (`main`'s tests, or round 1's) |
|---|---|---|---|
| B1 | readableDrops and mayRead without the author's account being active | the matrix as "member in the audience": caught (exit 1); `authorization.test.ts`: caught (exit 1) | the matrix as "member in the audience": passed (missed) |
| B2 | starKeepsDay and mayRead without the star's leaving before the reveal | the matrix as "member in the audience": caught (exit 1); `authorization.test.ts`: caught (exit 1) | the matrix as "member in the audience": passed (missed) |
| B3 | starKeepsDay and mayRead without the star's deletion asked before the reveal | the matrix as "member in the audience": caught (exit 1); `authorization.test.ts`: caught (exit 1) | the matrix as "member in the audience": passed (missed) |
| B4 | a one-way block: the viewer's own block of the author dropped, in both fragments | the matrix as "blocked: Cleo blocked the author, both still members": caught (exit 1); `home.test.ts`: caught (exit 1); `authorization.test.ts`: caught (exit 1) | the matrix as "blocked: Cleo blocked the author, leaving by the block": passed (missed); `home.test.ts`: passed (missed) |
| B5 | no block at all, in both fragments and mayRead | the matrix as "blocked: Cleo blocked the author, both still members": caught (exit 1); `home.test.ts`: caught (exit 1); `authorization.test.ts`: caught (exit 1) | the matrix as "blocked: the author blocked Cleo as the day opened, leaving by the block and keeping the drop (FQ88)": failed, so caught already |
| B6 | the audit's inline Home: the page's drops by its own statement, with a one-way block | `one-module.test.ts`: caught (exit 1); `home.test.ts`: caught (exit 1); the matrix as "blocked: Cleo blocked the author, both still members": caught (exit 1) | the matrix as "blocked: Cleo blocked the author, leaving by the block": passed (missed); `home.test.ts`: passed (missed) |
| B7 | Home's time from `?t=` by a cast to ServerNow | `one-clock.test.ts`: caught (exit 1); the matrix as "member in the audience": caught (exit 1) | the matrix as "member in the audience": passed (missed) |
| B8 | Home's time from If-Modified-Since by a cast to ServerNow | `one-clock.test.ts`: caught (exit 1); the matrix as "member in the audience": caught (exit 1) | the matrix as "member in the audience": passed (missed) |
| B9 | Home's time from `?t=` by a typed query whose row says it holds a ServerNow, with no cast (the instant bound as a Temporal.Instant, which the API's instant type takes) | `one-clock.test.ts`: caught (exit 1); the matrix as "member in the audience": caught (exit 1) | the matrix as "member in the audience": passed (missed) |
| B10 | a block keyed by the blocked person's interval rather than their account, in both fragments | `home.test.ts`: caught (exit 1); `authorization.test.ts`: caught (exit 1); the matrix as "blocked: Cleo blocked the author, both still members", registered beforehand as a miss: passed, as registered (exit 0) | `home.test.ts`: passed (missed); `authorization.test.ts`: passed (missed) |
| B11 | a view of the audience made in a migration, outside the authorization module | `one-module.test.ts`: caught (exit 1) | none |
| B12 | readableDrops alone without starKeepsDay (mayRead and the day choice keep it) | `authorization.test.ts`: caught (exit 1); the matrix as "member in the audience", registered beforehand as a miss: passed, as registered (exit 0) | none |
| B13 | Home's time from `?since=` by a typed query whose row is a named type, so the query's line never says ServerNow (round 2's R2-1) | `one-clock.test.ts`: caught (exit 1); the matrix as "member in the audience", registered beforehand as a miss: passed, as registered (exit 0) | round 1's tests (`a43d484`), `one-clock.test.ts`: passed (missed); `main`'s tests, `one-clock.test.ts`: passed (missed) |
| B14 | Home's time from `?since=` by a query whose rows are typed by their variable, with no type argument and no cast (round 2's R2-1) | `one-clock.test.ts`: caught (exit 1); the matrix as "member in the audience", registered beforehand as a miss: passed, as registered (exit 0) | round 1's tests (`a43d484`), `one-clock.test.ts`: passed (missed); `main`'s tests, `one-clock.test.ts`: passed (missed) |
| B15 | Home's `server_now` from `?since=`, with no cast: `homeBody` takes a plain Temporal.Instant (round 2's R2-3, out of this slice's reach) | `one-clock.test.ts`, registered beforehand as a miss: passed, as registered (exit 0); the matrix as "member in the audience", registered beforehand as a miss: passed, as registered (exit 0) | none |

B5 under `main`'s tests failed, so `main` already caught it: FQ88's role has the author block Cleo and leave, keeping the drop, so the author's block of the viewer is that cell's only denial. B10's and B12's matrix runs were registered beforehand as misses: the matrix's block role names Ben's interval in its own club, and Home reads drops only from days its day choice keeps, which holds `starKeepsDay` itself (the plan's section 4). B9 to B12 are round 1's (section 6); B11 has no control, since `main` has no scan of the module to run. B13 to B15 are round 2's: B13's and B14's matrix runs were registered beforehand as misses, since no manipulation sends `since`, and round 1's line scan missed both (its control); B15 was registered beforehand as missed by both suites, since `homeBody` takes a plain instant (R2-3; the third slice's, the plan's section 5). B7 to B9 and B13 to B15 ran against the compiler check; B1 to B6 and B10 to B12 are as run at the second commit, since the third changes nothing they run. B9 was first written binding the query's string, which the API's instant type refuses, so the route answered 500 and the matrix failed for that; written to bind a `Temporal.Instant`, as here, the matrix fails on the moved time itself (Home's `club_today`, `next`, `recent_days` and `server_now`). The first run is kept under `b9-first/`.

Home's judge (`tests/src/privacy/home.ts`) without each of its rules in turn: 22 of 22 caught by `tests/src/privacy/home.test.ts` (Home's judge had no test of its own on `main`):
- J01, mayView without the viewer's account: caught (exit 1)
- J02, mayView without the audience: caught (exit 1)
- J03, mayView without the viewer's interval ended: caught (exit 1)
- J04, mayView without the drop's state: caught (exit 1)
- J05, mayView without the day's status: caught (exit 1)
- J06, mayView without the club's suspension: caught (exit 1)
- J07, mayView without the star gone before the reveal: caught (exit 1)
- J08, mayView without the star's deletion before the reveal: caught (exit 1)
- J09, mayView without the author's account: caught (exit 1)
- J10, mayView without a block either way: caught (exit 1)
- J11, mayView without the viewer's own block of the author: caught (exit 1)
- J12, mayView without the author's block of the viewer: caught (exit 1)
- J13, mayView without the reveal: caught (exit 1)
- J14, mayView without the star's leaving at any time: caught (exit 1)
- J15, mayView without the star's deletion at any time: caught (exit 1)
- J16, mayView without anyone's block: caught (exit 1)
- J17, mayView without the audience's interval being the viewer's active one: caught (exit 1)
- J18, recentFor without its newest-first order: caught (exit 1)
- J19, pageFor breaking a tie by a locale's order, not byte by byte: caught (exit 1)
- J20, homeFor waiting for the next day before the open one: caught (exit 1)
- J21, homeFor pausing a member left alone before waiting for the next day: caught (exit 1)
- J22, a suspended club that hasn't started awaiting activation, not unavailable (the modes' order swapped; round 2's R2-7): caught (exit 1)
