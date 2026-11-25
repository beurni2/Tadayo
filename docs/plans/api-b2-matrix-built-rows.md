# api/b2-matrix-built-rows: the outside audit's A4: a built route can't keep the skeleton's row

The outside audit of 2026-11-24, finding A4 (High, latent): "A built route can keep the skeleton's row and pass the
privacy matrix." TECH-DESIGN section 8 says "A route with no matrix row fails the build", and the check
(`tests/src/privacy/rows.ts` `rowProblems`) asks only that every operation has a row and that a judged row isn't
`NONE`. Nothing ties the handlers the app builds (`services/api/src/app.ts` `handlersOf`) to rows that are judged:
`services/api/src/app.test.ts` and `services/api/src/session.test.ts` keep hand-written `BUILT` lists. A `NONE` row
demands the neutral not-found for the matrix's own request, and that request gets a 404 from a leaking handler too
when its id names nothing: `comment_id` is bound to `"missing"` (`tests/src/privacy/bindings.ts`), and `drop_id` is
always Ben's photo, never a video. The audit's reviewer added two leaking handlers (`deleteComment` answering a
comment's body to any signed-in caller, `getEmbed` answering a video's source with no audience or reveal), left their
rows `NONE`, added them to the two lists, and every suite passed.

Re-checked against `main` at `f2ed830` before the change: all of it holds. `rowProblems` takes the contract's
operations, the rows and the judged set, nothing built; `handlersOf` is private to `app.ts`; the two test lists are
copies of its 28 keys; `BINDINGS.comment_id` is `"missing"`; and `Targets` has one drop. Today's 28 built routes all
have judged rows, so nothing leaks: the hole is in the control the next stages rely on (comments, the embed, media).

Sources: the audit's A4 and its fix ("Export the built operation ids from the app and assert in `matrix.test.ts` that
they equal the rows that aren't `NONE`. Refuse a `"missing"` binding for a built operation. Put a comment and a video
in the matrix's world and bind `drop_id` to both."); TECH-DESIGN section 8 (the matrix); T9 (one read predicate),
T14 (the neutral not-found), T58 (checks only get stronger; every route has a row).

## 0. Readings

0.1. **What "built" means.** An operation is built when `buildApp` gives its route a handler of its own, not
`notFound`. That set lives in `handlersOf`'s keys. Exporting it from the same table the app reads keeps it true by
construction: a handler can't be added without joining the set, and the set can't name a handler that isn't there.

0.2. **The tie.** In the matrix, the built set must equal the set of rows that aren't `NONE`, both ways: a built
route with the skeleton's row (the audit's hole), and a judged row for a route nobody built (a row whose judge
expects answers the neutral 404 would contradict, already failing in its cells, but named plainly here).

0.3. **"missing".** A binding marked `"missing"` gives a fresh id, so a request names nothing and any handler, leaking
or not, answers it the neutral not-found. Refused for a built operation: every Id parameter a built route takes must
name an object of the world. A route can act on comments without taking `comment_id`: `listComments` and
`createComment` take a drop, `createReport` a body whose target may be a comment, and `getOccurrence` answers a day
whose drops carry a reply's preview. A thread or a day asked only while it has no comment passes a handler that shows
a removed comment or a blocked author's message, so `bindings.ts` `ACTS_ON` names the objects those four act on, and
the refusal covers them too (review round 1, P2 and E1; round 2, F2). Home's page carries the same preview and is
built, but its handler refuses a page with a comment (0.4), so `REFUSES_COMMENTS` names it, and the matrix holds it to
that refusal by what it answers: a test of its own puts Ana's comment on Ben's photo as the day opens and asks Home, in
the open phase, as each role the gate lets through, each in a world of its own; Home's judge wants the refusal from
whoever may see the photo and their own page from everyone else (round 3, F1). A handler that lifts the refusal fails
it, so the slice that lifts it changes that test and its judge, moves Home into `ACTS_ON` and puts a comment in the
world first (round 2, F2; round 3, F1). The harness tests find every operation whose request or answer can name a
comment by walking the contract and by round 1's rule, the operations named for comments (round 3, F2); each takes
`comment_id`, is in `ACTS_ON`, or is in `REFUSES_COMMENTS`. `comment_id` is the one still missing (0.4); the refusal makes the slice that
builds any of those routes put the comment in the world, and guards the next Id parameter the contract adds. And a
binding that's a function but names nothing, an object of another kind or another club's object is caught in every
cell: each value a cell binds must be a row of its binding's table whose club is the cell's (`bindings.ts` `TABLES`,
`matrix.test.ts` `checkBoundRows`; round 1, P4; round 2, F3).

