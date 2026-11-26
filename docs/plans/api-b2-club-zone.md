# api/b2-club-zone: the outside audit's A11: Postgres resolves no club's zone

The outside audit's A11 (medium): one trigger resolved the club's time zone in Postgres, against ADR-008, so a club whose
zone has a name Node takes and Postgres doesn't failed every join after its first days. This slice takes the zone out of
the trigger, and adds two checks that keep any zone out of the server's SQL: one reads the code and the migrations, and
one reads the live schema after every migration has run.

Sources: ADR-008 (the time module resolves every zone with Temporal; Postgres only compares instants); T2 (a day's two
instants in the club's IANA zone); T1 (the server's clock); spec 05 (the club's zone and its dates); FQ130 (a new
member's pick, from the club's local date it opened on); the founder's order of the audit's items (the coordinator's
relay of 10:02 UTC on 2026-11-24): A11 after A14, before A10.

## 0. The finding, re-checked on `main` at `e696eb9`

- `db/migrations/0015_new_member_day.sql`, `app.schedule_change_start_guard()`, line 296:
  `IF NEW.effective_from IS DISTINCT FROM (SELECT (NEW.created_at AT TIME ZONE c.timezone)::date FROM app.clubs c …)`.
  It runs before each insert of a `membership_change` proposal: the pick a join opens once a club's first days have
  applied (`packages/domain/src/schedule/settle-change.ts`, `settleChange`).
- `createClub` keeps the zone as Temporal names it (`packages/domain/src/time/civil.ts`, `clubTimeZone`), and Node 26
  keeps an older name as given: `US/Eastern`, `Europe/Kiev`, `Asia/Calcutta`, `GB`.
- The session's Postgres 16 (Ubuntu 16.15) knows none of those four. It knows `Europe/Kyiv` and `Asia/Kolkata`. Its
  `pg_timezone_names` was read on 2026-11-26; Ubuntu ships the older names in a separate package, which this server
  doesn't read.
- So in a club made as `US/Eastern`, the join after the first days throws `time zone "US/Eastern" not recognized`
  (a 500), and every later join does the same. This is reproduced by the new test below, run on `main`'s schema.
- No other SQL of the server's names or resolves a zone. The new scan found only that line, and the live schema's
  check found only that function.

## 1. The change

### 1.1. Migration `0019_pick_date_without_zone.sql`

It replaces `app.schedule_change_start_guard()` with the same function, except for its date check. The command
works the pick's date out in the club's zone (`settle-change.ts`, `today`), as it does for every date it writes.
Postgres now refuses only a date that no zone puts at the instant the pick opened:
- every zone's offset lies between −12 and +14 hours;
- so a date begins, at +14, 14 hours before its midnight by UTC's clock;
- and it ends, at −12, 12 hours after the next midnight by UTC's.

The check takes the date's epoch, which Postgres reads as nominal (its midnight, with no zone), and the epoch of
`created_at`, which is the instant's. `EXTRACT` gives both exactly, with no zone and no session setting. Reading the
date itself, with no cast to a timestamp, means a date beyond any timestamp's range, or `infinity`, is refused like any
other wrong date, not with a range error. The other checks are 0015's, word for word. 0015 is left as it is, since it
has run in every environment.

The bound holds while every zone keeps its offset between −12 and +14 hours. `one-clock.test.ts`, "keeps every zone's
offset between -12 and +14 hours to 2036 …", checks that against Node's zones, through every transition from 2026 to
2036: the 418 that Node lists, from −11 (Pacific/Midway) to +14 (Pacific/Kiritimati), and Etc's two ends, `Etc/GMT+12`
and `Etc/GMT-14`, which Temporal resolves. It also reads 0019 for the two numbers.

What the database stops holding: the exact date. A command that wrote the date one day off, within the bound, would now
pass the trigger. The command's own tests hold the exact date instead, in `tests/src/db/membership-change.test.ts`:
- "opens the pick from the club's own date, not UTC's: a join on Sunday evening in New York, Monday by UTC (T1)", a
  club behind UTC;
- "opens the pick from the club's own date ahead of UTC's: a join on Monday morning in Auckland, Sunday by UTC (T1)", a
  club ahead of it;
