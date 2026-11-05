# Slice 4's breakage runs (PR #17)

Each breakage is one change to one migration in `db/migrations/`, or to the runner `tools/ops/src/migrate.ts`, that turns off one guard or one clause of one. For each, the database is made fresh (the cluster remade, `db/bootstrap.sql` run, every migration applied by the runner) and the whole database suite runs (`pnpm --filter @tadayo/tests test:db`); a change to the runner also runs its unit tests (`pnpm --filter @tadayo/ops exec vitest run`). The verdicts:

- **CAUGHT**: at least one test failed, named below. A test that fails is one written for that rule.
- **MISSED**: every test passed.
- **BROKEN**: the change stopped a migration applying or the runner loading, so no test could judge it. Never counted as caught.

The files are restored from a copy after each breakage and at the end; after both runs, `git diff` showed the working tree as it was committed.

- **Commit:** `cc629765752f547049a430482233b33bacd52325` on `api/b0-db`, PR #17's second commit (the review's fixes). The runs were made on its working tree just before it was committed.
- **Server:** the session's PostgreSQL 16, made like `ci`'s service (ADR-026): its first role `supabase_admin`, Supabase's roles made by `tools/ci/ci_steps.py db-bootstrap`. `ci`'s Postgres 17 is the authority for the suite itself.
- **Run 3:** 65 breakages: 2 broken, 61 caught, 2 missed. The two missed are `app.drops_guard`'s owner clauses (a photo's owner, a pending replacement's owner): `app.uploads_owner_guard` and the reservation's composite key already refuse every write that would reach them, so they are a second layer no test can reach alone. The two broken used a bare `true` in jsonpath, which isn't a predicate; run 4 redoes them with `exists(@.value)`.
- **Run 4:** 58 breakages: 58 caught. The first 38 are the ones first run at `5ff6215` (`first/run.py`, `first/run2.py`; their logs `first/out.log`, `first/out2.log`), applied again to the migrations as the review left them; two needed their text adapting to rewritten code ("T24 ended drop only loses content", "T52 no caption in receipts/outbox"). "T7 join needs every approval" was missed in the full run, because the review's new check of every current member covers it whenever that person is still a member; the test `refuses a join through a roster someone on it left before approving, though everyone still here approved (T7)` was added to reach it, and that breakage alone was run again and caught (its entry below is that run).

## How to run them again

1. Check out the commit above in a working tree, with Node 26 and pnpm 12.16.1 (`docs/JOURNAL.md`, block 1.1, "How to run and check everything"), and run `pnpm install`.
2. Make a server like `ci`'s on port 5432. `pgci.sh` does it for the session's PostgreSQL 16 (as root): it stops and deletes the cluster at `/var/lib/postgresql/pgci`, then `initdb --username=supabase_admin` with the password `postgres` and starts it. Any server made like `ci`'s does (`docs/LIMITATIONS.md`, the row on the session's own cluster).
3. `dbtest.sh` runs the database tests against it; with `FRESH=1` it remakes the server with `pgci.sh` beside it and runs `python3 tools/ci/ci_steps.py db-bootstrap` first. Change its `cd` to your working tree.
4. `python3 run3.py` or `python3 run4.py`, each with optional words that pick breakages by name. Change `REPO` at their top to your working tree. Each reads its list (run 3's is in the script, run 4's is `run4-list.json`) and runs `dbtest.sh` from the folder holding it, keeps its copies of the files it changes in `backup/` there, and writes `run3-results.json` or `run4-results.json` there, over the published one.

