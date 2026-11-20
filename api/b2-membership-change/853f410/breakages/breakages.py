"""Deliberate breakages of the membership change's first PR (api/b2-membership-change), one change each,
in a scratch worktree.

For each: change the one place, run the suite registered for it, and check that a test whose name holds
the pre-registered words fails. The file is restored after each. A breakage of the migration makes the
local database again from the changed file first, and the database is made again from the true file
after the last of them. Nothing else may use the local database meanwhile.

  breakages.py --check        count every anchor, change nothing
  breakages.py C01 M02 ...    only these
"""

import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path("/home/user/tadayo-b2m-mut")
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(SP) / "b2m/brk/out"
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
RULE = "packages/domain/src/schedule/change.ts"
SETTLE = "packages/domain/src/schedule/settle-change.ts"
GEN = "packages/domain/src/schedule/generate.ts"
VIEW = "packages/domain/src/schedule/view.ts"
DECIDE = "packages/domain/src/schedule/decide.ts"
CONFIRM = "packages/domain/src/schedule/confirm-days.ts"
WEEK = "packages/domain/src/schedule/week.ts"
DAYS = "packages/domain/src/authorization/days.ts"
APPLY = "packages/domain/src/clubs/apply-roster.ts"
LEAVE = "packages/domain/src/clubs/leave-club.ts"
ROUTES = "services/api/src/schedule/routes.ts"
MIG = "db/migrations/0014_membership_change.sql"
JUDGE = "tests/src/privacy/schedule.ts"

PRIV = ["npx", "vitest", "run", "--config", "vitest.privacy.config.ts"]
DB = ["npx", "vitest", "run", "--config", "vitest.db.config.ts"]
SUITES = {
    "unit": ("packages/domain", ["npx", "vitest", "run", "src/schedule"]),
    "api": ("services/api", ["npx", "vitest", "run", "src/schedule"]),
    "db": ("tests", [*DB, "src/db/membership-change.test.ts"]),
    "fdr": ("tests", [*DB, "src/db/first-days-roster.test.ts"]),
    "home": ("tests", [*DB, "src/db/home-days.test.ts"]),
    "mig": ("tests", [*DB, "src/db/schedule-proposals.test.ts"]),
    "judge": ("tests", [*PRIV, "src/privacy/schedule.test.ts"]),
    "matrix": ("tests", [*PRIV, "src/privacy/matrix.test.ts", "-t", "a membership change through the app"]),
}

EQUIVALENT = {"C04"}

