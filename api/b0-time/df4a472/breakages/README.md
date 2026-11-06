# Slice 5's breakage run: the time module

Each breakage is one exact change of text in one file of the time module (`packages/domain/src/time/`), the package's entry (`packages/domain/src/index.ts`) or the dev clock's table (`tools/ops/sql/dev_clock.sql`): a wrong rule from ADR-008 or spec 05 put in, a check taken out, a precision lost. For each, the tests that judge that file run: the domain's unit tests (`pnpm --filter @tadayo/domain exec vitest run src/time`), the database's `tests/src/db/clock.test.ts` against a server made like `ci`'s, or both. The verdicts:

- **CAUGHT**: at least one test failed; the failing tests are named below.
- **MISSED**: every test passed.

Each file is restored after its breakage; at the end, every file the run touched matched its SHA-256 from before it.

- **Commit:** `df4a472` on `api/b0-time`, slice 5's first commit. The run was made on its tree, with nothing else changed (`git status` clean before and after).
- **Server:** the session's PostgreSQL 16, made like `ci`'s service (ADR-026): its first role `supabase_admin`, Supabase's roles made by `tools/ci/ci_steps.py db-bootstrap`. `ci`'s Postgres 17 is the authority for the suite itself.
- **Result:** 34 breakages: 33 caught, 1 missed. The one missed, `contractInstant` rounding with `trunc` for `floor`, can't be caught: Temporal rounds an instant as if its count of nanoseconds since 1970 were positive (the proposal's RoundNumberToIncrementAsIfPositive), so `trunc` and `floor` give the same instant for every value, 1969's included, and no test can tell them apart.

## How to run them again

1. Check out the commit above in a working tree, with Node 26 and pnpm 12.16.1 (`docs/JOURNAL.md`, block 1.1, "How to run and check everything"), and run `pnpm install`.
2. Make a server like `ci`'s on port 5432. `pgci.sh` does it for the session's PostgreSQL 16 (as root): it stops and deletes the cluster at `/var/lib/postgresql/pgci`, then `initdb --username=supabase_admin` with the password `postgres` and starts it. `FRESH=1 REPO=<your working tree> bash dbtest.sh` remakes it, runs `python3 tools/ci/ci_steps.py db-bootstrap` and then the database tests.
3. `REPO=<your working tree> python3 run_breakages.py`, with optional words that pick breakages by name. It runs `dbtest.sh` from its own folder, restores each file after its breakage, checks every file's SHA-256 at the end, and writes `results.json` beside it, over the published one.

Each breakage takes about ten seconds on the session's machine.

## The breakages

### 1. gap: Temporal's compatible: CAUGHT

In `packages/domain/src/time/civil.ts`, this:

      const jump = first.getTimeZoneTransition("next");

becomes this:

      return wall.toZonedDateTime(zone).toInstant();
      const jump = first.getTimeZoneTransition("next");

Suites run: unit exit 1.

Tests that failed:

- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > closes St John's Saturday 12 March 2011 at 1:01 AM, when the clocks jumped there
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in America/Goose_Bay, 2011-03-13 01:00 is 2011-03-13T04:01:00Z, not 2011-03-13T05:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in America/St_Johns, 2011-03-13 01:00 is 2011-03-13T03:31:00Z, not 2011-03-13T04:30:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Antarctica/Casey, 2022-10-02 01:00 is 2022-10-01T16:01:00Z, not 2022-10-01T17:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Antarctica/Troll, 2026-03-29 02:00 is 2026-03-29T01:00:00Z, not 2026-03-29T02:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Australia/Lord_Howe, 2026-10-04 02:15 is 2026-10-03T15:30:00Z, not 2026-10-03T15:45:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Europe/London, 2026-03-29 01:30 is 2026-03-29T01:00:00Z, not 2026-03-29T01:30:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Pacific/Apia, 2011-12-30 01:00 is 2011-12-30T10:00:00Z, not 2011-12-30T11:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Pacific/Apia, 2011-12-30 07:00 is 2011-12-30T10:00:00Z, not 2011-12-30T17:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > keeps the days around a date its zone skipped in order: each opens once the one before has closed
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/Goose_Bay in 2011: 1 missing (1 inside a gap) and 1 doubled, days of 1021 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/St_Johns in 2011: 1 missing (1 inside a gap) and 1 doubled, days of 1021 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Antarctica/Casey in 2022: 1 missing (1 inside a gap) and 0 doubled, days of 1021 to 1260 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Pacific/Apia in 2011: 2 missing (2 inside a gap) and 0 doubled, days of 60 to 1080 minutes

