# api/b2-worker-storage-retry: the outside audit's B1: Storage trouble no longer loses a valid photo

The outside audit's B1 (low): any not-found while the worker reads an original (the object, the bucket, or a plain 404
from a proxy) rejected the upload as `unreadable` for good, though `completeUpload` saw the object seconds before; and
an event died after five attempts, about 450 seconds, so seven and a half minutes of Storage trouble left the upload
`preparing` until it lapsed 24 hours later, with nobody told. The audit's fix: "treat only Storage's own
object-not-found as gone, after retries; keep retrying `storage.unavailable` until the upload lapses, or give the client
a failed state". This slice takes the first two.

Sources: spec 33 (an upload is ready only after preparation); spec 34 and T54 (bounded retries, exponential backoff, a
dead letter queue with alerts); TECH-DESIGN section 5, "The worker"; T1 (the clock's sample decides every wait); T52
(codes and opaque ids in lines and rows, never a message); docs/plans/api-b2-spike-prepare.md sections 1, 2 and 5; the
founder's order of the audit's items (the coordinator's relay of 10:02 UTC on 2026-11-24): B1 after A10.

## 0. The finding, re-checked on `main` at `954e47d`

- `services/worker/src/storage.ts`, `readOriginal`: any answer whose Storage status is 404 gives `null`, whether the
  body is Storage's own (`{"statusCode":"404","code":"NoSuchKey",…}`), names a missing bucket (`NoSuchBucket`), or is a
  plain 404 with no Storage body at all (`storageStatus` falls back to the HTTP status).
- `services/worker/src/prepare.ts`, step 4: `null` rejects the upload `unreadable` on the first attempt.
- `services/worker/src/outbox.ts`: every failure counts. `MAX_ATTEMPTS` 5 and the backoff of 30, 60, 120 and 240
  seconds kill the event about 450 seconds after its first attempt; `storage.unavailable` is no different. The upload
  stays `preparing` until `expires_at`, and `uploadToPrepare` then finds nothing to prepare.
- Storage's own answer for an object it doesn't have, from its sources (`supabase/storage`,
  `src/internal/errors/codes.ts` `ERRORS.NoSuchKey` and `storage-error.ts` `render`, read on 2026-11-27): HTTP 400,
  body `statusCode` "404", `code` "NoSuchKey", `error` "not_found", message "Object not found". A missing bucket is
  `code` "NoSuchBucket"; an object Storage's table has and its backend lost is `code` "S3Error". `storage-setup` already
  branches on `code` "NoSuchBucket" on `dev` (tools/ops/src/storage-setup.ts), and the probe's fake project answers
  `NoSuchKey` this way (tools/ops/test/fake-supabase.ts `NO_KEY`).

## 1. The change

### 1.1. Only Storage's own not-found is gone (`services/worker/src/storage.ts`)

`readOriginal` gives `null` only for Storage's own not-found of the object: Storage status 404 in the body and `code`
"NoSuchKey" (`storageNoSuchKey`, in `packages/domain/src/media/storage-http.ts`, which the probe reads it with too).
Every other answer that isn't the bytes is a `StorageUnavailable`, waited out (section 1.2): Storage refusing the read
itself (`storageRefusal`: its own body with a 4xx status but 408 and 429, and not `S3Error`: a missing bucket, a
refused key, NoSuchKey under another status) under its own code, `storage.refused`, so a line or a row tells a
misconfiguration from an outage; anything else (a plain 404, a 404 with no Storage body, `S3Error`, a 408, a 429, a 5xx,
no answer) under `storage.unavailable`.

`putRendition`: Storage's own refusal of a put (`storageRefusal`: too large, the wrong type, a bad key, a policy, a
missing bucket) is a `StorageRefused`, code `storage.refused`, which is not an `Unavailable`: a counted failure, so a
refusal no wait would change dies after five attempts, as on `main`. Anything else is a `StorageUnavailable`. (Added in
the review, section 5, P2 and G3.)

### 1.2. Storage away is waited out, not counted (`services/worker/src/outbox.ts`)

- A new error class, `Unavailable`: a service the work needs didn't answer, which says nothing of the event.
  `StorageUnavailable` extends it, keeping its code `storage.unavailable`.
- On an `Unavailable` failure, in the event's first day (its `created_at` to 24 hours on, by the clock's sample):
  - the attempt the claim counted is given back (`attempts - 1`), so the five attempts stay for failures that are the
    event's own: a photo whose process times out or breaks, a crash that leaves the lease to lapse, a database error;
  - it is tried again after a wait of the event's age, at least 30 seconds and at most 15 minutes: 30, 30, 60, 120,
    240, 480 seconds, then every 15 minutes. The waits double as the backoff's do, without a counter of their own (no
    migration);
  - it never dies of it, and its line says so: `worker: an event is waiting: <topic> <id>: <code>, again in <n> s`.
