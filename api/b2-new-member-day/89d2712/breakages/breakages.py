"""Deliberate breakages of the new member's day (api/b2-new-member-day, PR #87), one change each, in a
scratch worktree.

For each: change the one place, run the suite registered for it, and check that a test whose name holds
the pre-registered words fails. The file is restored after each. A breakage of the migration makes the
local database again from the changed file first, and the database is made again from the true file
before the next breakage that isn't the migration's, and after the last. Nothing else may use the local
database meanwhile.

  breakages.py --check        count every anchor, change nothing
  breakages.py R01 M02 ...    only these
"""

import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path("/home/user/tadayo-b2m-mut")
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(SP) / "b2m/brk87/out"
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
RULE = "packages/domain/src/schedule/change.ts"
SETTLE = "packages/domain/src/schedule/settle-change.ts"
CONFIRM = "packages/domain/src/schedule/confirm-days.ts"
READ = "packages/domain/src/schedule/read.ts"
VIEW = "packages/domain/src/schedule/view.ts"
GEN = "packages/domain/src/schedule/generate.ts"
MIG = "db/migrations/0015_new_member_day.sql"
JUDGE = "tests/src/privacy/schedule.ts"

PRIV = ["npx", "vitest", "run", "--config", "vitest.privacy.config.ts"]
DB = ["npx", "vitest", "run", "--config", "vitest.db.config.ts"]
SUITES = {
    "unit": ("packages/domain", ["npx", "vitest", "run", "src/schedule"]),
    "mc": ("tests", [*DB, "src/db/membership-change.test.ts"]),
    "sp": ("tests", [*DB, "src/db/schedule-proposals.test.ts"]),
    "days": ("tests", [*DB, "src/db/days.test.ts"]),
    "uniq": ("tests", [*DB, "src/db/uniqueness.test.ts"]),
    "sc": ("tests", [*DB, "src/db/schedule-commands.test.ts"]),
    "judge": ("tests", [*PRIV, "src/privacy/schedule.test.ts"]),
    "matrix": ("tests", [*PRIV, "src/privacy/matrix.test.ts", "-t", "a new member's pick through the app"]),
}

EQUIVALENT = {"R05", "K04", "M18"}

