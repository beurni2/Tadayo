# Spike S5: Time

**Result: passed.** The 23 rows of the zone table pass on `ci`. On `dev`, with the worker stopped and `dev`'s clock moved, Home's day choice switched at 07:00 and at 01:00 New York time, each within the second the server's clock reached it, and no answer was on the wrong side of either instant. The run was on Monday 2026-11-16, from `main` at `dedc8a7`, and its 12 checks all passed. For Gate 0 (`docs/MILESTONES.md`: "the reports of spikes S3, S5 and S6 in one PDF, with the measured times").

## What was asked

`docs/MILESTONES.md`'s spike table asks for "Reveal and close instants for the six zones of ADR-008, including Europe/London's missing and doubled 01:00. On `dev` with workers stopped, Home switches at the instant". `docs/plans/B0.md` section 4 adds: "The zone table comes from slice 5's tests. The live half: a few seeded occurrences and a minimal Home read with `server_now`". How S5 does it is in `docs/plans/api-b0-spike-time.md`, built in PR #55 (`ce18cb6`), with its `ops` entry in PR #58 (`6ed0837`).

## The zone table

The table below is `packages/domain/src/time/civil.test.ts`' `ZONE_TABLE`, printed from the file at `dedc8a7` by `zone_table.py` (on `evidence`, beside the runs). Each row is one case of the test "a day's two instants (T2, ADR-008)": `dayInstants` gives that `reveal_at` and `close_at`, and the day lasts that many hours. `civil.test.ts` passed, all 61 of its tests, in `ci` run [43813415764](https://github.com/beurni2/tadayo/actions/runs/43813415764) on `main` at `dedc8a7` (job `node`).

| Zone | Day | Weekday | `reveal_at` | `close_at` | Hours |
|---|---|---|---|---|---|
| Europe/London | 2026-03-27 | Friday | `2026-03-27T07:00:00Z` | `2026-03-28T01:00:00Z` | 18 |
| Europe/London | 2026-03-28 | Saturday | `2026-03-28T07:00:00Z` | `2026-03-29T01:00:00Z` | 18 |
| Europe/London | 2026-03-30 | Monday | `2026-03-30T06:00:00Z` | `2026-03-31T00:00:00Z` | 18 |
| Europe/London | 2026-10-24 | Saturday | `2026-10-24T06:00:00Z` | `2026-10-25T00:00:00Z` | 18 |
| Europe/London | 2026-10-26 | Monday | `2026-10-26T07:00:00Z` | `2026-10-27T01:00:00Z` | 18 |
| America/New_York | 2026-03-07 | Saturday | `2026-03-07T12:00:00Z` | `2026-03-08T06:00:00Z` | 18 |
| America/New_York | 2026-03-09 | Monday | `2026-03-09T11:00:00Z` | `2026-03-10T05:00:00Z` | 18 |
| America/New_York | 2026-10-31 | Saturday | `2026-10-31T11:00:00Z` | `2026-11-01T05:00:00Z` | 18 |
| America/New_York | 2026-11-02 | Monday | `2026-11-02T12:00:00Z` | `2026-11-03T06:00:00Z` | 18 |
| Australia/Lord_Howe | 2026-04-04 | Saturday | `2026-04-03T20:00:00Z` | `2026-04-04T14:00:00Z` | 18 |
| Australia/Lord_Howe | 2026-04-06 | Monday | `2026-04-05T20:30:00Z` | `2026-04-06T14:30:00Z` | 18 |
| Australia/Lord_Howe | 2026-10-03 | Saturday | `2026-10-02T20:30:00Z` | `2026-10-03T14:30:00Z` | 18 |
| Australia/Lord_Howe | 2026-10-05 | Monday | `2026-10-04T20:00:00Z` | `2026-10-05T14:00:00Z` | 18 |
| Antarctica/Troll | 2026-03-28 | Saturday | `2026-03-28T07:00:00Z` | `2026-03-29T01:00:00Z` | 18 |
| Antarctica/Troll | 2026-03-30 | Monday | `2026-03-30T05:00:00Z` | `2026-03-30T23:00:00Z` | 18 |
| Antarctica/Troll | 2026-10-24 | Saturday | `2026-10-24T05:00:00Z` | `2026-10-24T23:00:00Z` | 18 |
| Antarctica/Troll | 2026-10-26 | Monday | `2026-10-26T07:00:00Z` | `2026-10-27T01:00:00Z` | 18 |
| America/Santiago | 2026-04-04 | Saturday | `2026-04-04T10:00:00Z` | `2026-04-05T05:00:00Z` | 19 |
| America/Santiago | 2026-04-06 | Monday | `2026-04-06T11:00:00Z` | `2026-04-07T05:00:00Z` | 18 |
| America/Santiago | 2026-09-05 | Saturday | `2026-09-05T11:00:00Z` | `2026-09-06T04:00:00Z` | 17 |
| America/Santiago | 2026-09-07 | Monday | `2026-09-07T10:00:00Z` | `2026-09-08T04:00:00Z` | 18 |
| Africa/Ouagadougou | 2026-03-28 | Saturday | `2026-03-28T07:00:00Z` | `2026-03-29T01:00:00Z` | 18 |
| Africa/Ouagadougou | 2026-10-24 | Saturday | `2026-10-24T07:00:00Z` | `2026-10-25T01:00:00Z` | 18 |

