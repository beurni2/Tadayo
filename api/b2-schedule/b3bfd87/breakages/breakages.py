"""Deliberate breakages of B2's schedule slice (api/b2-schedule), one change each, in a scratch worktree.

For each: change the one place, run the suite registered for it, and check that a test whose name begins
with the pre-registered words fails. The file is restored after each. A migration's breakage runs on a
freshly made cluster, and the cluster is remade once more after the last of them. Run it in the
background; nothing else may use the local database meanwhile.

  breakages.py --check        count every anchor, change nothing
  breakages.py B07 B21 ...    only these
"""

import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path("/home/user/tadayo-b2s-mut")
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(SP) / "b2s/brk/out"
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
S = "packages/domain/src/schedule/"
MIG = "db/migrations/0012_schedule_proposals.sql"
ROUTES = "services/api/src/schedule/routes.ts"

# suite: (directory, command)
SUITES = {
    "rules": ("packages/domain", ["npx", "vitest", "run", "src/schedule"]),
    "api": ("services/api", ["npx", "vitest", "run", "src/schedule"]),
    "proposals": ("tests", ["npx", "vitest", "run", "--config", "vitest.db.config.ts", "src/db/schedule-proposals.test.ts"]),
    # The database tests' own setup (tests/src/db/global-setup.ts), run alone so that what it refuses is printed:
    # vitest 5 hides a failing global setup behind "No test files found".
    "migrate": ("tests", ["node", "migrate-once.mts"]),
    "commands": ("tests", ["npx", "vitest", "run", "--config", "vitest.db.config.ts", "src/db/schedule-commands.test.ts"]),
    "matrix": ("tests", ["npx", "vitest", "run", "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts",
                         "-t", "answers the (author|star|member who joined)"]),
}

# Changes shown to change no answer (the README says why).
EQUIVALENT = {"B74"}

