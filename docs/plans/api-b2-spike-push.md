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
then. The worker's minute (`services/worker/src/main.ts`, the loop of `loop.ts` that runs generation) gains the
push's part after generation (`pushMinute` in `services/worker/src/push.ts`): the purge, then, when `TADAYO_PUSH` is
`apns`, the plan and the dispatch (2.3), each in a try of its own, so none of them stops another or the days (as built,
after the first review's D5 and P2: the first draft purged only with `apns`, inside the pass). The plan finds each day
whose `reveal_at` has passed by the clock's sample, whose `close_at` hasn't, and which has no row in `app.push_days`
(migration `0021_push.sql`), and in one transaction per day writes that row and one row per recipient and
registration in `app.push_deliveries`. A second pass, or a second worker, finds the day's row and plans nothing
(Q17): the insert of `push_days` is `ON CONFLICT DO NOTHING`, so a plan that waits on another's uncommitted row
plans nothing once that one commits. The dev clock moves the sample (S5), so a dev run reaches 07:00 and 08:00 when
the founder asks.

As built, a day is planned once, at the first pass that sees it open, even when nobody reads a drop of it then: its
`push_days` row is written with no delivery. So a day nobody could read at the reveal (a club suspended then, or every
drop withdrawn and a new one added later) gets no push when it becomes readable before its close. The day still opens
in the app; the push says only that it is ready (`docs/LIMITATIONS.md`, 2026-11-28).

A row names a sign-in only while its registration lives: `push_deliveries.sign_in` references
`app.device_registrations` `ON DELETE SET NULL`, so a removal, a move, a dead token or an account's deletion clears
that sign-in from its rows in the transaction that deletes the registration, and nothing kept joins an ended sign-in,
whose row holds no account, to an account ((b); PR #120's privacy review, P6). The token itself stays in
`device_registrations` alone (0017): a delivery reads it from there when it is sent, so a sign-in whose token iOS
replaced is sent to at its new token, the same app on the same device. The plan takes its readers' registrations in
0017's order (`lockDevicesOf`, `packages/domain/src/identity/devices.ts`): the sign-ins' advisory locks in their
hashes' order, then the accounts' rows `FOR KEY SHARE` in their ids' order, then each registration `FOR KEY SHARE`. So
a registration, a removal or a move of one of them waits for the plan, or the plan for it, and none deadlocks it, and a
registration deleted while the plan waited is left out instead of failing the delivery's foreign key (as built, after
the first review's D3 and D4: the first draft locked the registrations alone, reader by reader, and a move that held
one sign-in's lock while it waited for another's row deadlocked it). A registration whose zone the server no longer
resolves (a zone dropped from the time zone data since it was registered) is left out, named in the pass's failures and
counted as `push.zone`, and the day's other devices are planned (the review's P11: the first draft rolled the whole
day back each minute).

The rows are kept until 48 hours after the day closes, by the clock's sample, so a spike's report can read them; the
minute's purge then deletes them (`push_days`' rows, and their deliveries with them), whatever `TADAYO_PUSH` says. They hold an account, a day, a sign-in's
hash while it is registered, times and codes, never a token, a name or a body.

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

