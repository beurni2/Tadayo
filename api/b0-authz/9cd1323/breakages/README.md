# Slice 6's breakage run: the read predicate

Each breakage is one exact change of text in one of the authorization module's two files: the TypeScript policy (`packages/domain/src/authorization/read.ts`) or the SQL that filters lists and loads one drop's facts (`packages/domain/src/authorization/read-sql.ts`). A condition is taken out or loosened, an edge moved by one comparison, a type guard removed, a fact loaded wrong. For each, the tests that judge that file run: the domain's unit tests (`pnpm --filter @tadayo/domain exec vitest run src/authorization src/time/one-clock.test.ts`), the database's `tests/src/db/authorization.test.ts` against a server made like `ci`'s, or both. The verdicts:

- **CAUGHT**: at least one test failed; the failing tests are named below.
- **MISSED**: every test passed.

Each file is restored after its breakage; at the end, both files matched their SHA-256 from before the run.

- **Commit:** `9cd1323` on `api/b0-authz` (PR #24), the commit that records the PR's independent review and its privacy and security review, and their fixes. The run was made on the working tree just before that commit, whose code and tests are the commit's; only `docs/` changed after it. The first commit, `7d19400`, had 47 breakages, all caught by the end (`docs/JOURNAL.md`, section 3.2's first entry of PR #24); this run keeps those 47 with their anchors moved to the new code and adds 8 for the review's fixes: the star's account deletion ignored in each path, and its edge moved in the SQL; any viewer string taken; the star's deletion not loaded; an ended interval taken before an active one; any drop id queried; the server's time not read back.
- **Server:** the session's PostgreSQL 16, made like `ci`'s service (ADR-026): its first role `supabase_admin`, Supabase's roles made by `tools/ci/ci_steps.py db-bootstrap`. `ci`'s Postgres 17 is the authority for the suite itself.
- **Result:** 55 breakages: 55 caught, 0 missed.

## How to run them again

1. Check out the commit above in a working tree, with Node 26 and pnpm 12.16.1 (`docs/JOURNAL.md`, block 1.1, "How to run and check everything"), and run `pnpm install`.
2. Make a server like `ci`'s on port 5432. `pgci.sh` does it for the session's PostgreSQL 16 (as root): it stops and deletes the cluster at `/var/lib/postgresql/pgci`, then `initdb --username=supabase_admin` with the password `postgres` and starts it. `FRESH=1 REPO=<your working tree> bash dbtest.sh` remakes it, runs `python3 tools/ci/ci_steps.py db-bootstrap` and then the database tests.
3. `REPO=<your working tree> python3 run_breakages.py`, with optional words that pick breakages by name. It runs `dbtest.sh` from its own folder, restores each file after its breakage, checks both files' SHA-256 at the end, and writes `results.json` beside it, over the published one. Nothing else may read or change the working tree while it runs, since it edits the two files in place.

Each breakage takes a few seconds on the session's machine.

## The breakages

### 1. ts: no account check: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

        facts.viewerAccount === "active" &&
    

is taken out.

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with no account with the viewer's id
- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the viewer's account deleted
- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the viewer's account deleting (T27)
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > denies or throws, never grants, whatever viewerAccount holds that isn't a granting value
- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > keeps a day whose star asked to delete their account once it had opened
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies cleo everything after Cleo's account deletion (T27), and nobody else
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the deletion pending, the membership not yet ended (T27) by both paths alike

### 2. ts: no interval check: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

        facts.viewerInterval === "active" &&
    

is taken out.

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T14: missing and unauthorized get the same answer > answers false for a drop that doesn't exist, as for one the viewer may not read
- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with no interval of the viewer's in the audience (T8)
- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the viewer's interval ended by a block
- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the viewer's interval ended by a deletion
- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the viewer's interval left
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > denies or throws, never grants, whatever viewerInterval holds that isn't a granting value
- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > keeps a day that had opened when its star left, at reveal_at itself or later
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ben, cleo everything after the author's block of Cleo, the drop kept (FQ88), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies cleo everything after the end of Cleo's membership, and nobody else
- src/db/authorization.test.ts > T8: an audience that holds two of one viewer's intervals > answers through the one still active, by both paths alike, and nothing once neither is
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the former member by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the invited, not yet a member (T7) by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member who joined after the commit (T8) by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the rejoined member, a new interval (T8) by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the stranger from another club by both paths alike
- src/db/authorization.test.ts > spec 22 and D11: an author who leaves keeps the drop for the club, or takes it away > lets the club read the drop of an author who left and kept it, before or after the reveal

### 3. ts: any interval in the audience: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

    facts.viewerInterval === "active" &&

becomes this:

    facts.viewerInterval !== null &&

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the viewer's interval ended by a block
- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the viewer's interval ended by a deletion
- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the viewer's interval left
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > denies or throws, never grants, whatever viewerInterval holds that isn't a granting value
- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > keeps a day that had opened when its star left, at reveal_at itself or later
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ben, cleo everything after the author's block of Cleo, the drop kept (FQ88), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies cleo everything after the end of Cleo's membership, and nobody else
- src/db/authorization.test.ts > T8: an audience that holds two of one viewer's intervals > answers through the one still active, by both paths alike, and nothing once neither is
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the former member by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the rejoined member, a new interval (T8) by both paths alike
- src/db/authorization.test.ts > spec 22 and D11: an author who leaves keeps the drop for the club, or takes it away > lets the club read the drop of an author who left and kept it, before or after the reveal

### 4. ts: held and removed let in: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

    facts.drop === "active" &&

becomes this:

    facts.drop !== "withdrawn" &&

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the drop held (T29)
- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the drop removed, as pictured or by moderation
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > denies or throws, never grants, whatever drop holds that isn't a granting value
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after a moderation removal (FQ27), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after a pictured member's removal (T25), and nobody else
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike

### 5. ts: no day status: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

        facts.day === "scheduled" &&
    

is taken out.

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the day cancelled
- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the day suspended
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > denies or throws, never grants, whatever day holds that isn't a granting value
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike

### 6. ts: cancelled let in: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

    facts.day === "scheduled" &&

becomes this:

    facts.day !== "suspended" &&

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the day cancelled
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > denies or throws, never grants, whatever day holds that isn't a granting value
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike

### 7. ts: no club suspension: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

        facts.clubSuspendedAt === null &&
    

is taken out.

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the club suspended
- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the club suspended, at an instant after now
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > denies or throws, never grants, whatever clubSuspendedAt holds that isn't a granting value
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike

### 8. ts: club suspension as truthy: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

    facts.clubSuspendedAt === null &&

becomes this:

    !facts.clubSuspendedAt &&

Suites run: unit exit 1.

Tests that failed:

- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > denies or throws, never grants, whatever clubSuspendedAt holds that isn't a granting value

### 9. ts: no held day: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

        notBeforeReveal(facts.starLeftAt, facts.revealAt) &&
    

is taken out.

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the star left before the day opened (FQ63)
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > denies or throws, never grants, whatever starLeftAt holds that isn't a granting value
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > never reveals media or reactions, or opens a held day, by an instant that isn't a Temporal.Instant
- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > holds a day whose star left a microsecond before reveal_at
- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > serves nothing of it to anyone, the caption included, before or after reveal_at

### 10. ts: no star deletion: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

        notBeforeReveal(facts.starDeletionRequestedAt, facts.revealAt) &&
    

is taken out.

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the star asked to delete their account before the day opened (FQ63, T27)
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > denies or throws, never grants, whatever starDeletionRequestedAt holds that isn't a granting value
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > never reveals media or reactions, or opens a held day, by an instant that isn't a Temporal.Instant
- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > holds a day whose star asked to delete their account before it opened, whenever the membership is ended

### 11. ts: held day at reveal_at: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

    Temporal.Instant.compare(at, revealAt) >= 0

becomes this:

    Temporal.Instant.compare(at, revealAt) > 0

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T1, T9: the reveal is reached at reveal_at, by the server's time > keeps a day open after its star leaves, or asks to delete their account, once it has opened (FQ63)
- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > keeps a day that had opened when its star left, at reveal_at itself or later
- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > keeps a day whose star asked to delete their account once it had opened

### 12. ts: held day's instants unguarded: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

        (at instanceof Temporal.Instant &&
          revealAt instanceof Temporal.Instant &&
          Temporal.Instant.compare(at, revealAt) >= 0)

becomes this:

        Temporal.Instant.compare(at, revealAt) >= 0

Suites run: unit exit 1.

Tests that failed:

- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > never reveals media or reactions, or opens a held day, by an instant that isn't a Temporal.Instant

### 13. ts: no author account: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

        facts.authorAccount === "active" &&
    

is taken out.

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the author's account deleted
- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with the author's account deleting (T27, spec 23)
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > denies or throws, never grants, whatever authorAccount holds that isn't a granting value
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after the author's account deletion, before its purge (T27, spec 23), and nobody else

### 14. ts: no block: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

        Object.is(facts.blocked, false) &&
    

is taken out.

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T23: each denial beats every grant > denies everything with a block between the viewer and the author (FQ88)
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > denies or throws, never grants, whatever blocked holds that isn't a granting value
- src/db/authorization.test.ts > T23 and FQ88: a block denies in every interval after it, whoever made it > hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ben, cleo everything after the author's block of Cleo, the drop kept (FQ88), and nobody else
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the blocked: the author blocked Cleo as the day opened, leaving by the block and keeping the drop (FQ88) by both paths alike

### 15. ts: block as truthy: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

    Object.is(facts.blocked, false) &&

becomes this:

    !facts.blocked &&

Suites run: unit exit 1.

Tests that failed:

- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > denies or throws, never grants, whatever blocked holds that isn't a granting value

### 16. ts: reveal after reveal_at: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

    Temporal.Instant.compare(now, facts.revealAt) >= 0

becomes this:

    Temporal.Instant.compare(now, facts.revealAt) > 0

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T1, T9: the reveal is reached at reveal_at, by the server's time > holds media and reactions back until the very microsecond of reveal_at
- src/authorization/read.test.ts > T9: a member in the audience, with nothing denying > reads the caption while collecting, and everything once the day opens, for good
- src/db/authorization.test.ts > T23 and FQ88: a block denies in every interval after it, whoever made it > hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again
- src/db/authorization.test.ts > T8: an audience that holds two of one viewer's intervals > answers through the one still active, by both paths alike, and nothing once neither is
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike
- src/db/authorization.test.ts > spec 22 and D11: an author who leaves keeps the drop for the club, or takes it away > lets the club read the drop of an author who left and kept it, before or after the reveal

### 17. ts: reveal_at unguarded: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

    (facts.revealAt instanceof Temporal.Instant && Temporal.Instant.compare(now, facts.revealAt) >= 0)

becomes this:

    Temporal.Instant.compare(now, facts.revealAt) >= 0

Suites run: unit exit 1.

Tests that failed:

- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > never reveals media or reactions, or opens a held day, by an instant that isn't a Temporal.Instant

### 18. ts: media before the reveal: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

    (what === "caption" ||

becomes this:

    (what !== "reactions" ||

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T1, T9: the reveal is reached at reveal_at, by the server's time > holds media and reactions back until the very microsecond of reveal_at
- src/authorization/read.test.ts > T9: a member in the audience, with nothing denying > reads the caption while collecting, and everything once the day opens, for good
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > never reveals media or reactions, or opens a held day, by an instant that isn't a Temporal.Instant
- src/db/authorization.test.ts > T23 and FQ88: a block denies in every interval after it, whoever made it > hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike
- src/db/authorization.test.ts > spec 22 and D11: an author who leaves keeps the drop for the club, or takes it away > lets the club read the drop of an author who left and kept it, before or after the reveal

### 19. ts: reactions before the reveal: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

    (what === "caption" ||

becomes this:

    (what !== "media" ||

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T1, T9: the reveal is reached at reveal_at, by the server's time > holds media and reactions back until the very microsecond of reveal_at
- src/authorization/read.test.ts > T9: a member in the audience, with nothing denying > reads the caption while collecting, and everything once the day opens, for good
- src/authorization/read.test.ts > fails closed: a fact that is missing, of the wrong type or unknown never grants > never reveals media or reactions, or opens a held day, by an instant that isn't a Temporal.Instant
- src/db/authorization.test.ts > T23 and FQ88: a block denies in every interval after it, whoever made it > hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike
- src/db/authorization.test.ts > spec 22 and D11: an author who leaves keeps the drop for the club, or takes it away > lets the club read the drop of an author who left and kept it, before or after the reveal

### 20. ts: missing drop granted: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

      if (facts === null) return false;

becomes this:

      if (facts === null) return true;

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T14: missing and unauthorized get the same answer > answers false for a drop that doesn't exist, as for one the viewer may not read
- src/db/authorization.test.ts > T14: a missing drop and a drop the viewer may not read get the same answer > answers no for a drop id nobody has or one that isn't an id at all, and for an account nobody has, without an error
- src/db/authorization.test.ts > the connection: the time module's INSTANT_TYPE, or a loud failure > binds now and reads instants through INSTANT_TYPE on a command's connection

### 21. ts: unknown read taken: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

      if (!READS.includes(what as ReadWhat)) {

becomes this:

      if (false) {

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T14: missing and unauthorized get the same answer > takes only the three reads and the server's time to the microsecond, and refuses anything else
- src/db/authorization.test.ts > the connection: the time module's INSTANT_TYPE, or a loud failure > refuses a viewer that isn't an id, a time that isn't the server's to the microsecond, and a read it doesn't know

### 22. ts: any now taken: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

      if (!(now instanceof Temporal.Instant)) throw

becomes this:

      if (false) throw

Suites run: unit exit 1, db exit 0.

Tests that failed:

- src/authorization/read.test.ts > T14: missing and unauthorized get the same answer > takes only the three reads and the server's time to the microsecond, and refuses anything else

### 23. ts: nanoseconds taken: CAUGHT

In `packages/domain/src/authorization/read.ts`, this:

      wholeMicroseconds(now, "now");
    

is taken out.

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/authorization/read.test.ts > T14: missing and unauthorized get the same answer > takes only the three reads and the server's time to the microsecond, and refuses anything else
- src/db/authorization.test.ts > the connection: the time module's INSTANT_TYPE, or a loud failure > refuses a viewer that isn't an id, a time that isn't the server's to the microsecond, and a read it doesn't know

### 24. sql: no account check: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

           AND u.state = 'active'
    

is taken out.

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > keeps a day whose star asked to delete their account once it had opened
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies cleo everything after Cleo's account deletion (T27), and nobody else
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the deletion pending, the membership not yet ended (T27) by both paths alike

### 25. sql: no interval check: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

           AND m.state = 'active'
    

is taken out.

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > keeps a day that had opened when its star left, at reveal_at itself or later
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ben, cleo everything after the author's block of Cleo, the drop kept (FQ88), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies cleo everything after the end of Cleo's membership, and nobody else
- src/db/authorization.test.ts > T8: an audience that holds two of one viewer's intervals > answers through the one still active, by both paths alike, and nothing once neither is
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the former member by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the rejoined member, a new interval (T8) by both paths alike
- src/db/authorization.test.ts > spec 22 and D11: an author who leaves keeps the drop for the club, or takes it away > lets the club read the drop of an author who left and kept it, before or after the reveal

### 26. sql: any interval of the club's: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

          JOIN app.drop_audience a ON a.drop_id = d.id
          JOIN app.memberships m ON m.interval_id = a.interval_id
    

becomes this:

          JOIN app.memberships m ON m.club_id = d.club_id
    

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member who joined after the commit (T8) by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the rejoined member, a new interval (T8) by both paths alike

### 27. sql: held and removed let in: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

           AND d.state = 'active'
    

becomes this:

           AND d.state <> 'withdrawn'
    

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after a moderation removal (FQ27), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after a pictured member's removal (T25), and nobody else
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike

### 28. sql: no day status: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

           AND o.status = 'scheduled'
    

is taken out.

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike

### 29. sql: cancelled let in: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

    o.status = 'scheduled'

becomes this:

    o.status <> 'suspended'

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike

### 30. sql: no club suspension: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

           AND c.suspended_at IS NULL
    

is taken out.

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike

### 31. sql: no held day: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

           AND (s.left_at IS NULL OR s.left_at >= o.reveal_at)
    

is taken out.

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > holds a day whose star left a microsecond before reveal_at
- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > serves nothing of it to anyone, the caption included, before or after reveal_at

### 32. sql: held day at reveal_at: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

    s.left_at >= o.reveal_at

becomes this:

    s.left_at > o.reveal_at

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > keeps a day that had opened when its star left, at reveal_at itself or later

### 33. sql: no star deletion: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

           AND (su.deletion_requested_at IS NULL OR su.deletion_requested_at >= o.reveal_at)
    

is taken out.

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > holds a day whose star asked to delete their account before it opened, whenever the membership is ended

### 34. sql: star deletion at reveal_at: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

    su.deletion_requested_at >= o.reveal_at

becomes this:

    su.deletion_requested_at > o.reveal_at

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > keeps a day whose star asked to delete their account once it had opened

### 35. sql: no author account: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

           AND au.state = 'active'
    

is taken out.

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after the author's account deletion, before its purge (T27, spec 23), and nobody else

### 36. sql: the author's interval must be active: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

           AND au.state = 'active'
    

becomes this:

           AND au.state = 'active' AND am.state = 'active'
    

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ben, cleo everything after the author's block of Cleo, the drop kept (FQ88), and nobody else
- src/db/authorization.test.ts > spec 22 and D11: an author who leaves keeps the drop for the club, or takes it away > lets the club read the drop of an author who left and kept it, before or after the reveal

### 37. sql: no block: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

           AND NOT EXISTS (SELECT FROM app.blocks b
                            WHERE (b.blocker_user_id = m.user_id AND b.blocked_user_id = am.user_id)
                               OR (b.blocker_user_id = am.user_id AND b.blocked_user_id = m.user_id))
    

is taken out.

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T23 and FQ88: a block denies in every interval after it, whoever made it > hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ben, cleo everything after the author's block of Cleo, the drop kept (FQ88), and nobody else
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the blocked: the author blocked Cleo as the day opened, leaving by the block and keeping the drop (FQ88) by both paths alike

### 38. sql: only the viewer's blocks: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

    
                               OR (b.blocker_user_id = am.user_id AND b.blocked_user_id = m.user_id))

becomes this:

    )

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T23 and FQ88: a block denies in every interval after it, whoever made it > hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ben, cleo everything after the author's block of Cleo, the drop kept (FQ88), and nobody else
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the blocked: the author blocked Cleo as the day opened, leaving by the block and keeping the drop (FQ88) by both paths alike

### 39. sql: only the author's blocks: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

    (b.blocker_user_id = m.user_id AND b.blocked_user_id = am.user_id)
                               OR 

is taken out.

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T23 and FQ88: a block denies in every interval after it, whoever made it > hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again

### 40. sql: reveal after reveal_at: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

    o.reveal_at <= ${now}::pg_catalog.timestamptz

becomes this:

    o.reveal_at < ${now}::pg_catalog.timestamptz

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T23 and FQ88: a block denies in every interval after it, whoever made it > hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again
- src/db/authorization.test.ts > T8: an audience that holds two of one viewer's intervals > answers through the one still active, by both paths alike, and nothing once neither is
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike
- src/db/authorization.test.ts > spec 22 and D11: an author who leaves keeps the drop for the club, or takes it away > lets the club read the drop of an author who left and kept it, before or after the reveal

### 41. sql: everything before the reveal: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

    AND (NOT ${beyondCaption}::pg_catalog.bool OR o.reveal_at

becomes this:

    AND (true OR o.reveal_at

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T23 and FQ88: a block denies in every interval after it, whoever made it > hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike
- src/db/authorization.test.ts > spec 22 and D11: an author who leaves keeps the drop for the club, or takes it away > lets the club read the drop of an author who left and kept it, before or after the reveal

### 42. sql: the transaction's clock: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

    o.reveal_at <= ${now}::pg_catalog.timestamptz

becomes this:

    o.reveal_at <= pg_catalog.now() AND ${now}::pg_catalog.timestamptz IS NOT NULL

Suites run: unit exit 1, db exit 1.

Tests that failed:

- src/time/one-clock.test.ts > only the time module reads a clock (T1) > finds no other code that reads the time
- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > keeps a day that had opened when its star left, at reveal_at itself or later
- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > keeps a day whose star asked to delete their account once it had opened
- src/db/authorization.test.ts > T23 and FQ88: a block denies in every interval after it, whoever made it > hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after a moderation removal (FQ27), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after a pictured member's removal (T25), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after the author's account deletion, before its purge (T27, spec 23), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after the author's withdrawal, and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ben, cleo everything after the author's block of Cleo, the drop kept (FQ88), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies cleo everything after Cleo's account deletion (T27), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies cleo everything after Cleo's block of the author, and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies cleo everything after the end of Cleo's membership, and nobody else
- src/db/authorization.test.ts > T8: an audience that holds two of one viewer's intervals > answers through the one still active, by both paths alike, and nothing once neither is
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike
- src/db/authorization.test.ts > spec 22 and D11: an author who leaves keeps the drop for the club, or takes it away > lets the club read the drop of an author who left and kept it, before or after the reveal

### 43. sql: any viewer string taken: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

      if (typeof viewer !== "string" || !ID.test(viewer)) throw

becomes this:

      if (typeof viewer !== "string" || viewer === "") throw

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T14: a missing drop and a drop the viewer may not read get the same answer > refuses a viewer that isn't an account id, whichever drop is asked about

### 44. sql: now rounded up to the millisecond: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

    o.reveal_at <= ${now}::pg_catalog.timestamptz

becomes this:

    o.reveal_at <= ${now.round({ smallestUnit: "millisecond", roundingMode: "ceil" })}::pg_catalog.timestamptz

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T23 and FQ88: a block denies in every interval after it, whoever made it > hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike
- src/db/authorization.test.ts > spec 22 and D11: an author who leaves keeps the drop for the club, or takes it away > lets the club read the drop of an author who left and kept it, before or after the reveal

### 45. facts: no viewer account: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

    (SELECT u.state FROM app.users u WHERE u.id = ${viewer}::pg_catalog.text) AS viewer_account

becomes this:

    'active'::pg_catalog.text AS viewer_account

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > keeps a day whose star asked to delete their account once it had opened
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies cleo everything after Cleo's account deletion (T27), and nobody else
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the deletion pending, the membership not yet ended (T27) by both paths alike

### 46. facts: any interval of the club's: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

                      FROM app.drop_audience a JOIN app.memberships m ON m.interval_id = a.interval_id
                     WHERE a.drop_id = d.id AND m.user_id

becomes this:

                      FROM app.memberships m
                     WHERE m.club_id = d.club_id AND m.state = 'active' AND m.user_id

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member who joined after the commit (T8) by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the rejoined member, a new interval (T8) by both paths alike

### 47. facts: no author account: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

               au.state AS author_account,

becomes this:

               'active'::pg_catalog.text AS author_account,

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after the author's account deletion, before its purge (T27, spec 23), and nobody else

### 48. facts: only the viewer's blocks: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

    
                               OR (b.blocker_user_id = am.user_id AND b.blocked_user_id = ${viewer}::pg_catalog.text)) AS blocked

becomes this:

    ) AS blocked

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T23 and FQ88: a block denies in every interval after it, whoever made it > hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ben, cleo everything after the author's block of Cleo, the drop kept (FQ88), and nobody else
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the blocked: the author blocked Cleo as the day opened, leaving by the block and keeping the drop (FQ88) by both paths alike

### 49. facts: only the author's blocks: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

    (b.blocker_user_id = ${viewer}::pg_catalog.text AND b.blocked_user_id = am.user_id)
                               OR 

is taken out.

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T23 and FQ88: a block denies in every interval after it, whoever made it > hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again

### 50. facts: the star's join, not leave: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

               s.left_at AS star_left_at,

becomes this:

               s.joined_at AS star_left_at,

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > keeps a day that had opened when its star left, at reveal_at itself or later
- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > keeps a day whose star asked to delete their account once it had opened
- src/db/authorization.test.ts > T23 and FQ88: a block denies in every interval after it, whoever made it > hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after a moderation removal (FQ27), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after a pictured member's removal (T25), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after the author's account deletion, before its purge (T27, spec 23), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ana, ben, cleo everything after the author's withdrawal, and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies ben, cleo everything after the author's block of Cleo, the drop kept (FQ88), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies cleo everything after Cleo's account deletion (T27), and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies cleo everything after Cleo's block of the author, and nobody else
- src/db/authorization.test.ts > T23: a denial beats every grant, once the drop has been read and saved > denies cleo everything after the end of Cleo's membership, and nobody else
- src/db/authorization.test.ts > T8: an audience that holds two of one viewer's intervals > answers through the one still active, by both paths alike, and nothing once neither is
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the author by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the member in the audience by both paths alike
- src/db/authorization.test.ts > T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day > answers the star by both paths alike
- src/db/authorization.test.ts > spec 22 and D11: an author who leaves keeps the drop for the club, or takes it away > lets the club read the drop of an author who left and kept it, before or after the reveal

### 51. facts: the star's deletion not loaded: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

    su.deletion_requested_at AS star_deletion_requested_at,

becomes this:

    NULL::pg_catalog.timestamptz AS star_deletion_requested_at,

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > FQ63: a day whose star left before it opened is held and never opens > holds a day whose star asked to delete their account before it opened, whenever the membership is ended

### 52. facts: an ended interval before an active one: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

    ORDER BY m.state = 'active' DESC, m.interval_id

becomes this:

    ORDER BY m.state = 'active' ASC, m.interval_id

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T8: an audience that holds two of one viewer's intervals > answers through the one still active, by both paths alike, and nothing once neither is

### 53. facts: any drop id queried: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

      if (!ID.test(drop)) return null;
    

is taken out.

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > T14: a missing drop and a drop the viewer may not read get the same answer > answers no for a drop id nobody has or one that isn't an id at all, and for an account nobody has, without an error

### 54. facts: the server's time not read back: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

      if (row === undefined || !instant(row["now"], "now").equals(now))

becomes this:

      if (row === undefined)

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > the connection: the time module's INSTANT_TYPE, or a loud failure > refuses a connection that sends instants whole but reads them back as Dates, for a drop that doesn't exist too

### 55. facts: a Date taken: CAUGHT

In `packages/domain/src/authorization/read-sql.ts`, this:

      if (value instanceof Temporal.Instant) return value;

becomes this:

      if (value instanceof Temporal.Instant || value instanceof Date) return value as Temporal.Instant;

Suites run: db exit 1.

Tests that failed:

- src/db/authorization.test.ts > the connection: the time module's INSTANT_TYPE, or a loud failure > refuses a connection that sends instants whole but reads them back as Dates, for a drop that doesn't exist too