- From the event's second day an `Unavailable` counts as any failure, so the outbox's retries stay bounded whatever a
  handler does (T54): at most a day of waits, then five attempts.
- For `upload.prepare` the day is the upload's: an upload lives 24 hours from `createDropPhotoUpload`, before
  `completeUpload` writes the event, so it lapses inside the event's first day (`outbox.test.ts` pins `OUTAGE_SECONDS`
  at least `UPLOAD_HOURS`). Its next attempt then finds the upload lapsed while still `preparing`, never prepared, and
  the event fails for good, `upload.lapsed`: a dead letter with its line (section 1.3).
- The write stays over the attempt's own claim, known by its lease's end: each claim carries the `available_at` it set
  (`Claim.leaseUntil`, its sample plus `LEASE_SECONDS`), and every failure's write matches it as well as the attempts'
  number. An attempt given back makes `attempts` no longer name one claim: a stale claim could hold the same number as
  a newer one that gave its attempt back. The lease's end can't come back: a later claim's sample is past it, and every
  later write sets a time later still. (Added in the review, section 5, G1.)
- The day assumes the clock moves forward, as the server's does (T1): a sample behind the row's `created_at` waits the
  least, 30 seconds, and counts nothing.
- It starts at `created_at`, which for `upload.prepare` is when the event first comes due. A topic written ahead of its
  time (a day's reveal or close, 0009) would start its day before its first attempt; that topic's slice keeps its first
  due time as its own start.
- `OutboxEvent` gains `createdAt`, read by the claim.

### 1.3. A missing original, after retries (`services/worker/src/prepare.ts`)

Storage's own not-found on the event's first or second counted attempt throws `OriginalMissing` (code
`storage.missing`), a counted failure: tried again after 30 and then 60 seconds. On the third counted attempt or
later the upload is rejected `unreadable` and the event is done, as before. An original that is there again on a retry
is prepared. The count is the event's counted attempts, not its not-founds: after two counted failures of another kind
the first not-found rejects at once, which Storage's own not-found of an object `completeUpload` saw allows.

An upload still `preparing` whose `expires_at` has come was never prepared and never will be. `uploadToPrepare` says
`lapsed` for it, and `recordPreparation` says `lapsed` when it lapsed during the work; either way the event fails for
good, `upload.lapsed`, so a photo lost to a long outage, or to anything else that outlived its upload, is a dead letter
with its line, never a quiet done. An upload no longer `preparing` is still nothing to do. (Added in the review, section
5, P1 and G2.)

### 1.4. The probe proves Storage's answer on `dev` (`tools/ops/src/supabase-probe.ts`)

A third `worker:` check, before the two that put a rendition: the service key reads an original never put in
`uploads` and must get an answer other than 200 that the worker's own `storageNoSuchKey` takes for gone (shared since
the review, section 5, P3). It runs at every `deploy-dev`; until then the reading of Storage's answer rests on its
sources and on `storage-setup`'s `NoSuchBucket`. If `dev` answered otherwise, the check would fail, and the worker would
wait out a missing original until its upload lapses, never reject a photo that is there.

## 2. Tests first

Written before the change and run on `main`'s code (the first commit's runs; the review's tests are in section 5):

- `services/worker/src/storage.test.ts`: "gives no object only for Storage's own not-found of the object, NoSuchKey, as
  Storage sends it" (passes on `main` too), and "fails as Storage unavailable for any other 404" (replacing "gives no
  object for Storage's not-found, in the body as Storage sends it or in the status", whose second half was the bug).
- `services/worker/src/outbox.test.ts`: `outageWaitSeconds` by the event's age (0, 29, 30, 60, 899, 900, a day; a
  negative age as 30); `OUTAGE_SECONDS` a day; an `Unavailable`'s code.
- `tests/src/db/worker-outbox.test.ts`, "a pass":
  - "waits out a service the work needs: Storage away isn't counted, is tried again at waits that grow with the event's
    age to 15 minutes, and never kills the event in its first day";
  - "counts Storage away from the event's second day, so its retries stay bounded: it dies after five attempts", which
    passes on `main`, where every failure counts, and guards the second day;
  - "still counts the failures that are the event's own between outages, and kills it at the fifth".