### 2. gap: later: CAUGHT

In `packages/domain/src/time/civil.ts`, this:

      const jump = first.getTimeZoneTransition("next");

becomes this:

      return wall.toZonedDateTime(zone, { disambiguation: "later" }).toInstant();
      const jump = first.getTimeZoneTransition("next");

Suites run: unit exit 1.

Tests that failed:

- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > closes St John's Saturday 12 March 2011 at 1:01 AM, when the clocks jumped there
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in America/Goose_Bay, 2011-03-13 01:00 is 2011-03-13T04:01:00Z, not 2011-03-13T05:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in America/St_Johns, 2011-03-13 01:00 is 2011-03-13T03:31:00Z, not 2011-03-13T04:30:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Antarctica/Casey, 2022-10-02 01:00 is 2022-10-01T16:01:00Z, not 2022-10-01T17:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Antarctica/Troll, 2026-03-29 02:00 is 2026-03-29T01:00:00Z, not 2026-03-29T02:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Australia/Lord_Howe, 2026-10-04 02:15 is 2026-10-03T15:30:00Z, not 2026-10-03T15:45:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Europe/London, 2026-03-29 01:30 is 2026-03-29T01:00:00Z, not 2026-03-29T01:30:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Pacific/Apia, 2011-12-30 01:00 is 2011-12-30T10:00:00Z, not 2011-12-30T11:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Pacific/Apia, 2011-12-30 07:00 is 2011-12-30T10:00:00Z, not 2011-12-30T17:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > keeps the days around a date its zone skipped in order: each opens once the one before has closed
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/Goose_Bay in 2011: 1 missing (1 inside a gap) and 1 doubled, days of 1021 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/St_Johns in 2011: 1 missing (1 inside a gap) and 1 doubled, days of 1021 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Antarctica/Casey in 2022: 1 missing (1 inside a gap) and 0 doubled, days of 1021 to 1260 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Pacific/Apia in 2011: 2 missing (2 inside a gap) and 0 doubled, days of 60 to 1080 minutes

### 3. doubled: later: CAUGHT

In `packages/domain/src/time/civil.ts`, this:

    { disambiguation: "earlier" }

becomes this:

    { disambiguation: "later" }

Suites run: unit exit 1.

Tests that failed:

