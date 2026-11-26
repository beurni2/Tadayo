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
  `listMembers` (the last four hold a club's `open_day`, `next_day` and a member's `next_day`); and, since round 1,
  `getAuthorPreview`, the author's own preview of a link, which answers its author before the reveal (T11, built by
  B3; section 5.1, P7).
- `OPENED_ONLY`, in the first two commits: the schemas only an opened day holds (`DropRevealed`, `RevealedPhoto`,
  `RevealedVideo`, `ReactionSummary`, `RevealedDayDrop`, `ReplyPreview`, `HighlightEntry`, `DayLink`), which no list
  held: the world check refuses each before its day opens, and the key check skips what has opened. The first commit had
  Home's open day (`HomeDay`) and the revealed day (`RevealedDay`) on it too, but each also names a day still to open
  (`next`, `add_target`), so round 1 gave each its own list (section 5.1, P2). Round 2 found that a day link sits among
  a waiting Home's recent days while the club's next day collects, and that an opened card, its photo and its
  reactions sit in the same answers as a day still to open, so a key there (`drops: 7` on a day link, `upcoming: 2` on
  an opened card) met no list, and no never-word; `OPENED_ONLY` is gone, and each of the eight has its list (section
  5.4, F1).
- `BEFORE_REVEAL`: this file's own copy of each object schema those answers reach, its keys as `{ required, optional }`
  (37 schemas after round 1: the first commit's 34, `HomeDay`, `RevealedDay` and the author's preview's
  `ExternalVideoPreview`; 45 since round 2, with `DayLink` and the seven opened ones). The scan checks every object whose
  schema (the walk's name for it) is on the list against it exactly, in every answer and phase, as a `whitelist` finding
  (`a <schema> that has <key>`, or `an`). In an answer of a `BEFORE_REVEAL_OPERATIONS` operation, an object of a schema
  off the list, or with no schema name at all, is a `whitelist` finding too, so a new schema can't arrive under the day
  unlisted.
- `CAPTION_CARD` and `CARD_AUTHOR` stay as they are: they judge a card by its `view`, whatever schema the walk gives it.
- A test reads the contract: the object schemas `BEFORE_REVEAL_OPERATIONS`' answers reach are exactly `BEFORE_REVEAL`'s
  names (since round 2; before, with `OPENED_ONLY`'s), and each list is the contract's keys and required keys today; the
  schemas only an opened day holds, where the key check doesn't look, are on it, and none reaches an `Occurrence`; and
  every operation whose answer reaches an `Occurrence`, a caption or own card, an `Allowance` or a drop or day id field
  is in `BEFORE_REVEAL_OPERATIONS` or on the test's own list of operations that answer only about opened days
  (`listFavourites`, `listMemories`, `searchMemories`, and the reactions', favourites', comments' and threads'). So a
  contract change alone fails twice: the matrix finds the served key, and the test finds the lists out of step. Since
  round 1, an operation whose path names a drop or a day (`{drop_id}`, `{occurrence_id}`) counts too, whatever its
  answer holds (`getDropMedia`, `getEmbed`, `listComments` and `removeFavourite` join the test's list of operations
  that answer only about opened days; section 5.1, P7), and a second test finds no object those answers can hold but a
  named schema's: none inline, none a map (section 5.1, G6).

### 1.2. Never-words that read camelCase (`scanner.ts`)

- `keyWords(key)`: the key's words, split at `_`, `-`, a lower-case letter or digit before a capital, and the last
  capital of a run before a lower-case letter (`thumbnailUrl` is `thumbnail url`, `posterURL` is `poster url`,
  `HTMLBody` is `html body`), lower-cased; since round 1, an acronym's plural `s` stays with it (`photoURLs` is
  `photo urls`), and a letter and a digit split (`url2x` is `url 2 x`; section 5.1, P1 and P6).
- `NEVER_WORDS`: today's list, plus the audit's `count`, `total`, `hidden`, `position`, `preview` (`size` is there),
  each with its plural; a key whose last word is `at` (`committed_at`, `committedAt`) is a time. A few media words are
  caught as a word's end too, which no plain word ends with: `url`, `uri`, `src`, `size`, `hash`, `thumb`,
  `thumbnail`, `width`, `height` (`filesize`, `imageurl`, `thumbhash`).
- Since round 1 (section 5.1, P1, G1 and P6): `main`'s own regex (`NEVER_KEY`, as `main` has it) is `neverKey`'s first
  test, so the check names every key `main`'s named, and more; two words that make a never-word together are read as
  one (`waveForm`, `highLight`); `NEVER_WORDS` gains `n`, `num`, `number`, `has`, `any`, `time`, `timestamp`, `created`
  and `updated`; a last word `on` is a time too (`added_on`); and `count` and `total` are caught as a word's end
  (`dropcount`), but in `account` (`PLAIN_WORDS`).
- Since round 2 (section 5.4, F4): the plain spellings of T10's and T15's own lists, `post`, `video`, `taken`,
  `length`, `w`, `h`, `dims`, `mime`, `remaining`, `missing`, `empty` and `slotsleft` (two words read as one, so
  `slots_left`), each with its plural; and a highlight at a word's start (`NEVER_STARTS`: `highlighted`,
  `isHighlighted`). No key the contract serves outside what has opened names one (the served-for-a-reason test).