0.4. **The comment: not in this slice.** Tried first: Ana's comment on Cleo's video link, written a minute after the
reveal (the comments' guard, `db/migrations/0007_after_the_reveal.sql`, refuses one written before it), in every
world. The matrix's whole run then failed: every role that reads got a 500 from `getHome` in the open phase, because
Home refuses its open page while a drop of the open day has a reaction, a comment or the viewer's favourite, which
B6's fields show (`packages/domain/src/clubs/home.ts`: "a page that left out one would be false"). A comment on
another day would need a revealed day of its own in every world, which changes what Home, the club and the schedule
answer, for no route that reads comments yet. So the comment comes with B6's first comment route, as Home's fields
for it do; 0.3's refusal means no comment route (the three that take `comment_id`, and the three in `ACTS_ON` that
list, write and report comments), nor `getOccurrence`, can be built without it, and Home's refusal can't be lifted
without changing the matrix's test of Home with a comment (0.3). A departure from the audit's literal fix, raised in the PR; the audit's
`deleteComment` is still caught twice, by the row check and by the binding check, and a thread route built before the
comment by the binding check (section 3, B9).

0.5. **Both drops.** `drop_id` binds to Ben's photo and to Ben's video link, so each request that takes a drop is sent
once for each: the photo's and the video's routes (`getDropMedia` against `getEmbed`) can't hide behind a drop of the
other class. `Targets` gains `video`; a binding may give several values, and `specsFor` sends one request for each value
of each Id parameter, in the path and the query alike (round 1, P5 and E3). The requests a world gets go from 72 to 88:
14 operations take a drop, and two of them (`getDropMedia`, `removeDrop`) are sent once for each value of a required
enum, so the video adds 16 requests.

The video is Ben's, committed with the photo, and every state is made on it as on the photo
(`matrix.test.ts` `putInState`, which checks that the two end in one drop state, not active where the state ends the
drop). The first head used Cleo's video link, which no state ended and whose author was the viewer in six roles,
both block roles among them: a video route that skipped T9's per-drop denials (`d.state = 'active'`, the block) passed
every suite (round 1, P1; B8 shows it on the first head and caught now). With Ben's, every role, phase and state
meets the video as it meets the photo, so a row that holds for the photo's request holds for the video's, but for a
route's own media class. Cleo's video link stays the day's second contributor.

The guessed-id and signed-out steps send another club's object of the same place among the binding's values: the
video's request guesses another club's video, which a video route can't refuse for its class alone (round 1, P5 and
E2). Each specsFor request says which value it holds (`Spec.which`; `harness.ts` `elsewhereOf`).

0.6. **Ids in request bodies (round 1, P3): not in this slice.** `bindingProblems` reads parameters; the audit's A4 is
about them. The matrix's tables send each built route's bodies themselves, and the body ids of branches still to be
built are each bound to an object of the world by the slice that builds the branch, in its table:
- `createDrop`'s `source_id`: its link branch answers every source `NOT_FOUND` until B3 builds `resolveSource`
  (`packages/domain/src/drops/commit.ts`), and the commit table sends a fresh one;
- `createUpload`'s `drop_id` for its `replacement` and `conversation_photo` purposes, which answer `NOT_FOUND` today
  (`services/api/src/media/uploads.ts`);
- `createComment`'s `reply_to_id`, `createReport`'s target, and `blockMember`'s, `setHighlight`'s, `updateDrop`'s and
  `searchMemories`' ids, whose routes aren't built.
`createInvitation`'s cell request sends a fresh `candidate_id` on purpose (a candidate nobody has, never a link).
`bindings.ts`'s header and `rows.ts`'s header list the same.