- src/time/civil.test.ts > London's missing and doubled 1 AM (TECH-DESIGN section 8) > closes Saturday 24 October 2026 at the first of its two 1 AMs, not the later one AT TIME ZONE would give
- src/time/civil.test.ts > London's missing and doubled 1 AM (TECH-DESIGN section 8) > closes Saturday 28 March 2026 at 2 AM summer time, since 1 AM doesn't exist, not a whole gap early
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in America/New_York, 2026-10-31 opens at 2026-10-31T11:00:00Z and closes at 2026-11-01T05:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Antarctica/Troll, 2026-03-28 opens at 2026-03-28T07:00:00Z and closes at 2026-03-29T01:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Antarctica/Troll, 2026-10-24 opens at 2026-10-24T05:00:00Z and closes at 2026-10-24T23:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Europe/London, 2026-03-28 opens at 2026-03-28T07:00:00Z and closes at 2026-03-29T01:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Europe/London, 2026-10-24 opens at 2026-10-24T06:00:00Z and closes at 2026-10-25T00:00:00Z, 18 hours later
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > closes St John's Saturday 12 March 2011 at 1:01 AM, when the clocks jumped there
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in America/Goose_Bay, 2011-03-13 01:00 is 2011-03-13T04:01:00Z, not 2011-03-13T05:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in America/St_Johns, 2011-03-13 01:00 is 2011-03-13T03:31:00Z, not 2011-03-13T04:30:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Antarctica/Casey, 2022-10-02 01:00 is 2022-10-01T16:01:00Z, not 2022-10-01T17:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Antarctica/Troll, 2026-03-29 02:00 is 2026-03-29T01:00:00Z, not 2026-03-29T02:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Australia/Lord_Howe, 2026-10-04 02:15 is 2026-10-03T15:30:00Z, not 2026-10-03T15:45:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Europe/London, 2026-03-29 01:30 is 2026-03-29T01:00:00Z, not 2026-03-29T01:30:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Pacific/Apia, 2011-12-30 01:00 is 2011-12-30T10:00:00Z, not 2011-12-30T11:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Pacific/Apia, 2011-12-30 07:00 is 2011-12-30T10:00:00Z, not 2011-12-30T17:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > keeps the days around a date its zone skipped in order: each opens once the one before has closed
- src/time/civil.test.ts > a wall time that happens twice takes the first (spec 05) > in America/New_York, 2026-11-01 01:00 is 2026-11-01T05:00:00Z, not 2026-11-01T06:00:00Z
- src/time/civil.test.ts > a wall time that happens twice takes the first (spec 05) > in Antarctica/Troll, 2026-10-25 02:00 is 2026-10-25T00:00:00Z, not 2026-10-25T02:00:00Z
- src/time/civil.test.ts > a wall time that happens twice takes the first (spec 05) > in Australia/Lord_Howe, 2026-04-05 01:45 is 2026-04-04T14:45:00Z, not 2026-04-04T15:15:00Z
- src/time/civil.test.ts > a wall time that happens twice takes the first (spec 05) > in Europe/London, 2026-10-25 01:30 is 2026-10-25T00:30:00Z, not 2026-10-25T01:30:00Z
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/Goose_Bay in 2011: 1 missing (1 inside a gap) and 1 doubled, days of 1021 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/New_York in 2026: 0 missing (0 inside a gap) and 1 doubled, days of 1080 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/St_Johns in 2011: 1 missing (1 inside a gap) and 1 doubled, days of 1021 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Antarctica/Casey in 2022: 1 missing (1 inside a gap) and 0 doubled, days of 1021 to 1260 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Antarctica/Troll in 2026: 1 missing (0 inside a gap) and 1 doubled, days of 1080 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Antarctica/Troll in 2027, whatever the tzdata says then
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Europe/London in 2026: 1 missing (0 inside a gap) and 1 doubled, days of 1080 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Europe/London in 2027, whatever the tzdata says then
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Pacific/Apia in 2011: 2 missing (2 inside a gap) and 0 doubled, days of 60 to 1080 minutes

### 4. doubled: compatible everywhere: CAUGHT

In `packages/domain/src/time/civil.ts`, this:

    const first = wall.toZonedDateTime(clubTimeZone(zone), { disambiguation: "earlier" });

becomes this:

    const first = wall.toZonedDateTime(clubTimeZone(zone), { disambiguation: "compatible" });

Suites run: unit exit 1.

Tests that failed:

- src/time/civil.test.ts > London's missing and doubled 1 AM (TECH-DESIGN section 8) > closes Saturday 28 March 2026 at 2 AM summer time, since 1 AM doesn't exist, not a whole gap early
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Antarctica/Troll, 2026-03-28 opens at 2026-03-28T07:00:00Z and closes at 2026-03-29T01:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Europe/London, 2026-03-28 opens at 2026-03-28T07:00:00Z and closes at 2026-03-29T01:00:00Z, 18 hours later
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > closes St John's Saturday 12 March 2011 at 1:01 AM, when the clocks jumped there
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in America/Goose_Bay, 2011-03-13 01:00 is 2011-03-13T04:01:00Z, not 2011-03-13T05:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in America/St_Johns, 2011-03-13 01:00 is 2011-03-13T03:31:00Z, not 2011-03-13T04:30:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Antarctica/Casey, 2022-10-02 01:00 is 2022-10-01T16:01:00Z, not 2022-10-01T17:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Antarctica/Troll, 2026-03-29 02:00 is 2026-03-29T01:00:00Z, not 2026-03-29T02:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Australia/Lord_Howe, 2026-10-04 02:15 is 2026-10-03T15:30:00Z, not 2026-10-03T15:45:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Europe/London, 2026-03-29 01:30 is 2026-03-29T01:00:00Z, not 2026-03-29T01:30:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Pacific/Apia, 2011-12-30 01:00 is 2011-12-30T10:00:00Z, not 2011-12-30T11:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > in Pacific/Apia, 2011-12-30 07:00 is 2011-12-30T10:00:00Z, not 2011-12-30T17:00:00Z
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > keeps the days around a date its zone skipped in order: each opens once the one before has closed
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/Goose_Bay in 2011: 1 missing (1 inside a gap) and 1 doubled, days of 1021 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/St_Johns in 2011: 1 missing (1 inside a gap) and 1 doubled, days of 1021 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Antarctica/Casey in 2022: 1 missing (1 inside a gap) and 0 doubled, days of 1021 to 1260 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Antarctica/Troll in 2026: 1 missing (0 inside a gap) and 1 doubled, days of 1080 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Antarctica/Troll in 2027, whatever the tzdata says then
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Europe/London in 2026: 1 missing (0 inside a gap) and 1 doubled, days of 1080 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Europe/London in 2027, whatever the tzdata says then
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Pacific/Apia in 2011: 2 missing (2 inside a gap) and 0 doubled, days of 60 to 1080 minutes

