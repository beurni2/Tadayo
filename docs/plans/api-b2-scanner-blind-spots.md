# Plan: api/b2-scanner-blind-spots, the outside audit's A14, its second part

B2 · api lane. The outside audit's A14 (Medium, "Four blind spots in the privacy tests") named four gaps. The first
part, `api/b2-privacy-blind-spots` (PR #136), took the second and fourth: the matrix cells where each of T9's
conditions is the only denial, Home's judge tested on its own, T9's one module and T1's one clock. This part takes the
first and the third: the leak scanner's own key lists for what an answer can hold before a day's reveal, never-words
that read camelCase, and the API's log read in the matrix as the scanner reads answers, with redaction at every
depth. A third part, `api/b2-server-time-types`, follows (PR #136's plan, section 5).

Sources: T10, T16, T52, T58; spec 14, 30, 33; TECH-DESIGN sections 5 and 8; the audit's A14 (its first and third
bullets). Tests and the API's logging only: no route, schema or migration changes.

## 0. What the audit found, re-checked on `main` at `1a416e2`, and again at `270c3db`

0.1. **The scanner's whitelist stops at the card.** `tests/src/privacy/scanner.ts` holds T10's list for a caption card
(`CAPTION_CARD`) and its author (`CARD_AUTHOR`) and nothing else. Every other object is judged by the contract alone
(the shape check's walk), so a key the contract names passes the shape check: a key added to the contract and served
by the route, around the cards (`drop_count` on the day, a list of ids under `viewer`, `committed_at`, `filesize`,
`post_id`), meets only the never-key check, and the never-list has none of those words. Since the audit,
`packages/contracts/src/contract.test.ts` pins the keys of `UpcomingDay`, `ViewerDay`, `Occurrence` and `ClubRef`, but
that is the contract's own test, which the same change edits; and it pins none of the other schemas a day before its
reveal can sit in: `OwnDay`, `OwnContribution`, `Allowance`, `ClubSummary`, `Member`, the waiting Homes, a receipt.
Holds.

0.2. **The never-list reads snake_case only.** `NEVER_KEY` matches a word between underscores or the key's ends:
`thumbnail_url` matches, `thumbnailUrl`, `posterURL`, `ImageWidth` and `mediaVersion` don't (checked with node on
the regex as it is). It has no word for a count, a total, a hidden flag, a position, a preview or a time (`*_at`).
Holds.

0.3. **Nothing reads the logs of the real routes.** `tests/src/privacy/matrix.test.ts` builds the app with
`log: { level: "silent" }`; `services/api/src/logging.test.ts` drives the logger on stubs. `services/api/src/logging.ts`
blanks each of `REDACTED_FIELDS` at the top and one level down (`PATHS`: `field` and `*.field`), so
`{ served: { home: body } }` keeps everything two levels down, and `name` (a club's name, a candidate's label's
holder) isn't on the list at all. Holds.

0.4. **Again at `270c3db`** (PR #136 merged, and the ios lane's PRs #134 and #131): PR #136 changed the matrix's roles,
states and harness (`matrix.test.ts`, `harness.ts`, `rows.ts`, a new `home.test.ts`), not `scanner.ts`, `logging.ts` or
the matrix's app's log level, so 0.1 to 0.3 hold as written. This branch was made again from `270c3db` with the
slice's changes carried over by a three-way merge, which met no conflict.

## 1. The change

### 1.1. The scanner's own key lists before the reveal (`scanner.ts`)

- `BEFORE_REVEAL_OPERATIONS`: the operations whose answers can hold a day or a drop before its reveal, by id:
  `getOccurrence`, `getHome`, `getDrop`, `getOwnDay`, `listMyDrops`, `createDrop`, `updateDrop`, `removeDrop`,
  `setHighlight`, `hideDrop`, `createReservation`, `releaseReservation`, `listClubs`, `getClub`, `createClub` and
  `listMembers` (the last four hold a club's `open_day`, `next_day` and a member's `next_day`).
- `OPENED_ONLY`: the schemas only an opened day holds (`DropRevealed`, `RevealedPhoto`, `RevealedVideo`,
  `ReactionSummary`, `RevealedDay`, `RevealedDayDrop`, `ReplyPreview`, `HighlightEntry`, `DayLink`, `HomeDay`). The
  world check already refuses each before its day opens; the key check skips what has opened.
- `BEFORE_REVEAL`: this file's own copy of each other object schema those answers reach, its keys as
  `{ required, optional }`. The scan checks every object whose schema (the walk's name for it) is on the list against
  it exactly, in every answer and phase, as a `whitelist` finding (`a <schema> that has <key>`, or `an`). In an answer of a
  `BEFORE_REVEAL_OPERATIONS` operation, an object of a schema on neither list, or with no schema name at all, is a
  `whitelist` finding too, so a new schema can't arrive under the day unlisted.
- `CAPTION_CARD` and `CARD_AUTHOR` stay as they are: they judge a card by its `view`, whatever schema the walk gives it.
- A test reads the contract: the object schemas `BEFORE_REVEAL_OPERATIONS`' answers reach are exactly `BEFORE_REVEAL`'s
  and `OPENED_ONLY`'s names, the two lists don't meet, and each list is the contract's keys and required keys today; and
  every operation whose answer reaches an `Occurrence`, a caption or own card, an `Allowance` or a drop or day id field
  is in `BEFORE_REVEAL_OPERATIONS` or on the test's own list of operations that answer only about opened days
  (`listFavourites`, `listMemories`, `searchMemories`, and the reactions', favourites', comments' and threads'). So a
  contract change alone fails twice: the matrix finds the served key, and the test finds the lists out of step.

### 1.2. Never-words that read camelCase (`scanner.ts`)

- `keyWords(key)`: the key's words, split at `_`, `-`, a lower-case letter or digit before a capital, and the last
  capital of a run before a lower-case letter (`thumbnailUrl` is `thumbnail url`, `posterURL` is `poster url`,
  `HTMLBody` is `html body`), lower-cased.
- `NEVER_WORDS`: today's list, plus the audit's `count`, `total`, `hidden`, `position`, `preview` (`size` is there),
  each with its plural; a key whose last word is `at` (`committed_at`, `committedAt`) is a time. A few media words are
  caught as a word's end too, which no plain word ends with: `url`, `uri`, `src`, `size`, `hash`, `thumb`,
  `thumbnail`, `width`, `height` (`filesize`, `imageurl`, `thumbhash`).
- `SERVED_FOR_A_REASON`: the keys the contract serves today that a new word names, by schema and key, each with its
  reason: `Occurrence.reveal_at` and `close_at` (T1, the server's times), `expires_at` on `Reservation` (T18),
  `CandidateInvitation`, `InvitationLink`, `InvitationOpen`, `InvitationChanged`, `SignedUpload`, `Upload`,
  `UploadStatus` and `Source` (T7, T12),
  `LeftClub.left_at`, `DeviceRegistration.registered_at`, `AccountDeletion.requested_at`, `ClubSummary.member_count`
  (book p24), `Member.position` (book p24's order), `HiddenDrop.hidden` and `NotificationPreferences.text_previews`. A
  test pins it against the contract: each pair exists, and no other key of any answer's schema names a never-word.

### 1.3. The matrix reads the API's log (`matrix.test.ts`, `scanner.ts`)

- The matrix's app logs at `info`, fly.toml's `LOG_LEVEL`, into a stream the test keeps (`LogConfig.stream`).
- `logProblems(line, world)` in `scanner.ts`: each line is JSON with only the keys the API writes (`level`, `time`,
  `reqId`, `msg`, `op`, `preflight`, `status`, `ms`, `err`, `trouble`), and no string in it holds text people wrote in
  the world (any caption, comment, name or label, whole, or one of 6 characters or more inside another value), a value
  the world keeps back, a URL, a storage path or a provider's host (the values check's own marks), or a token the
  harness or the world holds. T52 has no viewer: a log carries no content to anyone.
- The matrix scans each line its answers wrote, with the answer, and fails the cell on any problem. Its last test reads
  any line left, and asks for a `request` line for every answer the scanner read, so a silenced log fails it.

### 1.4. Redaction at every depth (`services/api/src/logging.ts`)

- pino's path-based `redact` goes one level down; a `formatters.log` function replaces it, walking every object and
  array at any depth and blanking each key whose name, lower-cased with `_` and `-` taken out, is on the list (so
  `signedURL` and `Caption` too). An `err` is left to its serializer (its class and code). Any other object that isn't a
  plain object or an array (a class's instance, a buffer) is blanked whole, since its JSON form is its own.
- `name` joins the list: a club's name and a candidate's are text people wrote.
- `logging.test.ts`: a caption four levels down, in an array, under a camelCase key and inside a class's instance, each
  blanked; an error still its class and code.

### 1.5. A request line for Fastify's own answers (`services/api/src/app.ts`, `logging.ts`)

- The first whole run of the matrix with 1.3 found 658,490 answers and 542,301 request lines. Fastify answers a request
  it can't route (a broken escape such as `%zz`, an id past its 100 characters) through `frameworkErrors`, before any
  hook, so `logEachRequest`'s `onResponse` never ran for it: in production, a probe of malformed ids left no line at
  all. `requestLine(request, reply)` is now the one line's writer: the hook calls it, and so does `buildApp`'s
  `frameworkErrors`, after its neutral not-found.
- `logging.test.ts`: an id of 101 and of 4,096 characters and three broken escapes each get one line, the neutral 404,
  with no operation and no path; "holds Fastify's own lines back" now asks for exactly its three lines, where it took
  two or fewer.

## 2. Tests first

Written before the code and run on `main`'s scanner and logger, where each fails:
- `scanner.test.ts`, "holds its own key list for every object schema an answer can hold before a day's reveal, each the
  contract's keys today" and "counts every operation whose answer can name a day or a drop".
- `scanner.test.ts`, the audit's mutants, each with the contract widened in the test's own copy of the document so the
  shape check passes: `drop_count` and `hidden_count` on the day, a list of ids under `viewer`, `committed_at` and
  `post_id` on the own card's day, `filesize` on an allowance, `drop_count` on a club summary and a waiting Home: each a
  `whitelist` finding, and the never-word ones a `keys` finding too.
- `scanner.test.ts`, the never-list in camelCase and as a word's end, and every served-for-a-reason key passing.
- `scanner.test.ts`, `logProblems` on planted lines: a caption, a name, a club's name, a kept-back value, a URL, a token,
  an unknown key; and the API's real lines passing.
- `logging.test.ts`, the four depths above, and 1.5's line for Fastify's own answers.
- `matrix.test.ts`: the matrix's app at `info`, every line scanned.

A test whose existing expectation now meets one more check is changed with the reason in the commit's entry, never to
hide a finding: in `scanner.test.ts`, the planted `media_url` on a day is a `whitelist` finding too, and a link's and
an upload's `expires_at` outside their own answers are `keys` findings too (nothing reads them as their schemas
there); in `logging.test.ts`, the line for Fastify's own 404 (1.5).

## 3. Breakages, registered before they are run

Each applied to the code under test, run against the suites registered for it, and every file restored from its own
copy and checked after (the runner keeps each file's text, so the slice's own uncommitted changes survive it). "Contract
and route" means the zod schema in `packages/contracts/src/schemas/` or `common.ts`, `openapi.yaml` written again from
it (`node scripts/openapi.ts write`, as `ci`'s `openapi` step demands), and the route that fills it. Each matrix run is
the matrix as the member in the audience, whose cells reach every built route of the lists (`-t "answers the member in
the audience as|wrote a request line for every answer"`), on a freshly made database; caught means the run fails and
its output holds every pattern registered for it. The control runs apply the same edits to a worktree at `main`
(`1a416e2`, and again at `270c3db`) and run `main`'s matrix the same way, and `main`'s `contract.test.ts` for the contract's.

The first draft of this section put S1, S3 and S7 on `getOccurrence` and `getOwnDay`, which aren't built yet (the app's
`HANDLERS` table, `services/api/src/app.ts`), so no matrix cell could serve them. Before any run, they moved to the
answers the built routes serve before a day's reveal: the day as every `Occurrence` (`occurrenceBody`), the commit's
receipt and the waiting Home.

- S1: `drop_count` on `Occurrence` (contract and `occurrenceBody`, so every answer that names a day): the matrix's
  `whitelist` (`an Occurrence that has drop_count`) and `keys`; `scanner.test.ts`'s key-list and served-for-a-reason
  tests. Control: `main`'s matrix misses it; `main`'s `contract.test.ts` catches it (it pins `Occurrence`'s keys).
- S2: the open day's drop ids under `ViewerDay` (contract and Home's route): the matrix's `whitelist` (`a ViewerDay
  that has drop_ids`); the key-list test. Control: as S1.
- S3: `committed_at` on the commit's `DropReceipt` (contract and createDrop's route): the matrix's `whitelist` and
  `keys`; the key-list and served-for-a-reason tests. Control: `main`'s matrix and `contract.test.ts` both miss it.
- S4: `drop_count` on each `ClubSummary` of `listClubs` (contract and `listClubs`' route): `whitelist` and `keys`; both
  tests. Control: missed by both.
- S5: `filesize` on every `Allowance` (contract and `allowanceBody`): `whitelist` and `keys`; both tests. Control:
  missed by both.
- S6: `avatarUrl` on `Me` (contract and `getMe`'s route), outside the lists: the matrix's `keys`; the served-for-a-reason
  test. Control: missed by both.
- S7: a new schema, `DayStats`, under the waiting Home (contract and Home's route): the matrix's `whitelist` twice (`a
  HomeWaiting that has stats`, and `a DayStats, which this file holds no list for`); the key-list test. Control: missed
  by both.
- L1: Home's handler logs its whole answer as `{ served: { home: body } }`: the matrix's log scan (`a key the API's log
  doesn't write: served`); the values inside are blanked (`logging.test.ts` holds that on its own). Control: `main`'s
  matrix misses it.
- L2: L1 with the redaction back to pino's paths, one level down: the log scan finds the text people wrote under
  `$.served.home.`; `logging.test.ts`' two depth tests. No control (`main`'s logger is already one level down: L1's
  control covers it).
- L3: `listClubs`' handler logs a club's name as `{ club: name }`: the log scan (`a key the API's log doesn't write:
  club`, and text people wrote at `$.club`). Control: `main`'s matrix misses it.
- L4: the matrix's app back at `silent`: the matrix's log test (`wrote a request line for every answer the scanner
  read`). No control.

S6 as first run put `avatarUrl` in `meBody`, which `updateMe`'s answers share, and `updateMe` then answered 500 in every
cell, so `main`'s matrix failed on the 500s, not on the key. Before the runs on `270c3db` it moved to `getMe`'s handler
alone, as `{ ...meBody(account), avatarUrl: "x" }`; the first run's runner is kept beside the second's.

### 3.1. As run

- **On `1a416e2`**, the slice uncommitted: `privacy` 522 of 522 (the request-line test passing once 1.5 was in); all 19
  runs caught, S1 to S7 and L1 to L4, each with every registered pattern.
- **On `270c3db`**, the branch made again from it: `db-tests` 951 of 951 and `privacy` 537 of 537 on a fresh cluster
  (1,262 s); all 19 runs caught again, S6 as moved (no 500 in its output; the matrix's `keys` finding at `$.avatarUrl`
  of `getMe`).
- **The control runs did not go as registered.** At `1a416e2` and again at `270c3db`, `main`'s matrix failed on S1,
  S2, S3, S5 and S7: not through the scanner, but through the judges, which compare those answers whole (`listClubs`'
  `next_day`, Home's open day and its waiting body, `createDrop`'s receipt, a reservation's allowance), so a key added
  to them is a difference from the judge's expected body. The registration's "`main`'s matrix misses it" was wrong for
  those five: on the routes built today, the judges already catch a key added beside the cards. `main`'s
  `contract.test.ts` failed on the same five, each because the contract's example answers lack the new key, which each
  breakage made required (S1 and S2 also meet its pins of `Occurrence` and `ViewerDay`); S6's key, optional, passes it.
  As registered: S4 (`ClubSummary`, whose judge compares only its `next_day`) missed by both, and L1 and L3 missed by
  `main`'s matrix. S6 at `1a416e2` failed on `updateMe`'s 500s (above); at `270c3db`, moved, it is missed by both, as registered.
- **What that leaves this slice:** the judges hold the answers they compare whole, route by route, and only once a
  judge is written for a route; this slice's lists hold every object of a schema a day before its reveal can sit in,
  whatever the route and whether or not its judge compares it, and its never-words and log scan reach what no judge
  reads (S4, S6, L1 to L4).

## 4. What it leaves to others

- The scanner reads the API's answers and log, not the worker's log, the app's caches or push (B4, B7).
- A key the never-list can't read as words (`fsize`, a word in another language) passes the key check; outside the lists
  only the contract's own test and review hold it.
- The log scan reads what the matrix's routes write; a line only a failure path writes (Storage down, the database out
  of time) is read by `logging.test.ts` on stubs, as today.
- Time: the log scan made `privacy` about 18% longer here (1,262 s against `main`'s 1,068 s at `270c3db`). `ci`'s
  `postgres` job, which runs `db-tests` and `privacy`, has a 20-minute limit and took 14 min 28 s on `main` at `ae506db`
  (its `privacy` step 12 min 2 s), so about 16 min 40 s is expected. If later rows bring it near the limit, the limit
  is a workflow change, in its own PR (T58), not a cut to what the matrix reads.

## 5. Review

To come.