0.7. **The lists in the API's tests.** `app.test.ts` and `session.test.ts` take the exported set rather than their
copies; `app.test.ts` keeps its pin of how many operations are unbuilt, so a new route still changes that test on
purpose. The matrix is where a built route meets its row.

## 1. The change

1. `services/api/src/app.ts`: `handlersOf` becomes a table of handler makers, `HANDLERS`, from which `buildApp` makes
   the handlers; `BUILT_OPERATIONS`, the table's keys, exported (and from `services/api/src/index.ts`).
2. `tests/src/privacy/rows.ts`: `rowProblems(operations, rows, { built, judged = JUDGED })` (named since round 1, so a
   call can't swap them; the first head's signature was `(operations, rows, built, judged = JUDGED)`): a built
   operation whose row is `NONE`, a built id that isn't an operation of the contract (round 1, P6 and E4), and a row
   that isn't `NONE` for an operation that isn't built, each a problem.
3. `tests/src/privacy/bindings.ts`: `Targets.video`; `drop_id` bound to both drops; `bindAll`, every value of a
   binding; `bindingProblems(operations, built, bindings, actsOn)`, a built operation that takes an Id parameter whose
   binding is `"missing"` or acts on its objects (`ACTS_ON`); `TABLES`, each binding's table; `boundNames`, the
   bindings the built routes name or act on; `REFUSES_COMMENTS`, Home held to its refusal, and each table's way to its
   club (round 2).
4. `tests/src/privacy/harness.ts` `specsFor`: one request for each value of each Id parameter, path and query, each
   saying which value it holds (`Spec.which`); the guessed-id and signed-out steps guess another club's object of the
   same place (`elsewhereOf`, which throws for a value another club's binding hasn't).
5. `tests/src/privacy/matrix.test.ts`: Ben's video link in each world (`twoContributors`), put in every state with the
   photo (`putInState`); every bound value checked as a row of its table in the cell's club (`checkBoundRows`) in every world; the limits each
   role met in the reservations' table pinned (`LIMITS`), and the uploads' table's requests under a link's slot
   (`linkSlots`; round 2); the row
   check with the built set and the binding check; `REQUESTS_PER_WORLD` 88, for the requests the drop's second value
   adds. `tests/src/matrix.ts` `STATES`: `endsTheDrop` on the three states that change the drop's own row.
6. `services/api/src/app.test.ts`, `session.test.ts`: the exported set.
7. `rows.ts`'s header: the tie to the built set, the refusal and the video.
8. `tests/src/privacy/reservation.ts` `RESERVE_TABLE`: three photos, three links, two photos (round 2, F1), and
   `reservation.test.ts`'s pin of it.