### 5. close = reveal + 18h: CAUGHT

In `packages/domain/src/time/civil.ts`, this:

    const closeAt = resolveCivilTime(localDate.add({ days: 1 }), CLOSE_TIME, zone);

becomes this:

    const closeAt = revealAt.add({ hours: 18 });

Suites run: unit exit 1.

Tests that failed:

- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in America/Santiago, 2026-04-04 opens at 2026-04-04T10:00:00Z and closes at 2026-04-05T05:00:00Z, 19 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in America/Santiago, 2026-09-05 opens at 2026-09-05T11:00:00Z and closes at 2026-09-06T04:00:00Z, 17 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > resolves 1 AM on its own, never as 7 AM plus a duration (Santiago, 4 April and 5 September 2026)
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > closes St John's Saturday 12 March 2011 at 1:01 AM, when the clocks jumped there
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > keeps the days around a date its zone skipped in order: each opens once the one before has closed
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/Goose_Bay in 2011: 1 missing (1 inside a gap) and 1 doubled, days of 1021 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/Santiago in 2026: 0 missing (0 inside a gap) and 0 doubled, days of 1020 to 1140 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/Santiago in 2027, whatever the tzdata says then
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/St_Johns in 2011: 1 missing (1 inside a gap) and 1 doubled, days of 1021 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Antarctica/Casey in 2022: 1 missing (1 inside a gap) and 0 doubled, days of 1021 to 1260 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Pacific/Apia in 2011: 2 missing (2 inside a gap) and 0 doubled, days of 60 to 1080 minutes

### 6. close on the same date: CAUGHT

In `packages/domain/src/time/civil.ts`, this:

    resolveCivilTime(localDate.add({ days: 1 }), CLOSE_TIME, zone)

becomes this:

    resolveCivilTime(localDate, CLOSE_TIME, zone)

Suites run: unit exit 1.

Tests that failed:

- src/time/civil.test.ts > London's missing and doubled 1 AM (TECH-DESIGN section 8) > closes Saturday 24 October 2026 at the first of its two 1 AMs, not the later one AT TIME ZONE would give
- src/time/civil.test.ts > London's missing and doubled 1 AM (TECH-DESIGN section 8) > closes Saturday 28 March 2026 at 2 AM summer time, since 1 AM doesn't exist, not a whole gap early
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > gives every member the same two instants, whatever zone the server or the member is in (Q03)
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Africa/Ouagadougou, 2026-03-28 opens at 2026-03-28T07:00:00Z and closes at 2026-03-29T01:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Africa/Ouagadougou, 2026-10-24 opens at 2026-10-24T07:00:00Z and closes at 2026-10-25T01:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in America/New_York, 2026-03-07 opens at 2026-03-07T12:00:00Z and closes at 2026-03-08T06:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in America/New_York, 2026-03-09 opens at 2026-03-09T11:00:00Z and closes at 2026-03-10T05:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in America/New_York, 2026-10-31 opens at 2026-10-31T11:00:00Z and closes at 2026-11-01T05:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in America/New_York, 2026-11-02 opens at 2026-11-02T12:00:00Z and closes at 2026-11-03T06:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in America/Santiago, 2026-04-04 opens at 2026-04-04T10:00:00Z and closes at 2026-04-05T05:00:00Z, 19 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in America/Santiago, 2026-04-06 opens at 2026-04-06T11:00:00Z and closes at 2026-04-07T05:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in America/Santiago, 2026-09-05 opens at 2026-09-05T11:00:00Z and closes at 2026-09-06T04:00:00Z, 17 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in America/Santiago, 2026-09-07 opens at 2026-09-07T10:00:00Z and closes at 2026-09-08T04:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Antarctica/Troll, 2026-03-28 opens at 2026-03-28T07:00:00Z and closes at 2026-03-29T01:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Antarctica/Troll, 2026-03-30 opens at 2026-03-30T05:00:00Z and closes at 2026-03-30T23:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Antarctica/Troll, 2026-10-24 opens at 2026-10-24T05:00:00Z and closes at 2026-10-24T23:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Antarctica/Troll, 2026-10-26 opens at 2026-10-26T07:00:00Z and closes at 2026-10-27T01:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Australia/Lord_Howe, 2026-04-04 opens at 2026-04-03T20:00:00Z and closes at 2026-04-04T14:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Australia/Lord_Howe, 2026-04-06 opens at 2026-04-05T20:30:00Z and closes at 2026-04-06T14:30:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Australia/Lord_Howe, 2026-10-03 opens at 2026-10-02T20:30:00Z and closes at 2026-10-03T14:30:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Australia/Lord_Howe, 2026-10-05 opens at 2026-10-04T20:00:00Z and closes at 2026-10-05T14:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Europe/London, 2026-03-27 opens at 2026-03-27T07:00:00Z and closes at 2026-03-28T01:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Europe/London, 2026-03-28 opens at 2026-03-28T07:00:00Z and closes at 2026-03-29T01:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Europe/London, 2026-03-30 opens at 2026-03-30T06:00:00Z and closes at 2026-03-31T00:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Europe/London, 2026-10-24 opens at 2026-10-24T06:00:00Z and closes at 2026-10-25T00:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > in Europe/London, 2026-10-26 opens at 2026-10-26T07:00:00Z and closes at 2026-10-27T01:00:00Z, 18 hours later
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > opens at 7 AM on the date and closes at 1 AM on the next, in the club's zone
- src/time/civil.test.ts > a day's two instants (T2, ADR-008) > resolves 1 AM on its own, never as 7 AM plus a duration (Santiago, 4 April and 5 September 2026)
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > closes St John's Saturday 12 March 2011 at 1:01 AM, when the clocks jumped there
- src/time/civil.test.ts > a wall time that doesn't exist takes the next valid instant (spec 05) > keeps the days around a date its zone skipped in order: each opens once the one before has closed
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Africa/Ouagadougou in 2026: 0 missing (0 inside a gap) and 0 doubled, days of 1080 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Africa/Ouagadougou in 2027, whatever the tzdata says then
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/Goose_Bay in 2011: 1 missing (1 inside a gap) and 1 doubled, days of 1021 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/New_York in 2026: 0 missing (0 inside a gap) and 1 doubled, days of 1080 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/New_York in 2027, whatever the tzdata says then
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/Santiago in 2026: 0 missing (0 inside a gap) and 0 doubled, days of 1020 to 1140 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/Santiago in 2027, whatever the tzdata says then
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in America/St_Johns in 2011: 1 missing (1 inside a gap) and 1 doubled, days of 1021 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Antarctica/Casey in 2022: 1 missing (1 inside a gap) and 0 doubled, days of 1021 to 1260 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Antarctica/Troll in 2026: 1 missing (0 inside a gap) and 1 doubled, days of 1080 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Antarctica/Troll in 2027, whatever the tzdata says then
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Australia/Lord_Howe in 2026: 0 missing (0 inside a gap) and 0 doubled, days of 1080 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Australia/Lord_Howe in 2027, whatever the tzdata says then
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Europe/London in 2026: 1 missing (0 inside a gap) and 1 doubled, days of 1080 to 1080 minutes
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Europe/London in 2027, whatever the tzdata says then
- src/time/civil.test.ts > every date of a year, each instant checked by the two rules > in Pacific/Apia in 2011: 2 missing (2 inside a gap) and 0 doubled, days of 60 to 1080 minutes

### 7. no IANA check: CAUGHT

In `packages/domain/src/time/civil.ts`, this:

    if (!/^[A-Za-z]/.test(zone))

becomes this:

    if (false)

Suites run: unit exit 1.

Tests that failed:

- src/time/civil.test.ts > the club's zone (T2, FQ19) > is an IANA name: never a bare offset, which has no clock changes and which the contract refuses

### 8. zone by Intl: CAUGHT

In `packages/domain/src/time/civil.ts`, this:

    return Temporal.PlainDate.from("2026-01-01").toZonedDateTime(zone).timeZoneId;

becomes this:

    return new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;

Suites run: unit exit 1.

Tests that failed:

- src/time/civil.test.ts > the club's zone (T2, FQ19) > is one Temporal resolves, so a club never has a zone its days can't be found in

### 9. zone kept as given: CAUGHT

In `packages/domain/src/time/civil.ts`, this:

    return Temporal.PlainDate.from("2026-01-01").toZonedDateTime(zone).timeZoneId;

becomes this:

    Temporal.PlainDate.from("2026-01-01").toZonedDateTime(zone);
      return zone;

Suites run: unit exit 1.

Tests that failed:

- src/time/civil.test.ts > the club's zone (T2, FQ19) > comes back in Temporal's one spelling, which the club keeps

### 10. any isolation: CAUGHT

In `packages/domain/src/time/clock.ts`, this:

    if (isolation !== "read committed") {

becomes this:

    if (false) {

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/time/clock.test.ts > prepareClock (ADR-013) > samples only under READ COMMITTED, where dev's offset is the one after the locks, on prod as on dev
- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > refuses to sample outside READ COMMITTED, where dev would read the offset from before the locks, on prod too

### 11. prod: any isolation: CAUGHT

In `packages/domain/src/time/clock.ts`, this:

    SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint::text AS now_us,
                   pg_catalog.current_setting('transaction_isolation') AS isolation

becomes this:

    SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint::text AS now_us,
                   'read committed' AS isolation

Suites run: unit exit 0, db exit 1.

Tests that failed:

- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > refuses to sample outside READ COMMITTED, where dev would read the offset from before the locks, on prod too

### 12. dev: no table read at start: CAUGHT

In `packages/domain/src/time/clock.ts`, this:

        await sql`SELECT offset_microseconds FROM app.dev_clock`;

is taken out.

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/time/clock.test.ts > prepareClock (ADR-013) > reads dev's table once at startup, so a table its role can't read stops dev there (T53)
- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > refuses to start dev when its role can't read the table, rather than at the first request

### 13. dev table: any role: CAUGHT

In `tools/ops/sql/dev_clock.sql`, this:

    IF current_user <> 'tadayo_app' THEN

becomes this:

    IF false THEN

Suites run: db exit 1.

Tests that failed:

- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > is made only as tadayo_app, which then owns it, with nothing PUBLIC can run (T53)

### 14. dev table: PUBLIC runs its function: CAUGHT

In `tools/ops/sql/dev_clock.sql`, this:

    REVOKE EXECUTE ON FUNCTION app.dev_clock_forward() FROM PUBLIC;

becomes this:

    GRANT EXECUTE ON FUNCTION app.dev_clock_forward() TO PUBLIC;

Suites run: db exit 1.

Tests that failed:

- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > holds one offset at most, and keeps the schema closed (T53)
- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > is made only as tadayo_app, which then owns it, with nothing PUBLIC can run (T53)

### 15. fake clock in the main entry: CAUGHT

In `packages/domain/src/index.ts`, this:

    export { contractInstant, INSTANT_TYPE } from "./time/instant.ts";

becomes this:

    export { contractInstant, INSTANT_TYPE } from "./time/instant.ts";
    export { fakeClock } from "./time/testing.ts";

Suites run: unit exit 1.

Tests that failed:

- src/time/clock.test.ts > fakeClock, the tests' clock (TECH-DESIGN section 8) > isn't in the package's main entry, only in @tadayo/domain/testing
- src/time/one-clock.test.ts > only the time module reads a clock (T1) > finds no other code that reads the time

### 16. dev table: back in time: CAUGHT

In `tools/ops/sql/dev_clock.sql`, this:

      IF NEW.offset_microseconds < OLD.offset_microseconds THEN

becomes this:

      IF false THEN

Suites run: db exit 1.

Tests that failed:

- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > only moves forward, so a day that has opened never takes a drop again (T3)

### 17. dev table: negative: CAUGHT

In `tools/ops/sql/dev_clock.sql`, this:

     CHECK (offset_microseconds >= 0)

is taken out.

Suites run: db exit 1.

Tests that failed:

- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > only moves forward, so a day that has opened never takes a drop again (T3)

### 18. dev table: delete: CAUGHT

In `tools/ops/sql/dev_clock.sql`, this:

    CREATE TRIGGER dev_clock_kept BEFORE DELETE

becomes this:

    CREATE TRIGGER dev_clock_kept BEFORE INSERT

Suites run: db exit 1.

Tests that failed:

- src/db/clock.test.ts > the cutoff is the time after the occurrence's lock (T3, ADR-013), the database's half > refuses a drop whose commit waited past 07:00, which a sample from before the wait would have let in
- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > adds its offset on dev, to the microsecond, and nothing with no row
- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > holds one offset at most, and keeps the schema closed (T53)
- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > never reaches prod's clock, even when the table is made after prod's clock started
- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > only moves forward, so a day that has opened never takes a drop again (T3)

### 19. contract: half-expand: CAUGHT

In `packages/domain/src/time/instant.ts`, this:

    roundingMode: "floor"

becomes this:

    roundingMode: "halfExpand"

Suites run: unit exit 1.

Tests that failed:

- src/time/clock.test.ts > an instant leaving the time module > goes into the contract in whole seconds, rounded down, so server_now is never ahead of the server

### 20. contract: trunc: MISSED

In `packages/domain/src/time/instant.ts`, this:

    roundingMode: "floor"

becomes this:

    roundingMode: "trunc"

Suites run: unit exit 0.

No test failed.

### 21. database: milliseconds: CAUGHT

In `packages/domain/src/time/instant.ts`, this:

    fractionalSecondDigits: 6

becomes this:

    fractionalSecondDigits: 3

Suites run: unit exit 1.

Tests that failed:

- src/time/clock.test.ts > an instant leaving the time module > crosses postgres.js as a Temporal.Instant both ways, and as nothing else (T1)
- src/time/clock.test.ts > an instant leaving the time module > goes to the database whole, to the microsecond, as a command stores the clock's sample (T3, T22)

### 22. instant type takes a Date: CAUGHT

In `packages/domain/src/time/instant.ts`, this:

    if (!(value instanceof Temporal.Instant)) {

becomes this:

    if (!(value instanceof Temporal.Instant) && !(value instanceof Date)) {

Suites run: unit exit 1.

Tests that failed:

- src/time/clock.test.ts > an instant leaving the time module > crosses postgres.js as a Temporal.Instant both ways, and as nothing else (T1)

### 23. fake: nanoseconds: CAUGHT

In `packages/domain/src/time/instant.ts`, this:

    if (instant.epochNanoseconds % 1000n !== 0n) {

becomes this:

    if (false) {

Suites run: unit exit 1.

Tests that failed:

- src/time/clock.test.ts > an instant leaving the time module > goes to the database whole, to the microsecond, as a command stores the clock's sample (T3, T22)
- src/time/clock.test.ts > fakeClock, the tests' clock (TECH-DESIGN section 8) > keeps Postgres's precision, microseconds, so what a test compares is what the database stores

### 24. prod gets the dev clock: CAUGHT

In `packages/domain/src/time/clock.ts`, this:

        return PROD_CLOCK;
    

becomes this:

        return DEV_CLOCK;
    

Suites run: unit exit 1.

Tests that failed:

- src/time/clock.test.ts > prepareClock (ADR-013) > gives prod a clock whose query has no offset in it and never names the dev clock

### 25. prod skips its check: CAUGHT

In `packages/domain/src/time/clock.ts`, this:

        if (present) throw new Error("time: prod refuses

becomes this:

        if (false) throw new Error("time: prod refuses

Suites run: unit exit 1.

Tests that failed:

- src/time/clock.test.ts > prepareClock (ADR-013) > refuses to start prod on a database that has a dev clock

### 26. dev skips its check: CAUGHT

In `packages/domain/src/time/clock.ts`, this:

      if (!present)

becomes this:

      if (false)

Suites run: unit exit 1.

Tests that failed:

- src/time/clock.test.ts > prepareClock (ADR-013) > gives dev the clock that adds app.dev_clock's offset, and refuses to start dev without one

### 27. any environment is dev: CAUGHT

In `packages/domain/src/time/clock.ts`, this:

      if (environment !== "dev" && environment !== "prod") {

becomes this:

      if (false) {

Suites run: unit exit 1.

Tests that failed:

- src/time/clock.test.ts > prepareClock (ADR-013) > refuses any environment but exactly dev or prod, so a typo can't pick the dev clock

### 28. prod reads now(): CAUGHT

In `packages/domain/src/time/clock.ts`, this:

    SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint::text AS now_us,

becomes this:

    SELECT (extract(epoch FROM pg_catalog.now()) * 1000000)::bigint::text AS now_us,

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/time/clock.test.ts > prepareClock (ADR-013) > gives prod a clock whose query has no offset in it and never names the dev clock
- src/time/clock.test.ts > prepareClock (ADR-013) > reads clock_timestamp(), the moment it's asked, never now(), the transaction's start
- src/time/clock.test.ts > prepareClock (ADR-013) > refuses an answer that isn't a whole number of microseconds
- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > never reaches prod's clock, even when the table is made after prod's clock started
- src/db/clock.test.ts > the server's clock (ADR-013) > reads the moment it's asked, clock_timestamp(), never the transaction's start
- src/db/clock.test.ts > the server's clock (ADR-013) > reads the time after a lock wait: clock_timestamp() moves on while a transaction waits for a lock (T3)

### 29. dev reads now(): CAUGHT

In `packages/domain/src/time/clock.ts`, this:

    SELECT ((extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint

becomes this:

    SELECT ((extract(epoch FROM pg_catalog.now()) * 1000000)::bigint

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/time/clock.test.ts > prepareClock (ADR-013) > gives dev the clock that adds app.dev_clock's offset, and refuses to start dev without one
- src/time/clock.test.ts > prepareClock (ADR-013) > reads clock_timestamp(), the moment it's asked, never now(), the transaction's start
- src/db/clock.test.ts > the cutoff is the time after the occurrence's lock (T3, ADR-013), the database's half > refuses a drop whose commit waited past 07:00, which a sample from before the wait would have let in
- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > adds its offset on dev, to the microsecond, and nothing with no row

### 30. dev ignores its offset: CAUGHT

In `packages/domain/src/time/clock.ts`, this:

    + coalesce((SELECT offset_microseconds FROM app.dev_clock), 0))

becomes this:

    + 0 * coalesce((SELECT offset_microseconds FROM app.dev_clock), 0))

Suites run: db exit 1.

Tests that failed:

- src/db/clock.test.ts > the cutoff is the time after the occurrence's lock (T3, ADR-013), the database's half > refuses a drop whose commit waited past 07:00, which a sample from before the wait would have let in
- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > adds its offset on dev, to the microsecond, and nothing with no row

### 31. dev offset in seconds: CAUGHT

In `packages/domain/src/time/clock.ts`, this:

    + coalesce((SELECT offset_microseconds FROM app.dev_clock), 0))

becomes this:

    + coalesce((SELECT offset_microseconds / 1000000 * 1000000 FROM app.dev_clock), 0))

Suites run: db exit 1.

Tests that failed:

- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > adds its offset on dev, to the microsecond, and nothing with no row

### 32. sample in milliseconds: CAUGHT

In `packages/domain/src/time/clock.ts`, this:

    SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint::text AS now_us,

becomes this:

    SELECT ((extract(epoch FROM pg_catalog.clock_timestamp()) * 1000)::bigint * 1000)::text AS now_us,

Suites run: db exit 1.

Tests that failed:

- src/db/clock.test.ts > the server's clock (ADR-013) > keeps Postgres's microseconds, and a command's connection stores and reads back each sample exactly (T3, T22)

### 33. dev table: no RLS: CAUGHT

In `tools/ops/sql/dev_clock.sql`, this:

    ALTER TABLE app.dev_clock ENABLE ROW LEVEL SECURITY;

is taken out.

Suites run: db exit 1.

Tests that failed:

- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > holds one offset at most, and keeps the schema closed (T53)

### 34. dev table: many rows: CAUGHT

In `tools/ops/sql/dev_clock.sql`, this:

    only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),

becomes this:

    only_row boolean DEFAULT true,

Suites run: db exit 1.

Tests that failed:

- src/db/clock.test.ts > the dev clock, only on dev (ADR-013) > holds one offset at most, and keeps the schema closed (T53)