# (name, file, old, new, suite, the words a failing test's name must begin with)
B = [
    # The pure rules.
    ("B01 three members get one day each", S + "propose.ts", "return memberCount <= 3 ? 2 : 1;", "return memberCount <= 2 ? 2 : 1;",
     "rules", "gives two days each to two or three members and one to four, five or six"),
    ("B02 the second day two on, not three", S + "propose.ts", "WEEKDAYS[member + nth * 3]", "WEEKDAYS[member + nth * 2]",
     "rules", "proposes spec 05's example week for three members"),
    ("B03 exactly 24 hours isn't enough", S + "first-date.ts", ".epochNanoseconds >= earliest) return date;", ".epochNanoseconds > earliest) return date;",
     "rules", "opens on a date whose 7 AM is exactly 24 hours after the confirmation"),
    ("B04 23 hours are enough", S + "first-date.ts", "const LEAD_NANOSECONDS = 24n * 3_600_000_000_000n;", "const LEAD_NANOSECONDS = 23n * 3_600_000_000_000n;",
     "rules", "waits a week when the 7 AM is one second, or one nanosecond, short of 24 hours"),
    ("B05 a member who confirmed sees who holds a day", S + "view.ts",
     "...(other === undefined || viewer.confirmed ? {} : { heldBy: other.id }),", "...(other === undefined ? {} : { heldBy: other.id }),",
     "rules", "holds in every world, for every viewer"),
    ("B06 a contested day names a holder to someone outside it", S + "view.ts",
     'if (holders.length >= 2) return { weekday, state: "no_reveal", suggested };', 'if (holders.length >= 99) return { weekday, state: "no_reveal", suggested };',
     "rules", "G04-contested-other: Sam sees Friday contested, with no names and no count"),
    ("B07 anyone sees a contest's holders", S + "view.ts",
     "if (holders.some((member) => member.id === viewer.id)) {", "if (holders.length > 0) {",
     "rules", "G04-contested-other: Sam sees Friday contested, with no names and no count"),
    ("B08 a day whose owner left keeps its date", S + "view.ts",
     "const date = confirmer.active ? facts.firstDates[weekday] : undefined;", "const date = facts.firstDates[weekday];",
     "rules", "a member who left holds nothing; a day they confirmed stays taken by them, with no date (FQ102)"),
    ("B09 a member who left still holds", S + "view.ts",
     "return member.active && !member.confirmed && member.held.includes(weekday);", "return !member.confirmed && member.held.includes(weekday);",
     "rules", "a member who left holds nothing; a day they confirmed stays taken by them, with no date (FQ102)"),
    ("B10 a member who left gets a view", S + "view.ts",
     "if (viewer === undefined || !viewer.active) {\n    throw new Error(\"schedule: the proposal doesn't include the viewer",
     "if (viewer === undefined) {\n    throw new Error(\"schedule: the proposal doesn't include the viewer",
     "rules", "answers only a member the proposal includes who is still active (FQ100; T14)"),
    ("B11 a choice after confirming", S + "decide.ts",
     '  // After confirming, nothing is chosen again (FQ57).\n  if (caller.confirmed) return "NOT_ALLOWED";', "",
     "rules", "refuses any choice after the caller confirmed, their own day too (FQ57)"),
    ("B12 more days than a member has", S + "decide.ts",
     'if (held.length > facts.daysPerMember) return "NOT_ALLOWED";', "",
     "rules", "refuses more days than days_per_member"),
    ("B13 a choice of a confirmed day", S + "decide.ts",
     'if (held.some((weekday) => confirmerOf(facts, weekday) !== undefined)) return "NOT_ALLOWED";', "",
     "rules", "refuses a day another member has confirmed (G04.error.chooseTaken)"),
    ("B14 a contested day confirmed", S + "decide.ts",
     'if (holdersOf(facts, weekday).some((member) => member.id !== caller.id)) return "NOT_ALLOWED";', "",
     "rules", "refuses a day another member holds too, even by proposal alone (FQ55; G04-confirm-refused)"),
    ("B15 one day of two confirmed", S + "decide.ts",
     'if (days.length !== facts.daysPerMember) return "NOT_ALLOWED";', "",
     "rules", "refuses fewer days than days_per_member, held and named alike"),
    ("B16 other days confirmed than the caller holds", S + "decide.ts",
     'if (held.length !== days.length || held.some((weekday, index) => weekday !== days[index])) return "NOT_ALLOWED";', "",
     "rules", "refuses days that aren't exactly what the caller holds: the caller saw another choice"),
    ("B17 the first days wait for a member who left", S + "decide.ts",
     "const active = facts.members.filter((member) => member.active);", "const active = facts.members;",
     "rules", "doesn't wait for a member who left, and never applies with nobody left to have confirmed"),
    ("B18 the first days apply with nobody left", S + "decide.ts",
     "return active.length > 0 && active.every(", "return active.every(",
     "rules", "doesn't wait for a member who left, and never applies with nobody left to have confirmed"),
    # The migration.
    ("B20 two open proposals in a club", MIG,
     "CREATE UNIQUE INDEX schedule_proposals_one_open", "CREATE INDEX schedule_proposals_one_open",
     "proposals", "is the club's only open one"),
    ("B21 an ended proposal changes", MIG,
     "IF OLD.state <> 'open' AND NEW IS DISTINCT FROM OLD THEN", "IF false THEN",
     "proposals", "ends once, with its closing time and the next version, and never changes after (T33)"),
    ("B22 a state moves without its version", MIG,
     "IF NEW.state <> OLD.state AND NEW.version <> OLD.version + 1 THEN", "IF false THEN",
     "proposals", "ends once, with its closing time and the next version, and never changes after (T33)"),
    ("B23 first days with no week", MIG,
     "  CHECK (reason <> 'activation' OR schedule_version_id IS NOT NULL),\n", "",
     "proposals", "names the week its confirmed days join when it is the first days'"),
    ("B24 three days per member", MIG,
     "CHECK (days_per_member IN (1, 2))", "CHECK (days_per_member IN (1, 2, 3))",
     "proposals", "takes one or two days per member, and a week of its own club"),
    ("B25 a proposal's reason changes", MIG,
     "'id', 'club_id', 'reason', 'effective_from', 'schedule_version_id', 'created_at');", "'id', 'club_id', 'effective_from', 'schedule_version_id', 'created_at');",
     "proposals", "keeps its club, reason, start, week and making time, and is never deleted"),
    ("B26 a successor on a proposal that wasn't replaced", MIG,
     "CHECK (replaced_by IS NULL OR (state = 'superseded' AND replaced_by <> id))", "CHECK (replaced_by IS NULL OR replaced_by <> id)",
     "proposals", "names its successor only when it was replaced"),
    ("B27 a confirmation taken back", MIG,
     "app.set_once('confirmed_at')", "app.keep_columns('proposal_id')",
     "proposals", "start unconfirmed, confirm once, and never take it back (FQ57)"),
    ("B28 a member joins a closed proposal", MIG,
     "IF proposal_state IS DISTINCT FROM 'open' THEN", "IF false THEN",
     "proposals", "join and confirm only while the proposal is open"),
    ("B29 a row neither proposed nor held", MIG,
     "CHECK (suggested OR held)", "CHECK (true)",
     "proposals", "are never Sunday, and each row is proposed, held or both"),
    ("B30 a day more than a member has", MIG,
     "IF holds > most THEN", "IF holds > most + 1 THEN",
     "proposals", "are at most days_per_member for each member, counted at commit"),
    ("B31 a proposed day deleted", MIG,
     "IF OLD.suggested THEN", "IF false THEN",
     "proposals", "keep what was proposed: a proposed day is set aside, never deleted or made unproposed"),
    ("B32 a hold on a confirmed day", MIG,
     "IF NEW.held AND (TG_OP = 'INSERT' OR NOT OLD.held)", "IF false AND NEW.held AND (TG_OP = 'INSERT' OR NOT OLD.held)",
     "proposals", "never take a day another member has confirmed (FQ48: only a confirmed day is taken)"),
    ("B33 a hold changes after its member confirmed", MIG,
     "WHERE proposal_id = the_proposal AND interval_id = the_interval AND confirmed_at IS NOT NULL) THEN",
     "WHERE proposal_id = the_proposal AND interval_id = the_interval AND false) THEN",
     "proposals", "don't change once their member has confirmed (FQ57), or once the proposal has ended"),
    ("B34 a hold changes after the proposal ended", MIG,
     "IF proposal.state IS DISTINCT FROM 'open' THEN", "IF false THEN",
     "proposals", "don't change once their member has confirmed (FQ57), or once the proposal has ended"),
    ("B35 a contested day confirmed in the rows", MIG,
     "IF FOUND THEN", "IF false THEN",
     "proposals", "is refused while another member holds the day too, by choice or by proposal alone (FQ55)"),
    ("B36 one day of two confirmed in the rows", MIG,
     "IF pg_catalog.cardinality(held_days) <> proposal.days_per_member THEN", "IF false THEN",
     "proposals", "is refused for one day of two: both are confirmed at once (FQ99)"),
    ("B37 a confirmation without its days in the week", MIG,
     "IF written <> held_days THEN", "IF false THEN",
     "proposals", "is refused without its days in the week, or with another day there than the member holds"),
    ("B38 a member who left blocks a confirmation", MIG,
     "     AND (m.confirmed_at IS NOT NULL OR ms.state = 'active')\n", "",
     "proposals", "isn't blocked by a member who has left: they hold nothing (FQ102)"),
    ("B39 a hold doesn't wait for a confirmation", MIG,
     "SELECT * INTO proposal FROM app.schedule_proposals WHERE id = the_proposal FOR SHARE;",
     "SELECT * INTO proposal FROM app.schedule_proposals WHERE id = the_proposal;",
     "proposals", "refuses the hold that waited for the confirmation: the day is taken"),
    ("B40 a confirmation doesn't wait for a hold", MIG,
     "WHERE id = NEW.proposal_id FOR UPDATE;", "WHERE id = NEW.proposal_id;",
     "proposals", "refuses the confirmation that waited for the hold: another member holds the day too"),
    ("B41 a table without row-level security", MIG,
     "ALTER TABLE app.schedule_proposal_days ENABLE ROW LEVEL SECURITY;\n", "",
     "migrate", "migrate refused: migrate: "),
    # The commands and the read.
    ("B42 no lock on the club's row", S + "command.ts",
     "  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;", "  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${clubId}`;",
     "commands", "lets a choice and a confirmation of the same day race: exactly one stands"),
    ("B43 the clock sampled before the lock", S + "command.ts",
     "  const at = await clock.sample(tx);\n\n", "  const at = EARLY;\n\n",
     "commands", "takes the confirmation's instant after the club's lock, not when the request began (T1; T3's order)"),
    ("B44 the version judged before the replacement", S + "command.ts",
     "  if (proposal.replacedBy !== null) throw",
     '  if (proposal.version !== input.expectedVersion) throw new Refused("VERSION_CONFLICT", { current_version: proposal.version });\n  if (proposal.replacedBy !== null) throw',
     "commands", "answers a choice MEMBERSHIP_CHANGED with the newer proposal's id before it looks at the version or the days"),
    ("B45 the last confirmation doesn't apply", S + "confirm-days.ts",
     "if (everyoneConfirmed(now)) {", "if (false as boolean) {",
     "commands", "applies the first days of a club of"),
    ("B46 a late joiner gets the proposal", S + "read.ts",
     "week.proposal !== null && included ?", "week.proposal !== null ?",
     "commands", "gives a member who joined after the first days were opened the schedule in force alone, never the proposal (FQ100)"),
    ("B47 a suspended club's member counts", "packages/domain/src/authorization/member.ts",
     " AND c.suspended_at IS NULL", "",
     "commands", "gives a stranger, a former member, an account being deleted, a suspended club and a guessed id the same nothing"),
    ("B48 an account being deleted counts", "packages/domain/src/authorization/member.ts",
     " AND u.state = 'active'", "",
     "commands", "gives a stranger, a former member, an account being deleted, a suspended club and a guessed id the same nothing"),
    ("B49 a former member counts", "packages/domain/src/authorization/member.ts",
     "AND m.state = 'active' AND u.state", "AND u.state",
     "commands", "gives a stranger, a former member, an account being deleted, a suspended club and a guessed id the same nothing"),
    ("B50 another request under a used key replays", "packages/domain/src/idempotency/receipt.ts",
     'if (replayOutcome(receipt["request_hash"], request) !== "replay") throw new Refused("IDEMPOTENCY_CONFLICT");', "",
     "commands", "refuses another request under a used key with IDEMPOTENCY_CONFLICT"),
    ("B51 a closed proposal takes a change", S + "command.ts",
     '  if (proposal.state !== "open") throw new Refused("NOT_ALLOWED");', "",
     "commands", "answers a choice of first days that ended with no successor NOT_ALLOWED"),
    ("B52 a member the proposal doesn't include reaches the rule", S + "command.ts",
     '  if (!proposal.facts.members.some((member) => member.id === callerId)) throw new Refused("NOT_FOUND");', "",
     "matrix", "answers the member who joined after the commit (T8) as its account"),
    ("B54 the first date in UTC, not the club's zone", S + "open.ts",
     "at.toZonedDateTimeISO(clubTimeZone(timezone))", 'at.toZonedDateTimeISO("UTC")',
     "commands", "takes the club's first local date from the server clock's sample in the club's zone (T1, T2)"),
    ("B55 the proposed week not in the order the members joined", S + "open.ts",
     'ORDER BY joined_at, interval_id COLLATE "C"`;', 'ORDER BY interval_id COLLATE "C"`;',
     "commands", "proposes spec 05's week to a club of"),
    ("B56 a member who left is given days", S + "open.ts",
     "WHERE club_id = ${clubId} AND state = 'active' ORDER BY", "WHERE club_id = ${clubId} ORDER BY",
     "commands", "leaves out a member who has left before the opening, and counts the club by who is still in it"),
    ("B57 the first days opened twice", S + "open.ts",
     'if (existing?.["scheduled"] !== false || existing["proposed"] !== false) {', "if (false as boolean) {",
     "commands", "opens them once: a second opening, a club of one and a club that isn't there are the caller's bugs"),
    ("B58 a choice of the same days writes again", S + "choose-days.ts",
     "      if (holds === wanted) continue;\n", "",
     "commands", "writes nothing for a choice of the days the caller already holds, and still answers"),
    ("B59 a confirmed day's first date in UTC", S + "confirm-days.ts",
     "firstDate(weekday, at, week.club.timezone)", 'firstDate(weekday, at, "UTC")',
     "commands", "counts a confirmed day's 24 hours to 7 AM in the club's zone, not in UTC (T2; FQ79)"),
    ("B61 the latest week, in force or not", S + "read.ts",
     "week.versions.filter((version) => version.effectiveFrom <= today).at(-1)", "week.versions.at(-1)",
     "matrix", "answers the author as its account"),
    ("B64 a contest's holders not in the order they joined", S + "week.ts",
     'ORDER BY s.joined_at, s.interval_id COLLATE "C"),', 'ORDER BY s.interval_id COLLATE "C" DESC),',
     "commands", "names a contest's holders in the order they joined, whatever the order of their ids"),
    ("B63 a contest's holders by their ids", S + "week.ts",
     'ORDER BY s.joined_at, s.interval_id COLLATE "C"),', 'ORDER BY s.interval_id COLLATE "C"),',
     "commands", "names a contest's holders in the order they joined, whatever the order of their ids"),
    ("B65 a member who left read as active", S + "week.ts",
     "'active', s.state = 'active',", "'active', true,",
     "commands", "frees the hold of a member who left, and shows a confirmed member who left by the name they left with"),
    ("B66 a former member keeps their live name", S + "week.ts",
     "'name', CASE WHEN s.state = 'active' THEN su.display_name ELSE s.ended_display_name END,", "'name', su.display_name,",
     "commands", "frees the hold of a member who left, and shows a confirmed member who left by the name they left with"),
    # The routes.
    ("B70 a slot always has held_by", ROUTES,
     "...(slot.heldBy === undefined ? {} : { held_by: personBody(slot.heldBy) }),", "held_by: slot.heldBy === undefined ? null : personBody(slot.heldBy),",
     "api", "gives a slot only the keys its view has: no person and no date where the view gave none"),
    ("B71 a person carries another field", ROUTES,
     "    display_name: person.displayName,\n", "    display_name: person.displayName,\n    name: person.displayName,\n",
     "api", "gives a person their interval, their name and their avatar's version when there is one, and nothing else"),
    ("B72 a proposal carries a count", ROUTES,
     "    state: proposal.state,\n", "    state: proposal.state,\n    members: proposal.slots.length,\n",
     "api", "gives a proposal the contract's nine fields, and never"),
    ("B73 any string is an Idempotency-Key", ROUTES,
     'if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {', 'if (typeof key !== "string") {',
     "api", "chooseScheduleDays names the Idempotency-Key when it is missing or isn't a UUID, whatever else is wrong"),
    ("B74 a bad request names a field the contract doesn't have", ROUTES,
     'if (typeof field === "string" && FIELDS.includes(field)) return field;', 'if (typeof field === "string") return field;',
     "api", "chooseScheduleDays names the first bad field in the contract's order, never a value, and reads no database for it"),
    ("B75 a megabyte of body", "services/api/src/app.ts",
     "  chooseScheduleDays: 1024,", "  chooseScheduleDays: 1048576,",
     "api", "chooseScheduleDays reads at most 1 KiB of body, which shuts no valid request out"),
    ("B76 a refusal isn't answered", ROUTES,
     "      if (error instanceof Refused) return refusal(reply, error);\n", "",
     "matrix", "answers the author as its account"),
    ("B77 the week read in a writing transaction", ROUTES,
     'deps.sql.begin("read only", async (tx) => {', "deps.sql.begin(async (tx) => {",
     "api", "reads in a read-only transaction, and answers what it made for the caller alone"),
    ("B78 the server's instant with its fraction", ROUTES,
     "server_now: contractInstant(now),", "server_now: now.toString(),",
     "api", "gives the server's instant in whole seconds, rounded down"),
    ("B79 a choice routed to the confirmation", "services/api/src/app.ts",
     "chooseScheduleDays: chooseScheduleDaysHandler(deps),", "chooseScheduleDays: confirmScheduleDaysHandler(deps),",
     "matrix", "answers the author as its account"),
]