- every pick test there that reads `effective_from: TODAY`, a day after or before which fails 12 and 7 of them (the privacy and security review's run).

With the command's date taken by UTC's clock instead, three tests fail, the two above among them.

### 1.2. `createClub` is unchanged

The audit also suggested that `createClub` require the name in `pg_timezone_names`, or store Node's canonical name.
Neither is done:
- Once Postgres resolves no zone, its list decides nothing.
- Requiring it would refuse a name the iPhone sends (`TimeZone.current.identifier`) that Node resolves correctly.
- Node 26 gives no name that every Postgres knows. Temporal's `timeZoneId` keeps the name as given. `Intl`'s
  `resolvedOptions().timeZone` gives ICU's canonical name, not IANA's: it maps `US/Eastern` to `America/New_York` and
  `GB` to `Europe/London`, but `Asia/Kolkata` to `Asia/Calcutta`, and keeps `Europe/Kiev`, and this Postgres knows
  neither of those two.

The checks below keep it that way.

### 1.3. Three checks keep zones out of SQL

- **The code and the migrations:** `packages/domain/src/time/one-clock.test.ts`, "only the time module resolves a time
  zone; SQL compares instants and dates". It reads every product file the clock's scan reads (`productFiles`), and the
  time module's own files, whose clock runs SQL (`timeModule`). It reads each file whole, so a form split over lines is
  read as one, for:
  - `AT TIME ZONE` and `AT LOCAL`;
  - a call of `timezone()`, qualified, quoted or with a space before its bracket;
  - the zone lists `pg_timezone_names` and `pg_timezone_abbrevs`;
  - a function that takes a zone by name, or the session's: `make_timestamptz`, `date_add` and `date_subtract`;
  - `date_trunc`, but on a plain timestamp, which takes no zone (`home.ts`'s);
  - `generate_series` over times;
  - a zone's name built into text (`|| c.timezone`), as a cast would read it;
  - a setting of the zone: `SET [SESSION|LOCAL] TIME ZONE` or `timezone`, `SET "TimeZone"`, `set_config('timezone', …)`,
    `-c timezone=` and `PGTZ`;
  - the client's setting: `TimeZone:`, a quoted `'timezone':`, or a `timezone` key among its `connection` options.

  0015's line and the contract's prose "timezone (T2)" are kept with their reasons (`ZONES_KEPT`), and a test checks
  that each kept line is still there. The clock's scan already holds SQL's `CURRENT_DATE`, `LOCALTIMESTAMP` and `age()`.
- **The live schema:** `tests/src/db/migrations.test.ts`, "the schema resolves no time zone". After every migration has
  run, it reads app's functions, views, constraints, defaults, indexes and triggers, and the settings Postgres gives
  `tadayo_app`'s sessions (`pg_db_role_setting`, its own or this database's), for SQL's same ways.
  - Each function is read whole, as `pg_get_functiondef` prints it, with its settings (`SET "TimeZone" TO 'UTC'`) and
    its body. A body in SQL's standard form (`RETURN …`, `BEGIN ATOMIC …`) isn't in `prosrc`, which is empty for it;
    two of app's 55 functions have one.
  - It first checks that each kind of object the schema has is read, so an empty answer isn't a check that read
    nothing. The schema has no view yet.
  - A rolled-back test plants one of each and shows the check finds it: a standard-form body with `AT TIME ZONE`, a
    PL/pgSQL body with `timezone (zone_name, at)`, a three-argument `date_trunc`, a function's `SET timezone`, a view of
    `pg_timezone_names`, a default of `make_timestamptz`, an index that builds a zone into text, and a setting of
    `tadayo_app`'s zone. That test is how the gap in `prosrc` was found: the first version of the check read `prosrc`,
    and missed the planted body.
  - The domain's scan holds that each of its SQL patterns is in this check too, so the two lists can't drift apart.
  - The schema's dependencies can't do this job: Postgres records no dependency on its own built-in functions, so
    `pg_depend` names none of these (tried in the session: a view, a default, a constraint and an index on each, all
    rolled back, gave no row).
- **The session's zone:** SQL can take the session's zone without naming one: a cast between a `timestamptz` and a
  date or a timestamp, `to_char`, a field but the epoch, or a day's interval on a `timestamptz`. Their words can't tell
  them from a date's own. So every database test runs in a session zone 14 hours from UTC, `Pacific/Kiritimati`
  (`tests/src/db/harness.ts`, `SESSION_ZONE`), where such SQL gives another date than UTC's for most of each day, and
  the tests that hold each date would fail. "runs every database test in a session zone 14 hours from UTC …" checks the
  setting on each kind of connection. All 959 database tests pass in that zone. The privacy matrix's world is built
  through the same connections; the API it drives opens its own (`@tadayo/api`'s `connect`), in the database's own
  zone.

Left to review: SQL that takes the session's zone on a path no database test runs.

## 2. Tests first

Written before the migration, and run on `main`'s schema with the session's Postgres 16, on 2026-11-26 at 19:01 UTC.
Four failed, each for the reason this slice fixes:
- `membership-change.test.ts`, "opens a pick in a club whose zone has an older name Postgres needn't know …": failed
  with `PostgresError: time zone "US/Eastern" not recognized`.
- `schedule-proposals.test.ts`, "never resolves the club's zone: a club whose zone no Postgres knows still opens a pick":
  failed with `time zone "Nowhere/Tadayo" not recognized`.
- `schedule-proposals.test.ts`, "is proposed open, at version 1 …" (now "… on a date some zone puts at the instant it
  opened"): the bound's accepted edges, 10:00 UTC on 30 June
  and 11:59:59.999999 on 2 July for 1 July, were refused with "a membership change is from the club's local date it
  opened on, not 2026-07-01".
- `migrations.test.ts`, "finds none in a function, view, constraint, default, index or trigger of app's": found
  `function app.schedule_change_start_guard(): AT TIME ZONE or AT LOCAL`.

Two passed on `main` too, as they should: "the club's own date, not UTC's", and the live check's planted cases. With
0019, all six pass. The live check's rolled-back test, added after that run, passes on either schema.

The trigger's test changed. On `main` it refused the 7th at 22:00 UTC on Friday 6 November, and the 30th of June at
23:30 UTC on that day for a London club. Both are dates some zone puts at those instants, so the database no longer
refuses them, and the command's tests hold the exact date. The test now refuses:
- the 5th, the 8th and the Monday after;
- each bound to the microsecond.

It accepts both edges.

## 3. What it leaves to others

- Supabase's zone list, and `ci`'s `postgres:17.11` image's, are unread. Neither matters once Postgres resolves no zone;
  the audit's "Could not verify" item 4 is moot for this check. Where Postgres has `US/Eastern`, the test of a club made
  with it only shows that the join goes through; `schedule-proposals.test.ts`'s `Nowhere/Tadayo`, a zone no Postgres
  knows, holds the trigger on any Postgres.
- Device registrations keep their zone name the same way (`packages/domain/src/identity/devices.ts`), for quiet hours
  later (S4). The scan holds that any use of it is TypeScript's.
- `0019` runs on `dev` with `deploy-dev` after the merge: a `CREATE OR REPLACE FUNCTION`, nothing destructive.

## 4. Verified

The session's own runs are in the journal's entries for each commit (section 3.2), and `ci` is on the PR.

## 5. Review, round 1

Two fresh subagents, one general and one for privacy and security, read the first commit, `1e6ee76`. Neither found a
blocking defect. Their findings, merged, and what the second commit did with each:

| # | Finding | Done |
| --- | --- | --- |
| R1-1 | Both checks missed SQL that takes a zone by name: `make_timestamptz`, `date_add`, `date_subtract`, a three-argument `date_trunc`, `generate_series` with a zone, a zone built into text and cast, `timezone (x, …)` with a space and a bare first argument, and a quoted `"timezone"(…)`. | Fixed: each is a pattern in both checks, planted lines and planted schema objects hold them, and the domain's scan holds that the lists match. `pg_depend` was tried and can't help (section 1.3). |
| R1-2 | Nothing caught SQL that takes the session's zone without naming one. | Fixed: every database test runs in `Pacific/Kiritimati`'s zone (section 1.3), and all pass there. |
| R1-3 | The code scan skipped the time module, whose clock runs SQL. | Fixed: it reads `timeModule()` too, and a test checks `clock.ts` is among them. |
| R1-4 | The code scan read a line at a time, so a form split over lines was missed. | Fixed: each file is read whole, and planted split forms are caught. |
| R1-5 | The plan and the journal said Node has no call that gives a canonical name; `Intl` gives ICU's. | Fixed: section 1.2 now says what `Intl` gives (run on Node 26), and why that doesn't help. |
| R1-6 | Settings the checks didn't read: role and database settings, a lower-case or quoted client key, `-c TimeZone=`, `PGTZ`. | Fixed: the live check reads `tadayo_app`'s settings, and the code scan the client's other spellings, `-c timezone=` and `PGTZ`. |
| R1-7 | "Checks that each kind of object it reads exists" wasn't true of views, which the schema hasn't any of. | Fixed: the words now say each kind the schema has, and the rolled-back test reads a view. |
| R1-8 | A date beyond a timestamp's range raised a range error, not the guard's. | Fixed: 0019 reads the date's own epoch, with no cast (section 1.1). |
| R1-9 | The patterns could flag prose (`at local`, `set timezone`). | Answered: a false alarm fails loudly, and is reworded or kept with its reason; a miss is silent. The scan finds no prose today. |
| R1-10 | A test title named a case it didn't have, and the two lists could drift apart. | Fixed: the title, and the drift check (section 1.3). |
| R1-11 | The command's exact date was held only for a club behind UTC. | Fixed: the Auckland test, which fails with UTC's date (section 1.1). |
| R1-12 | The `US/Eastern` test only bites where Postgres lacks the name. | Answered: its comment and section 3 say so; the `Nowhere/Tadayo` test holds the trigger on any Postgres. |
| R1-13 | The guard test's title still said "from the club's local date". | Fixed: "… on a date some zone puts at the instant it opened". |