London's missing 01:00: Saturday 28 March closes at `2026-03-29T01:00:00Z`, the jump to 02:00 summer time. London's doubled 01:00: Saturday 24 October closes at `2026-10-25T00:00:00Z`, the first of its two 1 AMs (spec 05). Troll misses and doubles 01:00 and 02:00 the same nights, Lord Howe's instants move by half an hour, and Santiago's Saturdays of 4 April and 5 September last 19 and 17 hours, so no fixed duration gives `close_at`.

## The live run on `dev`

Three `ops` runs, each started from `main` at `dedc8a7` once the one before had ended, with `dev` claimed through the coordinator from 11:20 to 11:52 UTC:

1. `worker-scale --to stopped`, run [43859352493](https://github.com/beurni2/tadayo/actions/runs/43859352493): "the worker Machine is stopped" at 11:37:43 UTC.
2. `spike-time`, run [43861061798](https://github.com/beurni2/tadayo/actions/runs/43861061798), from 11:49:10 UTC. `dev`'s clock had no lead: its one earlier `dev-clock` run, 43155910874, made it 0 seconds ahead on 2026-11-12, and no run had moved it since. The run signed in a user of its own, made its account the product's way (`GET` and `PATCH /v1/me`), and wrote the club "S5 1fb70b23" in `America/New_York` as `dev`'s clock read between 06:49:39 and 06:49:53 there (the script began at 11:49:39 UTC, and its first move, which left the clock 587 seconds ahead, came at about 11:49:53). Ana's day was Monday 2026-11-16, opening at `2026-11-16T12:00:00Z` (07:00) and closing at `2026-11-17T06:00:00Z` (01:00). Ben's day, Tuesday 2026-11-17, opens at `2026-11-17T12:00:00Z`. The run moved `dev`'s clock to 20 seconds before each instant and read `GET /v1/clubs` as Ana with a 250 ms pause after each answer, about three times a second (60 answers in the 20 seconds before each instant), until five answers had come at or after the instant.
3. `worker-scale --to started`, run [43861320798](https://github.com/beurni2/tadayo/actions/runs/43861320798): "the worker Machine is started" at 11:51:25 UTC. The worker was stopped through the whole of run 2, whose job ran from 11:49:15 to 11:50:40 UTC.

## The measured times

Each answer was checked whole, key for key, against the club list T5 gives at that answer's own `server_now` ("every answer is the club's days as T5 has them at its server_now": ok, at both instants). `server_now` is to the second, the contract's precision.

| Instant | `dev`'s clock moved to | Answers before / at or after | Last answer before | First answer after |
|---|---|---|---|---|
| Reveal, `2026-11-16T12:00:00Z` (07:00) | `11:59:40Z`; lead 0 s before, 587 s after | 60 / 5 | `11:59:59Z`: no open day; next, Ana's 2026-11-16, collecting | `12:00:00Z`, 0 s after: open, Ana's 2026-11-16; next, Ben's 2026-11-17, collecting |
| Close, `2026-11-17T06:00:00Z` (01:00) | `05:59:40Z`; lead 587 s before, 65366 s after | 60 / 5 | `05:59:59Z`: open, Ana's 2026-11-16; next, Ben's 2026-11-17 | `06:00:00Z`, 0 s after: no open day; next, Ben's 2026-11-17, collecting |

## What "Home" means here

What switched is Home's day choice: which day is open now and which opens next. That is `daysByClub` in `packages/domain/src/authorization/days.ts`, the function `getHome` calls when B2 builds it. S5 read it through `GET /v1/clubs`' `open_day` and `next_day` (`listClubs`), not through `getHome`. This is FQ103's default ("yes"), which stands until the founder answers it (`docs/QUESTIONS.md`).

## What it doesn't show

- `getHome` and its page: B2, with the day's page in B3, B5 and B6.
- London's transitions live on `dev`: the next is months away, and `dev`'s clock only moves forward. The zone table covers them.
- A delayed close worker (spec 08): no worker job exists yet. The worker Machine was stopped, so nothing but the clock and the rows decided the answers (T1).
- That the worker was stopped is shown by `worker-scale`'s two runs, not by `spike-time`, which can't see Fly's Machines.

## What it left on `dev`

- `dev`'s server clock leads real time by 65366 seconds (18 hours 9 minutes 26 seconds), until a database reset, which needs the founder's yes. On `dev`, every day opens and closes that much early by the wall clock.
- The club "S5 1fb70b23", its two synthetic accounts and their two days stay, as the schema keeps every club. Ana's Supabase user was deleted at the end of the run ("cleanup: delete the run's user": ok), so nobody can sign in as Ana.

## Evidence

The three runs' logs and `zone_table.py` with its output: [`api/b0-spike-time/dedc8a7/runs/`](https://github.com/beurni2/tadayo/tree/evidence/api/b0-spike-time/dedc8a7/runs) on the `evidence` branch. In the `spike-time` log, the Fly organization's slug and the runner's address are replaced; the two `worker-scale` logs held neither and are as GitHub gives them. The folder's `README.md` says so, with each run's dispatch and job times.