U_FIFTH = "keeps every member's day and gives a fifth member the table's day for their place, which is free"
U_FREE = "gives a new member the first free day from Monday when the day of their place is kept by someone"
U_LEFT = "frees the days of a member who left and moves nobody, where the table keeps the days each"
U_FOURTH = "proposes the table's whole week when a fourth member joins three: one day each (spec 05)"
U_THREE = "proposes the table's whole week when four become three: two days each (spec 05)"
U_TWO = "gives two who join at once different days, in the order they joined"
U_OPEN = "leaves the first days to their own rule while they are open"
U_NEVER = "proposes nothing for a club that never had a confirmed week"
U_SAME = "proposes nothing when the active members are the week's stars, each with the table's days"
U_LEAVER = "proposes a change for a join, a leave, and a leaver's day still in the week"
U_FEWER = "proposes a change when a member has fewer days than the table's, though the stars are the members"
U_REPLACE = "replaces an open change when the members it includes are no longer the club's (FQ126)"
U_ALREADY = "changes nothing when the open change already includes exactly the club's members"
U_DROP = "drops an open change when the club is back at the week's own members"
U_PAUSED = "drops an open change, and proposes none, with fewer than two members (FQ16)"
U_START = "is Monday 7 December 2026 seen from Friday 6 November, the contract's own example"
U_MADE = "is the Monday after the last day made when a day was made beyond the window"
U_KEEP = "keeps the start of the change it replaces while that start is still ahead (FQ126, FQ127)"
U_KEEPMADE = "takes a new start when a day was made on or after the replaced change's start"
U_SEES = "gives none to a member with no day in it: a new member, each of several, a late joiner"
U_NONE = "gives the table's days to members none of whom has a day in the week"
U_NOMORE = "makes nothing once a change's start is today or has passed, until the change ends (FQ127)"
U_PASSED = "takes a new start when the replaced change's start is today or has passed"
U_HOLD = "makes no day from the start of a change waiting to start, and every day before it (FQ127)"
U_VIEW = "gives the viewer their own day, and names for every other day the member it is proposed for"
U_FQ81 = "is the same for a viewer whoever else has confirmed, and changes only `myState` at their own (FQ81)"
U_EXACT = "refuses any other days: another member's, one of each, too few"
U_SECOND = "refuses a second confirmation, though the days are the caller's own"
A_SCENE = "makes each scene of a membership change, field for field, with the days announced until its start"
D_JOIN = "proposes one for a join in a club with a week: everyone keeps their days, the new member gets free ones"
D_LAST = "proposes one with the last confirmation of the first days, for a member who joined after a day was confirmed"
D_LEAVE = "frees a leaver's days and moves nobody, where the days each stay (three to two)"
D_NONE = "proposes nothing in a club that never had a confirmed week, and nothing while the first days are open"
D_CHAIN = "names the club's open change to an id replaced more than once, and treats it as ended once none is open (FQ126)"
D_REPLACE = "replaces an open change at the next join: the same start, everyone confirms again, and the old id answers"
D_DROP = "drops an open change when a leave brings the club back to its week, and its id then answers as an ended one"
D_HOLD = "makes no day from the change's start on, whatever the date, and every day before it as before"
D_BEYOND = "starts a change after a day already made beyond the window"
D_READ = "gives a member who stays their days, each other day with the member it is proposed for, and the days announced"
D_NEW = "gives the new member the same week and no announced days"
D_CONFIRM = "writes the member's confirmation at the clock's instant and nothing else: the same version, state and answer"
D_ORDER = "refuses, in the contract's order: VERSION_CONFLICT, then NOT_ALLOWED for other days, a choice and a second"
D_HELD = "names nobody on a day the change proposes for nobody, and leaves a leaver's made days out of the announced"
H_HELD = "holds a day whose star left a microsecond before its reveal, by leaving, a block or a deletion: never open"
H_AHEAD = "opens each day at its 7 AM exactly and closes it at its 1 AM exactly, and gives the next in date order"
G_START = "is proposed open, at version 1, in its one week, with no week of its own, from a Monday"
G_ONCE = "is proposed only once the club's first days have applied"
G_DAYS = "has its days written once, each proposed and held, a weekday for one member"
G_WEEK = "never has its week proposed again, or its days each changed"
G_APPLIED = "never ends applied before its start, even with every member confirmed"
J_NEW = "accepts a new change for the active members, and each start the dates give"
J_REFUSES = "refuses no change, a change for other members, a member moved, a weekday twice, a day not held and the wrong"
J_CHAIN = "keeps the contract's order: not found, MEMBERSHIP_CHANGED, the version, NOT_ALLOWED"
J_DROP = "wants an open change dropped, with no successor, when a leave brings the club back to its week"
J_REPL = "wants an open change for other members replaced by a new one that names it and keeps its start while that"
X_APP = "answers each caller the change as the rows say, takes a confirmation that moves nothing, and replaces the"