- Since rounds 3 and 4 (sections 5.7, F-E, and 5.10, R4-2): `NEVER_STARTS` is tried on two words joined too
  (`highLighted`, `high_lighted`); one word is read as two run together (`joinedNever`: `providerid`, `createdat`,
  `aspectratio`, `haspreview`, `ishighlight`); and `NEVER_ENDINGS` gains `color`, `colour`, `remaining`, `missing`,
  `duration`, `preview`, `timestamp`, `dimension`, `waveform` and `highlight` (`dominantcolor`, `slotsremaining`).
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
- Since round 1 (section 5.1, P3), the text a request carried counts as text people wrote, though no world stores it
  (a caption a refused commit carried, a search's words): each string of a body or a query of 6 characters or more,
  but an id, a date or a value the contract enumerates (`textsOf`); and a token an answer gave counts as a token
  (`answerSecrets`: each string under a key that names a token, a secret or a URL, and each run of 20 URL-safe
  characters inside one, such as a link's token). `Needles` (`scanner.ts`) indexes them all by their first 6
  characters, so a line is read against tens of thousands in a few lookups.
- Each step's scanner reads the lines written since the last read, against all the matrix has gathered so far, so a
  line is read with the step that wrote it, and a request the matrix sends outside a step (a preflight, set-up) is read
  with the next step. It fails the cell on any problem, and, since round 1, on a count of request lines other than the
  requests sent since (`sentTo`, counted by `harness.ts`'s `answerOf`, through which every matrix request goes;
  section 5.1, G3). The last test reads every line again, against all of it (a token an answer gave after its line was
  read, text a later request carried), and asks for exactly one request line for every request sent, so a silenced
  log, a lost line or a doubled one fails it.
- Since round 2 (section 5.4, F5 to F7 and F9): a request's text is each string but an opaque one (`OPAQUE`: an id of
  the API's, `drp_` and 22 characters, a UUID, a whole date or instant), so an id, which T52 allows, is no text, and a
  caption that starts with a date is; a request's credential is gathered whatever its scheme, whole and after the
  scheme (`Basic`'s too); `Needles` looks for each string in any case and as JSON escapes it, and, for text people
  wrote (`cuts`), finds a log value of 8 characters or more inside one too (a text cut short or trimmed); and each line
  is tagged with the number of requests sent when it was written (`answerOf` counts a request after the event loop's
  turn, once the last one's lines are written), so each request must have exactly one request line written in its own
  time, and a lost line and a doubled one in the same step no longer cancel out (`lineCounts`, which reads from the
  step's own first line: walking the whole log at each step made round 2's first full run take 2,215 s; section 4).
- Since rounds 3 and 4 (sections 5.7, F-A, and 5.10, R4-1): with `cuts`, `Needles` also finds a run of 12 characters
  of a text anywhere inside a longer value (`SHORTEST_RUN`: `caption=rom Ben's pho`), by one exact lookup for each
  place in the value (`#byRun`); `logProblems` asks `holds`, which stops at the first needle a value holds, with the
  exact lookups first, so a leaking body costs little however many texts share its wording.

### 1.4. Redaction at every depth (`services/api/src/logging.ts`)

- pino's path-based `redact` goes one level down; a `formatters.log` function replaces it, walking every object and
  array at any depth and blanking each key whose name, lower-cased with `_` and `-` taken out, is on the list (so
  `signedURL` and `Caption` too), and, since round 1, each key with a word of `REDACTED_WORDS` in it, its words read as
  the scanner reads them (`signed_upload_url`, `captionText`, `storage_path`, `labels`; section 5.1, P5). An `err` is left to its serializer (its class and code). Any other object that isn't a
  plain object or an array (a class's instance, a buffer) is blanked whole, since its JSON form is its own.
- `name` joins the list: a club's name and a candidate's are text people wrote.
- Since round 1 (section 5.1, P4 and G2): a child logger's bindings are blanked the same way, as the child is made
  (`redactBindings`, called on the app's logger in `buildApp`). pino reads `formatters.log` for a line's own fields
  only and resets `formatters.bindings` for each child, so the first commit wrote `log.child({ caption })`'s caption
  whole, where `main`'s path redaction blanked it; pino makes each child from its parent, so the root's `child` is the
  one every logger of the app calls, Fastify's request loggers included. A request's id stays.
- Since round 2 (section 5.4, F2, F3 and F8): pino's own path redaction, `main`'s (each field of the list at the top
  and one level down), stays beneath `formatters.log`, so a child that brings a log formatter of its own, or bindings
  pino stringifies itself, still meet everything `main` blanked; `redactBindings` blanks bindings set later
  (`setBindings`) as it blanks a child's, and runs a child's own log formatter's output through the redaction; a `msg`
  among a line's fields is blanked; a line with an error and no message of its own gets a fixed one (`ownMessage`,
  pino's `hooks.logMethod`), since pino would copy the error's message into the line's `msg`, which no field's
  redaction reaches (Postgres quotes rows in it; Fastify's warning for a second answer quotes the URL); and
  `REDACTED_WORDS` gains `content`, `query`, `search`, `reason`, `username` and `nickname`.
- `logging.test.ts`: a caption four levels down, in an array, under a camelCase key and inside a class's instance, each
  blanked; an error still its class and code; since round 1, keys the list doesn't spell with a content word in them,
  and a child's and a grandchild's bindings, each blanked, with the request line's own keys and a request's id kept;
  since round 2, bindings set later, a child's own formatter's output and a `msg` field blanked, `main`'s paths beneath,
  and a line with an error and no message of its own (`log.error(err)`, `{ err }`, a child's, Fastify's own warning for
  a second answer) given the fixed message.
- Since rounds 3 and 4 (sections 5.7, F-B and F-D, and 5.10, R4-6 and R4-7): Fastify's warning for an answer sent after
  one went out on `reply.raw`, which quotes the URL in its message, keeps only `REPLY_SENT_MESSAGE`; `redactBindings`
  wraps only a child's own formatter that is a function, its `bindings` one as well as its `log` one, called with the
  `this` pino gives it; and falsy bindings pass as they are, for pino to refuse or skip.

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
  (its `privacy` step 12 min 2 s), so about 16 min 40 s was expected; at `6459ad3` it took 16 min 18 s (run
  45729519892, its `privacy` step 13 min 53 s). Round 1 reads more (each request's texts and each answer's tokens, and
  every line a second time at the end) through `Needles`' index: `privacy` 540 of 540 in 1,199 s here, against the
  first commit's 1,262 s for 537 on the same machine, and at `d76b977` the `postgres` job took 13 min 58 s (run
  45740021078, its `privacy` step 11 min 39 s). Round 2's first full run took 2,215 s for 542: each step's count of
  request lines walked the whole log from its first line, so the matrix's time grew with the square of its lines. It
  now reads from the step's own first line (`lineCounts`), and one role's sweep takes 93 s, against 88 s at `d76b977`
  and 107 s before the fix; the full run, 542 of 542 in 1,219 s, against round 1's 1,199 s for 540. If later rows
  bring it near the limit, the limit is a workflow change, in its own PR (T58), not a cut to what the matrix reads.

## 5. Review

### 5.1. Round 1, at `6459ad3`

Two fresh reviews, by subagents that hadn't seen the work: one on privacy and security (P1 to P7: three medium, four
low), one on the tests and the records (G1 to G12: one high, two medium, three low, and records points and nits). Each
is fixed in the second commit, or answered here.

- **P1 and G1 (medium; high): the never-word check named less than `main`'s (T58).** `keyWords` cut an acronym's
  plural before its last capital (`URLs` read `ur ls`, and so `HREFs`, `EXIFs`, `TOKENs`, `image_URLs`), and a
  never-word written as two words (`waveForm`, `highLight`) met neither half. No contract key was one, but outside the
  lists (`Me`) the check was weaker than `main`'s, and the T58 row's "loosens no check" was untrue. Fixed: `NEVER_KEY`,
  `main`'s regex as `main` has it, is `neverKey`'s first test, so it names every key `main`'s did; an acronym's plural
  `s` stays with it (`photoURLs`, which neither caught); two words that make a never-word are read as one; a letter
  and a digit split (`url2x`). Tests: those keys in "reads a key's words in snake_case and camelCase, …", and "names
  every key the never-list named before the outside audit's A14, in the contract and planted", which runs `main`'s
  regex over every key of the contract and seven planted ones.
- **P2 and G5 (medium; low): `HomeDay` and `RevealedDay` were on `OPENED_ONLY`,** though Home's open day names the
  club's next day (`next`) and the revealed day the star's next (`add_target`), each still collecting, so their own
  keys met no list (`next_has_drops` on Home's open day passed, against T15). Fixed: both on `BEFORE_REVEAL` with the
  contract's keys today; the key-list test holds that no schema left on `OPENED_ONLY` reaches an `Occurrence` but
  `DayLink`, a closed day.
- **P3 (medium): the log scan missed what no world stores, and what came after a line was read.** A refused commit's
  caption and a search's words are in no world, and `createInvitation`'s line was read before its answer's token was
  gathered. Fixed: each step adds its requests' texts (`textsOf`) and its answers' tokens (`answerSecrets`) before it
  reads the log, and the last test reads every line again against all of it (section 1.3). `Needles` indexes the
  strings, so the extra reading costs little (section 4).
- **G3 (medium): the last log test passed with lines missing.** It asked for at least as many request lines as answers
  the scanner read, and the matrix's other requests (three preflights and two invitation pages per cell and phase,
  set-up) padded that by thousands, so a route that lost its lines in one kind of cell, or wrote two, passed. Fixed:
  `harness.ts`'s `answerOf` counts every request (`sentTo`); each step's read asks for exactly one request line for
  each request sent since, and the last test for exactly one for each request sent in all.
- **P4 and G2 (low; medium): a child logger's bindings skipped the redaction.** The first commit wrote
  `log.child({ caption })`'s caption whole into each line, where `main`'s path redaction blanked it; nothing calls
  `child` today. Fixed by `redactBindings` (section 1.4). Test: "blanks a child logger's bindings as it blanks a line's
  own fields, and keeps a request's id".
- **P5 (low): the redaction matched only the list's own names,** though its comment said "any of its spellings":
  `signed_upload_url`, `media_url`, `photoUrl`, `object_key`, `storage_path`, `captionText` and `labels` came out
  whole, as on `main`. Fixed: a key with a word of `REDACTED_WORDS` in it is blanked too (an address, a credential, a
  storage path, text people wrote, a name, a provider's post), and the comment says so. Test: "blanks a key the list
  doesn't spell when a word of it is a content word, and keeps the request line's own keys".
- **P6 (low): the never-words missed common ways to write a count, a time or a flag** (`num_drops`, `n_drops`,
  `has_drops`, `any_added`, `added_on`, `created`, `timestamp`, `dropcount`, `url2`). Fixed (section 1.2), each in
  the never-word test; no key the contract serves today names one (the served-for-a-reason test).
- **P7 (low): operations that ask about a drop by its path weren't counted.** `getEmbed`, `getAuthorPreview` and
  `listComments` answer about the drop their path names and were on neither list. Fixed: the operation test counts an
  operation whose path has `{drop_id}` or `{occurrence_id}`; `getAuthorPreview`, which answers its author before the
  reveal (T11), is on `BEFORE_REVEAL_OPERATIONS`, with `ExternalVideoPreview`'s list; `getDropMedia`, `getEmbed`,
  `listComments` and `removeFavourite` answer only about opened days (the test's own list).
- **G4 (low): the world-texts test checked less than its name.** Fixed: it reads a world given a comment and a roster
  label, and asserts a comment, a label, an account's name and an invitation's club and inviter names.
- **G6 (low): the key-list test couldn't see an inline object or a map.** Fixed: "finds no object those answers can
  hold but a named schema's: none inline, none a map" walks the answers of `BEFORE_REVEAL_OPERATIONS` in the contract.
- **G7 (records):** the T58 row said the branch loosened no check, which G1 and G2 showed untrue of the first commit,
  and named one changed test where `logging.test.ts` changed three (each tighter); the first commit's entry said two
  planted cases met one more check, where section 2 names three. Corrected in the T58 row and in the second commit's
  entry (the log is append-only).
- **G8 and G9 (nits):** `scanner.ts`'s header and `NEVER_WORDS`' comment rewritten.
- **G10 (nit): "every answer has one".** Answered, and the comment corrected: Fastify's `clientError` answers a
  request Node's parser refuses before there is a request (a raw 400 on the socket), so there is no request to log;
  that answer carries no content and no route.
- **G11 (nits):** the camelCase test used `ClubRef`, on the lists; it now checks a camelCase key on `Me`, outside them,
  too. Section 1.3 now says how lines are read (each step's, and a request sent outside a step with the next).
- **G12 (nits):** the separators in the T16, T52 and T58 rows, fixed where the words are this lane's.

### 5.2. Breakages for round 1, registered before they are run

Each applied to the code under test and run as section 3 says, every file restored from its own copy and checked
after. "Scanner" is `tests/src/privacy/scanner.test.ts`, "logging" `services/api/src/logging.test.ts`, and the
matrix runs are section 3's (`-t "answers the member in the audience as|wrote a request line for every answer|wrote
one request line for every request"`), on a freshly made database. M1 to M4 also run as controls in a worktree at
`6459ad3`, the first commit, with its own matrix.

- R1: `neverKey` as `6459ad3` had it (no `NEVER_KEY`, an acronym's plural split, two words never one): scanner, "reads
  a key's words…" and "names every key the never-list named before…".
- R2: round 1's new never-words gone (`n`, `num`, `number`, `has`, `any`, `time`, `timestamp`, `created`, `updated`, a
  last word `on`, a count at a word's end, the split at digits): scanner, "reads a key's words…" (`num_drops`).
- R2 as run failed in its test, but on `keyWords("url2x")`, an assertion before `num_drops`, so the pattern registered
  for it was missing. Registered again after that run, before these: R2a, R2 without the split at digits (scanner,
  "reads a key's words…", `num_drops`); R2b, the split at digits gone (scanner, the same test, `url2x`).
- R3: `HomeDay` and `RevealedDay` back on `OPENED_ONLY`, their lists gone: scanner, the key-list test.
- R4: `Needles` matching only whole values, nothing inside one: scanner, the `Needles` test and the planted log lines.
- R5: `worldTexts` without comments, labels and account names: scanner, the world-texts test.
- R6: `ViewerDay.joined_later` an inline object (contract): scanner, the inline test (`ViewerDay.joined_later`).
- R7: `getAuthorPreview` off `BEFORE_REVEAL_OPERATIONS`: scanner, the operation test.
- R8: `buildApp` without `redactBindings`: logging, the child-logger test.
- R9: the redaction back to the list's own spellings: logging, the content-word test.
- M1: createDrop logs a refused commit's caption as `trouble`: the matrix (`the API's log: text people wrote at
  $.trouble`). Control: missed (P3).
- M5, registered after M1's control run, which caught M1 too (5.3): proposeRoster logs a refused proposal's first
  label as `trouble`, a label no world stores (the matrix's proposal at a version no club is at, `genericProposal`):
  the matrix (`the API's log: text people wrote at $.trouble`). Control: missed (P3).
- M2: createInvitation logs its link's token as `trouble`: the matrix (`the API's log: a request's or answer's token at
  $.trouble`). Control: missed (P3).
- M3: `getHealth`'s answers write no request line: the matrix (`N request lines for M requests`). Control: missed (G3).
- M4: `getHealth`'s answers write two: the matrix, as M3. Control: missed (G3).

### 5.3. As run

On the branch's tree with round 1's fixes, uncommitted, with Node 26.13.0, one run at a time, each matrix run on a
freshly made database:

- `db-tests` 951 of 951 and `privacy` 540 of 540 on a fresh cluster (1,199 s); `format`, `lint`, `typecheck`,
  `copy-lint`, `unit` (api 425, worker 160, domain 516, contracts 251, ops 495, web 47) and `tools-tests` pass;
  `scanner.test.ts` 109 of 109 and `logging.test.ts` 14 of 14.
- R1 and R3 to R9 caught, each with its pattern. R2 failed its test without its pattern (5.2); R2a and R2b, registered
  after it, caught.
- M1 to M5 caught: each failed the cell as the member in the audience and the last log test, which read each line
  again. The cell's problems: M1 10, M2 72, M3 and M4 50 each (`0 request lines for 1 requests` and `2 request lines
  for 1 requests` among them), M5 518.
- The controls at `6459ad3`: M2, M3 and M4 missed, as registered. M1 was caught, not missed: its 10 problems are the
  branch's 10, since every refused commit that carries a caption in that cell repeats the caption of the drop the step
  had just added, which the world stores. M5, registered after that, was caught too, but in 36 lines, each a label a
  world held; the branch finds 518 in the same cell, so the first commit's matrix missed 482 lines that held a label
  no world held when they were read (the proposal at a version no club is at, with its `Nobody` label, among them).
  Both recorded as run, not registered again.
- The last test's second reading has no breakage that only it catches: each of M1 to M5 is found in the step that
  wrote its line, and again by the second reading.

### 5.4. Round 2, at `d76b977`

One fresh review, by a subagent that hadn't seen the work, on privacy and security at full depth and the truth of the
records (F1 to F10: two medium, six low, two nits; nothing high). It read pino's own code and probed each case.
Each is fixed in the third commit, or answered here.

- **F1 (medium): a day link met no list, though a pre-reveal answer holds it.** `HomeWaiting`, `HomePaused` and
  `HomeDay` hold `recent_days: DayLink[]` while the club's next day collects, and `DayLink` was on `OPENED_ONLY`: with
  the contract and the route widened together, `drops: 7, unseen: 3, contributors: [...]` on a waiting Home's day link
  passed every check (no list, no never-word, and the world check judges only its day and cover). Fixed beyond the
  finding: the same held for every schema on `OPENED_ONLY` (a key on an opened card, its photo or a reaction sits in an
  answer beside a day still to open, inside what the key check skips), so `OPENED_ONLY` is gone and all eight have
  their lists (section 1.1). Tests: the key-list test (every schema those answers reach is on the list; the opened ones
  reach no day), and "holds what has opened to its list: a day link among a waiting Home's recent days, and an opened
  card, its photo and its reactions", with the review's case.
- **F2 (medium; on `main` too): an error logged with no message put its message in the line's `msg`.** pino copies
  `err.message` into `msg` when no message is given (`proto.js`, `write`), and `formatters.log` never sees `msg`; Fastify
  logs `{ err }` so itself for a second answer to a request (`reply.js`), whose message quotes the request's URL. No
  route of ours logs so today. Fixed: `ownMessage`, pino's `hooks.logMethod`, gives such a line the fixed message
  `error` (section 1.4). Test: "gives a line with an error and no message of its own a fixed one, …", with
  `log.error(err)`, `{ err }`, a child's warning and Fastify's own second-answer warning on a bare app.
- **F3 (low; T58): bindings set later, and a child with its own log formatter, kept what `main` blanked.**
  `request.log.setBindings({ caption })` and `log.child({}, { formatters: { log } }).info({ caption })` came out whole on
  the branch and blanked on `main`, whose path redaction ran through pino's stringifiers. Nothing calls either today.
  Fixed: `main`'s paths stay beneath, `setBindings` is redacted like `child`, and a child's own formatter's output is
  redacted (section 1.4); the T58 row says it. Tests: "blanks bindings set later, a child's whose own log formatter
  would keep them, and a `msg` among a line's fields", and "keeps pino's own redaction of the list beneath it, …".
- **F4 (low): the never-words missed plain spellings of T10's and T15's lists** (`highlighted`, `post_id`, `video_id`,
  `dateTaken`, `lengthSeconds`, `w`, `h`, `dims`, `mime_type`, `remaining`, `slots_left`, `empty_slots`, `missing`),
  which matter outside the lists (`Me`, `Config`, uploads, invitations, the schedule). Fixed (section 1.2), each in the
  never-word test, with `slots`, `weekday`, `headers`, `held_by`, `content_type` and `first_date` still passing; the
  audit's `post_id` mutant on the day's occurrence now meets the key check too.
- **F5 (low): a request's ids counted as text people wrote, and a caption starting with a date didn't.** Only UUIDs were
  skipped, so an id of the API's would have failed a future honest line that logs one (T52 allows ids), and any string
  starting with a date was dropped. Fixed: `OPAQUE` (section 1.3). Enum values stay skipped: a log carries the
  contract's own words (an operation, a state), and a caption that is exactly one is one word the log may hold anyway.
- **F6 (low): the log scan found text only whole inside a value.** A text cut short, lower-cased or JSON-escaped passed.
  Fixed in `Needles` (section 1.3): any case and the escaped form for every needle, and, for text people wrote, a
  value of 8 characters or more inside one. Tokens and kept-back values, long random strings by the thousand, aren't
  indexed for cuts: by every 6 characters, they would hold millions of entries (a test here: 30,000 random strings of
  150 characters, 4.3 million entries and 588 MB).
- **F7 (low): only a Bearer token was gathered.** The `another scheme` caller's `Basic bWF0cml4Om1hdHJpeA==` was in no
  needle. Fixed: the credential whatever its scheme, whole and after the scheme, each of 6 characters or more.
- **F8 (low): `REDACTED_WORDS` missed common content keys** (`content`, `search_query`, `reason`, `username`,
  `nickname`; `query` was a field, not a word). Fixed (section 1.4), each in the content-word test; none is a key the
  request line writes.
- **F9 (nit): the request-line counts compared totals only,** so a lost line and a doubled one in the same step
  cancelled out. Fixed: each line is tagged with the requests sent when it was written, and each request must have one
  (section 1.3). A probe first showed the line is written before `inject` resolves (3,000 requests of five kinds, none
  late), and `answerOf` counts after the event loop's turn, so a line still owed by the last request is that one's.
- **F10 (nit, records):** round 1's count of low findings among G1 to G12 was two, where G4, G5 and G6 are three, and
  table 4.1's row left out G5. Corrected in 5.1 and in table 4.1's row.

### 5.5. Breakages for round 2, registered before they are run

As 5.2, with K for the scanner's and the log's unit tests and N for the matrix. N1 to N5 also run as controls in a
worktree at `d76b977`, the second commit, with its own matrix. N1 is registered to pass.

- K1: what has opened off the lists, as `d76b977` had it (the eight lists gone, the closed world skipping them):
  scanner, the key-list test and "holds what has opened to its list".
- K2: round 2's new never-words gone: scanner, "reads a key's words…" (`post_id`).
- K3: a highlight at a word's start no longer caught: scanner, the same test (`highlighted`).
- K4: `Needles` in its own case only: scanner, "finds a needle in any case and as JSON escapes it, …" (`saturday
  people`).
- K5: `Needles` without the escaped form: scanner, the same test (`JSON.stringify({ caption })`).
- K6: no cuts: scanner, the same test and the planted log lines (`cut short`).
- K7: no `ownMessage`: logging, the error-message test.
- K8: bindings set later not redacted: logging, the bindings test (`SECRET-SET-CAPTION`).
- K8 as run failed in its test, but on the comment two levels down: `main`'s paths, beneath since this round, blank the
  caption set at the top. Registered again after that run: K8a, the same change (logging, the bindings test,
  `SECRET-SET-COMMENT`).
- K9: a child's own formatter not followed by the redaction: logging, the bindings test (`photoUrl`).
- K10: `main`'s paths gone from beneath: logging, "keeps pino's own redaction of the list beneath it, …".
- K11: round 2's new content words gone: logging, the content-word test.
- K12: a `msg` field kept: logging, the bindings test (`SECRET-MSG-FIELD`).
- N1: createDrop logs a refused commit's reservation id as `trouble`: the matrix, registered to pass (an id is no
  text). Control: expected caught (F5).
- N2: createDrop logs a refused commit's caption less its first and last characters: the matrix (`the API's log: text
  people wrote at $.trouble`). Control: expected missed (F6).
- N3: the gate logs the credential of a caller whose scheme isn't Bearer: the matrix as the callers without a session
  (`-t "answers each the same whatever the ids name|wrote one request line for every request"`; `the API's log: a
  request's or answer's token at $.trouble`). Control: expected missed (F7).
- N4: `getHealth`'s odd answers write no request line and its even ones two: the matrix (`0 request lines for request
  N`). Control: recorded as run (F9).
- N5: Home serves `drops` on each day link, which the contract names too: the matrix (`a DayLink that has drops`).
  Control: expected missed (F1).

### 5.6. As run

On the branch's tree with round 2's fixes, uncommitted, with Node 26.13.0, one run at a time, each matrix run on a
freshly made database:

- `db-tests` 951 of 951 (122 s), before `main` at `1a6fe23` was merged in as `15150ab` (the ios lane's #138: records
  and a snapshot test, nothing those tests run); `privacy` 542 of 542 on a fresh cluster in 1,219 s, after it. The
  first full run took 2,215 s: each step's count of request lines walked the whole log from its first line, so the
  matrix's time grew with the square of its lines. `lineCounts` now reads from the step's own first line; one role's
  sweep (`-t "answers the member in the audience as|wrote one request line for every request"`) took 107 s before
  the fix, 93 s after it and 88 s at `d76b977` (section 4). `format`, `lint`, `typecheck`, `copy-lint`, `unit` (api
  428, worker 160, domain 516, contracts 251, ops 495, web 47) and `tools-tests` pass; `scanner.test.ts` 111 of 111
  and `logging.test.ts` 17 of 17.
- K1 to K7 and K9 to K12 caught, each with its pattern. K8 failed its test without its pattern (5.5); K8a, registered
  after it, caught.
- N1 passed, as registered: a reservation's id in `trouble` is no text. N2 to N5 caught, each with its pattern: N2 in
  10 of the cell's lines (`text people wrote at $.trouble`); N3 in each of the 9,520 lines the gate wrote for a caller
  of another scheme, each found twice, as a request's token and as a value the world keeps back (below); N4 in 190
  requests (`0 request lines for request N`, and 2 for the next); N5 in 10 cells, 5 by the day link's list on Home
  before the reveal (`a DayLink that has drops`) and 5 by Home's judge in the past cells, which compares `recent_days`
  whole there.
- The controls at `d76b977`: N1 failed, as registered (10 problems: the reservation's id taken for text people
  wrote). N2 missed, as registered. N3, registered to be missed, was caught, but not as a token: the sweep's world
  keeps back each caller's header less its first seven characters (`slice("Bearer ".length)` in `matrix.test.ts`),
  which for `Basic bWF0cml4Om1hdHJpeA==` leaves `WF0cml4Om1hdHJpeA==`, inside the logged credential; the token needle
  for a credential of any scheme is the branch's (`secretsOf`), and that kept-back value an accident of the slice. N4
  was caught on its totals, in 50 steps (`0 request lines for 1 requests`, `16 request lines for 15 requests`), where
  the branch names each of 190 requests. N5, registered to be missed, was caught in the 5 past cells by Home's judge;
  the 5 cells before the reveal, the review's case, were missed, and only the branch finds them. N3 and N5 are recorded
  as run, not registered again.

### 5.7. Round 3, at `573967b`

One narrow fresh check, by a subagent that hadn't seen the work, of the third commit: production logging first, then
the scanner after `OPENED_ONLY`'s removal, the log scan and the records (F-A to F-G: three low, four nits; nothing
blocker, high or medium). It probed pino 10.4.0 and Fastify 5.12.7 with scripts of its own. Each is fixed in the fourth
commit, or answered here.

- **F-A (low): a cut of someone's text inside a longer log string wasn't found, and four records said it was.** With
  cuts, `Needles` found a log value of 8 characters or more that sits wholly inside a text, never 8 characters of a text
  inside a longer value (`trouble: aturday Peopl`, `caption=rom Ben's pho`). Fixed: `within` also looks up every run of
  12 characters of the value (`SHORTEST_RUN`) and finds each text that holds one (section 1.3). 12, not 8: a request's
  random id in the log, read in runs of 8 against the request strings the matrix gathers, would match one by chance
  about once in five runs by the review's estimate; in runs of 12, the chance is about a million times smaller (32^4:
  `within` reads both in lower case, so a character of the id matches a given letter with a chance of 2 in 64; "some 17
  million" until round 4 corrected it, R4-5). The
  records say it as it is (T16's row, PROGRESS, `logProblems`' doc). Tests: the needle test (the review's two cases,
  upper-cased, and a run of 11 not found) and a planted line, the club's name cut at both ends inside `trouble`. A text
  URL-encoded in a quoted request URL (`Saturday%20People`) is still not found: no route takes free text in its query,
  and `ownMessage` (F-B) cuts the one Fastify message that quotes a URL.
- **F-B (low): Fastify's warning for an answer sent after one went out on `reply.raw` (`reply.js`, `safeWriteHead`)
  put the request's raw URL, query and all, in `msg`, and the header said every message was fixed.** No route touches
  `reply.raw` today, and `main` has the same hole. Fixed: `ownMessage` keeps only its fixed start, `Reply was already
  sent` (`REPLY_SENT_MESSAGE`), without any format arguments; the header's layers 1 and 3 say what is left of Fastify's
  own lines: lines about Fastify itself, which carry nothing of a request's; lines that pass an error (a hook that
  failed, a second answer to a request, whose error quotes the URL), which layer 3's `ownMessage` and `safeError` hold to
  a fixed message and the error's class and code; and this one. (Until round 4, R4-3, this said every line that carries
  an error's message or the URL is `LogController`'s, which is true only of the request lines.) Test: the error-message test's bare app, `GET
  /raw?caption=SECRET-RAW` on a route that writes the head on `reply.raw` and then sends.
- **F-C (low, records; T58): the T58 row's "each as strict or stricter" wasn't literally true.** `OPAQUE` drops a
  request string shaped like an id of the API's, where the second commit counted it as text, and the pattern also fits
  plain snake_case writing (`photo_from_the_beach_in_july`). Answered in the records: the T58 row names the narrowing.
  T52 allows ids, so an id is no text; a caption shaped like one, in a refused commit only, is skipped, while every
  stored caption stays a needle through the worlds' texts (`worldTexts`). The pattern is not narrowed to today's
  prefixes: a new kind of id would then fail an honest line until someone listed it.
- **F-D (nit): `redactBindings`' wrappers left pino's ways in three edge cases nothing calls today.** A child's falsy
  log formatter threw on every line, where pino falls back to the parent's; a child's own formatter was called without
  the `this` pino gives it; and `setBindings(undefined)` threw, where pino does nothing. Fixed: only a function is
  wrapped, and called as pino calls it; absent bindings pass as they are. Test: "keeps pino's ways: …".
- **F-E (nit): never-word spellings still missed:** a highlight split where no word starts (`highLighted`,
  `high_lighted`, `isHighLighted`), and the one-word spellings of round 2's words (`mimetype`, `postid`, `videoid`,
  `datetaken`, `emptyslots`). Fixed: `NEVER_STARTS` is tried on two words joined too, and the five join `NEVER_WORDS`
  (section 1.2); each is in the never-word test, and no key the contract serves names one (the served-for-a-reason
  test).
- **F-F (nit): `ownMessage` counted more values of `err` as an error than pino does** (`{ err: 0 }`, `false`, `""`).
  Harmless, but fixed to pino's own test, truthiness. Test: the error-message test.
- **F-G (nit, records): block 1.2's PR #137 paragraph kept the first commit's "Now" sentence** (16 operations, 10
  schemas on `OPENED_ONLY`, 34 schemas). Corrected to the state as it is.

### 5.8. Breakages for round 3, registered before they are run

As 5.5. N6 also runs as a control in a worktree at `573967b`, the third commit, with its own matrix.

- K13: no runs (`within`'s run loop off): scanner, the needle test (`aturday Peopl`) and the planted lines (`cut short
  at both ends`).
- K14: `NEVER_STARTS` on a word alone, as `573967b` had it: scanner, the never-word test (`highLighted`).
- K15: the five one-word spellings gone: scanner, the same test (`mimetype`).
- K16: no `REPLY_SENT_MESSAGE` rule: logging, the error-message test (`SECRET-RAW`).
- K17: a child's own formatter wrapped whatever it is, as `573967b` had it: logging, "keeps pino's ways" (the falsy one
  throws: `Cannot read properties of null` or `is not a function`).
- K18: a child's own formatter called without pino's `this`: logging, the same test (`expected 'undefined' to be
  'function'`).
- K19: absent bindings redacted as if present: logging, the same test (`setBindings(undefined)` throws).
- K20: an `err` counted when it isn't `undefined` or `null`, as `573967b` had it: logging, the error-message test (`{
  err: 0 }` gets a message).
- N6: createDrop logs a refused commit's caption less its first and last characters inside a longer value (`refused at
  … here`): the matrix (`the API's log: text people wrote at $.trouble`). Control: expected missed (F-A).

### 5.9. As run

On the branch's tree with round 3's fixes, uncommitted, with Node 26.13.0, one run at a time, each matrix run on a
freshly made database:

- `db-tests` 951 of 951 (123 s); `privacy` 542 of 542 on a fresh cluster in 1,253 s (1,219 s at `573967b`: runs of 12
  added no honest finding, and about 3 % to the time). `format`, `lint`, `typecheck`, `copy-lint`, `unit` (api 429,
  worker 160, domain 516, contracts 251, ops 495, web 47) and `tools-tests` (36) pass; `scanner.test.ts` 111 of 111
  and `logging.test.ts` 18 of 18.
- K13 to K20 caught, each with its pattern; N6 caught, in 10 of the cell's lines, each found by the step and again by
  the last test (`the API's log: text people wrote at $.trouble`).
- The control at `573967b`: N6 missed, as registered.

### 5.10. Round 4, at `49c3abf`

One narrow fresh check, by a subagent that hadn't seen the work, of the fourth commit (R4-1 to R4-7: two low, five nits;
nothing blocker, high or medium). It probed pino 10.4.0's `genLog` and `write` with 26 call shapes, and timed the old
and new `Needles` on 3,000 worlds of its own. Each is fixed in the fifth commit, or answered here.

- **R4-1 (low): the run lookup's cost when a value leaks.** The fourth commit looked up each place's run of 12 by its
  first 6 characters and then searched every text that has them; the matrix's worlds word their texts alike ("The ferry
  at dawn" and a world's mark), so each place inside a leaking body searched thousands of texts. A 1,220-character
  leaking value cost about 480 ms against 42,000 texts; a regression that logs a body on every line could have run the
  privacy step into its time limit before it listed the problems. Honest values were unaffected. Fixed: `Needles`
  indexes every run of 12 of each text longer than 12 (`#byRun`), one exact lookup for each place in a value; a private
  `#scan` gives each form it finds to a callback until the callback says to stop, with the exact lookups first; `holds`
  stops at the first, and `logProblems` asks only `holds`; `within` still collects every needle, for the tests that
  name them. Measured with the review's own load (42,000 texts in 3,000 worlds; the script, `time.mts`, is on `evidence` with round 4's breakages): a 1,220-character leaking
  value 0.02 ms with `holds` (480 ms before with `within`, and 1.7 ms with the stop alone, without the exact index); an
  honest value 1.8 µs (1.8 µs before); none of 200,000 random request ids held a text; the heap 207 MB (86 MB before).
  Test: "says whether a value holds a needle as `within` finds them, and stops at the first, …" (`holds` agrees with
  `within` on every case of the needle tests; 20 rounds of `holds` and `logProblems` on a leaking 1,220-character
  value against 8,000 texts worded alike take under 100 ms).
- **R4-2 (low): one-word spellings were caught by list, not as a class.** `providerid`, `aspectratio`, `createdat`,
  `takenat`, `capturedat`, `durationms`, `slotsremaining`, `haspreview`, `ishighlight`, `alttext`, `sourceid`,
  `embedhtml`, `dominantcolor`, `posterframe`, `exifdata` and `previewtext` passed `neverKey`. No contract key uses any
  of them; T10's whitelist still caught them inside a pre-reveal drop's schemas. Fixed: `joinedNever` reads one word as
  two run together: a never-word of 3 letters or more and then a never-word of 3 letters or more, a highlight or a short
  tail (`NEVER_TAILS`: `id`, `ids`, `at`, `on`, `ms`, `text`, `html`, `data`, `frame`, `frames`), or `is` and then a
  never-word of 3 letters or more or a highlight; a shorter never-word (`w`, `h`, `n`) could start or end any plain word.
  `NEVER_ENDINGS` gains the media words and counts no plain word ends with (`color`, `colour`, `remaining`, `missing`,
  `duration`, `preview`, `timestamp`, `dimension`, `waveform`, `highlight`), for `dominantcolor` and `slotsremaining`.
  Tests: the never-word test (each of the review's 16 and `photo_providerid`; and `anyone`, `hashtag`, `timezone`,
  `format`, `items`, `metadata`, `context`, `isolated` and `valid` pass); the served-for-a-reason test holds the
  contract's answers; and none of the 174 property keys in `openapi.yaml` and the schema files changes its verdict
  (`keys.mts`, on `evidence` with round 4's breakages, against `49c3abf`'s `neverKey`).
- **R4-3 (nit, records): three records said every Fastify line that carries an error's message or the URL is
  `LogController`'s.** `reply.js:162` (`{ err: FST_ERR_REP_ALREADY_SENT(url, method) }`), `hooks.js:193`
  (`server.log.error(err)`) and `reply.js:934` (`reply.log.debug(err)`) aren't; `ownMessage` and `safeError` hold all
  three, so nothing leaked. Corrected: `logging.ts`' header, layer 1, and 5.7's F-B say what holds them; the fourth
  commit's journal entry is corrected by the fifth's.
- **R4-4 (nit, records): the fourth commit's journal entry said the never-word test gained ten keys; it gained nine.**
  Corrected in the fifth commit's entry.
- **R4-5 (nit, records): "some 17 million times smaller" for runs of 12 against runs of 8 is about a million**
  (32^4, since `within` lower-cases both sides). Corrected in 5.7 and in the fifth commit's entry; the conclusion
  stands.
- **R4-6 (nit): falsy bindings that aren't null or undefined** (`child(0)`, `child("")`, `child(false)`) became `{}`
  through `redactLine`, where pino refuses them. Fixed: the wrappers test `!bindings`, pino's own test, in `child` and
  in `setBindings`. Test: "blanks what a child's own bindings formatter brings, and lets pino refuse falsy bindings as
  pino does" (each of `0`, `""`, `false`, `null` and `undefined` throws pino's "missing bindings for child Pino").
- **R4-7 (nit, older than this commit): a child's own `formatters.bindings` wasn't wrapped**, and pino runs it after
  our redaction, so what the formatter brought in itself (`extra: { deeper: { caption } }`) got only pino's two-level
  paths. Fixed: `redactedFormatters` wraps a child's own `bindings` formatter as it wraps its `log` one, with
  `redactLine` after it and the `this` pino gives it (none); what a formatter returns that is no object goes to pino as
  it is. Test: the same test (the caption the formatter brings is blanked, in the child's lines and after its
  `setBindings`; the formatter gets the bindings already blanked; a formatter that returns nothing makes no bindings,
  as in pino).

### 5.11. Breakages for round 4, registered before they are run

As 5.8, on the unit suites only: no matrix row changes, and the matrix calls only `holds`, which K21 and K22 change.

- K21: `holds` collects every needle, as `within` does (no stop at the first): scanner, the `holds` test (`to be less
  than 100`).
- K22: `logProblems` asks `within(…).length > 0`, as `49c3abf` had it: scanner, the same test (`to be less than 100`).
- K23: the run lookup by first characters and a search, as `49c3abf` had it, with the stop at the first kept:
  registered to pass the scanner tests. The stop alone keeps the test under its bound (1.7 ms against 0.02 ms per
  value in 5.10's measurement), so the exact index is held by measurement, not by a test.
- K24: `joinedNever` off: scanner, the never-word test (`providerid`).
- K25: `NEVER_ENDINGS` as `49c3abf` had it: scanner, the same test (`slotsremaining`).
- K26: a child's own `bindings` formatter not wrapped, as `49c3abf` had it: logging, "blanks what a child's own
  bindings formatter brings" (the caption it brings is not blanked: `[redacted]`).
- K27: falsy bindings other than null and undefined redacted as if present, as `49c3abf` had it: logging, the same test
  (`child(0)` makes a child: `to throw`).

### 5.12. As run

On the branch's tree with round 4's fixes, uncommitted, with Node 26.13.0, one run at a time, each matrix run on a
freshly made database:

- `format`, `lint`, `typecheck`, `copy-lint`, `unit` (api 430, worker 160, domain 516, contracts 251, ops 495, web 47)
  and `tools-tests` (36) pass; `scanner.test.ts` 112 of 112 and `logging.test.ts` 19 of 19.
- `db-tests` 951 of 951 (125 s); `privacy` 543 of 543 on a fresh cluster in 1,300 s (1,253 s at `49c3abf`; the one more
  is the scanner's new test, which the privacy config runs too); the step's largest process peaked at 1.8 GB resident
  (1,831,872 kB; no figure was taken at `49c3abf`).
- K21, K22 and K24 to K27 caught, each with its pattern: K21's 20 rounds took 2,118 ms and K22's 1,135 ms, against the
  bound of 100. K23 passed the scanner tests, as registered.