9. Round 3: in `matrix.test.ts`, the test of Home while a drop of the open day has a comment (F1); after the commit's
   table, while the day collects, a link given back at once, then a photo and a photo again, so a friend meets the
   friend's one link and two photos with drops already in the day counted (F3, F4); `clubsOf` follows `TABLES`' hops,
   which `bindings.ts` now spells out, and reports a row in no club (F5). In `harness.test.ts`, the walk also takes a
   kind that can be a comment (a report's target) and round 1's rule beside it (F2).

## 2. Tests first

2.1. `tests/src/privacy/harness.test.ts`: `rowProblems` with the built set: a built operation with a `NONE` row is
named ("… is built but its row is NONE"), and a judged row for an operation that isn't built ("… isn't built but its
row isn't NONE"); with the real rows and `BUILT_OPERATIONS`, none. `bindingProblems`: a built operation that takes a
`"missing"` parameter is named, an unbuilt one isn't; with the real bindings and `BUILT_OPERATIONS`, none.
`specsFor` on an operation with `drop_id` in its path gives two requests, one naming the photo and one the video.
`comment_id` is the one binding still missing.

2.2. `tests/src/privacy/matrix.test.ts`: the row check passes the built set; the binding check is empty.

2.3. On `main` first: the new `harness.test.ts` tests seen failing (no built parameter, no `bindingProblems`, one
request per drop operation), and the audit's hole reproduced: its two leaking handlers, their rows left `NONE`, added to
the two lists with the unbuilt pin moved to 37, pass `app.test.ts`, `session.test.ts`, `harness.test.ts` and the whole
matrix (each answering the neutral not-found for an id of the wrong shape, as a built handler does). On this branch the same handlers are B1 to B4 (section 3).

2.4. Round 1 (`harness.test.ts`): a built `listComments`, `createComment` or `createReport` is refused while
`comment_id` is missing (its rule for which operations are about comments, by their id, replaced in round 2 by the
contract's walk, 2.5); `TABLES` has every
binding; `boundNames` for the built routes; a required and an optional Id query parameter each sent once for each
value, with `which`; the video's request guesses another club's video and the photo's another club's photo, in the
guessed-id and signed-out steps, and a video route that leaks another club's video is caught on the video's request
only; a built id that isn't an operation is named.

2.5. Round 2: `harness.test.ts` walks the contract for the operations whose request or answer reaches a comment's or
a reply's schema or a property naming one (`createComment`, `getHome`, `getOccurrence`, `listComments`,
`updateComment`; round 3 adds a kind that can be a comment, so `createReport`, and round 1's rule of operations named
for comments beside the walk, so `deleteComment` and `getCommentMedia`) and holds each to `comment_id`, `ACTS_ON`
or `REFUSES_COMMENTS`, `ACTS_ON` being exactly the ones left; it finds Home's refusal's words in
`packages/domain/src/clubs/home.ts`, which only says where the refusal is (round 3: the matrix holds what it answers); `elsewhereOf` throws for a
value another club hasn't; the matrix pins the limits each role met in the reservations' table and the uploads'
table's requests under a link's slot.

## 3. Breakages

At the PR's last head, each caught by the test it names:
- B1: the audit's `deleteComment`: a handler answering the comment's body to any signed-in caller, its row left
  `NONE` (the matrix's row check: built but `NONE`);
- B2: B1 with the row check undone (the matrix's binding check: `deleteComment` built while `comment_id` names nothing);
- B3: the audit's `getEmbed`: a handler answering a video drop's source with no audience or reveal, its row left
  `NONE` (the matrix's row check);
- B4: B3 with the row check undone (the matrix's cells, now that `drop_id` names the video too);
- B5: `BUILT_OPERATIONS` leaves one handler out, run twice (`app.test.ts`'s unbuilt routes; and as B5m, the matrix's row
  check);
- B6: `upload_id`, which two built routes take, back to `"missing"` (harness.test.ts's binding test);
- B7: `specsFor` sends the first value only (harness.test.ts's two requests).

Round 1 adds, at the PR's last head:
- B8: the read predicate lets a video link through in any drop state (`packages/domain/src/authorization/read-sql.ts`
  `readableDrops`: `d.state = 'active'` becomes `(d.state = 'active' OR d.media_class = 'external_video')`): the
  matrix's cells (Home in the open phase, for a withdrawn, removed or held video). Run on the first head too, where it
  passes the author's cells (P1);
- B9: a `listComments` that leaks comments, built with its row left `NONE` and the row check undone: the matrix's
  binding check (`ACTS_ON`). Run on the first head too, where it passes the matrix's row check and the author's cells
  (P2, E1);
- B10: `upload_id` bound to the cell's slot, a function that names an object of another kind: the matrix's cells
  (`checkBoundRows`, P4);
- B11: `comment_id` bound to Ben's photo, the review's probe: the matrix's cells (`checkBoundRows`, P4);
- B12: `elsewhereOf` always gives the first value (harness.test.ts's guess of another club's video, P5);
- B13: `putInState` leaves the video out (the matrix's cells: its own check);
- B14: `rowProblems` without the built id that isn't an operation (harness.test.ts's tie both ways, P6);
- B15: `bindingProblems` without `ACTS_ON` (harness.test.ts's thread routes refused, P2 and E1);
- B16: `TABLES` without `star` (harness.test.ts's table for every binding, P4).

Round 2 adds, at the PR's last head:
- B17: `RESERVE_TABLE` back to two photos, three links, three photos: the whole matrix's pin of the limits each role
  met (F1);
- B18: the uploads' table's request under a link's slot left out: the whole matrix's uploads pin (F1);
- B19: `ACTS_ON` without `getOccurrence`: harness.test.ts's walk of the contract (F2);
- B20: `REFUSES_COMMENTS` without `getHome`: the same (F2);
- B21: Home's refusal of a page with a comment lifted in `packages/domain/src/clubs/home.ts`: the same, which holds
  `REFUSES_COMMENTS` to its words (F2);
- B22: a role cell's `upload` taken from another club's world: the matrix's cells (`checkBoundRows`'s club, F3);
- B23: `elsewhereOf` gives the first value for one another club lacks: harness.test.ts's guess test (nit).

Round 3 adds, at the PR's last head:
- B21m: B21 on the matrix's test of Home with a comment (F1);
- B24: Home's refusal without the comment, its words kept, the review's probe: the matrix's test of Home with a comment
  (F1). The harness test that finds the words passes it;
- B25: the walk without round 1's rule of operations named for comments: harness.test.ts's walk (F2);
- B26: an operation `hideComments` added to the contract, the review's probe: the same (F2);
- B27: the server counts only slots against a friend's photos (`packages/domain/src/drops/allowance.ts`
  `limitRefusal`), the review's scenario: the matrix's author cells (F3). Run on the third head too;
- B28: the server counts only slots against a friend's link: the cells of the member in the audience (F4). Run on the
  third head too;
- B29: the requests after the commit's table left out: the whole matrix's pin of the limits each role met (F3, F4);
- B30: `upload_id` bound to an avatar, an upload with no slot and so in no club: `checkBoundRows`, in the file's
  setup (F5).
B16's anchor follows `TABLES`' new shape.

Since round 1's fixes, a breakage that `checkBoundRows` catches in the other club's world fails the matrix file in its
setup, before any test runs: the script registers that error's words for B1, B2, B9, B10 and B11, and B1c, B2c and
B9c undo `checkBoundRows`'s throw to show the row test still catches B1, B2 and B9.

## 4. After the merge

Nothing on `dev`: the change is in the API's test of its routes and the matrix; `app.ts`'s routes are the same.

## 5. Review round 1

Two fresh reviewers of the first head (`9bc33bc`), privacy and engineering. Each finding fixed or answered in the second
commit:
- P1 (high): the video never met the drop-ending states, and its author was the viewer in six roles. Fixed: the video
  is Ben's and every state is made on it (0.5; B8). The reservations' table's hand count for the author follows the
  world: with a photo and a link already in the day, the author holds one slot where the day takes them and three once
  both are withdrawn, 6 held and 2 given back, from 9 and 5. (Round 2 found this cost the matrix its only
  `PHOTO_LIMIT`: section 6.)
- P2, E1 (medium, high): the thread routes could be built with no comment in the world, and seven records said they
  couldn't. Fixed: `ACTS_ON` (0.3; B9, B15); the records now say what holds.
- P3 (medium): ids in bodies are outside the checks. Answered: outside A4, listed with the slice that binds each (0.6).
- P4 (low): a binding that's a function but names nothing passed. Fixed: `checkBoundRows` (0.3; B10, B11, B16).
- P5, E2, E3 (low): queries and guesses sent the first value only. Fixed (0.5; B12, and B7 at its new anchor).
- P6, E4 (nit): a built id that isn't an operation, and swappable sets. Fixed (section 1, item 2; B14).
- R1 to R7 (records): the 16 operations were 14 operations and 16 requests; the plan's signature; the PR body's
  breakages; the order of the B items (B1, B7, B8 and B6, in block 1.2 and PROGRESS alike); T59's "no request" is "no
  Id parameter"; table 4.1's "every suite that could see them"; the video's "no state ends it". Each corrected in the
  second commit's records, the log entry of the first head left as written (append-only).

## 6. Review round 2

One fresh reviewer of the second commit (`7b39998`) at full depth. Each finding fixed in the third commit:
- F1 (medium, T58): with Ben's link in the day, the author's three cells that met `PHOTO_LIMIT` met `QUOTA_FULL`, and
  no other role met it in the first order, so no cell did; the second commit's entry said the author newly met the
  allowance full, which every role that held a slot already did. Fixed: `RESERVE_TABLE` asks three photos, three links,
  then two photos, which leaves every role's slots as they were; the matrix pins, per role, the requests refused at
  each limit (`LIMITS`), and the uploads' table's requests under a link's slot (`linkSlots`), which the author now
  meets only once both drops are withdrawn (B17, B18).
- F2 (medium, latent): Home's and the day's answers carry a reply's preview, outside `ACTS_ON`. Fixed: `getOccurrence`
  in `ACTS_ON`, Home in `REFUSES_COMMENTS`, the contract walked (0.3; B19 to B21).
- F3 (low): a bound row of another club passed `checkBoundRows`. Fixed: `TABLES` gives each row's way to its club
  (0.3; B22).
- F4 (records): T59 said round 1's tests were caught by breakages not yet run, and that `putInState` runs in every
  world. Both rewritten.
- Nits: `ACTS_ON`'s names checked; `elsewhereOf` throws rather than giving the first value (B23).

Also fixed: five inferred pronouns in the matrix's comments and one cell's note ("the slot he gave back", "as hers").

## 7. Review round 3

One fresh reviewer of the third commit (`aa3ba4a`) at full depth. Each finding fixed in the fourth commit:
- F1 (medium, latent, A4's shape): `REFUSES_COMMENTS` held Home to its refusal's words, not to what it answers.
  Deleting only the comment from the refusal's statement kept the words and passed the harness; only
  `tests/src/db/home.test.ts`'s refusal test caught it, which the slice that lifts the refusal rewrites anyway. Fixed:
  the matrix's test "refuses the open page to each role that may see the commented photo, and gives every other role
  its own" (0.3; B21m, B24). Its pins, counted by hand: the author, the star and the member in the audience get the
  refusal; the member who joined after the commit, the rejoined member and Cleo once the author has blocked Cleo and
  left by the block get their page (the refusal tells nobody a drop they can't see has a comment); the former member,
  the invited person, the stranger and Cleo once Cleo has left by Cleo's own block get the neutral not-found. The two
  roles the gate stops never reach the handler, and the cells hold them to the gate. The scanner's one finding on a
  refused answer, its empty 500 undeclared by the contract, is set aside for those answers alone and pinned to the
  three roles. The records that said the slice that lifts the refusal fails the harness are rewritten.
- F2 (low to medium, T58): the walk replaced round 1's rule rather than joining it, and missed `createReport`, whose
  body names a comment as a report's target. Fixed: the walk takes a kind that can be a comment, and the operations
  named for comments join it; `ACTS_ON` must be exactly what is left (2.5; B25, B26). "Walks the contract for every
  operation that can name a comment" was more than the walk did, and is rewritten.
- F3 (low to medium, T58 against `main`): `PHOTO_LIMIT` came back as a code but with no committed photo counted, as
  `main`'s author cells had met it. Fixed: after the commit's table, while the day collects, a photo and a photo again,
  so a friend with the photo just added meets the friend's two (B27, B29).
- F4 (records): "every allowance limit met" and "each role meets its own limits" were false: no friend met a friend's
  one link. Fixed in the code rather than the claim: a link before those photos, given back at once, so the member in
  the audience, with Cleo's link in the day, is refused another at the friend's one with the three not full (B28). The
  star's photo limit is the star's six, which `QUOTA_FULL` always meets first; every other limit is met, a friend's
  three each with a drop already in the day counted. The records say so.
- F5 (low): `clubsOf` hard-coded each joined path's child table, and a row in no club read as another club's. Fixed:
  `TABLES` gives each binding's hops and `clubsOf` follows them; a row in no club says so (B30).
- Nits: `checkBoundRows`'s doc comment back above it; the limits test's "Nobody else is asked" rewritten (everyone is
  asked); round 2's breakage script to go on `evidence` with its run, which step (z) points to; two inferred pronouns
  in `tests/src/privacy/drop.test.ts`'s comments ("his") replaced by Ben's name.