def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


def fresh():
    r = run(["bash", f"{SP}/s4/pgci.sh"])
    if r.returncode != 0:
        return "cluster failed: " + r.stderr[-300:]
    r = run(["python3", "tools/ci/ci_steps.py", "db-bootstrap"])
    return None if r.returncode == 0 else "bootstrap failed"


def edit(name, text, old, new):
    changed = text.replace(old, new)
    if name.startswith("B43"):
        first = "  const first = await reserveReceipt(tx, receipt, await clock.sample(tx));"
        assert changed.count(first) == 1
        changed = changed.replace(first, "  const EARLY = await clock.sample(tx);\n  const first = await reserveReceipt(tx, receipt, EARLY);")
    return changed


def main():
    args = sys.argv[1:]
    if args == ["--check"]:
        bad = 0
        for name, path, old, new, suite, prefix in B:
            count = (ROOT / path).read_text().count(old)
            if count != 1 or suite not in SUITES or old == new:
                bad += 1
                print("BAD", name, count)
        print(len(B), "entries,", bad, "bad")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    dirty = False
    for name, path, old, new, suite, prefix in B:
        code = name.split()[0]
        if args and code not in args:
            continue
        p = ROOT / path
        orig = p.read_text()
        assert orig.count(old) == 1, (name, orig.count(old))
        migration = path == MIG
        try:
            p.write_text(edit(name, orig, old, new))
            (OUT / f"{code}.patch").write_text(run(["git", "diff"]).stdout)
            if migration or dirty:
                trouble = fresh()
                dirty = migration
                if trouble:
                    print(f"== {name}: {trouble}", flush=True)
                    continue
            cwd, cmd = SUITES[suite]
            r = run(cmd, cwd=ROOT / cwd)
            out = r.stdout + r.stderr
            (OUT / f"{code}.txt").write_text(out)
            failed = sorted({l.strip()[2:].strip()[:170] for l in out.splitlines() if l.strip().startswith("×")})
            summary = [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")]
            caught = any(f.startswith(prefix[:105]) for f in failed)
            verdict = "CAUGHT" if caught else ("CAUGHT BY ANOTHER TEST" if failed else ("NO RESULT" if not summary else "NOT CAUGHT"))
            if verdict == "NOT CAUGHT" and code in EQUIVALENT:
                verdict = "NOT CAUGHT, AN EQUIVALENT CHANGE (README)"
            print(f"== {name} [{suite}]: {verdict}; exit {r.returncode} {summary}", flush=True)
            for f in failed[:6]:
                print("    ×", f, flush=True)
            if not summary:
                print("   ", out[-500:].replace("\n", "\n    "), flush=True)
        finally:
            p.write_text(orig)
    if dirty:
        print("cluster remade:", fresh() or "ok", flush=True)
    print("restored:", repr(run(["git", "status", "--short"]).stdout), flush=True)


if __name__ == "__main__":
    main()