Corrected after `435c0e7`: as first published, `run3.py`, `run4.py` and `dbtest.sh` read and wrote under the session's scratch folder, so `run4.py` couldn't find its list (finding records 2 of the check of PR #17's fixes). Only those paths changed; the breakages and the results are the runs'.

Each run takes about ten seconds a breakage on the session's machine.

## Run 3: the review's new guards and the runner

### 1. T8 interval keeps its account: CAUGHT

In `db/migrations/0003_people_and_clubs.sql`, this:

    'interval_id', 'club_id', 'user_id', 'origin'

became this:

    'interval_id', 'club_id', 'origin'

Tests that failed:

- T8: an interval is one account's, in one club, for good > never moves an interval to another account or club, and never deletes it

### 2. T8 interval keeps its club: CAUGHT

In `db/migrations/0003_people_and_clubs.sql`, this:

    'interval_id', 'club_id', 'user_id', 'origin'

became this:

    'interval_id', 'user_id', 'origin'

Tests that failed:

- T8: an interval is one account's, in one club, for good > never moves an interval to another account or club, and never deletes it

### 3. T8 interval never deleted: CAUGHT

In `db/migrations/0003_people_and_clubs.sql`, this:

    CREATE TRIGGER memberships_no_delete BEFORE DELETE ON app.memberships
      FOR EACH ROW EXECUTE

became this:

    CREATE TRIGGER memberships_no_delete BEFORE DELETE ON app.memberships
      FOR EACH ROW WHEN (false) EXECUTE

Tests that failed:

- T8: an interval is one account's, in one club, for good > never moves an interval to another account or club, and never deletes it

### 4. T27 deletion never goes back: CAUGHT

In `db/migrations/0003_people_and_clubs.sql`, this:

      IF NOT (NEW.state = OLD.state
    

became this:

      IF false AND NOT (NEW.state = OLD.state
    

Tests that failed:

- T27 and FQ13: an account's deletion goes one way > never brings a deleted account back, changes its sign-in identity, or takes back the age confirmation

### 5. FQ13 age confirmation kept: CAUGHT

In `db/migrations/0003_people_and_clubs.sql`, this:

      IF OLD.age_confirmed_at IS NOT NULL AND

became this:

      IF false AND OLD.age_confirmed_at IS NOT NULL AND

Tests that failed:

- T27 and FQ13: an account's deletion goes one way > never brings a deleted account back, changes its sign-in identity, or takes back the age confirmation

### 6. sign-in identity kept: CAUGHT

In `db/migrations/0003_people_and_clubs.sql`, this:

      IF OLD.auth_subject IS DISTINCT FROM NEW.auth_subject

became this:

      IF false AND OLD.auth_subject IS DISTINCT FROM NEW.auth_subject

Tests that failed:

- T27 and FQ13: an account's deletion goes one way > never brings a deleted account back, changes its sign-in identity, or takes back the age confirmation

### 7. clubs truncate trigger gone: CAUGHT

In `db/migrations/0003_people_and_clubs.sql`, this:

    CREATE TRIGGER clubs_no_truncate BEFORE TRUNCATE ON app.clubs
    

became this:

    CREATE TRIGGER clubs_no_truncate BEFORE UPDATE ON app.clubs
    

Tests that failed:

- A01 and TECH-DESIGN section 6: the roster's limits > holds at most six active members
- A01 and TECH-DESIGN section 6: the roster's limits > holds one active interval per account and club, and a rejoin is a new interval
- A01 and TECH-DESIGN section 6: the roster's limits > keeps an invitation's token only as a unique hash, with one latest link per candidate
- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > adds nothing to a drop that isn't active, or from someone who has left, who can still take their own away (T9, T24)
- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > lets a deleted comment only lose its text
- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > reacts, comments and saves once the day has opened
- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > refuses a reaction to one's own drop, and anyone outside the audience
- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > refuses each before the reveal
- FQ27: a moderation removal cites the operator's removal of that drop > refuses an action about anything else, and takes the one about that drop
- T12 and T40: uploads and links keep nothing they shouldn't > commits only a link its author resolved (T40)
- T12 and T40: uploads and links keep nothing they shouldn't > commits only the author's own ready upload, made for that day's slot or that drop (T12)
- T12 and T40: uploads and links keep nothing they shouldn't > makes an avatar only of a ready upload made as one (T12, FQ74)
- T12 and T40: uploads and links keep nothing they shouldn't > puts an upload only into its owner's own slot or drop (T12)
- T12 and T40: uploads and links keep nothing they shouldn't > refuses a link with a query string or fragment, or a provider id that isn't one
- T12 and T40: uploads and links keep nothing they shouldn't > starts an upload pending and never takes it back
- T17: six and two, as a last guard behind the counter's lock > refuses a seventh drop or a third link in the counter
- T17: six and two, as a last guard behind the counter's lock > ties a counter to one club's day and member
- T18: a reservation ends once > never changes a used reservation
- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > never changes a completed receipt, nor the hash of a pending one
- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > refuses a receipt left pending at the commit
- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > refuses an operation the contract doesn't make idempotent
- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > replays the same removal, and refuses the key on another drop or with another reason
- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > stores ids, states, flags and people's names, whatever a name holds
- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > stores no caption, comment, note, link or token in a response, under any key
- T21: the same photo or link once per author and day > refuses a second live drop with the same scoped hash, and allows another author's
- T22: a highlight points to the contributor's own active drop, before the reveal > clears it from the reveal on only when its drop ends (T3, T22, T24)
- T22: a highlight points to the contributor's own active drop, before the reveal > refuses a withdrawal that leaves the highlight on the drop
- T22: a highlight points to the contributor's own active drop, before the reveal > refuses another member's drop, a held drop, and any pointer from the reveal on
- T22: a highlight points to the contributor's own active drop, before the reveal > sets, moves and clears it, moving its version by one each time
- T23 to T25: a removal is one audited record, and the drop's state agrees with it > lets a withdrawn drop lose its content and nothing else
- T23 to T25: a removal is one audited record, and the drop's state agrees with it > lets only the author withdraw, and never changes a removal
- T23 to T25: a removal is one audited record, and the drop's state agrees with it > refuses a drop withdrawn without a removal, or in a state its reason doesn't give
- T23 to T25: a removal is one audited record, and the drop's state agrees with it > refuses a pictured removal by someone who has left (T9)
- T23 to T25: a removal is one audited record, and the drop's state agrees with it > refuses a pictured removal by the author, before the reveal, or of a link
- T23 to T25: a removal is one audited record, and the drop's state agrees with it > withdraws by the author, and removes as pictured by a member in the revealed photo
- T29: a drop on hold at the reveal never appears afterwards > releases a hold before the reveal, and refuses it from the reveal on
- T33: a revision's version moves with its state, and only then > never changes an ended revision
- T33: a revision's version moves with its state, and only then > refuses a version moved by an approval, or a state change that doesn't move it
- T3: the reveal is the cutoff > commits a drop only active and at version 1
- T3: the reveal is the cutoff > judges every change at its own instant, and an edit is a new version (T1, T3, T19)
- T3: the reveal is the cutoff > lets a caption change before the reveal, and freezes it from the reveal on
- T3: the reveal is the cutoff > refuses a commit at the reveal
- T3: the reveal is the cutoff > refuses a reservation made at the reveal or lasting past it (T18)
- T4 and T6: an announced day never moves > never changes a day's date, star, week or instants, and never deletes it
- T4 and T6: an announced day never moves > never changes an announced week or a confirmed weekday
- T4: the server never moves a drop > never changes a drop's day, author or kind, and never deletes it
- T6 and FQ61: a day for the right star, from the week in force > makes Ana's next Saturday from the week in force on it
- T6 and FQ61: a day for the right star, from the week in force > refuses a Sunday, and an assignment whose first date isn't its weekday
- T6 and FQ61: a day for the right star, from the week in force > refuses a day before the weekday's first date
- T6 and FQ61: a day for the right star, from the week in force > refuses a day for a star who has left (FQ63)
- T6 and FQ61: a day for the right star, from the week in force > refuses a day for a star whose weekday it isn't
- T6 and FQ61: a day for the right star, from the week in force > refuses a day from a week that isn't in force on its date
- T6 and FQ61: a day for the right star, from the week in force > refuses a new week that would move a day already announced
- T6 and FQ61: a day for the right star, from the week in force > refuses instants out of order
- T7: an exact roster, sealed when it is made > binds a link once, to one account, before it expires (T7, FQ71)
- T7: an exact roster, sealed when it is made > commits a revision with its roster sealed
- T7: an exact roster, sealed when it is made > counts proposing as approving only for the proposer of a member's proposal (FQ60, FQ84)
- T7: an exact roster, sealed when it is made > lets only a member of the exact roster decide, while still a member
- T7: an exact roster, sealed when it is made > refuses a member or a candidate added to a sealed revision
- T7: an exact roster, sealed when it is made > refuses a revision made without its seal, its proposer or a candidate
- T7: an exact roster, sealed when it is made > refuses an approval before the seal, a second decision, and a decision once it has ended
- T7: an exact roster, sealed when it is made > seals a roster only when it is exactly the club's members (T7, FQ84)
- T7: joining only by the exact roster accepted and approved > adds Dan once every member approved, Dan accepted with Dan's own link, and it was applied
- T7: joining only by the exact roster accepted and approved > makes the creator's membership with the club, and no other without a roster
- T7: joining only by the exact roster accepted and approved > refuses Dan while a member hasn't approved, before it is applied, or as someone else
- T7: joining only by the exact roster accepted and approved > refuses a late join through an older roster that someone who has joined since never approved (T7)
- T8: a commit that leaves the audience incomplete or unsealed doesn't commit > refuses a drop committed without its seal
- T8: a commit that leaves the audience incomplete or unsealed doesn't commit > refuses a drop for a star who is no longer a member
- T8: a commit that leaves the audience incomplete or unsealed doesn't commit > refuses an audience that leaves out an active member
- T8: an interval is one account's, in one club, for good > never moves an interval to another account or club, and never deletes it
- T8: the audience is sealed at the commit > commits a drop whose audience is every active member, sealed
- T8: the audience is sealed at the commit > never changes, deletes or truncates an audience row
- T8: the audience is sealed at the commit > never unseals a drop
- T8: the audience is sealed at the commit > refuses a late audience row even in the transaction that sealed it
- T8: the audience is sealed at the commit > refuses a late audience row once the drop is sealed, for a member who joined after the commit
- T8: the audience is sealed at the commit > refuses a member whose interval has ended
- T8: the audience is sealed at the commit > refuses another club's member
- T9: a day's status only denies it > stores no phase: collecting, open and past aren't statuses (T1, T5)
- T9: a day's status only denies it > suspends and cancels a day, and never brings a cancelled one back
- rows kept for good can't be truncated > gives every table that refuses a DELETE a trigger that refuses TRUNCATE
- spec 22 and FQ27: reports, cases and the operator's audit trail > keeps the operator's actions append-only, with a label and never an address
- spec 22 and FQ27: reports, cases and the operator's audit trail > refuses a report on one's own drop, and keeps one open case per target
- the other keys a double tap meets > keeps one day per club and date (T6)
- the other keys a double tap meets > keeps one live reservation per contributor and key (T19)
- the other keys a double tap meets > keeps one reaction per member and drop (spec 16)
- the uniqueness of receipts, highlights and favourites > keeps one favourite per member and drop (spec 18, 31)
- the uniqueness of receipts, highlights and favourites > keeps one highlight per contributor and day (T22)
- the uniqueness of receipts, highlights and favourites > keeps one receipt per caller, operation and key (T19)

### 8. T7 seal: an active member left out: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

        IF EXISTS (SELECT FROM app.memberships m
                    WHERE m.club_id = NEW.club_id AND m.state = 'active'
                      AND NOT EXISTS (SELECT FROM app.roster_revision_members r

became this:

        IF false AND EXISTS (SELECT FROM app.memberships m
                    WHERE m.club_id = NEW.club_id AND m.state = 'active'
                      AND NOT EXISTS (SELECT FROM app.roster_revision_members r

Tests that failed:

- T7: an exact roster, sealed when it is made > seals a roster only when it is exactly the club's members (T7, FQ84)

### 9. T7 seal: a member who left listed: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

           OR EXISTS (SELECT FROM app.roster_revision_members r
                        JOIN app.memberships m

became this:

           OR false AND EXISTS (SELECT FROM app.roster_revision_members r
                        JOIN app.memberships m

Tests that failed:

- T7: an exact roster, sealed when it is made > seals a roster only when it is exactly the club's members (T7, FQ84)

### 10. T7 only an active member decides: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

        IF NOT FOUND THEN
          RAISE EXCEPTION 'app.roster_approvals: % is no longer a member

became this:

        IF false THEN
          RAISE EXCEPTION 'app.roster_approvals: % is no longer a member

Tests that failed:

- T7: an exact roster, sealed when it is made > lets only a member of the exact roster decide, while still a member

### 11. FQ84 no implicit approval in a rename: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    IF NEW.implicit AND (revision.origin <> 'proposal' OR NEW.interval_id <> revision.proposed_by_interval_id) THEN

became this:

    IF NEW.implicit AND (NEW.interval_id <> revision.proposed_by_interval_id) THEN

Tests that failed:

- T7: an exact roster, sealed when it is made > counts proposing as approving only for the proposer of a member's proposal (FQ60, FQ84)

### 12. FQ60 implicit only for the proposer: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    IF NEW.implicit AND (revision.origin <> 'proposal' OR NEW.interval_id <> revision.proposed_by_interval_id) THEN

became this:

    IF NEW.implicit AND (revision.origin <> 'proposal') THEN

Tests that failed:

- T7: an exact roster, sealed when it is made > counts proposing as approving only for the proposer of a member's proposal (FQ60, FQ84)

### 13. T7 join: every current member approved: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

         OR EXISTS (SELECT FROM app.memberships m
                     WHERE m.club_id = NEW.club_id AND m.state = 'active'

became this:

         OR false AND EXISTS (SELECT FROM app.memberships m
                     WHERE m.club_id = NEW.club_id AND m.state = 'active'

Tests that failed:

- T7: joining only by the exact roster accepted and approved > refuses a late join through an older roster that someone who has joined since never approved (T7)

### 14. FQ71 a link binds before it expires: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    CONSTRAINT invitations_bound_before_expiry CHECK (bound_at IS NULL OR bound_at < expires_at)

became this:

    CONSTRAINT invitations_bound_before_expiry CHECK (true)

Tests that failed:

- T7: an exact roster, sealed when it is made > binds a link once, to one account, before it expires (T7, FQ71)

### 15. T7 a link binds one account: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    app.set_once('revoked_at', 'replaced_by_id', 'bound_user_id', 'bound_at')

became this:

    app.set_once('revoked_at', 'replaced_by_id', 'bound_at')

Tests that failed:

- T7: an exact roster, sealed when it is made > binds a link once, to one account, before it expires (T7, FQ71)

### 16. T7 an acceptance names its link once: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    app.set_once('accepted_at', 'accepted_invitation_id')

became this:

    app.set_once('accepted_at')

Tests that failed:

- T7: an exact roster, sealed when it is made > binds a link once, to one account, before it expires (T7, FQ71)

### 17. T7 no approval before the seal: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

      IF TG_TABLE_NAME = 'roster_approvals' AND revision.roster_sealed_at IS NULL THEN

became this:

      IF false AND TG_TABLE_NAME = 'roster_approvals' AND revision.roster_sealed_at IS NULL THEN

Tests that failed:

- T7: an exact roster, sealed when it is made > refuses an approval before the seal, a second decision, and a decision once it has ended

### 18. T7 a revision adds somebody: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

      IF NOT EXISTS (SELECT FROM app.roster_revision_candidates WHERE revision_id = NEW.id) THEN

became this:

      IF false AND NOT EXISTS (SELECT FROM app.roster_revision_candidates WHERE revision_id = NEW.id) THEN

Tests that failed:

- T7: an exact roster, sealed when it is made > refuses a revision made without its seal, its proposer or a candidate

### 19. T7 no member added once sealed: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    IF TG_OP = 'INSERT' AND TG_TABLE_NAME <> 'roster_approvals' AND revision.roster_sealed_at IS NOT NULL THEN

became this:

    IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'roster_revision_candidates' AND revision.roster_sealed_at IS NOT NULL THEN

Tests that failed:

- T7: an exact roster, sealed when it is made > refuses a member or a candidate added to a sealed revision

### 20. approvals truncate refused: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    CREATE TRIGGER roster_approvals_no_truncate BEFORE TRUNCATE ON app.roster_approvals
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER roster_approvals_no_truncate BEFORE TRUNCATE ON app.roster_approvals
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses TRUNCATE on each such table that no foreign key references, by its own trigger

### 21. candidates truncate trigger gone: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    CREATE TRIGGER candidates_no_truncate BEFORE TRUNCATE ON app.candidates
    

became this:

    CREATE TRIGGER candidates_no_truncate BEFORE UPDATE ON app.candidates
    

Tests that failed:

- A01 and TECH-DESIGN section 6: the roster's limits > holds at most six active members
- A01 and TECH-DESIGN section 6: the roster's limits > holds one active interval per account and club, and a rejoin is a new interval
- A01 and TECH-DESIGN section 6: the roster's limits > keeps an invitation's token only as a unique hash, with one latest link per candidate
- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > adds nothing to a drop that isn't active, or from someone who has left, who can still take their own away (T9, T24)
- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > lets a deleted comment only lose its text
- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > reacts, comments and saves once the day has opened
- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > refuses a reaction to one's own drop, and anyone outside the audience
- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > refuses each before the reveal
- FQ27: a moderation removal cites the operator's removal of that drop > refuses an action about anything else, and takes the one about that drop
- T12 and T40: uploads and links keep nothing they shouldn't > commits only a link its author resolved (T40)
- T12 and T40: uploads and links keep nothing they shouldn't > commits only the author's own ready upload, made for that day's slot or that drop (T12)
- T12 and T40: uploads and links keep nothing they shouldn't > makes an avatar only of a ready upload made as one (T12, FQ74)
- T12 and T40: uploads and links keep nothing they shouldn't > puts an upload only into its owner's own slot or drop (T12)
- T12 and T40: uploads and links keep nothing they shouldn't > refuses a link with a query string or fragment, or a provider id that isn't one
- T12 and T40: uploads and links keep nothing they shouldn't > starts an upload pending and never takes it back
- T17: six and two, as a last guard behind the counter's lock > refuses a seventh drop or a third link in the counter
- T17: six and two, as a last guard behind the counter's lock > ties a counter to one club's day and member
- T18: a reservation ends once > never changes a used reservation
- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > never changes a completed receipt, nor the hash of a pending one
- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > refuses a receipt left pending at the commit
- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > refuses an operation the contract doesn't make idempotent
- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > replays the same removal, and refuses the key on another drop or with another reason
- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > stores ids, states, flags and people's names, whatever a name holds
- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > stores no caption, comment, note, link or token in a response, under any key
- T21: the same photo or link once per author and day > refuses a second live drop with the same scoped hash, and allows another author's
- T22: a highlight points to the contributor's own active drop, before the reveal > clears it from the reveal on only when its drop ends (T3, T22, T24)
- T22: a highlight points to the contributor's own active drop, before the reveal > refuses a withdrawal that leaves the highlight on the drop
- T22: a highlight points to the contributor's own active drop, before the reveal > refuses another member's drop, a held drop, and any pointer from the reveal on
- T22: a highlight points to the contributor's own active drop, before the reveal > sets, moves and clears it, moving its version by one each time
- T23 to T25: a removal is one audited record, and the drop's state agrees with it > lets a withdrawn drop lose its content and nothing else
- T23 to T25: a removal is one audited record, and the drop's state agrees with it > lets only the author withdraw, and never changes a removal
- T23 to T25: a removal is one audited record, and the drop's state agrees with it > refuses a drop withdrawn without a removal, or in a state its reason doesn't give
- T23 to T25: a removal is one audited record, and the drop's state agrees with it > refuses a pictured removal by someone who has left (T9)
- T23 to T25: a removal is one audited record, and the drop's state agrees with it > refuses a pictured removal by the author, before the reveal, or of a link
- T23 to T25: a removal is one audited record, and the drop's state agrees with it > withdraws by the author, and removes as pictured by a member in the revealed photo
- T29: a drop on hold at the reveal never appears afterwards > releases a hold before the reveal, and refuses it from the reveal on
- T33: a revision's version moves with its state, and only then > never changes an ended revision
- T33: a revision's version moves with its state, and only then > refuses a version moved by an approval, or a state change that doesn't move it
- T3: the reveal is the cutoff > commits a drop only active and at version 1
- T3: the reveal is the cutoff > judges every change at its own instant, and an edit is a new version (T1, T3, T19)
- T3: the reveal is the cutoff > lets a caption change before the reveal, and freezes it from the reveal on
- T3: the reveal is the cutoff > refuses a commit at the reveal
- T3: the reveal is the cutoff > refuses a reservation made at the reveal or lasting past it (T18)
- T4 and T6: an announced day never moves > never changes a day's date, star, week or instants, and never deletes it
- T4 and T6: an announced day never moves > never changes an announced week or a confirmed weekday
- T4: the server never moves a drop > never changes a drop's day, author or kind, and never deletes it
- T6 and FQ61: a day for the right star, from the week in force > makes Ana's next Saturday from the week in force on it
- T6 and FQ61: a day for the right star, from the week in force > refuses a Sunday, and an assignment whose first date isn't its weekday
- T6 and FQ61: a day for the right star, from the week in force > refuses a day before the weekday's first date
- T6 and FQ61: a day for the right star, from the week in force > refuses a day for a star who has left (FQ63)
- T6 and FQ61: a day for the right star, from the week in force > refuses a day for a star whose weekday it isn't
- T6 and FQ61: a day for the right star, from the week in force > refuses a day from a week that isn't in force on its date
- T6 and FQ61: a day for the right star, from the week in force > refuses a new week that would move a day already announced
- T6 and FQ61: a day for the right star, from the week in force > refuses instants out of order
- T7: an exact roster, sealed when it is made > binds a link once, to one account, before it expires (T7, FQ71)
- T7: an exact roster, sealed when it is made > commits a revision with its roster sealed
- T7: an exact roster, sealed when it is made > counts proposing as approving only for the proposer of a member's proposal (FQ60, FQ84)
- T7: an exact roster, sealed when it is made > lets only a member of the exact roster decide, while still a member
- T7: an exact roster, sealed when it is made > refuses a member or a candidate added to a sealed revision
- T7: an exact roster, sealed when it is made > refuses a revision made without its seal, its proposer or a candidate
- T7: an exact roster, sealed when it is made > refuses an approval before the seal, a second decision, and a decision once it has ended
- T7: an exact roster, sealed when it is made > seals a roster only when it is exactly the club's members (T7, FQ84)
- T7: joining only by the exact roster accepted and approved > adds Dan once every member approved, Dan accepted with Dan's own link, and it was applied
- T7: joining only by the exact roster accepted and approved > makes the creator's membership with the club, and no other without a roster
- T7: joining only by the exact roster accepted and approved > refuses Dan while a member hasn't approved, before it is applied, or as someone else
- T7: joining only by the exact roster accepted and approved > refuses a late join through an older roster that someone who has joined since never approved (T7)
- T8: a commit that leaves the audience incomplete or unsealed doesn't commit > refuses a drop committed without its seal
- T8: a commit that leaves the audience incomplete or unsealed doesn't commit > refuses a drop for a star who is no longer a member
- T8: a commit that leaves the audience incomplete or unsealed doesn't commit > refuses an audience that leaves out an active member
- T8: an interval is one account's, in one club, for good > never moves an interval to another account or club, and never deletes it
- T8: the audience is sealed at the commit > commits a drop whose audience is every active member, sealed
- T8: the audience is sealed at the commit > never changes, deletes or truncates an audience row
- T8: the audience is sealed at the commit > never unseals a drop
- T8: the audience is sealed at the commit > refuses a late audience row even in the transaction that sealed it
- T8: the audience is sealed at the commit > refuses a late audience row once the drop is sealed, for a member who joined after the commit
- T8: the audience is sealed at the commit > refuses a member whose interval has ended
- T8: the audience is sealed at the commit > refuses another club's member
- T9: a day's status only denies it > stores no phase: collecting, open and past aren't statuses (T1, T5)
- T9: a day's status only denies it > suspends and cancels a day, and never brings a cancelled one back
- rows kept for good can't be truncated > gives every table that refuses a DELETE a trigger that refuses TRUNCATE
- spec 22 and FQ27: reports, cases and the operator's audit trail > keeps the operator's actions append-only, with a label and never an address
- spec 22 and FQ27: reports, cases and the operator's audit trail > refuses a report on one's own drop, and keeps one open case per target
- the other keys a double tap meets > keeps one day per club and date (T6)
- the other keys a double tap meets > keeps one live reservation per contributor and key (T19)
- the other keys a double tap meets > keeps one reaction per member and drop (spec 16)
- the uniqueness of receipts, highlights and favourites > keeps one favourite per member and drop (spec 18, 31)
- the uniqueness of receipts, highlights and favourites > keeps one highlight per contributor and day (T22)
- the uniqueness of receipts, highlights and favourites > keeps one receipt per caller, operation and key (T19)

### 22. assignments truncate refused: CAUGHT

In `db/migrations/0005_schedules_and_days.sql`, this:

    CREATE TRIGGER schedule_assignments_no_truncate BEFORE TRUNCATE ON app.schedule_assignments
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER schedule_assignments_no_truncate BEFORE TRUNCATE ON app.schedule_assignments
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses TRUNCATE on each such table that no foreign key references, by its own trigger

### 23. versions truncate trigger gone: CAUGHT

In `db/migrations/0005_schedules_and_days.sql`, this:

    CREATE TRIGGER schedule_versions_no_truncate BEFORE TRUNCATE ON app.schedule_versions
    

became this:

    CREATE TRIGGER schedule_versions_no_truncate BEFORE UPDATE ON app.schedule_versions
    

Tests that failed:

- rows kept for good can't be truncated > gives every table that refuses a DELETE a trigger that refuses TRUNCATE

### 24. a day keeps its week: CAUGHT

In `db/migrations/0005_schedules_and_days.sql`, this:

    'id', 'club_id', 'star_interval_id', 'schedule_version_id', 'local_date'

became this:

    'id', 'club_id', 'star_interval_id', 'local_date'

Tests that failed:

- T4 and T6: an announced day never moves > never changes a day's date, star, week or instants, and never deletes it

### 25. a day keeps collecting_from: CAUGHT

In `db/migrations/0005_schedules_and_days.sql`, this:

    'reveal_at', 'close_at', 'collecting_from');

became this:

    'reveal_at', 'close_at');

Tests that failed:

- T4 and T6: an announced day never moves > never changes a day's date, star, week or instants, and never deletes it

### 26. T12 upload into own slot: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

      IF (NEW.reservation_id IS NOT NULL
    

became this:

      IF (false AND NEW.reservation_id IS NOT NULL
    

Tests that failed:

- T12 and T40: uploads and links keep nothing they shouldn't > puts an upload only into its owner's own slot or drop (T12)

### 27. T12 replacement by the author: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

         OR (NEW.replaces_drop_id IS NOT NULL
             AND NOT EXISTS (SELECT FROM app.drops d

became this:

         OR (false AND NEW.replaces_drop_id IS NOT NULL
             AND NOT EXISTS (SELECT FROM app.drops d

Tests that failed:

- T12 and T40: uploads and links keep nothing they shouldn't > puts an upload only into its owner's own slot or drop (T12)

### 28. FQ74 avatar made as one: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

    WHERE id = NEW.avatar_upload_id AND purpose = 'avatar' AND state = 'ready'

became this:

    WHERE id = NEW.avatar_upload_id AND state = 'ready'

Tests that failed:

- T12 and T40: uploads and links keep nothing they shouldn't > makes an avatar only of a ready upload made as one (T12, FQ74)

### 29. FQ74 avatar ready: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

    WHERE id = NEW.avatar_upload_id AND purpose = 'avatar' AND state = 'ready'

became this:

    WHERE id = NEW.avatar_upload_id AND purpose = 'avatar'

Tests that failed:

- T12 and T40: uploads and links keep nothing they shouldn't > makes an avatar only of a ready upload made as one (T12, FQ74)

### 30. T12 drop photo is the author's (owner clause): MISSED

In `db/migrations/0006_contributions.sql`, this:

    WHERE u.id = NEW.upload_id AND u.owner_user_id = author AND u.state = 'ready'

became this:

    WHERE u.id = NEW.upload_id AND u.state = 'ready'

No test failed.

### 31. T12 drop photo is ready: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

    WHERE u.id = NEW.upload_id AND u.owner_user_id = author AND u.state = 'ready'

became this:

    WHERE u.id = NEW.upload_id AND u.owner_user_id = author

Tests that failed:

- T12 and T40: uploads and links keep nothing they shouldn't > commits only the author's own ready upload, made for that day's slot or that drop (T12)

### 32. T12 drop photo for this slot or drop: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

              AND (u.replaces_drop_id = NEW.id
    

became this:

              AND (true OR u.replaces_drop_id = NEW.id
    

Tests that failed:

- T12 and T40: uploads and links keep nothing they shouldn't > commits only the author's own ready upload, made for that day's slot or that drop (T12)

### 33. T40 link resolved by the author: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

    WHERE id = NEW.source_id AND owner_user_id = author

became this:

    WHERE id = NEW.source_id

Tests that failed:

- T12 and T40: uploads and links keep nothing they shouldn't > commits only a link its author resolved (T40)

### 34. T12 pending replacement is the author's: MISSED

In `db/migrations/0006_contributions.sql`, this:

    WHERE id = NEW.pending_upload_id AND owner_user_id = author

became this:

    WHERE id = NEW.pending_upload_id

No test failed.

### 35. T3 every change carries its instant: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

        IF NEW.updated_at = OLD.updated_at
    

became this:

        IF false AND NEW.updated_at = OLD.updated_at
    

Tests that failed:

- T3: the reveal is the cutoff > judges every change at its own instant, and an edit is a new version (T1, T3, T19)

### 36. T19 an edit is a new version: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

        IF NEW.state IN ('active', 'held') AND NEW.version <> OLD.version + 1
    

became this:

        IF false AND NEW.state IN ('active', 'held') AND NEW.version <> OLD.version + 1
    

Tests that failed:

- T3: the reveal is the cutoff > judges every change at its own instant, and an edit is a new version (T1, T3, T19)

### 37. T19 version and time never go back: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

        IF NEW.version < OLD.version OR NEW.updated_at < OLD.updated_at THEN

became this:

        IF false THEN

Tests that failed:

- T3: the reveal is the cutoff > judges every change at its own instant, and an edit is a new version (T1, T3, T19)

### 38. T3 committed active: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

    IF NEW.state <> 'active' OR NEW.version <> 1 OR NEW.submitted_at >= reveal THEN

became this:

    IF NEW.version <> 1 OR NEW.submitted_at >= reveal THEN

Tests that failed:

- T3: the reveal is the cutoff > commits a drop only active and at version 1

### 39. T3 committed at version 1: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

    IF NEW.state <> 'active' OR NEW.version <> 1 OR NEW.submitted_at >= reveal THEN

became this:

    IF NEW.state <> 'active' OR NEW.submitted_at >= reveal THEN

Tests that failed:

- T3: the reveal is the cutoff > commits a drop only active and at version 1

### 40. T3 highlight cleared only with its drop's end: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

      IF TG_OP = 'UPDATE' AND OLD.drop_id IS NOT NULL AND NEW.drop_id IS NULL THEN

became this:

      IF false AND TG_OP = 'UPDATE' AND OLD.drop_id IS NOT NULL AND NEW.drop_id IS NULL THEN

Tests that failed:

- T22: a highlight points to the contributor's own active drop, before the reveal > clears it from the reveal on only when its drop ends (T3, T22, T24)

### 41. highlights truncate refused: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

    CREATE TRIGGER highlights_no_truncate BEFORE TRUNCATE ON app.highlights
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER highlights_no_truncate BEFORE TRUNCATE ON app.highlights
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses TRUNCATE on each such table that no foreign key references, by its own trigger

### 42. audience truncate refused (own trigger): CAUGHT

In `db/migrations/0006_contributions.sql`, this:

    CREATE TRIGGER drop_audience_no_truncate BEFORE TRUNCATE ON app.drop_audience
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER drop_audience_no_truncate BEFORE TRUNCATE ON app.drop_audience
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- T8: the audience is sealed at the commit > never changes, deletes or truncates an audience row

### 43. T24 nothing added to an inactive drop: CAUGHT

In `db/migrations/0007_after_the_reveal.sql`, this:

        PERFORM FROM app.drops WHERE id = NEW.drop_id AND state = 'active' FOR SHARE;
        IF NOT FOUND THEN

became this:

        PERFORM FROM app.drops WHERE id = NEW.drop_id AND state = 'active' FOR SHARE;
        IF false THEN

Tests that failed:

- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > adds nothing to a drop that isn't active, or from someone who has left, who can still take their own away (T9, T24)

### 44. T9 nothing added by someone who left: CAUGHT

In `db/migrations/0007_after_the_reveal.sql`, this:

        PERFORM FROM app.memberships WHERE interval_id = writer AND state = 'active' FOR SHARE;
        IF NOT FOUND THEN

became this:

        PERFORM FROM app.memberships WHERE interval_id = writer AND state = 'active' FOR SHARE;
        IF false THEN

Tests that failed:

- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > adds nothing to a drop that isn't active, or from someone who has left, who can still take their own away (T9, T24)

### 45. T9 a comment edit adds: CAUGHT

In `db/migrations/0007_after_the_reveal.sql`, this:

        adds := TG_OP = 'INSERT' OR (NEW.state = 'active' AND NEW.body IS DISTINCT FROM OLD.body);

became this:

        adds := TG_OP = 'INSERT';

Tests that failed:

- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > adds nothing to a drop that isn't active, or from someone who has left, who can still take their own away (T9, T24)

### 46. T9 clearing one's own reaction adds nothing: CAUGHT

In `db/migrations/0007_after_the_reveal.sql`, this:

        adds := NEW.reaction IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.reaction IS DISTINCT FROM OLD.reaction);

became this:

        adds := true;

Tests that failed:

- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > adds nothing to a drop that isn't active, or from someone who has left, who can still take their own away (T9, T24)

### 47. T9 pictured remover still a member: CAUGHT

In `db/migrations/0008_safety.sql`, this:

      IF NEW.reason = 'pictured' THEN
        PERFORM FROM app.memberships

became this:

      IF false THEN
        PERFORM FROM app.memberships

Tests that failed:

- T23 to T25: a removal is one audited record, and the drop's state agrees with it > refuses a pictured removal by someone who has left (T9)

### 48. FQ27 moderation cites a remove_drop: CAUGHT

In `db/migrations/0008_safety.sql`, this:

    WHERE id = NEW.operator_action_id AND action = 'remove_drop' AND target_kind = 'drop'

became this:

    WHERE id = NEW.operator_action_id AND target_kind = 'drop'

Tests that failed:

- FQ27: a moderation removal cites the operator's removal of that drop > refuses an action about anything else, and takes the one about that drop

### 49. FQ27 moderation cites this drop: CAUGHT

In `db/migrations/0008_safety.sql`, this:

              AND target_id = NEW.drop_id) THEN

became this:

              ) THEN

Tests that failed:

- FQ27: a moderation removal cites the operator's removal of that drop > refuses an action about anything else, and takes the one about that drop

### 50. moderation_cases truncate trigger gone: CAUGHT

In `db/migrations/0008_safety.sql`, this:

    CREATE TRIGGER moderation_cases_no_truncate BEFORE TRUNCATE ON app.moderation_cases
    

became this:

    CREATE TRIGGER moderation_cases_no_truncate BEFORE UPDATE ON app.moderation_cases
    

Tests that failed:

- rows kept for good can't be truncated > gives every table that refuses a DELETE a trigger that refuses TRUNCATE

### 51. T52 keys in any case: CAUGHT

In `db/migrations/0009_platform.sql`, this:

    "caption|text|body|note|url|href|link|token|preview|message|secret|signed" flag "i"

became this:

    "caption|text|body|note|url|href|link|token|preview|message|secret|signed"

Tests that failed:

- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > stores no caption, comment, note, link or token in a response, under any key

### 52. T52 a link under any key: CAUGHT

In `db/migrations/0009_platform.sql`, this:

             ? (@.value.type() == "string" && @.value like_regex "://"

became this:

             ? (@.value.type() == "string" && @.value like_regex "^:///$"

Tests that failed:

- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > stores no caption, comment, note, link or token in a response, under any key

### 53. T52 a link in a list: CAUGHT

In `db/migrations/0009_platform.sql`, this:

    'strict $.** ? (@.type() == "array")[*] ? (@.type() == "string" && @ like_regex "://")'

became this:

    'strict $.** ? (@.type() == "array")[*] ? (@.type() == "string" && @ like_regex "^:///$")'

Tests that failed:

- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > stores no caption, comment, note, link or token in a response, under any key

### 54. T52 a flag is no content: BROKEN

In `db/migrations/0009_platform.sql`, this:

                && (@.value.type() == "string" || @.value.type() == "object" || @.value.type() == "array"))')

became this:

                && true)')

No test failed.

### 55. T52 a name may hold anything: BROKEN

In `db/migrations/0009_platform.sql`, this:

                && !(@.key like_regex "^(display_name|name|club_name|inviter_name|label)$"))')

became this:

                && true)')

No test failed.

### 56. T27 no receipt for a deleted account: CAUGHT

In `db/migrations/0009_platform.sql`, this:

      PERFORM FROM app.users WHERE id = NEW.actor_user_id AND state <> 'deleted' FOR KEY SHARE;
      IF NOT FOUND THEN

became this:

      PERFORM FROM app.users WHERE id = NEW.actor_user_id AND state <> 'deleted' FOR KEY SHARE;
      IF false THEN

Tests that failed:

- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > deletes an account's receipts before it becomes a shell, and keeps none for it after (T27)

### 57. T27 receipts deleted with the account: CAUGHT

In `db/migrations/0009_platform.sql`, this:

      IF EXISTS (SELECT FROM app.idempotency_receipts WHERE actor_user_id = NEW.id) THEN

became this:

      IF false AND EXISTS (SELECT FROM app.idempotency_receipts WHERE actor_user_id = NEW.id) THEN

Tests that failed:

- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > deletes an account's receipts before it becomes a shell, and keeps none for it after (T27)

### 58. T53 runner refuses COMMIT: CAUGHT

In `tools/ops/src/migrate.ts`, this:

    ["BEGIN", "COMMIT", "END",

became this:

    ["BEGIN", "END",

Tests that failed:

- transactionControl (T53: a migration never ends the runner's transaction) > finds every statement that would begin, end or split the transaction, in any case

### 59. T53 runner skips dollar-quoted bodies: CAUGHT

In `tools/ops/src/migrate.ts`, this:

    } else if (c === "$" && !word.test(text[i - 1] ?? "")) {

became this:

    } else if (false) {

Tests that failed:

- readMigrations > reads the repository's own migrations
- transactionControl (T53: a migration never ends the runner's transaction) > ignores those words in comments, strings, quoted names and function bodies

### 60. T53 runner refuses BEGIN in a file: CAUGHT

In `tools/ops/src/migrate.ts`, this:

        if (control) {
          throw new Error(

became this:

        if (false) {
          throw new Error(

Tests that failed:

- readMigrations > refuses a file that begins, ends or splits its own transaction
- the runner (T57) > refuses a migration with its own BEGIN and COMMIT before running any of it (T53)

### 61. T53 runner's transaction backstop: CAUGHT

In `tools/ops/src/migrate.ts`, this:

      if (!before || after?.xid !== before.xid) {

became this:

      if (false) {

Tests that failed:

- the runner (T57) > fails loudly if a file it runs ends its transaction, which readMigrations refuses first
- the runner (T57) > rolls back a migration that fails part way, with nothing of it left
- the runner (T57) > rolls back a migration that names a table without its schema

### 62. T53 check reads column grants: CAUGHT

In `tools/ops/src/migrate.ts`, this:

         WHERE att.attrelid = relations.oid AND att.attnum > 0 AND NOT att.attisdropped

became this:

         WHERE att.attrelid = relations.oid AND att.attnum > 1000 AND NOT att.attisdropped

Tests that failed:

- T53: the runner's check finds whatever would open the schema > a grant on a column, which a grant on the table doesn't show (review finding privacy 3 of PR #17)

### 63. T53 check reads type grants: CAUGHT

In `tools/ops/src/migrate.ts`, this:

         WHERE a.grantee NOT IN (types.typowner, app.nspowner)

became this:

         WHERE a.grantee NOT IN (types.typowner, app.nspowner) AND false

Tests that failed:

- T53: the runner's check finds whatever would open the schema > a grant on a type or domain
- T53: the runner's check finds whatever would open the schema > an object another role owns

### 64. T53 check reads type owners: CAUGHT

In `tools/ops/src/migrate.ts`, this:

          FROM types, app WHERE typowner <> app.nspowner

became this:

          FROM types, app WHERE typowner <> app.nspowner AND false

Tests that failed:

- T53: the runner's check finds whatever would open the schema > an object another role owns

### 65. T53 check reads default privileges: CAUGHT

In `tools/ops/src/migrate.ts`, this:

           AND a.grantee <> d.defaclrole

became this:

           AND a.grantee <> d.defaclrole AND false

Tests that failed:

- T53: the runner's check finds whatever would open the schema > a default privilege that would grant what the owner makes later

## Run 4: the first 38 again, two of run 3's redone, and every TRUNCATE guard

### 1. T8 late audience row: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

      IF sealed_at IS NOT NULL THEN

became this:

      IF false THEN

Tests that failed:

- T8: the audience is sealed at the commit > refuses a late audience row even in the transaction that sealed it
- T8: the audience is sealed at the commit > refuses a late audience row once the drop is sealed, for a member who joined after the commit

### 2. T8 audience leaves out a member: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

      IF EXISTS (SELECT FROM app.memberships m
    

became this:

      IF false AND EXISTS (SELECT FROM app.memberships m
    

Tests that failed:

- T8: a commit that leaves the audience incomplete or unsealed doesn't commit > refuses an audience that leaves out an active member

### 3. T8 audience of ended member: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

      PERFORM FROM app.memberships WHERE interval_id = NEW.interval_id AND state = 'active' FOR SHARE;

became this:

      PERFORM FROM app.memberships WHERE interval_id = NEW.interval_id FOR SHARE;

Tests that failed:

- T8: the audience is sealed at the commit > refuses a member whose interval has ended

### 4. T3 commit after reveal: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

    OR NEW.submitted_at >= reveal THEN

became this:

    THEN

Tests that failed:

- T3: the reveal is the cutoff > refuses a commit at the reveal

### 5. T3 frozen content: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

      IF NEW.state IN ('active', 'held') AND NEW.updated_at >= reveal
    

became this:

      IF false AND NEW.state IN ('active', 'held') AND NEW.updated_at >= reveal
    

Tests that failed:

- T3: the reveal is the cutoff > lets a caption change before the reveal, and freezes it from the reveal on

### 6. T29 held never late: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

      IF OLD.state = 'held' AND NEW.state = 'active' AND NEW.updated_at >= reveal THEN

became this:

      IF false THEN

Tests that failed:

- T29: a drop on hold at the reveal never appears afterwards > releases a hold before the reveal, and refuses it from the reveal on

### 7. T24 ended drop only loses content: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

      ELSIF OLD.state IN ('withdrawn', 'removed') THEN
        -- Withdrawn and removed are final; the purge only takes the content away (T23, T24).
        IF (NEW.state

became this:

      ELSIF OLD.state IN ('withdrawn', 'removed') THEN
        -- Withdrawn and removed are final; the purge only takes the content away (T23, T24).
        IF false AND (NEW.state

Tests that failed:

- T23 to T25: a removal is one audited record, and the drop's state agrees with it > lets a withdrawn drop lose its content and nothing else

### 8. T22 highlight active, before reveal: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

        IF drop_state <> 'active' OR NEW.updated_at >= app.drop_reveal_at(NEW.drop_id) THEN

became this:

        IF false THEN

Tests that failed:

- T22: a highlight points to the contributor's own active drop, before the reveal > refuses another member's drop, a held drop, and any pointer from the reveal on

### 9. T22 removal clears highlight: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

      IF EXISTS (SELECT FROM app.highlights WHERE drop_id = NEW.id) THEN

became this:

      IF false THEN

Tests that failed:

- T22: a highlight points to the contributor's own active drop, before the reveal > refuses a withdrawal that leaves the highlight on the drop

### 10. T22 highlight version: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

        IF NEW.version <> OLD.version + 1 THEN

became this:

        IF false THEN

Tests that failed:

- T22: a highlight points to the contributor's own active drop, before the reveal > sets, moves and clears it, moving its version by one each time

### 11. T17 six: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

      CHECK (committed_total + reserved_total <= 6),

became this:

      CHECK (committed_total + reserved_total <= 7),

Tests that failed:

- T17: six and two, as a last guard behind the counter's lock > refuses a seventh drop or a third link in the counter

### 12. T18 reservation past reveal: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

     OR NEW.expires_at > reveal THEN

became this:

     THEN

Tests that failed:

- T3: the reveal is the cutoff > refuses a reservation made at the reveal or lasting past it (T18)

### 13. T21 duplicate: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

    CREATE UNIQUE INDEX drops_no_duplicate ON app.drops (occurrence_id, author_interval_id, dedupe_key)

became this:

    CREATE UNIQUE INDEX drops_no_duplicate ON app.drops (occurrence_id, author_interval_id, dedupe_key, id)

Tests that failed:

- T21: the same photo or link once per author and day > refuses a second live drop with the same scoped hash, and allows another author's

### 14. spec 33 upload born pending: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

        IF NEW.state <> 'pending' THEN

became this:

        IF false THEN

Tests that failed:

- T12 and T40: uploads and links keep nothing they shouldn't > starts an upload pending and never takes it back

### 15. T6 right star: CAUGHT

In `db/migrations/0005_schedules_and_days.sql`, this:

                        AND star_interval_id = NEW.star_interval_id
    

became this:

    
    

Tests that failed:

- T6 and FQ61: a day for the right star, from the week in force > refuses a day for a star whose weekday it isn't

### 16. FQ61 version in force: CAUGHT

In `db/migrations/0005_schedules_and_days.sql`, this:

      IF version.effective_from > NEW.local_date
         OR EXISTS

became this:

      IF version.effective_from > NEW.local_date
         OR false AND EXISTS

Tests that failed:

- T6 and FQ61: a day for the right star, from the week in force > refuses a day from a week that isn't in force on its date

### 17. FQ61 new version moves a day: CAUGHT

In `db/migrations/0005_schedules_and_days.sql`, this:

      IF EXISTS (SELECT FROM app.occurrences WHERE club_id = NEW.club_id AND local_date >= NEW.effective_from) THEN

became this:

      IF false THEN

Tests that failed:

- T6 and FQ61: a day for the right star, from the week in force > refuses a new week that would move a day already announced

### 18. FQ63 no day for a leaver: CAUGHT

In `db/migrations/0005_schedules_and_days.sql`, this:

      IF NOT EXISTS (SELECT FROM app.memberships WHERE interval_id = NEW.star_interval_id AND state = 'active') THEN

became this:

      IF false THEN

Tests that failed:

- T6 and FQ61: a day for the right star, from the week in force > refuses a day for a star who has left (FQ63)

### 19. T9 status only denies: CAUGHT

In `db/migrations/0005_schedules_and_days.sql`, this:

              OR (OLD.status = 'suspended' AND NEW.status = 'cancelled')) THEN

became this:

              OR (OLD.status = 'suspended' AND NEW.status = 'cancelled') OR true) THEN

Tests that failed:

- T9: a day's status only denies it > suspends and cancels a day, and never brings a cancelled one back

### 20. T7 join needs applied revision: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    AND club_id = NEW.club_id AND state = 'applied')

became this:

    AND club_id = NEW.club_id)

Tests that failed:

- T7: joining only by the exact roster accepted and approved > refuses Dan while a member hasn't approved, before it is applied, or as someone else

### 21. T7 one creator: CAUGHT

In `db/migrations/0003_people_and_clubs.sql`, this:

    CREATE UNIQUE INDEX memberships_one_creator ON app.memberships (club_id) WHERE origin = 'creator';

became this:

    CREATE INDEX memberships_one_creator ON app.memberships (club_id) WHERE origin = 'creator';

Tests that failed:

- T7: joining only by the exact roster accepted and approved > makes the creator's membership with the club, and no other without a roster

### 22. T33 version with state: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

      IF NEW.version <> OLD.version + (CASE WHEN NEW.state = OLD.state THEN 0 ELSE 1 END) THEN

became this:

      IF false THEN

Tests that failed:

- T33: a revision's version moves with its state, and only then > refuses a version moved by an approval, or a state change that doesn't move it

### 23. T7 sealed roster: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

      IF TG_OP = 'INSERT' AND TG_TABLE_NAME <> 'roster_approvals' AND revision.roster_sealed_at IS NOT NULL THEN

became this:

      IF false THEN

Tests that failed:

- T7: an exact roster, sealed when it is made > refuses a member or a candidate added to a sealed revision

### 24. A01 six members: CAUGHT

In `db/migrations/0003_people_and_clubs.sql`, this:

        IF active >= 6 THEN

became this:

        IF active >= 7 THEN

Tests that failed:

- A01 and TECH-DESIGN section 6: the roster's limits > holds at most six active members

### 25. T25 removal state matches: CAUGHT

In `db/migrations/0008_safety.sql`, this:

      IF drop_state IS DISTINCT FROM (CASE

became this:

      IF false AND drop_state IS DISTINCT FROM (CASE

Tests that failed:

- T23 to T25: a removal is one audited record, and the drop's state agrees with it > refuses a drop withdrawn without a removal, or in a state its reason doesn't give

### 26. T25 pictured after reveal: CAUGHT

In `db/migrations/0008_safety.sql`, this:

    
                                      OR NEW.removed_at < app.drop_reveal_at(d.id)) THEN

became this:

    ) THEN

Tests that failed:

- T23 to T25: a removal is one audited record, and the drop's state agrees with it > refuses a pictured removal by the author, before the reveal, or of a link

### 27. spec 22 own report: CAUGHT

In `db/migrations/0008_safety.sql`, this:

      IF target_author = NEW.reporter_interval_id THEN

became this:

      IF false THEN

Tests that failed:

- spec 22 and FQ27: reports, cases and the operator's audit trail > refuses a report on one's own drop, and keeps one open case per target

### 28. D07 after reveal: CAUGHT

In `db/migrations/0007_after_the_reveal.sql`, this:

      IF written_at < app.drop_reveal_at(NEW.drop_id) THEN

became this:

      IF false THEN

Tests that failed:

- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > refuses each before the reveal

### 29. spec 16 own reaction: CAUGHT

In `db/migrations/0007_after_the_reveal.sql`, this:

        IF EXISTS (SELECT FROM app.drops WHERE id = NEW.drop_id AND author_interval_id = NEW.interval_id) THEN

became this:

        IF false THEN

Tests that failed:

- D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience > refuses a reaction to one's own drop, and anyone outside the audience

### 30. T19 receipt commits completed: CAUGHT

In `db/migrations/0009_platform.sql`, this:

                    AND idempotency_key = NEW.idempotency_key AND state = 'pending') THEN

became this:

                    AND idempotency_key = NEW.idempotency_key AND false) THEN

Tests that failed:

- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > refuses a receipt left pending at the commit

### 31. T19 completed immutable: CAUGHT

In `db/migrations/0009_platform.sql`, this:

      IF OLD.state = 'completed' AND NEW IS DISTINCT FROM OLD THEN

became this:

      IF false THEN

Tests that failed:

- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > never changes a completed receipt, nor the hash of a pending one

### 32. T19 one receipt per key: CAUGHT

In `db/migrations/0009_platform.sql`, this:

      PRIMARY KEY (actor_user_id, operation, idempotency_key),

became this:

      PRIMARY KEY (actor_user_id, operation, idempotency_key, request_hash),

Tests that failed:

- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > replays the same removal, and refuses the key on another drop or with another reason

### 33. T52 no caption in receipts/outbox: CAUGHT

In `db/migrations/0009_platform.sql`, this:

    "caption|text|body|note|url|href|link|token|preview|message|secret|signed" flag "i"

became this:

    "^$" flag "i"

Tests that failed:

- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > stores no caption, comment, note, link or token in a response, under any key
- T52 and T54: the outbox carries ids, never content, and a retry happens once > refuses a payload with a caption or a link, an error that isn't a code, and a second event per key

### 34. FQ27 audit append-only: CAUGHT

In `db/migrations/0008_safety.sql`, this:

    CREATE TRIGGER operator_actions_append_only BEFORE UPDATE OR DELETE ON app.operator_actions

became this:

    CREATE TRIGGER operator_actions_append_only BEFORE UPDATE ON app.operator_actions

Tests that failed:

- rows kept for good can't be truncated > gives every table that refuses a DELETE a trigger that refuses TRUNCATE
- spec 22 and FQ27: reports, cases and the operator's audit trail > keeps the operator's actions append-only, with a label and never an address

### 35. T7 join needs every approval: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

         OR EXISTS (SELECT FROM app.roster_revision_members m
    

became this:

         OR false AND EXISTS (SELECT FROM app.roster_revision_members m
    

Note: caught after the test was added; MISSED in the full run before it.

Tests that failed:

- T7: joining only by the exact roster accepted and approved > refuses a join through a roster someone on it left before approving, though everyone still here approved (T7)

### 36. T25 removal written once (update): CAUGHT

In `db/migrations/0008_safety.sql`, this:

    CREATE TRIGGER drop_removals_written_once BEFORE UPDATE OR DELETE ON app.drop_removals
      FOR EACH ROW

became this:

    CREATE TRIGGER drop_removals_written_once BEFORE DELETE ON app.drop_removals
      FOR EACH ROW

Tests that failed:

- T23 to T25: a removal is one audited record, and the drop's state agrees with it > lets only the author withdraw, and never changes a removal

### 37. T25 removal written once (delete): CAUGHT

In `db/migrations/0008_safety.sql`, this:

    CREATE TRIGGER drop_removals_written_once BEFORE UPDATE OR DELETE ON app.drop_removals
      FOR EACH ROW

became this:

    CREATE TRIGGER drop_removals_written_once BEFORE UPDATE ON app.drop_removals
      FOR EACH ROW

Tests that failed:

- T23 to T25: a removal is one audited record, and the drop's state agrees with it > lets only the author withdraw, and never changes a removal
- rows kept for good can't be truncated > gives every table that refuses a DELETE a trigger that refuses TRUNCATE

### 38. T28 tombstone never deleted: CAUGHT

In `db/migrations/0008_safety.sql`, this:

    CREATE TRIGGER deletion_tombstones_no_delete BEFORE DELETE ON app.deletion_tombstones
      FOR EACH ROW

became this:

    CREATE TRIGGER deletion_tombstones_no_delete BEFORE DELETE ON app.deletion_tombstones
      FOR EACH ROW WHEN (false)

Tests that failed:

- T28: the deletion record > records a deletion once, sets only its mirror time once, and is never deleted

### 39. T52 a flag is no content (redone): CAUGHT

In `db/migrations/0009_platform.sql`, this:

                && (@.value.type() == "string" || @.value.type() == "object" || @.value.type() == "array"))')

became this:

                && exists(@.value))')

Tests that failed:

- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > stores ids, states, flags and people's names, whatever a name holds

### 40. T52 a name may hold anything (redone): CAUGHT

In `db/migrations/0009_platform.sql`, this:

                && !(@.key like_regex "^(display_name|name|club_name|inviter_name|label)$"))')

became this:

                && exists(@.value))')

Tests that failed:

- T19: the same key is the same request, or IDEMPOTENCY_CONFLICT > stores ids, states, flags and people's names, whatever a name holds

### 41. clubs truncate refused only when (false): CAUGHT

In `db/migrations/0003_people_and_clubs.sql`, this:

    CREATE TRIGGER clubs_no_truncate BEFORE TRUNCATE ON app.clubs
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER clubs_no_truncate BEFORE TRUNCATE ON app.clubs
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 42. memberships truncate refused only when (false): CAUGHT

In `db/migrations/0003_people_and_clubs.sql`, this:

    CREATE TRIGGER memberships_no_truncate BEFORE TRUNCATE ON app.memberships
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER memberships_no_truncate BEFORE TRUNCATE ON app.memberships
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 43. candidates truncate refused only when (false): CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    CREATE TRIGGER candidates_no_truncate BEFORE TRUNCATE ON app.candidates
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER candidates_no_truncate BEFORE TRUNCATE ON app.candidates
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 44. roster_revisions truncate refused only when (false): CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    CREATE TRIGGER roster_revisions_no_truncate BEFORE TRUNCATE ON app.roster_revisions
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER roster_revisions_no_truncate BEFORE TRUNCATE ON app.roster_revisions
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 45. invitations truncate refused only when (false): CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    CREATE TRIGGER invitations_no_truncate BEFORE TRUNCATE ON app.invitations
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER invitations_no_truncate BEFORE TRUNCATE ON app.invitations
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 46. roster_approvals truncate refused only when (false): CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    CREATE TRIGGER roster_approvals_no_truncate BEFORE TRUNCATE ON app.roster_approvals
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER roster_approvals_no_truncate BEFORE TRUNCATE ON app.roster_approvals
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses TRUNCATE on each such table that no foreign key references, by its own trigger
- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 47. roster_revision_members truncate refused only when (false): CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    CREATE TRIGGER roster_revision_members_no_truncate BEFORE TRUNCATE ON app.roster_revision_members
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER roster_revision_members_no_truncate BEFORE TRUNCATE ON app.roster_revision_members
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 48. roster_revision_candidates truncate refused only when (false): CAUGHT

In `db/migrations/0004_rosters.sql`, this:

    CREATE TRIGGER roster_revision_candidates_no_truncate BEFORE TRUNCATE ON app.roster_revision_candidates
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER roster_revision_candidates_no_truncate BEFORE TRUNCATE ON app.roster_revision_candidates
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 49. schedule_versions truncate refused only when (false): CAUGHT

In `db/migrations/0005_schedules_and_days.sql`, this:

    CREATE TRIGGER schedule_versions_no_truncate BEFORE TRUNCATE ON app.schedule_versions
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER schedule_versions_no_truncate BEFORE TRUNCATE ON app.schedule_versions
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 50. schedule_assignments truncate refused only when (false): CAUGHT

In `db/migrations/0005_schedules_and_days.sql`, this:

    CREATE TRIGGER schedule_assignments_no_truncate BEFORE TRUNCATE ON app.schedule_assignments
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER schedule_assignments_no_truncate BEFORE TRUNCATE ON app.schedule_assignments
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses TRUNCATE on each such table that no foreign key references, by its own trigger
- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 51. occurrences truncate refused only when (false): CAUGHT

In `db/migrations/0005_schedules_and_days.sql`, this:

    CREATE TRIGGER occurrences_no_truncate BEFORE TRUNCATE ON app.occurrences
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER occurrences_no_truncate BEFORE TRUNCATE ON app.occurrences
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 52. drops truncate refused only when (false): CAUGHT

In `db/migrations/0006_contributions.sql`, this:

    CREATE TRIGGER drops_no_truncate BEFORE TRUNCATE ON app.drops
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER drops_no_truncate BEFORE TRUNCATE ON app.drops
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 53. drop_audience truncate refused only when (false): CAUGHT

In `db/migrations/0006_contributions.sql`, this:

    CREATE TRIGGER drop_audience_no_truncate BEFORE TRUNCATE ON app.drop_audience
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER drop_audience_no_truncate BEFORE TRUNCATE ON app.drop_audience
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- T8: the audience is sealed at the commit > never changes, deletes or truncates an audience row
- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 54. highlights truncate refused only when (false): CAUGHT

In `db/migrations/0006_contributions.sql`, this:

    CREATE TRIGGER highlights_no_truncate BEFORE TRUNCATE ON app.highlights
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER highlights_no_truncate BEFORE TRUNCATE ON app.highlights
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses TRUNCATE on each such table that no foreign key references, by its own trigger
- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 55. moderation_cases truncate refused only when (false): CAUGHT

In `db/migrations/0008_safety.sql`, this:

    CREATE TRIGGER moderation_cases_no_truncate BEFORE TRUNCATE ON app.moderation_cases
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER moderation_cases_no_truncate BEFORE TRUNCATE ON app.moderation_cases
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 56. operator_actions truncate refused only when (false): CAUGHT

In `db/migrations/0008_safety.sql`, this:

    CREATE TRIGGER operator_actions_no_truncate BEFORE TRUNCATE ON app.operator_actions
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER operator_actions_no_truncate BEFORE TRUNCATE ON app.operator_actions
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger
- spec 22 and FQ27: reports, cases and the operator's audit trail > keeps the operator's actions append-only, with a label and never an address

### 57. drop_removals truncate refused only when (false): CAUGHT

In `db/migrations/0008_safety.sql`, this:

    CREATE TRIGGER drop_removals_no_truncate BEFORE TRUNCATE ON app.drop_removals
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER drop_removals_no_truncate BEFORE TRUNCATE ON app.drop_removals
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses TRUNCATE on each such table that no foreign key references, by its own trigger
- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

### 58. deletion_tombstones truncate refused only when (false): CAUGHT

In `db/migrations/0008_safety.sql`, this:

    CREATE TRIGGER deletion_tombstones_no_truncate BEFORE TRUNCATE ON app.deletion_tombstones
      FOR EACH STATEMENT EXECUTE

became this:

    CREATE TRIGGER deletion_tombstones_no_truncate BEFORE TRUNCATE ON app.deletion_tombstones
      FOR EACH STATEMENT WHEN (false) EXECUTE

Tests that failed:

- rows kept for good can't be truncated > refuses TRUNCATE on each such table that no foreign key references, by its own trigger
- rows kept for good can't be truncated > refuses a cascading TRUNCATE on every such table, by the table's own trigger

