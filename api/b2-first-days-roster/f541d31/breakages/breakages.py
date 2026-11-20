"""Deliberate breakages of the schedule's third PR (api/b2-first-days-roster), one change each, in a
scratch worktree.

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

ROOT = pathlib.Path("/home/user/tadayo-b2f-mut")
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(SP) / "b2f/brk/out"
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
RULE = "packages/domain/src/schedule/roster-change.ts"
SETTLE = "packages/domain/src/schedule/settle.ts"
OPEN = "packages/domain/src/schedule/open.ts"
FIRST = "packages/domain/src/schedule/first-date.ts"
CONFIRM = "packages/domain/src/schedule/confirm-days.ts"
WEEK = "packages/domain/src/schedule/week.ts"
CHOOSE = "packages/domain/src/schedule/choose-days.ts"
APPLY = "packages/domain/src/clubs/apply-roster.ts"
LEAVE = "packages/domain/src/clubs/leave-club.ts"
MIG = "db/migrations/0013_first_days_revision.sql"
JUDGE = "tests/src/privacy/leave.ts"
WORLD = "tests/src/privacy/schedule.ts"

PRIV = ["npx", "vitest", "run", "--config", "vitest.privacy.config.ts"]
DB = ["npx", "vitest", "run", "--config", "vitest.db.config.ts"]
SUITES = {
    "unit": ("packages/domain", ["npx", "vitest", "run", "src/schedule/roster-change.test.ts", "src/schedule/first-date.test.ts"]),
    "db": ("tests", [*DB, "src/db/first-days-roster.test.ts"]),
    "cmd": ("tests", [*DB, "src/db/schedule-commands.test.ts"]),
    "mig": ("tests", [*DB, "src/db/schedule-proposals.test.ts"]),
    "judge": ("tests", [*PRIV, "src/privacy/leave.test.ts"]),
    "applied": ("tests", [*PRIV, "src/privacy/matrix.test.ts", "-t", "a roster applied through the app"]),
}

EQUIVALENT = set()

U_PLACE = "includes the new member with spec 05's days for their place, which nobody holds, and moves nobody"
U_FREE = "gives the new member the first free days from Monday when someone holds the days of their place"
U_CONTEST = "counts a contested day as held, and a day only someone who left held as free"
U_TWO = "gives two who join at once different days, in the order they joined"
U_FOURTH = "proposes the whole week again when a fourth member joins three: one day each"
U_ONE = "ends the first days with no successor when one member is left, or none"
U_LATE = "includes no new member and changes nothing on a join"
U_APPLY = "applies the first days when a leave leaves only confirmed members among those they include"
U_NOTHING = "changes nothing when a leave leaves a member who hasn't confirmed, in a club of two or more"
U_ALONE = "ends the first days when the club's one member left hasn't confirmed"
U_NOBODY = "ends them when nobody they include is left, and opens new ones at once for two or more"
U_AGAIN = "opens new first days when all before them ended with no successor and the club has two members again"
U_APPLIED = "does nothing once the first days have applied, or before any were opened"
U_FLOOR = "is the first such weekday on or after the week's start when that is later"
D_JOIN = "includes the new member in the same proposal, at its next version, and moves nobody"
D_STALE = "answers a request made with the earlier version VERSION_CONFLICT and the new one, then takes it"
D_HELD = "gives a new member the first free days when someone holds the days of their place"
D_WEEKS = "proposes the whole week again when a fourth member joins three, and again when one of four leaves"
D_LATE = "joins with no day, outside the first days, and moves no version"
D_LEAVE = "frees the leaver's days in the same week, at the next version"
D_PAIR = "ends the first days of a club of two with no successor, and opens new ones at the next join"
D_APPLY = "applies the first days when only confirmed members stay, at the leave's own instant"
D_STAYS = "changes nothing, and no version, when someone who hasn't confirmed stays in a club of two or more"
D_TAKEN = "keeps the leaver's confirmed day taken, with their name and no first date"
D_RESTART = "ends the first days when the one member left hasn't confirmed, and starts the next after the days already made"
D_NEXTDAY = "starts a restarted club's week the day after its first when nothing was made and the day is the same"
D_TODAY = "starts a restarted club's week today when every day already made is past"
D_FQ123 = "ends the first days when nobody they include is left, and opens new ones at once for those who remain"
G_STEP = "moves to its next week by one, with the next version, and never back"
G_OPEN = "moves only while the proposal stays open and nobody it includes has confirmed"
G_DPM = "changes the days a member takes only with a new week, while nobody has confirmed"
G_ROWS = "writes, changes and deletes a member's days only in the current week"
G_COUNT = "counts a member's days in the current week alone"
G_CONFIRM = "confirms the days a member holds in the current week, whoever held them in an earlier one"
J_STATE = "asks a revision at the next version when nobody had confirmed, and their end with one member left"
J_T33 = "asks nothing to move once a day is confirmed and someone who hasn't confirmed stays"
J_APPLIED = "asks them applied when only confirmed members stay, and ended when the one left hasn't confirmed"
J_FQ123 = "asks them ended when nobody they include is left, with new ones for two or more who remain"
J_SUCC = "catches an ended proposal given a successor, and one whose days per member moved without a revision"
J_ROWS = "catches a leave that adds a member, moves a confirmation or changes a day, whatever it does to the state"
J_EARLIER = "catches an earlier week's row that changed, and a week before that isn't kept"
J_FOUR = "asks a leave for a new week for the three who stay, with the week of four kept whole"
J_JOIN4 = "asks a join for the same, the other way, and for the new member in it"
J_JOIN = "asks the new member two proposed days nobody holds, and every other row as it was"
J_RESTART = "asks new first days of the join that restarts a club whose first days ended, and of no other"
X_REVISES = "and revises the open first days for t"
U_KEEPS = "keeps the new member's place in the table when its day is free, though an earlier day is free too"
D_CURRENT = "reads and writes the current week alone once the week was proposed again"

# (name, file, old, new, suite, words a failing test's name must hold); `old` may be a list of pairs.
B = [
    # The rule (roster-change.ts).
    ("C01 a club that never had first days end opens them on any join", RULE, "return facts.endedWithoutSuccessor && active.length >= 2 ?", "return active.length >= 2 ?", "unit", U_APPLIED),
    ("C02 new first days open for one member", RULE, "return facts.endedWithoutSuccessor && active.length >= 2 ?", "return facts.endedWithoutSuccessor ?", "unit", U_AGAIN),
    ("C03 first days nobody is left in reopen for one member", RULE, 'return { kind: "end", reopen: active.length >= 2 };', 'return { kind: "end", reopen: true };', "unit", U_NOBODY),
    ("C04 first days nobody is left in apply", RULE, '    if (included.length === 0) return { kind: "end", reopen: active.length >= 2 };\n', "", "unit", U_NOBODY),
    ("C05 one confirmed member who stays applies the first days", RULE, 'if (included.every((member) => member.confirmed)) return { kind: "apply" };', 'if (included.some((member) => member.confirmed)) return { kind: "apply" };', "unit", U_NOTHING),
    ("C06 one unconfirmed member left keeps the first days open", RULE, 'return active.length < 2 ? { kind: "end", reopen: false } : { kind: "nothing" };', 'return { kind: "nothing" };', "unit", U_ALONE),
    ("C07 a leaver's confirmation doesn't count as a confirmed day", RULE, "  if (open.members.some((member) => member.confirmed)) {", "  if (included.some((member) => member.confirmed)) {", "unit", U_NOTHING),
    ("C08 a revision is made for one member", RULE, '  if (active.length < 2) return { kind: "end", reopen: false };\n', "", "unit", U_ONE),
    ("C09 the week is never proposed again", RULE, "  if (per !== open.daysPerMember) {", "  if (per !== open.daysPerMember && active.length > 6) {", "unit", U_FOURTH),
    ("C10 a new member may be given a held day", RULE, "new Set<Weekday>(included.flatMap((member) => member.held))", "new Set<Weekday>()", "unit", U_FREE),
    ("C11 a leaver's days stay held", RULE, "new Set<Weekday>(included.flatMap((member) => member.held))", "new Set<Weekday>(open.members.flatMap((member) => member.held))", "unit", U_CONTEST),
    ("C12 two who join at once may be given the same day", RULE, "      taken.add(weekday);\n", "", "unit", U_FREE),
    ("C13 a new member's place in the table is ignored", RULE, "(week[active.indexOf(id)] ?? []).filter", "([] as Weekday[]).filter", "unit", U_KEEPS),
    # The write (settle.ts).
    ("S01 the facts read every week's holds", SETTLE, "AND d.week_revision = p.week_revision AND d.held)))", "AND d.held)))", "db", D_CURRENT),
    ("S02 the facts count a day set aside as held", SETTLE, "AND d.week_revision = p.week_revision AND d.held)))", "AND d.week_revision = p.week_revision)))", "db", D_HELD),
    ("S03 the first days applied by a leave are written as superseded", SETTLE, "SET state = 'applied', closed_at", "SET state = 'superseded', closed_at", "db", D_APPLY),
    ("S04 first days nobody is left in end without new ones", SETTLE, "    if (change.reopen) await openFirstDays(tx, { sample: () => Promise.resolve(at) }, clubId);\n", "", "db", D_FQ123),
    ("S05 a revision keeps the version", SETTLE, "SET version = version + 1, week_revision", "SET version = version, week_revision", "db", D_JOIN),
    ("S06 a revision doesn't add the new member", SETTLE, "  for (const interval of change.added) {", "  for (const interval of [] as string[]) {", "db", D_JOIN),
    ("S07 the restart doesn't open new first days", SETTLE, '  if (change.kind === "open") {\n    await openFirstDays(tx, { sample: () => Promise.resolve(at) }, clubId);\n', '  if (change.kind === "open") {\n', "db", D_PAIR),
    ("S08 first days that applied count as ended with no successor", SETTLE, "(p.reason <> 'activation' OR p.state <> 'superseded'", "(p.reason <> 'activation' OR p.state = 'open'", "db", D_APPLY),
    ("S09 the facts read a member who left as active", SETTLE, "'active', s.state = 'active',", "'active', true,", "db", D_LEAVE),
    # The callers.
    ("A01 a join doesn't settle the first days", APPLY, "  else await settleFirstDays(tx, at, clubId);\n", "", "db", D_JOIN),
    ("A02 a leave doesn't settle the first days", LEAVE, "  await settleFirstDays(tx, at, clubId);\n", "", "db", D_LEAVE),
    ("A03 a join doesn't settle the first days, through the routes", APPLY, "  else await settleFirstDays(tx, at, clubId);\n", "", "applied", X_REVISES),
    ("A04 a leave doesn't settle the first days, through the routes", LEAVE, "  await settleFirstDays(tx, at, clubId);\n", "", "applied", X_REVISES),
    # The restart (open.ts, first-date.ts, confirm-days.ts).
    ("O01 the restart uses a week a day was confirmed in", OPEN, "  if (latest !== null && !latest.confirmed) {", "  if (latest !== null) {", "db", D_RESTART),
    ("O02 the restart's week ignores the days already made", OPEN, "for (const taken of [latest.effectiveFrom, latest.lastMade]) {", "for (const taken of [latest.effectiveFrom]) {", "db", D_RESTART),
    ("O03 the restart's week ignores the earlier week's start", OPEN, "for (const taken of [latest.effectiveFrom, latest.lastMade]) {", "for (const taken of [latest.lastMade]) {", "db", D_NEXTDAY),
    ("O04 the restart's week never starts today", OPEN, "        if (Temporal.PlainDate.compare(next, start) > 0) start = next;", "        start = next;", "db", D_TODAY),
    ("O05 first days open again though some applied", OPEN, ' && existing["standing"] === false;', ";", "cmd", "opens them once: a second opening"),
    ("F01 a first date ignores its week's start", FIRST, "  if (notBefore !== undefined && Temporal.PlainDate.compare(notBefore, date) > 0) date = notBefore;\n", "", "unit", U_FLOOR),
    ("F02 a confirmation doesn't pass its week's start", CONFIRM, "firstDate(weekday, at, week.club.timezone, start)", "firstDate(weekday, at, week.club.timezone)", "db", D_RESTART),
    # The reads and the choice (week.ts, choose-days.ts).
    ("W01 the week is read with every week's rows", WEEK, "                                   AND d.week_revision = p.week_revision))", "                                   ))", "db", D_WEEKS),
    ("W02 a choice writes its day into the first week", CHOOSE, "VALUES (${proposal.id}, ${callerId}, ${weekday}::app.weekday, false, true, ${week}::pg_catalog.int2)", "VALUES (${proposal.id}, ${callerId}, ${weekday}::app.weekday, false, true, 1::pg_catalog.int2)", "db", D_CURRENT),
    # The migration's guards (0013).
    ("M01 a week may move by more than one, or back", MIG, "    IF NEW.week_revision <> OLD.week_revision + 1 THEN", "    IF false THEN", "mig", G_STEP),
    ("M02 a week may move without the version", MIG, "    IF NEW.version <> OLD.version + 1 THEN\n      RAISE EXCEPTION 'app.schedule_proposals: a new week", "    IF false THEN\n      RAISE EXCEPTION 'app.schedule_proposals: a new week", "mig", G_STEP),
    ("M03 a week may move as the proposal ends", MIG, "    IF NEW.state <> 'open' THEN\n      RAISE EXCEPTION 'app.schedule_proposals: the week of % is proposed again only while it stays open'", "    IF false THEN\n      RAISE EXCEPTION 'app.schedule_proposals: the week of % is proposed again only while it stays open'", "mig", G_OPEN),
    ("M04 a week may move after a confirmation", MIG, "                WHERE proposal_id = NEW.id AND confirmed_at IS NOT NULL) THEN\n      RAISE EXCEPTION 'app.schedule_proposals: the week of % is proposed again only while nobody", "                WHERE proposal_id = NEW.id AND confirmed_at IS NOT NULL AND false) THEN\n      RAISE EXCEPTION 'app.schedule_proposals: the week of % is proposed again only while nobody", "mig", G_OPEN),
    ("M05 the days a member takes change without a new week", MIG, "  ELSIF NEW.days_per_member <> OLD.days_per_member THEN", "  ELSIF false THEN", "mig", G_DPM),
    ("M06 a row is written into any week", MIG, "  IF the_week <> proposal.week_revision OR (TG_OP = 'UPDATE' AND OLD.week_revision <> proposal.week_revision) THEN", "  IF false THEN", "mig", G_ROWS),
    ("M07 an earlier week's row may be changed", MIG, "  IF the_week <> proposal.week_revision OR (TG_OP = 'UPDATE' AND OLD.week_revision <> proposal.week_revision) THEN", "  IF the_week <> proposal.week_revision AND TG_OP <> 'UPDATE' THEN", "mig", G_ROWS),
    ("M08 a member's days are counted across weeks", MIG, "AND interval_id = NEW.interval_id AND week_revision = week AND held;", "AND interval_id = NEW.interval_id AND held;", "mig", G_COUNT),
    ("M09 a confirmation reads the days held in every week", MIG, "   WHERE proposal_id = NEW.proposal_id AND interval_id = NEW.interval_id\n     AND week_revision = proposal.week_revision AND held;", "   WHERE proposal_id = NEW.proposal_id AND interval_id = NEW.interval_id\n     AND held;", "mig", G_CONFIRM),
    ("M10 a contest is read across weeks", MIG, "     AND d.week_revision = proposal.week_revision\n     AND d.weekday::text = ANY (held_days)", "     AND d.weekday::text = ANY (held_days)", "mig", G_CONFIRM),
    ("M11 a day joins the week as a hold of an earlier week", MIG, "                    AND d.week_revision = p.week_revision\n                  WHERE p.schedule_version_id = NEW.schedule_version_id", "                  WHERE p.schedule_version_id = NEW.schedule_version_id", "mig", G_CONFIRM),
    # The judges (tests/src/privacy/leave.ts).
    ("J01 the judge takes any state and version after a leave", JUDGE, "  if (now.state !== state || now.version !== version) {\n    problems.push(\n      `the first days are ${now.state} at version ${String(now.version)}, not ${state} at version ${String(version)} (FQ102)`,", "  if (false) {\n    problems.push(\n      `the first days are ${now.state} at version ${String(now.version)}, not ${state} at version ${String(version)} (FQ102)`,", "judge", J_STATE),
    ("J02 the judge asks a version to move though nothing changed", JUDGE, "    state = \"open\";\n    moved = false;", "    state = \"open\";", "judge", J_T33),
    ("J03 the judge asks first days nobody is left in to apply", JUDGE, '  else if (nobodyLeft) state = "superseded";\n', "", "judge", J_FQ123),
    ("J04 the judge takes a successor", JUDGE, '  if (now.replacedBy !== null) problems.push("the first days name a successor");\n  const revised = state === "open" && moved;', '  const revised = state === "open" && moved;', "judge", J_SUCC),
    ("J05 the judge takes new first days for one member", JUDGE, "  if (!again && fresh.length > 0) {", "  if (false) {", "judge", J_FQ123),
    ("J06 the judge takes any members", JUDGE, "      .join() !== members.join()\n  ) {", "      .join() !== members.join() &&\n    false\n  ) {", "judge", J_ROWS),
    ("J07 the judge takes a confirmation that moved", JUDGE, "    if (member.confirmed !== before) problems.push", "    if (false) problems.push", "judge", J_ROWS),
    ("J08 the judge takes any number of days each", JUDGE, "  if (now.daysPerMember !== per) problems.push", "  if (false) problems.push", "judge", J_SUCC),
    ("J09 the judge takes any week", JUDGE, "  if (now.weekRevision !== was.weekRevision + (newWeek ? 1 : 0)) {", "  if (false) {", "judge", J_ROWS),
    ("J10 the judge takes a changed earlier week", JUDGE, '    if (lines(now.earlier) !== lines(was.earlier)) problems.push("an earlier week\'s rows changed");\n', "", "judge", J_EARLIER),
    ("J11 the judge takes a member's days changed by a revision that moves nobody", JUDGE, "    if (lines(kept) !== lines(was.days)) problems.push", "    if (false) problems.push", "judge", J_ROWS),
    ("J12 the judge takes a new member with the wrong days", JUDGE, "      if (mine.length !== per || mine.some((day) => !day.suggested || !day.held)) {\n        problems.push(`the new member", "      if (false) {\n        problems.push(`the new member", "judge", J_JOIN),
    ("J13 the judge takes a new member given a held day", JUDGE, "        if (held.has(day.weekday)) problems.push", "        if (false) problems.push", "judge", J_JOIN),
    ("J14 the judge takes a week before that isn't kept", JUDGE, "  if (lines(now.earlier) !== lines(kept)) problems.push", "  if (false) problems.push", "judge", J_FOUR),
    ("J15 the judge takes a new week's day for someone who left", JUDGE, "  if (now.days.some((day) => !active.includes(day.interval))) {", "  if (false) {", "judge", J_FOUR),
    ("J16 the judge takes a member short of days in a new week", JUDGE, "    if (mine.length !== per || mine.some((day) => !day.suggested || !day.held)) {\n      problems.push(`${interval} doesn't hold", "    if (false) {\n      problems.push(`${interval} doesn't hold", "judge", J_FOUR),
    ("J17 the judge takes a day proposed twice", JUDGE, "  if (new Set(now.days.map((day) => day.weekday)).size !== now.days.length) {", "  if (false) {", "judge", J_FOUR),
    ("J18 the judge takes any version after a join", JUDGE, '  if (now.state !== "open" || now.version !== version) {', "  if (false) {", "judge", J_JOIN4),
    ("J19 the judge revises for a join once a day is confirmed", JUDGE, "  const revised = !was.members.some((member) => member.confirmed);", "  const revised = true;", "judge", J_JOIN4),
    ("J20 the judge takes new first days beside open ones", JUDGE, '  if (fresh.length > 0) problems.push("a join opened new first days beside the open ones");\n', "", "judge", J_JOIN),
    ("J21 the judge asks no new first days of a restart", JUDGE, "    if (!ended || active.length < 2) {", "    if (true) {", "judge", J_RESTART),
    ("J22 the judge takes any new first days for a restart", JUDGE, "      members.join() !== active.join() ||", "", "judge", J_RESTART),
    ("J23 the judge takes a join that changed an ended proposal", JUDGE, '    if (old.map(whole).join("\\n") !== of(before).map(whole).join("\\n")) {', "    if (false) {", "judge", J_RESTART),
    ("J24 the judge restarts a club whose first days applied", JUDGE, '          proposal.reason === "activation" && proposal.state === "superseded" && proposal.replacedBy === null,', '          proposal.reason === "activation" && proposal.replacedBy === null,', "judge", J_RESTART),
    ("J25 the judge takes reopened first days with a confirmation in them", JUDGE, "      members.join() !== stayed.join() ||\n      next[1].members.some((member) => member.confirmed)", "      members.join() !== stayed.join()", "judge", J_FQ123),
    ("J26 the judge takes reopened first days that are a membership change", JUDGE, '      next[1].reason !== "activation" ||\n      members.join() !== stayed.join()', "      members.join() !== stayed.join()", "judge", J_FQ123),
    ("J27 the judge takes a leave that changed a club's proposals with none open", JUDGE, 'return of(after).map(whole).join("\\n") === of(before).map(whole).join("\\n")', "return true", "judge", "passes a club with no first days, and catches a proposal that appears or changes there"),
    # The world's reader (tests/src/privacy/schedule.ts).
    ("P01 the world reads no earlier week", WORLD, "each.proposal === row.id && each.week_revision !== row.week_revision", "each.proposal === row.id && each.week_revision > row.week_revision", "applied", X_REVISES),
    ("P02 the world reads every week as the current one", WORLD, "each.proposal === row.id && each.week_revision === row.week_revision", "each.proposal === row.id", "applied", X_REVISES),
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
