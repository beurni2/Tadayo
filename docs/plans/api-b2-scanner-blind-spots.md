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
- `OPENED_ONLY`: the schemas only an opened day holds (`DropRevealed`, `RevealedPhoto`, `RevealedVideo`,
  `ReactionSummary`, `RevealedDayDrop`, `ReplyPreview`, `HighlightEntry`, `DayLink`). The world check already refuses
  each before its day opens; the key check skips what has opened. The first commit had Home's open day (`HomeDay`) and
  the revealed day (`RevealedDay`) on it too, but each also names a day still to open (`next`, `add_target`), so since
  round 1 each has its own list in `BEFORE_REVEAL` (section 5.1, P2), and a test holds that no schema on `OPENED_ONLY`
  reaches an `Occurrence` but `DayLink`'s, a closed day.
- `BEFORE_REVEAL`: this file's own copy of each other object schema those answers reach, its keys as
  `{ required, optional }` (37 schemas since round 1: the first commit's 34, `HomeDay`, `RevealedDay` and the author's
  preview's `ExternalVideoPreview`). The scan checks every object whose schema (the walk's name for it) is on the list against
  it exactly, in every answer and phase, as a `whitelist` finding (`a <schema> that has <key>`, or `an`). In an answer of a
  `BEFORE_REVEAL_OPERATIONS` operation, an object of a schema on neither list, or with no schema name at all, is a
  `whitelist` finding too, so a new schema can't arrive under the day unlisted.
- `CAPTION_CARD` and `CARD_AUTHOR` stay as they are: they judge a card by its `view`, whatever schema the walk gives it.
- A test reads the contract: the object schemas `BEFORE_REVEAL_OPERATIONS`' answers reach are exactly `BEFORE_REVEAL`'s
  and `OPENED_ONLY`'s names, the two lists don't meet, and each list is the contract's keys and required keys today; and
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
- `logging.test.ts`: a caption four levels down, in an array, under a camelCase key and inside a class's instance, each
  blanked; an error still its class and code; since round 1, keys the list doesn't spell with a content word in them,
  and a child's and a grandchild's bindings, each blanked, with the request line's own keys and a request's id kept.

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
  first commit's 1,262 s for 537 on the same machine. If later rows bring it near the limit, the limit is a workflow
  change, in its own PR (T58), not a cut to what the matrix reads.

## 5. Review

### 5.1. Round 1, at `6459ad3`

Two fresh reviews, by subagents that hadn't seen the work: one on privacy and security (P1 to P7: three medium, four
low), one on the tests and the records (G1 to G12: one high, two medium, two low, and records points and nits). Each
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
