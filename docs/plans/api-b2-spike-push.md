# Spike S4's server part: device registration and the reveal push

Written 2026-11-24 for the api lane's step 11 (x) (`docs/JOURNAL.md`, block 1.2), from `docs/MILESTONES.md` (B0's
spike table, "S4 Push"; "Spikes S1, S2 and S4, before Gate A"), `docs/plans/B0.md` section 4, spec 21, book p37,
`docs/TECH-DESIGN.md` section 6 (device registration, (a) to (e)) and its test table (the worker's row), the
contract's `registerDevice` and `removeDevice`, and T1, T9, T14, T27, T36, T37, T38, T52 and T53.

S4's goal (MILESTONES): a push with previews off reaches the founder's iPhone from the worker through APNs and opens
the exact club and day; a 7 AM reveal push is deferred to 8 AM by quiet hours, shown with the dev clock. The founder
added `APNS_KEY_ID`, `APNS_KEY_P8` and `APPLE_TEAM_ID` as Fly secrets on `tadayo-api-dev` (23:45 UTC on 2026-11-23).

## 0. What the server builds, and in which PR

Two PRs, each from `main`, each reviewed at full depth with a privacy and security reviewer (tokens, notifications):

1. **`api/b2-spike-devices`: device registration and its removal** (section 1). `PUT /v1/devices/current` and
   `POST /v1/device-removals`, as the contract has them, built to `docs/TECH-DESIGN.md` section 6's (a) to (e). This
   is the mechanism B8 was to finish; S4 needs it first, so it is built here and kept (ADR-024: spike code merges only
   if it is clean enough to keep). One contract change and no field change: `registerDevice` declares the neutral
   `NOT_FOUND` that 1.3 answers (the privacy matrix's first run found it missing from the contract, which listed
   only the gate's answers for the route), and the two descriptions say what is built instead of "B8 finishes the
   mechanism", `removeDevice`'s that a removal that finds nothing still ends the sign-in. A contract change is its
   own PR from the api lane (`docs/GITHUB.md`); this one rides in the build PR because the route's 404 and the
   matrix's check of it can't pass `ci` apart, and the PR says so for the founder to accept or have split.
2. **`api/b2-spike-push`: the reveal push** (section 2). The worker finds each day that has opened, decides who gets
   "Debby's day is ready" or "It's your day. Your collection is ready" (spec 21's two reveal rows), holds each push
   through the device's quiet hours, keeps the two-a-day budget, rechecks access at dispatch, and sends it through
   APNs with the exact club and day in its payload. No other event of spec 21's table is built: each comes with the
   stage that makes it (B5 reactions and comments, B8 the rest).

The app's half (asking for permission, registering, the removal at logout, opening the payload's club and day) is
the ios lane's, in an ios PR once PR 1 is on `main`. The payload's keys were agreed with it on 2026-11-24 (section
2.4). Its registration, as it told the api lane: a new secret at each sign-in (32 random bytes, base64url, 43
characters) in the keychain beside the session, sent with every `registerDevice` of that sign-in; a `registerDevice`
answering `NOT_FOUND` ends registering for that sign-in, with no retry; at logout the session is deleted and the secret
kept as a pending removal, sent then and at each launch or wake with a delay after each failure, until a 204 or a
`NOT_FOUND`, when the secret is deleted. Every build goes through TestFlight, so the app sends `production`.

One rule of the app's makes (e) hold, since the server can't tell which of two sign-ins on one phone came first
(PR #120's privacy review, P1; `docs/LIMITATIONS.md`): a new sign-in sends no `registerDevice` until every earlier
sign-in's pending removal has ended with a 204 or a `NOT_FOUND`. At a sign-in the app sends any pending removal at
once, without waiting out its delay, and registers once it ends; at a logout it cancels any `registerDevice` still in
flight, then queues the removal (the ios lane, 2026-11-24 04:29 UTC). A removal ends its sign-in here whether or not it
found a registration (1.4), so an earlier sign-in's registration that lands after it changes nothing, and a later
sign-in's token is never taken back. Cancelling is best effort, since a request may already be at the server; the
ended row is what makes that case safe. While an earlier removal can't end (offline, a 5xx or a 429), the new sign-in
gets no pushes, and the app keeps sending the removal ((c)).

## 1. Device registration (`api/b2-spike-devices`)

### 1.1 What a sign-in is to the server

A sign-in is named by its removal secret. The app makes a new random secret at each sign-in (`RemovalSecret`, 43 to
128 base64url characters) and sends it with every registration of that sign-in. The server keeps its SHA-256 hash and
nothing else of it, so the hash is the sign-in's key: the same secret means the same sign-in, a new secret a new one.
Supabase's own session id is not used: the server never reads a claim but the subject (`identity/token.ts`), and the
removal has to work with no session at all (the app deleted it at logout).

### 1.2 The tables (migration `0017_devices.sql`)

- `app.device_registrations`: `sign_in` (the secret's hash, 32 bytes, the primary key), `user_id` (the account, a
  foreign key that a deletion's rows follow), `apns_token` (unique: a token belongs to one sign-in at a time),
  `apns_environment` (`sandbox` or `production`), `timezone` (an IANA zone the database checks as the contract's
  `Timezone`), `registered_at`. Owned by `tadayo_app`, row-level security on with no policy, as every `app` table
  (T53).
- `app.device_sign_ins_ended`: `sign_in` (the hash) and `ended_at`. A sign-in whose registration was removed, or
  whose token moved to a later sign-in, is written here, so that a registration of it that lands late changes nothing
  ((e)). It holds no account, no token and no zone: nothing personal ((b)). A row is deleted once it is older than
  `ENDED_KEEP` (8 days), past the longest life Supabase allows an access token (one week), since only a request
  carrying one of that sign-in's tokens can register it: the next registration or removal after that deletes it, at
  most 100 a time and skipping rows another transaction holds, in that command's own transaction. Ending a sign-in
  writes its row only when none is there, a row another command's purge is deleting among them, so it never waits on
  a purge (two removals whose purges each took the other's row would otherwise deadlock). A row kept longer holds
  nothing personal and refuses nothing but its own sign-in. The keep is measured by the server's clock (T1), which on
  `dev` runs ahead of real time and moves forward at a gate's run: `docs/LIMITATIONS.md` gives the bound.

### 1.3 `PUT /v1/devices/current` (`registerDevice`)

Signed in, profile finished (the gate's own rule; FQ69). One transaction, at read committed. Its locks come in the
one order every writer of the two tables keeps (the migration's header): transaction-scoped advisory locks first, then
the account's row (`FOR NO KEY UPDATE`), then the registrations' rows. It takes the token's lock, reads which sign-in
holds the token, takes that sign-in's lock and its own in the hashes' order, and reads the holder again under them:
no two registrations of one token or one sign-in interleave, a move can't cross the holder's own registration, and
two registrations that each take the other's token queue on the same lock instead of deadlocking. The schema's
guards take the sign-in's lock too, which the command already holds, so a writer that forgot it can't slip a
registration past an ending. Then:

1. The sign-in has ended (a row in `device_sign_ins_ended`): nothing changes; the answer is the neutral `NOT_FOUND`
   ((e); T14). A secret whose registration belongs to another account answers the same, and changes nothing.
2. Another sign-in holds this token: its registration is deleted and that sign-in is ended (a row written), so the
   token moves, whichever account held it ((a), the move; (e): a late registration of that earlier sign-in now
   changes nothing).
3. This sign-in's registration is written, or its token, environment and zone replaced (a new token from iOS
   replaces the old), with `registered_at` the server's clock (T1).

The answer is the contract's `DeviceRegistration`: the environment, the zone and `registered_at`, never the token or
the secret (T55). A token is a device's address, so it is never logged, never in an error, never in an answer (T52).

### 1.4 `POST /v1/device-removals` (`removeDevice`)

No session (`security: []`, already in the gate's public list). One transaction, the sign-in's lock taken:

- the sign-in's registration is deleted, the sign-in is ended, and the answer is 204;
- there is none (removed already, the token moved to a later sign-in, or never registered): the sign-in is ended all
  the same, so a registration still on its way changes nothing, and the answer is the neutral `NOT_FOUND`, which also
  ends the app's removal ((d)).

The secret can do nothing else ((a)). Removing the account's other sign-ins, or anything of another account, is out
of its reach: it names one sign-in by its hash.

### 1.5 Account deletion and suspended pushes

A deletion's rows: `user_id` references `app.users` with `ON DELETE CASCADE`, and the push's dispatch reads the
account's state (section 2.3), so a `deleting` account gets no push from the moment its deletion begins (T27). The
removal of a deleting account's registrations is B8's account-deletion job; until it runs, the rows send nothing.

### 1.6 Tests first

- `packages/domain`: the hash, the zone check, the rules of 1.3 and 1.4 as pure functions where there are any.
- `tests/src/db/devices.test.ts` on Postgres: a registration, its replacement by a new token, a token moving from
  another sign-in of the same account and of another account, a late registration of an ended sign-in (after a
  removal, after a move, after a removal that found nothing), the app's order of two sign-ins (section 0), a removal
  twice, the ended rows' purge after 8 days with the fake clock, a deleting account, the guards and their race, and
  `migrations.test.ts`'s ownership and row-level-security checks for both tables. The races hold the lock they meet
  from a transaction of the test's own until Postgres shows every command waiting on it, so each is proved to
  overlap: twenty registrations of one token, two sign-ins crossing tokens, a registration and a removal of one
  sign-in in each order, a deletion that begins while a registration waits, the guards' race, and a removal meeting
  another command's purge held open. Two purges at once past more than a batch can't be held between a removal's
  purge and its ending, so that test lays its rows out in the order that deadlocked.
- `services/api`: the routes' tests (the contract's answers, the first bad field never its value, no token or secret
  in an answer or a log line), the gate's public list unchanged.
- The privacy matrix: `registerDevice` and `removeDevice` move from `NONE` to rows of their own in
  `tests/src/privacy/rows.ts`, each as every role of the matrix, and the leak scanner reads their answers.

## 2. The reveal push (`api/b2-spike-push`)

### 2.1 When a day's push is made

A day opens at its `reveal_at` (07:00 in the club's zone) by the server's clock alone (T1, T5): nothing is written
then. The worker's loop (`services/worker/src/loop.ts`) gains a pass, after generation, that finds each day whose
`reveal_at` has passed by the clock's sample and whose `close_at` hasn't, and whose pushes haven't been planned: one
row per recipient and device in `app.push_deliveries` (migration `0018_push_deliveries.sql`), unique on the day, the
account and the sign-in, so a pass that runs twice plans once (Q17). The dev clock moves the sample (S5), so a dev
run reaches 07:00 and 08:00 when the founder asks. A row names a sign-in only while its registration lives: a
removal, a move, a dead token or an account's deletion clears that sign-in from its rows in the same transaction, so
nothing kept joins an ended sign-in, whose row holds no account, to an account ((b); PR #120's privacy review, P6).

### 2.2 Who gets it, and when

- **Recipients:** each member whose membership interval holds the reveal and who can read at least one drop of the
  day at the reveal, by the read predicate (`readableDrops`, `what` = `media`; T9). Nobody with no readable drop is
  told the day is ready (T36). The star reads their own day like everyone else.
- **Devices:** each registration of the recipient's account. An account can hold many (`docs/LIMITATIONS.md`); a
  made-up token costs one APNs request, whose answer deletes it (2.3).
- **When:** `due_at` is the reveal, or 08:00 in the device's zone when the reveal falls in its quiet hours (23:00 to
  08:00, T37). The day opens in the app at 07:00 all the same.
- **Never too late by quiet hours:** they last 9 hours (10 across a change of the device's clocks), and a day is open
  at least 17 hours, from 07:00 to 01:00 in the club's zone, so a reveal held to 08:00 in any device's zone is due
  before the day closes. Only APNs' retries can reach `close_at`, and 2.3 stops them there. (FQ141 asked about the
  held case and is withdrawn: PR #120's engineering review, E1.)

### 2.3 Dispatch

The dispatcher claims due rows (`FOR UPDATE SKIP LOCKED`, a lease like the outbox's), and for each one, at the
clock's sample:

1. **Rechecks** (T37, "dispatch rechecks access"): the account is active, the membership still holds, the recipient
   still reads a drop of the day (a withdrawal or a removal since the plan can leave none), the registration is still
   this sign-in's with the same token, and the day hasn't closed. Any of these failing ends the row as `skipped`, with
   its code, and nothing is sent.
2. **Budget** (T37): at most two ordinary pushes per account and device per device-local day, across clubs. The
   reveal is the only ordinary push today, so the budget counts sent reveal pushes; a third day revealed the same
   morning on the same device is `skipped` as `budget` and still opens in the app. Within the budget spec 21 puts
   reveals first, so when two or more are due at once on one device, the earliest reveal goes first.
3. **Switches:** the account's "Day is ready" and the club's switch (spec 21; contract `NotificationPreferences`) are
   on by default and not yet stored: B8 builds the routes that set them, and the dispatcher reads them once they exist.
   Until then every recipient has them on.
4. **The payload** (2.4), sent through APNs (2.5), and the row ends as `sent`, or `failed` with APNs' reason. An APNs
   answer that the token is dead (`410 Unregistered`, `400 BadDeviceToken`) deletes the registration, so nothing more
   goes to it; its sign-in isn't ended, so the app's next registration with a new token is taken. That deletion keeps
   the migration's order: the sign-in's advisory lock, then the account's row, then the registration, and only if it
   still holds the token the push went to. A `429`, a `5xx` or a network failure is tried again with the outbox's
   backoff, until the day closes.

### 2.4 The payload

Names and timing only, never a caption, media, a URL or a source (T37, T52; the worker's row of TECH-DESIGN's test
table):

```json
{
  "aps": { "alert": { "body": "Debby's day is ready" }, "sound": "default", "thread-id": "<club id>" },
  "tadayo": { "open": "day", "club_id": "<club id>", "occurrence_id": "<occurrence id>" }
}
```

- The body is spec 21's copy: "It's your day. Your collection is ready" to the star; "<name>'s day is ready" to the
  others, with the star's name as the recipient sees it in that club (`starNameOf`), and the copy lint's rules (names,
  never pronouns: T42).
- `tadayo.open`, `club_id` and `occurrence_id` are the deep link: the app opens that club's day
  (`GET /v1/occurrences/{occurrence_id}`, in that club) after rechecking access (T38). Agreed with the ios lane
  (2026-11-24 03:17 UTC): `tadayo` is the one custom key and `open` a closed set; the app treats an unknown `open`
  value or a missing id as "open the app at Home" and never reads the alert's text, so later values don't break older
  builds; a `NOT_FOUND`, or a club no longer the caller's, opens Home with nothing of that club (T14, T38).
- No `badge` (T33: nothing is counted), and no `content-available` or `mutable-content`: the app has no notification
  extension (the ios lane, same message).
- APNs headers: `apns-push-type: alert`, `apns-priority: 10`, `apns-topic: app.tadayo`, `apns-collapse-id` the day's
  id (one ready message per day on a device), `apns-expiration` the day's `close_at`.

### 2.5 The APNs sender (`services/worker/src/apns.ts`)

- HTTP/2 to `api.push.apple.com` or, for a `sandbox` registration, `api.sandbox.push.apple.com`, port 443, one
  connection per host kept open (Apple's guidance), with Node's `http2` and no new dependency.
- A provider token: an ES256 JWT with `kid` = `APNS_KEY_ID`, `iss` = `APPLE_TEAM_ID` and `iat`, signed with
  `APNS_KEY_P8` through `node:crypto`, made again every 50 minutes (Apple refuses one older than an hour, and one made
  more often than every 20 minutes). Its `iat` is real time, not the server's clock: dev's clock leads real time, and
  Apple would refuse the token (`one-clock.test.ts` keeps that line, with its reason).
- The key is read from the environment once, at the worker's start, and the worker refuses to start pushes without
  all three when it runs in `dev` or `prod`; the tests and the session run with none, and use a fake APNs.
- Nothing about a push reaches a log but its row's id, the day's id and APNs' status and reason code (T52).

### 2.6 Tests first

- The fake APNs: an HTTP/2 server in the tests (`http2.createSecureServer` with a test certificate) that checks each
  request's path, headers and JWT (with the test key's public half) and answers as told: 200, 400, 410, 429, 500, a
  dropped stream.
- `services/worker`: the payload for each recipient with previews off (the body, the keys, no caption, URL or id but
  the club's and the day's), the JWT and its refresh, the backoff, the dead token's deletion.
- `tests/src/db/push.test.ts` on Postgres, with the fake clock: the plan at the reveal (each member with a readable
  drop, nobody without one, the star's own wording, each device), twice planned once, quiet hours in several device
  zones (07:00 in New York held to 08:00; a device in London already past 08:00; a device in Tokyo at 21:00 sent at
  once), the budget across three clubs, each recheck (a drop withdrawn, a member who left, a deleting account, a token
  moved), a retry that reaches the day's close, and two dispatchers at once.
- The privacy matrix's worker row: every payload the dispatcher builds, before and after the reveal and for every
  role, holds no caption, media, URL, provider id or source.

## 3. The spike on `dev`, with the founder

Once both PRs are merged and the ios lane's build registers and opens the payload:

1. The founder's account is in S1's club on `dev`, with a day that has a drop they can read (S1's photo).
2. With the founder's yes, the `dev` worker is started (`ops` `worker-scale --to started`), and the dev clock (S5)
   is set so that the founder's day reveals: at 07:00 in the club's zone (New York, inside quiet hours) the day opens in
   the app and no push comes; at 08:00 the push comes, previews off, and a tap opens that club and day.
3. The report, `docs/spikes/S4-push.md`, records what the founder saw, the rows' times and codes, and the worker's
   lines, with no token and no name but the founder's own word for their phone.

## 4. Not in S4

The other events of spec 21's table; the notification switches' routes and storage (B8); aggregation of arrivals
(nothing arrives as a push yet); a push to a removed device's earlier account after the removal lands (TECH-DESIGN
section 6 promises none, and none is possible once the row is gone); a rate limit on the public removal route (the
API has none yet; `docs/LIMITATIONS.md` records it).
