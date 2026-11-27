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
"NoSuchKey". Every other answer that isn't the bytes is `StorageUnavailable`: a plain 404, a 404 with no Storage body,
`NoSuchBucket`, `S3Error`, a refused key, a 5xx, no answer. `putRendition` is unchanged.

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
  `completeUpload` writes the event, so it lapses inside the event's first day. Its next attempt then finds nothing to
  prepare (`uploadToPrepare`) and the event is done, as today.
- The write stays over the attempt's own claim (`attempts = <this attempt>`), as every failure's does.
- `OutboxEvent` gains `createdAt`, read by the claim.

### 1.3. A missing original, after retries (`services/worker/src/prepare.ts`)

Storage's own not-found on the event's first or second counted attempt throws `OriginalMissing` (code
`storage.missing`), a counted failure: tried again after 30 and then 60 seconds. On the third counted attempt or
later the upload is rejected `unreadable` and the event is done, as before. An original that is there again on a retry
is prepared.

### 1.4. The probe proves Storage's answer on `dev` (`tools/ops/src/supabase-probe.ts`)

A third `worker:` check, after the two that put a rendition: the service key reads an original never put in `uploads`
and gets Storage's own not-found, `code` "NoSuchKey", which the worker alone takes for gone. It runs at every
`deploy-dev`; until then the reading of Storage's answer rests on its sources and on `storage-setup`'s `NoSuchBucket`.
If `dev` answered otherwise, the worker would retry a missing original until its upload lapses, never reject a
photo that is there.

## 2. Tests first

Written before the change and run on `main`'s code, where each fails for want of it:

- `services/worker/src/storage.test.ts`: "gives no object only for Storage's own not-found of the object, NoSuchKey",
  and "fails as Storage unavailable for any other 404: a plain one, one with no Storage body, a missing bucket, a
  lost object" (replacing "gives no object for Storage's not-found, in the body as Storage sends it or in the status",
  whose second half was the bug).
- `services/worker/src/outbox.test.ts`: `outageWaitSeconds` by the event's age (0, 29, 30, 60, 899, 900, a day; a
  negative age as 30); `OUTAGE_SECONDS` a day; an `Unavailable`'s code.
- `tests/src/db/worker-outbox.test.ts`, "a pass":
  - "waits out a service the work needs: an Unavailable isn't counted, is tried again at waits that grow with the
    event's age to 15 minutes, and never kills the event in its first day";
  - "counts an Unavailable from the event's second day, so it dies after five attempts";
  - "still counts the attempts of failures that are the event's own between outages, and kills it at the fifth".
- `tests/src/db/worker-prepare.test.ts`:
  - "rejects a missing original as unreadable only on its third attempt, after 30 and 60 seconds" (moved out of the
    table of rejections, whose case "no original in Storage" rejected on the first);
  - "prepares an original that is there again on a retry";
  - "waits out Storage for as long as the upload lives, counting no attempt, then finishes the event once it lapses,
    rejecting nothing";
  - "tries again after its backoff, and the retry writes over the same keys, leaving one row of each rendition": its
    waits and counts become the outage's (30 then 30 seconds, `attempts` 1 at the end, not 3), the rule it shows.
- `tools/ops/src/supabase-probe.test.ts`: the third `worker:` check passes on the closed fake project, and fails for a
  plain 404, a missing bucket and a 200.

## 3. Breakages

Each run once the change is in, each restored from its own copy, each expected to fail the named test:

1. `readOriginal` taking any Storage 404 for gone, as on `main`.
2. `readOriginal` taking `NoSuchBucket` for gone.
3. An `Unavailable` counted as any failure, as on `main`.
4. An `Unavailable` not counted after the first day either.
5. The outage's wait without its 15-minute ceiling.
6. A missing original rejected on the first attempt, as on `main`.
7. The probe's check taking any 404.

## 4. What it leaves to others

- B7: a dead event is still a line on standard error, and nothing pages anyone; an upload whose Storage was away for
  its whole life lapses with only the waiting lines to say so.
- A `upload.prepare` event that dies for its own sake (five crashes, timeouts or broken processes) still leaves its
  upload `preparing` until it lapses. The audit's other fix, a failed state the client is told, is the client's and the
  contract's, and isn't asked for here.
- The API's `completeUpload` reads Storage's not-found by its status alone (`services/api/src/media/storage.ts`
  `objectThere`); a plain 404 there tells the app its bytes aren't in yet, which a retry of its own clears. Unchanged.