# The domain's rules (packages/domain/src/schedule/change.test.ts, view.test.ts, generate.test.ts).
U_ENOUGH = "frees nothing where the free days are enough for the new members, and nothing in a club of three or fewer"
U_FOURTH = "keeps each member's first day from Monday and frees the others, for a fourth member to pick from"
U_EARLIER = "frees by the days each has, not the table's: the earlier day from Monday stays"
U_TWOTHREE = "frees the days beyond each member's first wherever the free days are too few, as two joined by three"
U_FIRSTFREE = "gives a new member the first free days from Monday when the table's day for their place is someone's"
U_TWO = "gives two who join at once different free days, in the order they joined"
U_ALONE = "opens a pick for a new member alone, with spec 05's number of free days for the club's size (FQ127, FQ131)"
U_OPEN = "asks nothing while the first days are open or never applied: their own rule decides (FQ102)"
U_PAUSED = "frees nothing in a paused club, which asks nobody anything (FQ16)"
U_EVERYONE = "asks nothing when every active member has a day in the week, after a leave too (FQ125, FQ131)"
U_SIZE = "opens a new pick in its place when the club's size changes the days each takes (FQ131)"
U_ADD = "adds a member who joins while it is open, with free days nobody it includes holds"
U_ENDS = "ends with no successor when nobody it includes is still a member, or the club is paused (FQ16)"
U_APPLIES = "applies when everyone it includes who is still a member has confirmed, as on a leave"
U_START = "starts a new week today, or the day after the latest week's start when that is today or later"
U_MONDAY = "gives the Monday after the date's week, weeks running Monday to Sunday"
U_NEXTWEEK = "is that weekday in the week after the confirmation, never this week"
U_WAIT = "waits a week where the week after's date is less than 24 hours on (FQ79)"
U_AFTERLAST = "comes after the last day of that weekday announced for a member still in the club"
U_WEEKSTART = "is on or after the start of the week it joins"
U_LEAVERFREE = "frees the days of a member who left, of the week or of the pick (FQ125, FQ129)"
U_CANCELOWED = "owes a cancelled date to the star the week in force now gives it: the new member's first days"
U_NEVERAGAIN = "never owes a cancelled date again to the star whose day was cancelled"
U_KEEPHELD = "keeps what each member held when a new pick takes the place of theirs, as far as the new number allows (FQ1"
U_LOCAL = "takes this week and next from the club's own date, not UTC's (T1)"
# The commands on Postgres (tests/src/db/membership-change.test.ts).
D_FREES = "frees the others' second days when a fourth member joins three: a new week now, their days from next week"
D_HIDDEN = "keeps what was added for a freed day hidden from everyone, its caption too, and never on the new member's"
D_LATE = "frees days the same way when the first days apply with a late joiner and no day free (FQ100, FQ131)"
D_OPENS = "opens one for a join in a club with a week: only the new member is in it, holding free days, and nobody"
D_REPLACE = "replaces an open pick when the club's size changes the days each, and the old id answers MEMBERSHIP_CHA"
D_ENDS = "ends an open pick with no successor when nobody it includes is still a member"
D_WRITES = "writes the days into a new week at once, each the new member's from that weekday next week, and moves no"
D_LEAVER = "gives a new member a leaver's weekday from its first date, cancelling the leaver's days there on (FQ63, F"
D_KEEPHELD = "keeps what a member held when a new pick takes the place of theirs: Alex's chosen Saturday stays Alex's (FQ12"
D_LOCAL = "takes today and next week from the club's own date: a fourth member who joins on Sunday evening in New York, M"
D_RACE_RESERVE = "refuses a reservation that waits on a cancellation in progress, once it commits (T9)"
D_RACE_CANCEL = "lets a cancellation wait on a reservation in progress, which then stays as it was (T9, FQ63)"
# The migration's guards (tests/src/db/schedule-proposals.test.ts, days.test.ts, uniqueness.test.ts).
G_LEFT = "lets a member confirm a day of one who confirmed it and left since: a member who left contests nothing (FQ1"
G_MEMBERS = "lists only members still in the club with no day in its latest week (FQ125, FQ127)"
G_KEEPS = "keeps in a week after the first days every day of the week before whose member is still in the club (FQ125"
G_FOLLOWS = "holds in a week after the first days only what its members had in the week before, as it was, and confirma"
G_HOLD = "lets its members hold any free day, and never a day of the week in force whose member is still in the club"
G_START = "is proposed open, at version 1, in its one week, with no week of its own, from the club's local date"
G_APPLIES = "applies once every member it includes who is still in the club has confirmed, and never with nobody left"
G_CONTEST = "is refused while another member it includes holds the day too, or with fewer days than it gives each (FQ5"
Y_ANNOUNCED = "refuses a new week that would give a day already announced to someone else (FQ61, 0015)"
Y_CANCELLED = "takes a new week whose day is a date with a cancelled day, which then takes the new star's (FQ129)"
Y_ORDER = "refuses a new week that starts on or before an earlier week of its club (0015)"
Y_KEEPS = "takes a new week over days already made that keeps them, starts its day after them, or leaves the weekday"
Q_ONE = "keeps one day per club and date (T6)"
Q_LIVE = "leaves a cancelled day's date to one other day, and keeps the cancelled one (FQ129)"
# The read (tests/src/db/schedule-commands.test.ts) and the privacy judges and matrix.
S_LEFT = "frees the hold of a member who left, and shows a confirmed member who left by the name they left with (FQ75"
J_REPLACED = "wants an open pick replaced when the club's size changes the days each, naming its successor"
J_FOURTH = "wants a fourth member's join to free the others' second days in a new week, and a pick for the fourth"
J_REFUSES = "refuses no new week, another start, a day moved or dropped, a day dated this week, and no version"
J_ADDED = "wants a member who joins an open pick added to it, holding a day nobody it includes holds, and nothing else m"
X_APP = "answers each caller the pick as the rows say, asks nobody already in the week, and replaces it as the club"