- `tests/src/db/worker-prepare.test.ts`:
  - "rejects an original Storage says it doesn't have only on its third attempt, after 30 and 60 seconds, as
    unreadable" (moved out of the table of rejections, whose case "no original in Storage" rejected on the first);
  - "prepares an original that is there again on a retry";
  - "waits out Storage for as long as the upload lives, counting no attempt, then …" (its end since the review:
    "kills the event once it lapses, as upload.lapsed, rejecting nothing");
  - "tries again after its wait, counting no attempt, and the retry writes over the same keys, leaving one row of each
    rendition": its waits and counts become the outage's (30 then 30 seconds, `attempts` 1 at the end, not 3).
- `tools/ops/src/supabase-probe.test.ts`: the third `worker:` check passes on the closed fake project, and fails for a
  plain 404, a missing bucket and a 200.

On `main`'s code, with the first commit's tests: the worker's two unit files 5 of 24 failed; the two database files 8
of 35 (the six above for want of the change, and the two claim tests, which read the event's new `createdAt`; the first
commit's journal entry said 6, corrected in the second's); the probe's file 5 of 71.

## 3. Breakages

Each run once the change is in, each in place and restored from its own copy, each expected to fail the named tests
(`breakages.py`, in the session's scratch; the runs are in the journal):

1. `readOriginal` taking any Storage 404 for gone, as on `main`.
2. Storage's not-found taken to cover `NoSuchBucket` (`storageNoSuchKey`, since the review shared by the worker and the
   probe).
3. An `Unavailable` counted as any failure, as on `main`.
4. An `Unavailable` not counted after the first day either.
5. The outage's wait without its 15-minute ceiling.
6. A missing original rejected on the first attempt, as on `main`.
7. The probe's check taking any 404.

Added in the review (section 5):

8. A failure written over the attempts' number alone, without the lease's end (G1).
9. An upload lapsed while still `preparing` taken as nothing to do, as on `main` (P1, G2).
10. A put Storage refuses taken as Storage away (P2, G3).
11. A read Storage refuses recorded under `storage.unavailable` (P2).
12. The probe's check without its HTTP status (G5).
13. Storage's not-found read from its code alone (P3, G5).
14. A sample behind the event's row counted, not waited out (G7).
15. The record not saying the upload lapsed during the work (P1, G2).
16. A put Storage refuses made an `Unavailable`, so waited out (P2, G3).

## 4. What it leaves to others

- B7: a dead event is still a line on standard error, and nothing pages anyone. Since the review a photo lost to a
  long outage is at least a dead letter, `upload.lapsed`, with its line.
- A `upload.prepare` event that dies for its own sake (five crashes, timeouts, broken processes or refused puts) still
  leaves its upload `preparing` until it lapses. The audit's other fix, a failed state the client is told, is the
  client's and the contract's, and isn't asked for here.
- The API's `completeUpload` reads Storage's not-found by its status alone (`services/api/src/media/storage.ts`
  `objectThere`); a plain 404 there tells the app its bytes aren't in yet, which a retry of its own clears. Unchanged.
- The outbox's day starts at `created_at` (section 1.2): the first topic written ahead of its time keeps its first due
  time as its own start.
- The poller is serial: each wait holds it for at most the call that failed (Storage's 30 seconds). While every topic
  needs Storage, nothing that could run waits behind a waiting event; the first topic that doesn't will need a topic's
  waiting events kept from holding it up (a breaker, or a shorter connect time).
- A rendition the photo's process returns larger than the `renditions` bucket's 20 MiB is refused by Storage, not by
  the worker first. That was so before this slice; since the review that refusal is counted, so it ends in five
  attempts, as on `main`. Checking a rendition's bytes before the put is left to a slice of its own.
- A worker whose `SUPABASE_SERVICE_KEY` isn't the service key would read every private original as NoSuchKey and reject
  it after three attempts (on `main`, at the first). The probe's controls on the Machine read with that same secret
  (`tools/ops/src/run.ts`), so a wrong key fails `deploy-dev` first.

## 5. The review (round 1, at `fa028e7`)

Two fresh subagents, one general (G1 to G8) and one for reliability, privacy and security (P1 to P7). Neither found a
blocker.

- **G1** (low): after an attempt is given back, `attempts = <this attempt>` no longer names one claim, so a stale
  claim's failure could be written over a newer claim that gave its attempt back (shown by a planted test: the event
  went dead under the newer claim's wait). Fixed: the lease's end marks the claim (section 1.2). Test: "writes nothing
  over a later claim that gave its attempt back: the lease's end, not the attempts' number, marks the claim", for a
  failure for good, one of the event's own and Storage away. Breakage 8.
- **G2 / P1** (low / should-fix): a photo lost to a long outage ended with its event `done`, not `dead`, and no line, so
  T54's dead letter queue lost it. Fixed: an upload lapsed while still `preparing` is a dead letter, `upload.lapsed`,
  whether found before the work or under the record's lock (section 1.3). Tests: "finishes an event whose upload isn't
  preparing or doesn't exist, and kills one whose upload lapsed still preparing as upload.lapsed, calling Storage for
  nothing" (was "finishes an event whose upload isn't preparing, has lapsed or doesn't exist", whose lapsed case was the
  gap); "records nothing for an upload that lapses during the work, and kills the event as upload.lapsed: its
  renditions stay stored at its key" (was "… and finishes the event"); the lapse test now ends dead. Breakages 9 and 15.