Each delivery goes through three short transactions (as built, after the first review's P1: the first draft sent
outside any transaction, so a removal that landed between the decision and the send didn't stop it):

1. **The claim:** the clock's sample, then the earliest due row that this pass hasn't visited (`pending` and unleased
   with `due_at` at or before the sample, or `sending` whose lease has passed: a send that never reported back),
   `FOR UPDATE SKIP LOCKED`, leased until the sample plus `CLAIM_LEASE_SECONDS`. Two dispatchers never claim one row,
   and a pass visits each row once at most, so a row whose decision keeps failing doesn't end the pass early (the
   review's N3 and D7).
2. **The decision:** the recipient's account row `FOR NO KEY UPDATE` first, then the delivery's row, still under the
   claim's lease, then the clock's sample (T1, as T3 samples after its lock). The account's row is the lock every
   writer of that account's registrations takes after its advisory locks (0017's order), so a registration of that
   account waits for the decision, and two decisions for one member queue, which keeps the budget's count exact. A
   removal or a move from another account takes no account row of this one, and deletes the registration whose rows it
   then sets null, so it waits for this delivery's row; the decision never waits on it, so the two can't deadlock. A
   day closed by the sample ends the row as `skipped`, `closed`, before anything else is read, so a row whose facts
   can't be read (a zone the server no longer resolves, a fault) ends at its day's close instead of coming back each
   minute (the review's D6). A decision or a send that throws is named in the pass's failures, counted as
   `push.failed`, and left leased, so its lease brings it back. Then the decision reads:
   - **Rechecks** (T37, "dispatch rechecks access"), in this order, the first that fails ending the row as `skipped`
     with its code and nothing sent: the day hasn't closed (`closed`); the day is still one that opens, with a star to
     name (`held`, by `placeable`, the authorization module's own rule); the account is active (`account`); the
     recipient reads at least one drop of the day by the read predicate (`unreadable`: a withdrawal, a removal, a
     block or a membership that ended since the plan can leave none; T9, T36); and the sign-in is still registered to
     this account (`unregistered`).
   - **Quiet hours** (T37), in the zone the registration holds now: inside 23:00 to 08:00 the row goes back to
     `pending`, due at the next 08:00 in that zone; if that is past the day's close it ends as `skipped`, `quiet`.
   - **Budget** (T37, FQ30's default): one budget per member, two ordinary pushes a day across clubs, the day counted
     in the zone of the member's most recently registered device (the latest `registered_at`, which each launch's
     registration refreshes). A push counts from the decision to send it, by its delivery's `sent_at`, whatever its
     state since, unless Apple's answer says it took nothing (3.): a push whose fate is unknown may be on the phone, so
     it counts (the review's P3 and D8). The decision counts the member's other days with a delivery whose `sent_at`
     falls in that local day; a day already counted there, by this delivery's earlier decision or by one to another of
     the member's devices, is the same push and is not counted again (the review's D2: the first draft counted another
     device's send of the day whenever it was sent). A third day the same day ends as `skipped`, `budget`, and still
     opens in the app. Within the budget spec 21 puts reveals first, and the reveal is the only ordinary push built, so
     the claim takes the earliest due first.
   - **Switches:** the account's "Day is ready" and the club's switch (spec 21; contract `NotificationPreferences`)
     are on by default and not yet stored: B8 builds the routes that set them, and the dispatcher reads them once they
     exist. Until then every recipient has them on.
   A delivery that passes is `sending`, leased for `SEND_LEASE_SECONDS`, with `sent_at` the sample, or its earlier
   decision's `sent_at` kept when that falls in the same budget day, so a send decided again after a lost answer counts
   once and keeps its first time. The decision hands the send the payload (2.4) and the push's expiry: the day's close,
   or the next 23:00 in the device's zone if that comes first, so a phone that is off when the push is sent isn't
   woken by it in its quiet hours (`decideReveal`; the review's E1: the first draft's expiry was the close, which let
   Apple deliver a stored push at 03:00).
3. **The send**, in its own transaction: the delivery's row `FOR UPDATE`, still under the decision's lease (else the
   decision is stale and nothing is sent) and still naming its sign-in. A registration deleted since the decision (a
   removal, a move, a dead token, a deletion) has set that null, and the row ends as `skipped`, `unregistered`, with
   nothing sent. Else the registration's token and environment are read and the push goes to Apple while the row is
   held: a removal or a move of that registration, whose foreign key sets the row's sign-in null, waits until Apple has
   answered and the answer is written, so no push is handed to Apple once a removal has landed. The hold lasts at most
   the sender's 10 seconds (2.5), under the role's 15 seconds idle in a transaction (0018) and the send's lease; a
   registration or a removal of that sign-in in the API waits for it, and past the API's 5-second wait for a lock
   answers 503, which the app tries again. After the clock's sample, Apple's answer is written in the same
   transaction:
   - 200: `sent`.
   - A dead token (`410` `Unregistered` or `ExpiredToken`, `400` `BadDeviceToken` or `DeviceTokenNotForTopic`):
     `failed` with the reason. Once the transaction has let the row go, the registration is deleted if it still holds
     the token the push went to, in a transaction of its own, in 0017's order (the sign-in's advisory lock, then the
     account's row, then the registration), so nothing more goes to it; its sign-in isn't ended, so the app's next
     registration with a new token is taken. A `410` is not counted: an app deleted from its phone is ordinary. A
     `400` is counted as `push.<reason>`, since it means a token sent to the wrong environment or topic, which the
     founder's alert should name (the review's E5).
   - A `429`, a `5xx`, a `400` `IdleTimeout`, a lost stream, a timeout or a lost connection: `pending` again, due after
     the outbox's backoff (`backoffSeconds`), and at least 15 minutes after a `5xx`, as Apple asks. Past the day's
     close it ends as `failed`, `closed` (Apple would drop it by then: its expiry is the close or sooner), and is
     counted as `push.closed`, so the founder's alert names pushes that Apple kept refusing until the day closed. The
     backoff doubles from 30 seconds and the close ends it, so a delivery is tried about a dozen times at most. A `403`
     `ExpiredProviderToken` makes a new provider token at once and is tried again the same way.
   - Any other answer (a refused provider token, a bad topic, a payload too large): `failed` with the reason, and the
     reason counted in `app.failure_counts` as `push.<reason>` (B7), so the founder's alert names a broken
     configuration. A skip is not a failure and is not counted.
   - `sent_at` is cleared only when Apple's answer says it took nothing (any status but 200, or a request refused or
     unconnected before it left) and this decision set it; no answer in time and a lost stream leave it, since Apple
     may have taken the push.
   A send that never reports back (the worker stopped) is claimed again once its lease passes and decided again: its
   `sent_at` is kept, so it is counted once, and a repeat on the device collapses into the same notification
   (`apns-collapse-id`, 2.4). Delivery is at least once: a push Apple took whose answer was lost is sent again, which
   the phone shows as the same notification replaced, and the spike checks on the founder's phone
   (`docs/LIMITATIONS.md`, the review's E6).

A push Apple has already taken can still reach a phone after the reader lost access: one that was off or out of
signal when it was sent gets it when it comes back, up to its expiry, and a removal of the drop or of the member, or a
block, isn't waited for by the send (only a removal of the registration is). The push says only that the day is
ready, and the app rechecks access when it opens the day (T38), so nothing of the day shows. FQ151 asks the founder
whether that is accepted for the trial (the review's P1 and D1; `docs/LIMITATIONS.md`).

### 2.4 The payload

Names and timing only, never a caption, media, a URL or a source (T37, T52; the worker's row of TECH-DESIGN's test
table):

```json
{
  "aps": { "alert": { "body": "Debby’s day is ready" }, "sound": "default", "thread-id": "<club id>" },
  "tadayo": { "open": "day", "club_id": "<club id>", "occurrence_id": "<occurrence id>" }
}
```

- The body is spec 21's copy, with the app's typographic apostrophe (every string of the app's catalog has it):
  "It’s your day. Your collection is ready" to the star; "<name>’s day is ready" to the others, with the star's name as the recipient sees it in that club (`starNameOf`), and the copy lint's rules (names,
  never pronouns: T42).
- `tadayo.open`, `club_id` and `occurrence_id` are the deep link: the app opens that club's day
  (`GET /v1/occurrences/{occurrence_id}`, in that club) after rechecking access (T38). Agreed with the ios lane
  (2026-11-24 03:17 UTC): `tadayo` is the one custom key and `open` a closed set; the app treats an unknown `open`
  value or a missing id as "open the app at Home" and never reads the alert's text, so later values don't break older
  builds; a `NOT_FOUND`, or a club no longer the caller's, opens Home with nothing of that club (T14, T38).
- No `badge` (T33: nothing is counted), and no `content-available` or `mutable-content`: the app has no notification
  extension (the ios lane, same message).
- APNs headers: `apns-push-type: alert`, `apns-priority: 10`, `apns-topic: app.tadayo`, `apns-collapse-id` the day's
  id (one ready message per day on a device), `apns-expiration` the decision's expiry (2.3): the day's `close_at`, or
  the device's next 23:00 if that comes first. Priority 10 is Apple's for an alert shown at once; 5 lets Apple hold it
  for the phone's power, and the push is the reveal itself (the review's N1). No `apns-id` is sent or kept: the row's
  id is the worker's record, and Apple's id serves only Apple's support, which the spike doesn't need (N2).

### 2.5 The APNs sender (`services/worker/src/apns.ts`)

- HTTP/2 to `api.push.apple.com` or, for a `sandbox` registration, `api.sandbox.push.apple.com`, port 443, one
  connection per host kept open (Apple's guidance), with Node's `http2` and no new dependency.
- A provider token: an ES256 JWT with `kid` = `APNS_KEY_ID`, `iss` = `APPLE_TEAM_ID` and `iat`, signed with
  `APNS_KEY_P8` through `node:crypto`, made again every 50 minutes (Apple refuses one older than an hour, and one made
  more often than every 20 minutes), or when real time steps back more than 5 minutes behind its making
  (`STEP_BACK_SECONDS`): a smaller step keeps it, since a new token for each small correction of the clock would spend
  Apple's refreshes (the review's N5). Its `iat` is real time, not the server's clock: dev's clock leads real time, and
  Apple would refuse the token (`one-clock.test.ts` keeps that line, with its reason).
- Whether the worker sends at all is the required setting `TADAYO_PUSH` (`pushSettingFor` in
  `services/worker/src/push.ts`, read by `start.ts`): `none` or `apns`, and nothing else; a worker without it refuses
  to start, as with `TADAYO_SAFETY_PROVIDER`, so no environment sends, or stays silent, by accident. With `apns`, the
  key is read from the environment once, at the worker's start (`apnsKeyFrom`), and the worker refuses to start
  without all three, naming what is wrong and never a value. `fly.toml` sets `none` for `dev`: the switch to `apns`
  for the spike (section 3) is its own PR, on the founder's yes. The tests and the session use a fake APNs.
- Nothing about a push reaches a log but its row's id, the day's id and APNs' status and reason code (T52).
- Apple's current documentation (read 2026-11-28: "Handling notification responses from APNs", "Sending
  notification requests to APNs", "Establishing a token-based connection to APNs") gives the answers 2.3 sorts: never
  retry `BadDeviceToken`, `DeviceTokenNotForTopic`, `Forbidden`, `ExpiredToken`, `Unregistered` or
  `PayloadTooLarge`; retry `TooManyRequests` after a delay and a `5xx` after 15 minutes; a token at most an hour old,
  made again no more often than every 20 minutes; a payload of 4 KB at most; a collapse id of 64 bytes at most (a
  day's id is 64 characters at most, `app.id`). A team key can be limited to one environment. Every TestFlight build
  registers `production` (section 0), so the founder's key must cover production; which environments it covers isn't
  recorded, and a key that doesn't cover a registration's environment answers `403` `BadEnvironmentKeyIdInToken`,
  which ends the delivery as `failed`, counts `push.BadEnvironmentKeyIdInToken` and so reaches the founder's alert.
- An answer's body is read up to 4 KB; past that the stream is reset (`CANCEL`) and the answer taken as refused, with
  the reason `unknown`. A 200 settles at once, without waiting for the stream's end. A request whose answer hasn't
  ended 10 seconds after it was made (`REQUEST_TIMEOUT_MS`, a deadline from the request, not a wait between bytes) is
  cancelled, and its session is closed and forgotten, so the next push opens a new connection; it ends as
  `network.timeout`, or `network.connection` if the session never connected, and is tried again (the review's P2 and
  E2: the first draft's wait restarted at each byte, and reused a session that had gone dark). A session idle for 10
  minutes (`SESSION_IDLE_MS`) is closed, and Apple's `GOAWAY` or a closed connection forgets it. TLS is verified
  whatever `NODE_TLS_REJECT_UNAUTHORIZED` says (`rejectUnauthorized: true`; P4), and the `:path` header, which holds
  the token, and `authorization` are marked sensitive, so HTTP/2's header compression never keeps them.
- TECH-DESIGN's push row names Apple's production host because every TestFlight build registers `production`. The
  contract also allows `sandbox`, and a sandbox token sent to the production host would be answered `BadDeviceToken`
  and deleted, so the sender takes each registration's own host. In the trial every registration is `production`
  (the review's N6).

### 2.6 Tests first

- The fake APNs: an HTTP/2 server in the tests, in clear text (`http2.createServer`; the sender takes its origin, and
  TLS is Node's own), that checks each request's path, headers and JWT (with the test key's public half) and answers
  as told: 200, 400, 403, 410, 429, 500, a dropped stream, no answer, an answer trickled a byte at a time, a 200 whose
  body never ends, a body past 4 KB; and one over TLS with a certificate nobody signed, which the sender refuses
  before it sends anything, even with `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- `services/worker`: the payload for each recipient with previews off (the body, the keys, no caption, URL or id but
  the club's and the day's), the JWT and its refresh, the backoff, the dead token's deletion.
- `tests/src/db/worker-push.test.ts` on Postgres, with the fake clock (as built): the plan at the reveal (each member
  with a readable drop, nobody without one, the star's own wording, each device), twice planned once, quiet hours in
  several device zones (a reveal at 07:00 in London, 07:00Z: a device in New York, at 02:00, held to 08:00 there; one
  in London, at 07:00, held to 08:00; one in Tokyo, at 16:00, sent at once), the zone a registration holds when it is
  decided, not when it was planned, the budget with one and two other days spent over two clubs, each recheck (a deleting account, a removed
  device, a removed drop), a dead token and a renewed one, the backoff, a retry that reaches the day's close, a refused
  answer counted, a send that never reported back, and the purge. After the first review, as built: the expiry in
  three zones, a zone left out of the plan, a registration deleted after the decision, a decision that keeps failing
  until the close, the budget's zone in New York, a second phone after other clubs spent the budget, a push sent in an
  earlier budget day on another phone (Tokyo and Los Angeles), a send whose fate is unknown counted whatever its state,
  `sent_at` kept or cleared by the answer, the claim skipping rows it visited, the purge with `TADAYO_PUSH` `none`,
  and, on two connections, a removal that waits while the send holds the row and lands after Apple's answer. Two
  dispatchers at once are not tested: the claim is `FOR UPDATE SKIP LOCKED`, as the outbox's is.
- `tests/src/db/devices.test.ts`: the plan's sign-in locks make a move wait, and a registration deleted while the plan
  waited is left out.
- The privacy matrix's push (`tests/src/db/push-matrix.test.ts`, as built): every role of the matrix
  (`tests/src/matrix.ts`), in each of its states of the drop, before, during and after the day, through the worker's
  whole pass, each two ways: planned by the pass, and planned for every phone before the role and the state applied,
  so the dispatch's rechecks are proved and not only the plan's filter (the review's P6); the viewer is told only when
  the role reads the drop, the state denies nothing and the day is open, and
  every payload the dispatcher builds is exactly the day's words, its club and its id, with no caption, media, URL,
  provider id, source, drop or upload id, or token.

## 3. The spike on `dev`, with the founder

Once both PRs are merged and the ios lane's build registers and opens the payload:

1. The founder's account is in S1's club on `dev`, with a day that has a drop they can read (S1's photo).
2. With the founder's yes, `TADAYO_PUSH` is set to `apns` for `dev` (its own PR), the `dev` worker is started (`ops`
   `worker-scale --to started`), and the dev clock (S5)
   is set so that the founder's day reveals: at 07:00 in the club's zone (New York, inside quiet hours) the day opens in
   the app and no push comes; at 08:00 the push comes, previews off, and a tap opens that club and day.
   With `apns`, the worker pushes every account registered on `dev` that reads a day that opens, and the dev clock
   moves every club's days at once, so the spike's PR first limits the sender to the founder's own registrations on
   `dev`, or lists `dev`'s registrations for the founder to clear, whichever it shows the founder (PR #159's first
   review, P7). No test alert is sent and no device is pushed without the founder's yes.
3. The report, `docs/spikes/S4-push.md`, records what the founder saw, the rows' times and codes, and the worker's
   lines, with no token and no name but the founder's own word for their phone.

## 4. Not in S4

The other events of spec 21's table; the notification switches' routes and storage (B8); aggregation of arrivals
(nothing arrives as a push yet); a push to a removed device's earlier account after the removal lands (none is handed
to Apple once it has, 2.3, but one Apple took just before it can still be shown, FQ151); a rate limit on the public removal route (the
API has none yet; `docs/LIMITATIONS.md` records it).