B = [
    # The rule (change.ts pickAfter, nextMonday, nextWeekStart, newMemberFirstDate).
    ("R01 days are freed at every join that brings four or more", RULE, "  const freeing = WEEKDAYS.length - held < per * fresh.length;", "  const freeing = active.length >= 4 && fresh.length > 0;", "unit", U_ENOUGH),
    ("R02 days are never freed", RULE, "  const freeing = WEEKDAYS.length - held < per * fresh.length;", "  const freeing = false;", "unit", U_FOURTH),
    ("R03 days are freed when the free days are exactly enough", RULE, "  const freeing = WEEKDAYS.length - held < per * fresh.length;", "  const freeing = WEEKDAYS.length - held <= per * fresh.length;", "unit", U_ENOUGH),
    ("R04 a member keeps their later days and loses their first", RULE, "      (freeing && nth >= per ? freed : kept).push({ weekday, star: id }),", "      (freeing && nth < per ? freed : kept).push({ weekday, star: id }),", "unit", U_EARLIER),
    ("R05 freeing counts the table's days, not each member's", RULE, "  const freeing = WEEKDAYS.length - held < per * fresh.length;", "  const freeing = WEEKDAYS.length - held < fresh.length;", "unit", U_TWOTHREE),
    ("R06 a new member may take a day someone keeps", RULE, "      if (taken.has(weekday)) continue;\n", "", "unit", U_FIRSTFREE),
    ("R07 two who join take the same day", RULE, "      taken.add(weekday);\n", "", "unit", U_ENOUGH),
    ("R08 a pick opens while the first days are open", RULE, "  if (facts.firstDaysOpen || week === null) return NOTHING;", "  if (week === null) return NOTHING;", "unit", U_OPEN),
    ("R09 a paused club is asked something", RULE, "  if (active.length < 2) return open === null ? NOTHING : { freed: [], proposal: { kind: \"drop\" } };\n", "", "unit", U_PAUSED),
    ("R10 a member with fewer days than the table's is asked again", RULE, "  const fresh = active.filter((id) => daysOf.get(id)?.length === 0);", "  const fresh = active.filter((id) => (daysOf.get(id)?.length ?? 0) < per);", "unit", U_EVERYONE),
    ("R11 an open pick of another size is kept", RULE, "  if (open.daysPerMember !== per) {", "  if (false) {", "unit", U_SIZE),
    ("R12 a member who joins an open pick isn't added", RULE, "  if (joining.length > 0) {", "  if (false) {", "unit", U_ADD),
    ("R13 a member who joins an open pick may take a day held in it", RULE, "    for (const member of included) if (!member.confirmed) for (const weekday of member.held) taken.add(weekday);\n", "", "unit", U_ADD),
    ("R14 a pick nobody is left in stays open", RULE, "  if (included.length === 0) return { freed, proposal: { kind: \"drop\" } };\n", "", "unit", U_ENDS),
    ("R15 a pick never applies", RULE, "  if (everyoneConfirmed) return { freed, proposal: { kind: \"apply\" } };\n", "", "unit", U_APPLIES),
    ("R16 a new week starts today even when the latest starts later", RULE, "  if (latestStart !== null && Temporal.PlainDate.compare(latestStart, today) >= 0) return latestStart.add({ days: 1 });", "  if (false) return today;", "unit", U_START),
    ("R17 a new week starts on the latest week's start when that is today", RULE, "Temporal.PlainDate.compare(latestStart, today) >= 0) return latestStart.add({ days: 1 });", "Temporal.PlainDate.compare(latestStart, today) > 0) return latestStart.add({ days: 1 });", "unit", U_START),
    ("R18 next Monday is a day early", RULE, "  return today.add({ days: 8 - today.dayOfWeek });", "  return today.add({ days: 7 - today.dayOfWeek });", "unit", U_MONDAY),
    ("R19 a new member's day first opens this week", RULE, "  let notBefore = nextMonday(today);", "  let notBefore = today;", "unit", U_NEXTWEEK),
    ("R23 on Postgres: a new member's day first opens this week", RULE, "  let notBefore = nextMonday(today);", "  let notBefore = today;", "mc", D_WRITES),
    ("R20 a new member's day ignores the start of the week it joins", RULE, "  if (Temporal.PlainDate.compare(weekStart, notBefore) > 0) notBefore = weekStart;\n", "", "unit", U_WEEKSTART),
    ("R21 a new member's day ignores the last day announced on its weekday", RULE, "  if (lastAnnounced !== null && Temporal.PlainDate.compare(lastAnnounced, notBefore) >= 0) {", "  if (false) {", "unit", U_AFTERLAST),
    ("R22 a new member's day ignores FQ79's 24 hours", RULE, "  return firstDate(weekday, confirmedAt, zone, notBefore);", "  return firstDate(weekday, confirmedAt.subtract({ hours: 24 }), zone, notBefore);", "unit", U_WAIT),
    # Round 2: a replaced pick keeps what each member held (FQ131's reading), and the club's own date (T1).
    ("R24 a new pick gives each member the table's days again, not what they held", RULE, "        proposed: firstHolds(fresh, active, per, inWeek, earlier),", "        proposed: firstHolds(fresh, active, per, inWeek),", "unit", U_KEEPHELD),
    ("R25 on Postgres: a new pick gives each member the table's days again", RULE, "        proposed: firstHolds(fresh, active, per, inWeek, earlier),", "        proposed: firstHolds(fresh, active, per, inWeek),", "mc", D_KEEPHELD),
    ("R26 on a clash the later joiner keeps the day", RULE, "  const kept = new Map(\n    ids.map((id) => {", "  const kept = new Map(\n    [...ids].reverse().map((id) => {", "unit", U_KEEPHELD),
    ("R27 a member keeps more than the new number of the days they held", RULE, "        .filter((weekday) => !taken.has(weekday))\n        .slice(0, per);", "        .filter((weekday) => !taken.has(weekday));", "unit", U_KEEPHELD),
    ("R28 a new member's day takes today from UTC", RULE, "  const today = confirmedAt.toZonedDateTimeISO(zone).toPlainDate();", "  const today = confirmedAt.toZonedDateTimeISO(\"UTC\").toPlainDate();", "unit", U_LOCAL),
    # The pick's view (view.ts pickWeekFacts).
    ("V01 a leaver's day of the week is taken in a pick", VIEW, "    if (!day.starActive) continue;\n", "", "unit", U_LEAVERFREE),
    # Generation (generate.ts): a cancelled date.
    ("N01 a cancelled date is owed again to its star", GEN, "    if (cancelled.get(localDate)?.includes(day.starInterval) === true) continue;\n", "", "unit", U_NEVERAGAIN),
    # The writes (settle-change.ts).
    ("S01 a freed week keeps the freed days", SETTLE, "      if (!active.includes(day.star) || freed(day)) continue;", "      if (!active.includes(day.star)) continue;", "mc", D_FREES),
    ("S02 the freed days are not cancelled", SETTLE, "        UPDATE app.occurrences SET status = 'cancelled'", "        UPDATE app.occurrences SET status = status", "mc", D_FREES),
    ("S03 the freed days are cancelled from this week", SETTLE, "    const from = nextMonday(today).toString();", "    const from = today.toString();", "mc", D_FREES),
    ("S04 a freed week starts next Monday", SETTLE, "    const start = nextWeekStart(today, date(latest[\"effective_from\"])).toString();", "    const start = nextMonday(today).toString();", "mc", D_FREES),
    ("S05 a pick is from next Monday", SETTLE, "    VALUES (${proposalId}, ${clubId}, 'membership_change', ${today.toString()}::pg_catalog.date,", "    VALUES (${proposalId}, ${clubId}, 'membership_change', ${nextMonday(today).toString()}::pg_catalog.date,", "mc", D_OPENS),
    ("S06 a replaced pick names no successor", SETTLE, ",\n             replaced_by = ${proposalId}\n", "\n", "mc", D_REPLACE),
    ("S07 an ended pick keeps its version", SETTLE, "         SET state = ${ended}, closed_at = ${at}::pg_catalog.timestamptz, version = version + 1", "         SET state = ${ended}, closed_at = ${at}::pg_catalog.timestamptz", "mc", D_ENDS),
    ("S08 the late joiner's apply frees nothing", SETTLE, "  if (change.freed.length > 0) {", "  if (change.freed.length > 0 && change.proposal.kind !== \"open\") {", "mc", D_LATE),
    ("S09 a join takes today and next week from UTC", SETTLE, "  const today = at.toZonedDateTimeISO(clubTimeZone(text(row[\"timezone\"]))).toPlainDate();", "  const today = at.toZonedDateTimeISO(\"UTC\").toPlainDate();", "mc", D_LOCAL),
    # The confirmation (confirm-days.ts confirmNewMemberDays).
    ("K01 a confirmation's week starts next Monday", CONFIRM, "  const start = nextWeekStart(today, Temporal.PlainDate.from(latest.effectiveFrom));", "  const start = today.add({ days: 8 - today.dayOfWeek });", "mc", D_WRITES),
    ("K02 a confirmation's week copies a leaver's days", CONFIRM, "       WHERE a.schedule_version_id = ${latest.id} AND s.state = 'active'`;", "       WHERE a.schedule_version_id = ${latest.id}`;", "mc", D_LEAVER),
    ("K03 a confirmation's week leaves everyone else out", CONFIRM, "       WHERE a.schedule_version_id = ${latest.id} AND s.state = 'active'`;", "       WHERE false`;", "mc", D_WRITES),
    ("K04 a confirmation ignores the last day announced on its weekday", CONFIRM, "      typeof lastAnnounced === \"string\" ? Temporal.PlainDate.from(lastAnnounced) : null,", "      null,", "mc", D_WRITES),
    ("K05 a leaver's days on a picked weekday are not cancelled", CONFIRM, "        UPDATE app.occurrences o SET status = 'cancelled'", "        UPDATE app.occurrences o SET status = o.status", "mc", D_LEAVER),
    ("K06 a pick never applies on its last confirmation", CONFIRM, "  await applyIfEveryoneConfirmed(tx, at, proposal, callerId);\n}", "}", "mc", D_WRITES),
    # The read (read.ts readSchedule).
    ("Q01 the club's week lists a member who left", READ, "    assignment.person === null || !assignment.starActive", "    assignment.person === null", "sc", S_LEFT),
    ("Q02 through the app: the club's week lists a member who left", READ, "    assignment.person === null || !assignment.starActive", "    assignment.person === null", "matrix", X_APP),
    # Through the app: the rule and the writes.
    ("X01 through the app: days are freed at every join that brings four or more", RULE, "  const freeing = WEEKDAYS.length - held < per * fresh.length;", "  const freeing = active.length >= 4 && fresh.length > 0;", "matrix", X_APP),
    ("X02 through the app: the freed days are not cancelled", SETTLE, "        UPDATE app.occurrences SET status = 'cancelled'", "        UPDATE app.occurrences SET status = status", "matrix", X_APP),
    ("X03 through the app: a new member's day first opens this week", RULE, "  let notBefore = nextMonday(today);", "  let notBefore = today;", "matrix", X_APP),
    # The migration (0015).
    ("M01 a cancelled day keeps its date from any other day", MIG, "CREATE UNIQUE INDEX occurrences_one_live_day ON app.occurrences (club_id, local_date)\n  WHERE status <> 'cancelled';", "CREATE UNIQUE INDEX occurrences_one_live_day ON app.occurrences (club_id, local_date);", "uniq", Q_LIVE),
    ("M02 a date may have two live days", MIG, "CREATE UNIQUE INDEX occurrences_one_live_day", "CREATE INDEX occurrences_one_live_day", "uniq", Q_ONE),
    ("M03 a new week may give an announced day to someone else", MIG, "  IF FOUND THEN\n    RAISE EXCEPTION 'app.schedule_assignments: % from % would give", "  IF false THEN\n    RAISE EXCEPTION 'app.schedule_assignments: % from % would give", "days", Y_ANNOUNCED),
    ("M04 a cancelled day keeps its date from a new week", MIG, "   WHERE o.club_id = NEW.club_id AND o.status <> 'cancelled' AND o.star_interval_id <> NEW.star_interval_id", "   WHERE o.club_id = NEW.club_id AND o.star_interval_id <> NEW.star_interval_id", "days", Y_CANCELLED),
    ("M05 a day made under a later week counts against an earlier one", MIG, "     AND NOT EXISTS (SELECT FROM app.schedule_versions v\n                      WHERE v.club_id = NEW.club_id AND v.effective_from > starts AND v.effective_from <= o.local_date)\n", "", "days", Y_CANCELLED),
    ("M06 a week after the first days may hold anything", MIG, "  RAISE EXCEPTION 'app.schedule_assignments: % for % is neither", "  RETURN NULL;\n  RAISE EXCEPTION 'app.schedule_assignments: % for % is neither", "sp", G_FOLLOWS),
    ("M07 a confirmation's day may be in a week it didn't write", MIG, "\n                   AND EXISTS (SELECT FROM app.schedule_versions v\n                                WHERE v.id = NEW.schedule_version_id AND v.created_at = NEW.confirmed_at)) THEN", ") THEN", "sp", G_FOLLOWS),
    ("M08 a day of the week before may move its first date", MIG, "                AND a.star_interval_id = NEW.star_interval_id AND a.first_date = NEW.first_date", "                AND a.star_interval_id = NEW.star_interval_id", "sp", G_FOLLOWS),
    ("M09 a week after the first days may leave out a member's day", MIG, "  IF FOUND THEN\n    RAISE EXCEPTION 'app.schedule_versions: the week % leaves out", "  IF false THEN\n    RAISE EXCEPTION 'app.schedule_versions: the week % leaves out", "sp", G_KEEPS),
    ("M10 the database frees days at every four or more", MIG, "  freeing := members >= 4 AND 6 - held < unplaced;", "  freeing := members >= 4;", "sp", G_KEEPS),
    ("M11 the database never frees days", MIG, "  freeing := members >= 4 AND 6 - held < unplaced;", "  freeing := false;", "mc", D_FREES),
    ("M12 the database keeps a leaver's days in every week", MIG, "    JOIN app.memberships ms ON ms.interval_id = a.star_interval_id AND ms.state = 'active'\n   WHERE a.schedule_version_id = before\n     AND (NOT freeing", "    JOIN app.memberships ms ON ms.interval_id = a.star_interval_id\n   WHERE a.schedule_version_id = before\n     AND (NOT freeing", "mc", D_LEAVER),
    ("M13 a pick may list a member who left", MIG, "  IF NOT EXISTS (SELECT FROM app.memberships WHERE interval_id = NEW.interval_id AND state = 'active') THEN\n    RAISE EXCEPTION 'app.schedule_proposal_members: % is no longer a member, and picks nothing", "  IF false THEN\n    RAISE EXCEPTION 'app.schedule_proposal_members: % is no longer a member, and picks nothing", "sp", G_MEMBERS),
    ("M14 a pick may list a member with a day in the week", MIG, "  IF EXISTS (SELECT FROM app.schedule_assignments a\n              WHERE a.star_interval_id = NEW.interval_id", "  IF false AND EXISTS (SELECT FROM app.schedule_assignments a\n              WHERE a.star_interval_id = NEW.interval_id", "sp", G_MEMBERS),
    ("M15 a week may start before an earlier week", MIG, "  IF latest IS NOT NULL AND NEW.effective_from <= latest THEN", "  IF false THEN", "days", Y_ORDER),
    ("M16 a week may start on an earlier week's start", MIG, "  IF latest IS NOT NULL AND NEW.effective_from <= latest THEN", "  IF latest IS NOT NULL AND NEW.effective_from < latest THEN", "days", Y_ORDER),
    ("M17 in a pick a member who confirmed and left still contests their day", MIG, "     AND (ms.state = 'active' OR (proposal.reason = 'activation' AND m.confirmed_at IS NOT NULL))", "     AND (ms.state = 'active' OR m.confirmed_at IS NOT NULL)", "sp", G_LEFT),
    ("M18 a member who left contests nothing in the first days either", MIG, "     AND (ms.state = 'active' OR (proposal.reason = 'activation' AND m.confirmed_at IS NOT NULL))", "     AND ms.state = 'active'", "sp", G_CONTEST),
    ("M19 a cancelled day takes a new drop", MIG, "  IF day_status = 'cancelled' THEN", "  IF false THEN", "mc", D_HIDDEN),
    ("M20 a pick may hold a day of the week in force", MIG, "    IF proposal.reason = 'membership_change' AND EXISTS (", "    IF false AND EXISTS (", "sp", G_HOLD),
    ("M21 a pick may be from any date", MIG, "  IF NEW.effective_from IS DISTINCT FROM (SELECT", "  IF false AND NEW.effective_from IS DISTINCT FROM (SELECT", "sp", G_START),
    ("M22 a pick may apply with nobody left in it", MIG, "       NOT EXISTS (SELECT FROM app.schedule_proposal_members m\n                     JOIN app.memberships ms ON ms.interval_id = m.interval_id\n                    WHERE m.proposal_id = NEW.id AND ms.state = 'active')\n       OR ", "", "sp", G_APPLIES),
    ("M23 a week may copy the day of a member who left, as it was", MIG, "               JOIN app.memberships ms ON ms.interval_id = a.star_interval_id AND ms.state = 'active'\n              WHERE a.schedule_version_id = before AND a.weekday = NEW.weekday", "              WHERE a.schedule_version_id = before AND a.weekday = NEW.weekday", "sp", G_FOLLOWS),
    ("M24 a cancelled day takes a new reservation", MIG, "CREATE TRIGGER reservations_day_not_cancelled BEFORE INSERT ON app.reservations\n  FOR EACH ROW EXECUTE FUNCTION app.day_not_cancelled_guard();\n", "", "mc", D_HIDDEN),
    ("M25 a reservation reads a day's status without waiting for a cancellation", MIG, "  SELECT status INTO day_status FROM app.occurrences WHERE id = NEW.occurrence_id FOR SHARE;", "  SELECT status INTO day_status FROM app.occurrences WHERE id = NEW.occurrence_id;", "mc", D_RACE_RESERVE),
    ("M26 a cancellation never waits for a reservation in progress", MIG, "  SELECT status INTO day_status FROM app.occurrences WHERE id = NEW.occurrence_id FOR SHARE;", "  SELECT status INTO day_status FROM app.occurrences WHERE id = NEW.occurrence_id;", "mc", D_RACE_CANCEL),
    # The judges (tests/src/privacy/schedule.ts).
    ("J01 the judge frees days at every join that brings four or more", JUDGE, "  const short = nobodys < per * unplaced;", "  const short = active.length >= 4 && unplaced > 0;", "judge", J_REPLACED),
    ("J02 the judge never frees days", JUDGE, "  const short = nobodys < per * unplaced;", "  const short = false;", "judge", J_FOURTH),
    ("J03 the judge takes a new member's first date anywhere in the right week", JUDGE, "          problems.push(`${each.weekday} first opens on ${each.firstDate}, not ${date.toString()} (FQ130)`);", "          void date;", "judge", J_REFUSES),
    ("J04 through the app: the judge lists a member who left in the club's week", JUDGE, "      found === undefined || world.members.get(found.star)?.active !== true ? undefined : personOf(world, found.star);", "      found === undefined ? undefined : personOf(world, found.star);", "matrix", X_APP),
    ("J05 the judge gives each member of a new pick the table's days again", JUDGE, "        ).slice(0, per);\n        for (const weekday of mine) gone.add(weekday);", "        ).slice(0, 0);\n        for (const weekday of mine) gone.add(weekday);", "judge", J_REPLACED),
    ("J06 the judge counts a day set aside as held", JUDGE, "rows.days.some((day) => day.interval === interval && day.weekday === weekday && day.held));\n  /** The pick that was open", "rows.days.some((day) => day.interval === interval && day.weekday === weekday));\n  /** The pick that was open", "judge", J_ADDED),
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
            note = ""
            if path == MIG:
                p.write_text(edit(orig, old, new))
                dirty = True
                made = remake()
                note = f" (database made again: {made[0]} {made[1]})"
                if made[1] != 0:
                    note += " " + made[2].replace("\n", " | ")
            else:
                if dirty:
                    made = remake()
                    dirty = False
                    note = f" (database made again from the true migration: {made[0]} {made[1]})"
                p.write_text(edit(orig, old, new))
            (OUT / f"{code}.patch").write_text(run(["git", "diff"]).stdout)
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
