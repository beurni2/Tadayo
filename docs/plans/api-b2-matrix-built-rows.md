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
name an object of the world. `comment_id` is the one still missing (0.4); the refusal makes the slice that builds the
first comment route put the comment in the world, and guards the next Id parameter the contract adds.

0.4. **The comment: not in this slice.** Tried first: Ana's comment on Cleo's video link, written a minute after the
reveal (the comments' guard, `db/migrations/0007_after_the_reveal.sql`, refuses one written before it), in every
world. The matrix's whole run then failed: every role that reads got a 500 from `getHome` in the open phase, because
Home refuses its open page while a drop of the open day has a reaction, a comment or the viewer's favourite, which
B6's fields show (`packages/domain/src/clubs/home.ts`: "a page that left out one would be false"). A comment on
another day would need a revealed day of its own in every world, which changes what Home, the club and the schedule
answer, for no route that reads comments yet. So the comment comes with B6's first comment route, as Home's fields
for it do; 0.3's refusal means that route can't be built without it. A departure from the audit's literal fix, raised
in the PR; the audit's `deleteComment` is still caught twice, by the row check and by the binding check (section 3).

0.5. **Both drops.** `drop_id` binds to Ben's photo and to Cleo's video link, already in every world, so each request
that takes a drop is sent once for each: the photo's and the video's routes (`getDropMedia` against `getEmbed`) can't
hide behind a drop of the other class. `Targets` gains `video`; a binding may give several values, and `specsFor`
sends one request for each value of each path Id parameter. The guessed-id steps keep one value (the first), as they
guess one object of the other club. The requests a world gets go from 72 to 88.

0.6. **The lists in the API's tests.** `app.test.ts` and `session.test.ts` take the exported set rather than their
copies; `app.test.ts` keeps its pin of how many operations are unbuilt, so a new route still changes that test on
purpose. The matrix is where a built route meets its row.

## 1. The change

1. `services/api/src/app.ts`: `handlersOf` becomes a table of handler makers, `HANDLERS`, from which `buildApp` makes
   the handlers; `BUILT_OPERATIONS`, the table's keys, exported (and from `services/api/src/index.ts`).
2. `tests/src/privacy/rows.ts`: `rowProblems(operations, rows, judged, built)`: a built operation whose row is `NONE`,
   and a row that isn't `NONE` for an operation that isn't built, each a problem.
3. `tests/src/privacy/bindings.ts`: `Targets.video`; `drop_id` bound to both drops; `bindAll`, every value of a
   binding; `bindingProblems(operations, built)`, a built operation that takes an Id parameter whose binding is
   `"missing"`.
4. `tests/src/privacy/harness.ts` `specsFor`: one request for each value of each path Id parameter.
5. `tests/src/privacy/matrix.test.ts`: the video in each world's targets (`cleosVideo`), the row check with the built
   set and the binding check; `REQUESTS_PER_WORLD` 88, for the requests the drop's second value adds.
6. `services/api/src/app.test.ts`, `session.test.ts`: the exported set.
7. `rows.ts`'s header: the tie to the built set, the refusal and the video.

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

## 4. After the merge

Nothing on `dev`: the change is in the API's test of its routes and the matrix; `app.ts`'s routes are the same.