B = [
    # The rule (change.ts).
    ("R01 a member who stays loses their days", RULE, "    const days = [...(kept.get(id) ?? [])];", "    const days: Weekday[] = [];", "unit", U_FIFTH),
    ("R02 a new member takes the first free day, not the day of their place", RULE, "    for (const weekday of [...wanted, ...WEEKDAYS]) {", "    for (const weekday of WEEKDAYS) {", "unit", U_NONE),
    ("R03 a new member may take a day someone keeps", RULE, "      if (taken.has(weekday)) continue;\n", "", "unit", U_FREE),
    ("R04 two who join take the same day", RULE, "      taken.add(weekday);\n", "", "unit", U_TWO),
    ("R05 the table's whole week is never proposed", RULE, "  if (most !== 0 && most !== per) {", "  if (false) {", "unit", U_FOURTH),
    ("R06 the table's whole week is always proposed", RULE, "  if (most !== 0 && most !== per) {", "  if (most !== 0) {", "unit", U_FREE),
    ("R07 a change is proposed while the first days are open", RULE, "  if (facts.firstDaysOpen || week === null) return { kind: \"nothing\" };", "  if (week === null) return { kind: \"nothing\" };", "unit", U_OPEN),
    ("R08 a paused club is proposed a change", RULE, "  if (active.length < 2) return open === null ? { kind: \"nothing\" } : { kind: \"drop\" };\n", "", "unit", U_PAUSED),
    ("R09 a leaver's day in the week is no reason for a change", RULE, "    week.every((day) => active.includes(day.star)) &&\n", "", "unit", U_LEAVER),
    ("R10 a member short of days is no reason for a change", RULE, "    active.every((id) => week.filter((day) => day.star === id).length === per);", "    active.every((id) => week.some((day) => day.star === id));", "unit", U_FEWER),
    ("R11 an open change isn't dropped when the club is back at its week", RULE, "  if (asTheWeek) return open === null ? { kind: \"nothing\" } : { kind: \"drop\" };", "  if (asTheWeek) return { kind: \"nothing\" };", "unit", U_DROP),
    ("R12 an open change for the same members is replaced", RULE, "  if (open !== null && open.members.length === active.length && open.members.every((id) => active.includes(id))) {\n    return { kind: \"nothing\" };\n  }\n", "", "unit", U_ALREADY),
    ("R13 an open change for other members stays", RULE, "  if (open !== null && open.members.length === active.length && open.members.every((id) => active.includes(id))) {", "  if (open !== null) {", "unit", U_REPLACE),
    ("R14 a change starts a week early", RULE, "  let start = windowEnd(today).add({ days: 1 });", "  let start = windowEnd(today).add({ days: -6 });", "unit", U_START),
    ("R15 a change starts before a day already made", RULE, "  if (lastMade !== null && Temporal.PlainDate.compare(lastMade, start) >= 0) {", "  if (false) {", "unit", U_MADE),
    ("R16 a replacement takes a new start", RULE, "    replacedStart !== null &&\n    Temporal.PlainDate.compare(replacedStart, today) > 0 &&", "    false &&\n    Temporal.PlainDate.compare(replacedStart ?? today, today) > 0 &&", "unit", U_KEEP),
    ("R17 a replacement keeps a start that has passed", RULE, "    Temporal.PlainDate.compare(replacedStart, today) > 0 &&", "    true &&", "unit", U_PASSED),
    ("R18 a replacement keeps a start a day was made on or after", RULE, "    (lastMade === null || Temporal.PlainDate.compare(lastMade, replacedStart) < 0)", "    true", "unit", U_KEEPMADE),
    # Generation (generate.ts).
    ("N01 days are made from a change's start on", GEN, "    if (changeFrom !== null && !(localDate < changeFrom)) break;\n", "", "unit", U_HOLD),
    ("N02 the day before a change's start isn't made", GEN, "    if (changeFrom !== null && !(localDate < changeFrom)) break;", "    if (changeFrom !== null && !(date.add({ days: 1 }).toString() < changeFrom)) break;", "unit", U_NOMORE),
    # The view and the confirmation's rule.
    ("V01 a change's view names nobody", VIEW, "    return { weekday, state: \"available\", ...(other === undefined ? {} : { heldBy: other.id }), suggested: false };", "    return { weekday, state: \"available\", suggested: false };", "unit", U_VIEW),
    ("V02 a change's view hides the days of a member who has confirmed", VIEW, "    const other = facts.members.find((member) => member.active && member.held.includes(weekday));", "    const other = facts.members.find((member) => member.active && !member.confirmed && member.held.includes(weekday));", "unit", U_FQ81),
    ("V03 a confirmation of other days is taken", DECIDE, "  if (proposed.length !== days.length || proposed.some((weekday, index) => weekday !== days[index])) {\n    return \"NOT_ALLOWED\";\n  }\n", "", "unit", U_EXACT),
    ("V04 a second confirmation of a change is taken", DECIDE, "  const days = fromMonday(weekdays, 1);\n  if (caller.confirmed) return \"NOT_ALLOWED\";\n  const proposed", "  const days = fromMonday(weekdays, 1);\n  const proposed", "unit", U_SECOND),
    # The writes and the commands.
    ("C01 a join proposes no change", APPLY, "    await settleChange(tx, at, clubId);\n", "", "db", D_JOIN),
    ("C02 a leave proposes no change", LEAVE, "  await settleChange(tx, at, clubId);\n", "", "db", D_LEAVE),
    ("C03 the last confirmation of the first days proposes no change", CONFIRM, "      await settleChange(tx, at, week.club.id);\n", "", "db", D_LAST),
    ("C04 a club with no applied first days is given its week", SETTLE, "  const week = flag(row[\"applied\"])\n    ?", "  const week = true\n    ?", "db", D_NONE),
    ("C05 a replaced change names no successor", SETTLE, ",\n             replaced_by = ${proposalId}\n", "\n", "db", D_REPLACE),
    ("C06 a dropped change keeps its version", SETTLE, "         SET state = 'superseded', closed_at = ${at}::pg_catalog.timestamptz, version = version + 1\n       WHERE id = ${openId ?? \"\"}`;", "         SET state = 'superseded', closed_at = ${at}::pg_catalog.timestamptz\n       WHERE id = ${openId ?? \"\"}`;", "db", D_DROP),
    ("C07 a change's start ignores the days made", SETTLE, "  const lastMade = row[\"last_made\"] === null ? null : date(row[\"last_made\"]);", "  const lastMade = null;", "db", D_BEYOND),
    ("C08 a replacement takes a new start", SETTLE, "changeStart(today, lastMade, found === null ? null : date(found[\"effective_from\"]))", "changeStart(today, lastMade, null)", "db", D_REPLACE),
    ("C09 a change's confirmation moves its version", CONFIRM, "          UPDATE app.schedule_proposal_members SET confirmed_at = ${at}::pg_catalog.timestamptz\n           WHERE proposal_id = ${proposal.id} AND interval_id = ${callerId}`;\n      return;", "          UPDATE app.schedule_proposal_members SET confirmed_at = ${at}::pg_catalog.timestamptz\n           WHERE proposal_id = ${proposal.id} AND interval_id = ${callerId}`;\n      await bound(tx)`UPDATE app.schedule_proposals SET version = version + 1 WHERE id = ${proposal.id}`;\n      return;", "db", D_CONFIRM),
    ("C10 a change's confirmation of other days is taken", CONFIRM, "      if (judgeChangeConfirmation(callerId, proposal.facts, input.weekdays) !== null) throw new Refused(\"NOT_ALLOWED\");\n", "", "db", D_ORDER),
    ("C11 the new member gets the announced days", WEEK, "      seesAnnounced(\n        callerId,", "      (true || seesAnnounced)(\n        callerId,", "db", D_NEW),
    ("C23 the pure rule gives the announced days to anyone", VIEW, "  return latestWeekStars.includes(viewerId);", "  return viewerId.length > 0 || latestWeekStars.length > 0;", "unit", U_SEES),
    ("C24 a replaced id names the change that replaced it, one hop", "packages/domain/src/schedule/command.ts", [("    const [current] = await bound(tx)`\n      SELECT id FROM app.schedule_proposals WHERE club_id = ${clubId} AND state = 'open'`;\n    if (current !== undefined) throw new Refused(\"MEMBERSHIP_CHANGED\", { current_id: String(current[\"id\"]) });", "    throw new Refused(\"MEMBERSHIP_CHANGED\", { current_id: proposal.replacedBy });")], None, "db", D_CHAIN),
    ("C25 a replaced id with none open answers MEMBERSHIP_CHANGED with any open one", "packages/domain/src/schedule/command.ts", "    if (current !== undefined) throw new Refused(\"MEMBERSHIP_CHANGED\", { current_id: String(current[\"id\"]) });", "    throw new Refused(\"MEMBERSHIP_CHANGED\", { current_id: String(current?.[\"id\"] ?? proposal.replacedBy) });", "db", D_CHAIN),
    ("J10 the judge names the change that replaced it, one hop", JUDGE, "    const current = [...world.proposals].find(([, each]) => each.club === proposal.club && each.state === \"open\");", "    const current = [[proposal.replacedBy, world.proposals.get(proposal.replacedBy)]].filter(([, each]) => each?.state === \"open\")[0];", "judge", J_CHAIN),
    ("C12 nobody gets the announced days", WEEK, "    ...(proposal.announced === null ? {} : { announced: proposal.announced }),", "", "db", D_READ),
    ("C13 a change is read with the first days' view", WEEK, "proposal.reason === \"activation\" ? viewFor(viewerId, proposal.facts) : changeViewFor(viewerId, proposal.facts);", "viewFor(viewerId, proposal.facts);", "db", D_CONFIRM),
    ("C14 the announced days include a closed day", DAYS, "    .filter((day) => placeable(day) && before(now, day.closeAt))\n    .sort(", "    .filter((day) => placeable(day))\n    .sort(", "home", H_AHEAD),
    ("C15 the announced days include a held day", DAYS, "    .filter((day) => placeable(day) && before(now, day.closeAt))\n    .sort(", "    .filter((day) => before(now, day.closeAt))\n    .sort(", "home", H_HELD),
    ("C21 the database lists closed days as announced", DAYS, "  const when = bound(sql)`${now}::pg_catalog.timestamptz < o.close_at`;", "  const when = bound(sql)`TRUE`;", "home", H_AHEAD),
    ("C22 the database lists a held day as announced", DAYS, "       AND ${starKeepsDay(sql)}\n", "", "db", D_HELD),
    ("C16 the route leaves the announced days out", ROUTES, "    ...(proposal.announced === undefined ? {} : { announced: proposal.announced.map(occurrenceBody) }),\n", "", "api", A_SCENE),
    ("C17 through the app: the new member gets the announced days", WEEK, "      seesAnnounced(\n        callerId,", "      (true || seesAnnounced)(\n        callerId,", "matrix", X_APP),
    ("C18 through the app: a confirmation moves the version", CONFIRM, "          UPDATE app.schedule_proposal_members SET confirmed_at = ${at}::pg_catalog.timestamptz\n           WHERE proposal_id = ${proposal.id} AND interval_id = ${callerId}`;\n      return;", "          UPDATE app.schedule_proposal_members SET confirmed_at = ${at}::pg_catalog.timestamptz\n           WHERE proposal_id = ${proposal.id} AND interval_id = ${callerId}`;\n      await bound(tx)`UPDATE app.schedule_proposals SET version = version + 1 WHERE id = ${proposal.id}`;\n      return;", "matrix", X_APP),
    ("C19 through the app: a leave replaces no change", LEAVE, "  await settleChange(tx, at, clubId);\n", "", "matrix", X_APP),
    ("C20 through the app: a change's view hides a confirmed member's days", VIEW, "    const other = facts.members.find((member) => member.active && member.held.includes(weekday));", "    const other = facts.members.find((member) => member.active && !member.confirmed && member.held.includes(weekday));", "matrix", X_APP),
    # The migration (0014).
    ("M01 a change may end applied", MIG, "  IF NEW.state = 'applied' AND NEW.reason = 'membership_change' THEN", "  IF false THEN", "mig", G_APPLIED),
    ("M02 a change's week may be proposed again", MIG, "    IF NEW.reason = 'membership_change' THEN\n      RAISE EXCEPTION 'app.schedule_proposals: the week of the membership change", "    IF false THEN\n      RAISE EXCEPTION 'app.schedule_proposals: the week of the membership change", "mig", G_WEEK),
    ("M03 a change may start at any version or state", MIG, "  IF NEW.state <> 'open' OR NEW.version <> 1 OR NEW.week_revision <> 1 OR NEW.replaced_by IS NOT NULL THEN", "  IF false THEN", "mig", G_START),
    ("M04 a change may start with a week of its own", MIG, "  IF NEW.schedule_version_id IS NOT NULL THEN", "  IF false THEN", "mig", G_START),
    ("M05 a change may start on any weekday", MIG, "  IF pg_catalog.date_part('isodow', NEW.effective_from) <> 1 THEN", "  IF false THEN", "mig", G_START),
    ("M06 a change may be proposed before the first days apply", MIG, "                  WHERE club_id = NEW.club_id AND reason = 'activation' AND state = 'applied') THEN", "                  WHERE club_id = NEW.club_id AND reason = 'activation') THEN", "mig", G_ONCE),
    ("M07 a change's days may be changed", MIG, "    IF TG_OP <> 'INSERT' THEN\n      RAISE EXCEPTION 'app.schedule_proposal_days: a membership change''s days are written once", "    IF false THEN\n      RAISE EXCEPTION 'app.schedule_proposal_days: a membership change''s days are written once", "mig", G_DAYS),
    ("M08 a change's day may be written not held", MIG, "    IF NOT (NEW.suggested AND NEW.held) THEN", "    IF false THEN", "mig", G_DAYS),
    ("M09 a change may propose a weekday for two members", MIG, "                WHERE proposal_id = NEW.proposal_id AND weekday = NEW.weekday) THEN\n      RAISE EXCEPTION 'app.schedule_proposal_days: a membership change proposes", "                WHERE false) THEN\n      RAISE EXCEPTION 'app.schedule_proposal_days: a membership change proposes", "mig", G_DAYS),
    # The judge (tests/src/privacy/schedule.ts weekChangeProblems).
    ("J01 the judge takes no change where one is due", JUDGE, "  if (now === undefined) return [...problems, \"no change is open though the club's members aren't its week's\"];", "  if (now === undefined) return problems;", "judge", J_REFUSES),
    ("J02 the judge takes a change for other members", JUDGE, "  if (canonical(included) !== canonical([...active].sort(byBytes)))\n", "  if (false)\n", "judge", J_REFUSES),
    ("J03 the judge takes a member moved", JUDGE, "    if (kept.length === per && canonical(kept) !== canonical(proposed))\n", "    if (false)\n", "judge", J_REFUSES),
    ("J04 the judge takes a weekday twice", JUDGE, "  if (new Set(weekdays).size !== weekdays.length) problems.push(\"a change proposes one weekday for two members (T6)\");\n", "", "judge", J_REFUSES),
    ("J05 the judge takes a day that isn't held", JUDGE, "  if (rows.days.some((day) => !(day.suggested && day.held)))\n", "  if (false)\n", "judge", J_REFUSES),
    ("J06 the judge takes any start", JUDGE, "  if (rows.effectiveFrom !== start) problems.push", "  if (false) problems.push", "judge", J_NEW),
    ("J07 the judge takes an open change in a club back at its week", JUDGE, "    if (now !== undefined) problems.push(\"a change is open in a club whose members are its week's, or that is paused\");\n", "", "judge", J_DROP),
    ("J08 the judge takes a replaced change that names no successor", JUDGE, "    const want = { ...was[1], state: \"superseded\" as const, version: was[1].version + 1, replacedBy: successor };\n    if (text(rows) !== text(want)) problems.push", "    const want = { ...was[1], state: \"superseded\" as const, version: was[1].version + 1, replacedBy: successor };\n    if (false) problems.push", "judge", J_REPL),
    ("J09 the judge takes a new change that starts with a confirmation", JUDGE, "  if (rows.members.some((member) => member.confirmed)) problems.push(\"a new change starts with a confirmation\");\n", "", "judge", J_REFUSES),
]