- **G3 / P2** (low / should-fix): lasting refusals were waited out as Storage away, re-running the whole preparation
  about a hundred times in a day, which a taken-over photo process could force with a rendition padded past the bucket's
  limit; and a refused key or a missing bucket shared `storage.unavailable` with an outage. Fixed: a put Storage refuses
  itself is a counted `StorageRefused`, `storage.refused`; a read it refuses is still waited out, as the audit asked of
  everything but NoSuchKey, under `storage.refused` (section 1.1). Tests: "fails a put Storage refuses itself as a
  refusal the outbox counts, not as Storage away: …"; "fails a read Storage refuses as waited out all the same, under
  the refusal's own code: …"; "fails as Storage away, saying nothing it holds, for any answer but Storage's 200 that
  isn't Storage refusing" (429, 408, 500, 544, `S3Error` and a plain 404 added); `storage-http.test.ts`'s two of
  `storageRefusal`; "counts a put Storage refuses itself as any failure, and kills the event after five attempts,
  leaving the upload preparing". Breakages 10, 11 and 16. The padded rendition's own cap: answered in section 4.
- **P3** (low): the probe's check fell back to the HTTP status, the worker's didn't, so an HTTP 404 `{code:NoSuchKey}`
  passed the probe and was Storage away to the worker. Fixed: one `storageNoSuchKey` in `@tadayo/domain`, read by both.
  Breakage 13.
- **G4 / P4** (low, latent): the first day starts at `created_at`, not when an event written ahead of its time comes
  due. Answered: only `upload.prepare` exists, whose `created_at` is when it comes due; said in `outbox.ts` item 4 and
  section 4.
- **P5** (low, latent): a hanging Storage holds the serial poller 30 seconds a try. Answered: nothing waits behind it
  while every topic needs Storage; said in item 4 and section 4.
- **G5** (nit): the probe's tests didn't pin the check's status part. Fixed: the probe's test fails it for an HTTP 404
  `{code:NoSuchKey}`, `{statusCode:"403",code:"NoSuchKey"}` at 400 and `{statusCode:"404",code:"NoSuchKey"}` at 200.
  Breakages 12 and 13.
- **G6** (nit): records that didn't match the runs. Fixed: the two test files' headers say which failed on `main` (two of
  the three outage tests in `worker-outbox`, four in `worker-prepare`); section 2 above; the second commit's journal
  entry corrects the first's 6 of 35 to 8 and its count of tests that failed on `main`.
- **G7** (nit): "is waited out for the event's first day, and counted after it" asserted only the constant, and a
  sample behind the row was tested only on `outageWaitSeconds`. Fixed: the unit test is now "lasts a day, no shorter than
  an upload lives, …" and pins `OUTAGE_SECONDS >= UPLOAD_HOURS` hours (P6 too); a database test, "waits the least,
  counting nothing, when the clock's sample is behind the event's row, as the server's never is (T1)"; and item 4 says
  the day assumes the clock moves forward. Breakage 14.
- **G8** (nit): `storage.ts` imports `Unavailable` from the poller's module. Answered, kept: there is no cycle
  (`outbox.ts` imports only `connection.ts`, as a type, and `generation.ts`), and the class sits beside the rule that
  reads it.
- **P6** (nit): nothing tied `OUTAGE_SECONDS` to the upload's life. Fixed with G7's test.
- **P7** (nit): the missing-original rule counts attempts, not not-founds. Answered, kept: said in `prepare.ts` step 4
  and section 1.3.
- The general reviewer's inferred notes: a wrong worker key and an older Storage's missing bucket. Answered in section
  4 (the key) and by Storage's current sources, which check the bucket first (the bucket would have to be deleted
  between `completeUpload` and the preparation).