def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


def remake():
    a = run(["bash", SP + "/s4/pgci.sh"])
    b = run(["python3", "tools/ci/ci_steps.py", "db-bootstrap"])
    return a.returncode, b.returncode, (b.stdout + b.stderr)[-400:]


def swap(text, old, new):
    assert text.count(old) == 1, (old[:70], text.count(old))
    return text.replace(old, new)


def edit(text, old, new):
    if isinstance(old, list):
        for a, b in old:
            text = swap(text, a, b)
        return text
    return swap(text, old, new)


def main():
    args = sys.argv[1:]
    codes = [name.split()[0] for name, *_ in B]
    assert len(set(codes)) == len(codes), "a code used twice"
    if args == ["--check"]:
        bad = 0
        for name, path, old, new, suite, words in B:
            text = (ROOT / path).read_text()
            try:
                ok = edit(text, old, new) != text and suite in SUITES and len(words) > 6
            except AssertionError as e:
                ok = False
                print("  ", e)
            if not ok:
                bad += 1
                print("BAD", name)
        print(len(B), "entries,", bad, "bad")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    dirty = False
    for name, path, old, new, suite, words in B:
        code = name.split()[0]
        if args and code not in args:
            continue
        p = ROOT / path
        orig = p.read_text()
        try:
            p.write_text(edit(orig, old, new))
            (OUT / f"{code}.patch").write_text(run(["git", "diff"]).stdout)
            note = ""
            if suite == "mig":
                dirty = True
                made = remake()
                note = f" (database made again: {made[0]} {made[1]})"
                if made[1] != 0:
                    note += " " + made[2].replace("\n", " | ")
            elif dirty:
                p.write_text(orig)
                made = remake()
                dirty = False
                p.write_text(edit(orig, old, new))
            cwd, cmd = SUITES[suite]
            r = run(cmd, cwd=ROOT / cwd)
            out = r.stdout + r.stderr
            (OUT / f"{code}.txt").write_text(out)
            failed = sorted({l.strip()[2:].strip()[:260] for l in out.splitlines() if l.strip().startswith("×")})
            summary = [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")]
            caught = any(words[:105] in f for f in failed)
            verdict = "CAUGHT" if caught else ("CAUGHT BY ANOTHER TEST" if failed else ("NO RESULT" if not summary else "NOT CAUGHT"))
            if verdict == "NOT CAUGHT" and code in EQUIVALENT:
                verdict = "NOT CAUGHT, AN EQUIVALENT CHANGE (README)"
            print(f"== {name} [{suite}]: {verdict}; exit {r.returncode} {summary}{note}", flush=True)
            for f in failed[:6]:
                print("    ×", f, flush=True)
            if not summary:
                print("   ", out[-500:].replace("\n", "\n    "), flush=True)
        finally:
            p.write_text(orig)
    if dirty:
        print("database made again from the true migration:", remake()[:2], flush=True)
    print("restored:", repr(run(["git", "status", "--short"]).stdout), flush=True)


if __name__ == "__main__":
    main()
