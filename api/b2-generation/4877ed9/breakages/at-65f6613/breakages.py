"""Deliberate breakages of B2's generation slice (api/b2-generation), one change each, in a scratch worktree.

For each: change the one place, run the suite registered for it, and check that a test whose name begins
with the pre-registered words fails. The file is restored after each. Run it in the background; nothing
else may use the local database meanwhile.

  breakages.py --check        count every anchor, change nothing
  breakages.py G07 M02 ...    only these
"""

import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path("/home/user/tadayo-gen-mut")
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(SP) / "gen/brk2/out"
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
GEN = "packages/domain/src/schedule/generate.ts"
ORD = "packages/domain/src/schedule/order.ts"
MK = "packages/domain/src/schedule/make-days.ts"
DAYS = "packages/domain/src/authorization/days.ts"
MEM = "packages/domain/src/clubs/members.ts"
API = "services/api/src/clubs/members.ts"
LOOP = "services/worker/src/loop.ts"
PASS = "services/worker/src/generation.ts"
MAIN = "services/worker/src/main.ts"
CONN = "services/worker/src/connection.ts"


def db(*files):
    return ("tests", ["npx", "vitest", "run", "--config", "vitest.db.config.ts", *[f"src/db/{f}.test.ts" for f in files]])


SUITES = {
    "rule": ("packages/domain", ["npx", "vitest", "run", "src/schedule/generate.test.ts", "src/schedule/order.test.ts"]),
    "worker": ("services/worker", ["npx", "vitest", "run"]),
    "api": ("services/api", ["npx", "vitest", "run", "src/clubs", "src/app.test.ts"]),
    "makedays": db("make-days"),
    "members": db("members"),
    "homedays": db("home-days"),
    "q18": db("days-without-workers"),
    "wgen": db("worker-generation"),
    "startup": db("startup"),
    "judge": ("tests", ["npx", "vitest", "run", "--config", "vitest.privacy.config.ts", "src/privacy/members.test.ts"]),
    "matrix": ("tests", ["npx", "vitest", "run", "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts",
                         "-t", "answers the (author|star|member who joined)"]),
}

# Changes shown to change no answer (the README says why).
EQUIVALENT = {"M03", "M11"}

FRI = "is the contract's Friday: Debby's day is open, so Debby's next is the 13th, and Nina is next up"
STRANGER = "gives nothing to a stranger, to an id nobody has, to what can't be an id, or of a suspended club"
INFLIGHT = "waits for a confirmation in flight and reads the week only once it has the club's row"
LOCKED = "samples its clock only once it holds the club's row, and dates its days from that sample"
UNDER = "owes nothing to a club under two members, one not started, or a suspended one"
FQ61 = "makes each date under the version in force on it: the latest that started on or before it"

# (name, file, old, new, suite, the words a failing test's name must begin with)
B = [
    # The rule.
    ("G01 three weeks ahead", GEN, "export const WEEKS_AHEAD = 4;", "export const WEEKS_AHEAD = 3;",
     "rule", "looks four whole weeks past the club's current week"),
    ("G02 the window by days, 28 after today, as the first commit had it", GEN, "7 - today.dayOfWeek + 7 * WEEKS_AHEAD", "7 * WEEKS_AHEAD",
     "rule", "owes, seen from Friday 6 November at 9:41 AM, the 25 dates the contract's example announces"),
    ("G18 the window stops before its last week's Saturday", GEN, "Temporal.PlainDate.compare(date, last) <= 0", "Temporal.PlainDate.compare(date, last.subtract({ days: 1 })) < 0",
     "rule", "owes, seen from Friday 6 November at 9:41 AM, the 25 dates the contract's example announces"),
    ("G03 today is UTC's date", GEN, "const today = now.toZonedDateTimeISO(zone).toPlainDate();", 'const today = now.toZonedDateTimeISO("UTC").toPlainDate();',
     "rule", "takes today and the horizon from the club's zone, not from UTC"),
    ("G04 a day made at its 7 AM", GEN, "if (!(Temporal.Instant.compare(revealAt, now) > 0)) continue;", "if (!(Temporal.Instant.compare(revealAt, now) >= 0)) continue;",
     "rule", "never makes a day late: one whose 7 AM is now or past isn't owed, one a microsecond ahead is"),
    ("G05 a day made after its 7 AM", GEN, "    if (!(Temporal.Instant.compare(revealAt, now) > 0)) continue;\n", "",
     "rule", "owes every assigned date from today to the window's end, in date order, and no Sunday"),
    ("G06 a day before its first date", GEN, "if (!day.starActive || !(day.firstDate <= localDate)) continue;", "if (!day.starActive) continue;",
     "rule", "owes nothing before a day's first date"),
    ("G07 a day for a star who left", GEN, "if (!day.starActive || !(day.firstDate <= localDate)) continue;", "if (!(day.firstDate <= localDate)) continue;",
     "rule", "owes no day to a star who has left, and still owes everyone else's"),
    ("G08 a club of one gets days", GEN, "!(facts.activeMembers >= 2)", "!(facts.activeMembers >= 1)", "rule", UNDER),
    ("G09 a club that hasn't started gets days", GEN, "if (!facts.activated || facts.suspended ||", "if (facts.suspended ||", "rule", UNDER),
    ("G10 a suspended club gets days", GEN, "if (!facts.activated || facts.suspended ||", "if (!facts.activated ||", "rule", UNDER),
    ("G11 a made date owed again", GEN, "    if (facts.made.has(localDate)) continue;\n", "",
     "rule", "doesn't owe a date already made, whoever's it was"),
    ("G12 the first version stays in force", GEN, "version.effectiveFrom <= localDate).at(-1)", "version.effectiveFrom <= localDate).at(0)", "rule", FQ61),
    ("G13 a version in force before it starts", GEN, "versions.filter((version) => version.effectiveFrom <= localDate).at(-1)", "versions.at(-1)", "rule", FQ61),
    ("G14 the versions in the order given", GEN, "(a.effectiveFrom < b.effectiveFrom ? -1 : 1)", "(a.effectiveFrom < b.effectiveFrom ? 1 : -1)", "rule", FQ61),
    ("G15 the instants in UTC", GEN, "dayInstants(date, zone)", 'dayInstants(date, "UTC")',
     "rule", "names each day's star, its version and its two instants, each resolved in the club's zone"),
    ("G16 any zone Temporal takes", GEN, "const zone = clubTimeZone(facts.zone);", "const zone = facts.zone;",
     "rule", "refuses a zone that isn't an IANA name, instead of guessing one"),
    ("G17 Sunday is someone's day", GEN, "const weekday = WEEKDAYS[date.dayOfWeek - 1];", "const weekday = WEEKDAYS[date.dayOfWeek % 6];",
     "rule", "owes every assigned date from today to the window's end, in date order, and no Sunday"),
    # The order.
    ("O01 the first days ordered by the week", ORD, "if (facts.firstDaysOpen || facts.inForce === null) return joined;", "if (facts.inForce === null) return joined;",
     "rule", "is the order they joined while the first days are open, whoever has confirmed"),
    ("O02 two days placed by the later", ORD, "index < known", "index > known", "rule", "places a member with two days by the earlier"),
    ("O03 a member with no day first", ORD, "?? WEEKDAYS.length", "?? -1", "rule", "puts anyone with no day in force last, in the order they joined"),
    ("O04 a member twice", ORD, '  if (new Set(joined).size !== joined.length) throw new Error("schedule: a member is in the roster twice");\n', "",
     "rule", "lists every member once, and refuses a roster that names one twice"),
    # The command.
    ("M01 no lock on the club", MK, "WHERE id = ${clubId} FOR UPDATE`;", "WHERE id = ${clubId}`;", "makedays", LOCKED),
    ("M02 the clock before the lock", MK, "  const now = await clock.sample(tx);\n", "  const now = BEFORE_LOCK;\n", "makedays", LOCKED),
    ("M03 no ON CONFLICT", MK, "      ON CONFLICT (club_id, local_date) DO NOTHING\n", "",
     "makedays", "makes each day once when two runs meet, and each run counts only its own"),
    ("M04 collecting from the database's own now", MK, "              ${now}::pg_catalog.timestamptz)", "              pg_catalog.clock_timestamp())",
     "makedays", "makes each owed day once, for its star, under its version, with its instants, collecting from the sample"),
    ("M05 former members counted", MK, "WHERE m.club_id = c.id AND m.state = 'active') AS active_members", "WHERE m.club_id = c.id) AS active_members",
     "makedays", "makes no day for a club left with one member (FQ16), and keeps the days it had"),
    ("M06 every star taken as a member", MK, "'star_active', s.state = 'active'", "'star_active', true",
     "makedays", "makes no day for a member who has left, and goes on making everyone else's"),
    ("M07 a suspended club's days made", MK, "c.suspended_at IS NOT NULL AS suspended", "false AS suspended",
     "makedays", "makes no day for a suspended club (spec 22), and makes them again once it is lifted"),
    ("M08 anything taken as a club's id", MK, '  if (typeof clubId !== "string" || !ID.test(clubId)) throw new TypeError("schedule: the club is a club id");\n', "",
     "makedays", "makes nothing for a club with no week, for an id nobody has, and refuses what can't be an id"),
    ("M09 every club listed", MK, "WHERE EXISTS (SELECT FROM app.schedule_versions v WHERE v.club_id = c.id)\n", "WHERE TRUE\n",
     "makedays", "lists the clubs that have a week, in id order, and no club without one"),
    ("M10 the list in reverse", MK, 'ORDER BY c.id COLLATE "C"`;', 'ORDER BY c.id COLLATE "C" DESC`;',
     "makedays", "lists the clubs that have a week, in id order, and no club without one"),
    ("M11 a made date not read", MK, "made: new Set(list(row[\"made\"]).map(date)),", "made: new Set(),",
     "makedays", "makes nothing a second time, and only the new week when the club's Monday comes"),
    ("M13 neither the read of made dates nor ON CONFLICT", MK, "made: new Set(list(row[\"made\"]).map(date)),", "made: new Set(),",
     "makedays", "makes nothing a second time, and only the new week when the club's Monday comes"),
    ("M14 the week read before the club's row is held", MK, "@@facts-before-lock", "", "makedays", INFLIGHT),
    ("M15 no lock on the club, with a confirmation in flight", MK, "WHERE id = ${clubId} FOR UPDATE`;", "WHERE id = ${clubId}`;", "makedays", INFLIGHT),
    ("M16 every club taken as started", MK, "c.activated_at IS NOT NULL AS activated", "true AS activated",
     "makedays", "makes no day for a club that hasn't started, though its rows hold a week"),
    ("M17 every week read as starting on one date", MK, "'id', v.id, 'effective_from', v.effective_from,", "'id', v.id, 'effective_from', '2026-01-01'::pg_catalog.date,",
     "makedays", "makes each date under the week in force on it, and a later week's days only from its start"),
    ("M12 a day made late by the command", MK, "for (const day of daysToMake(facts, now)) {", "for (const day of daysToMake(facts, now.subtract({ hours: 1 }))) {",
     "makedays", "never makes a day at or after its 7 AM"),
    # The day rule's two forms.
    ("D01 every member's next is the club's", DAYS, "const whose = ofMember ? bound(sql)`o.star_interval_id = sm.interval_id` : bound(sql)`TRUE`;", "const whose = ofMember ? bound(sql)`TRUE` : bound(sql)`TRUE`;",
     "members", FRI),
    ("D02 the same, with no worker", DAYS, "const whose = ofMember ? bound(sql)`o.star_interval_id = sm.interval_id` : bound(sql)`TRUE`;", "const whose = ofMember ? bound(sql)`TRUE` : bound(sql)`TRUE`;",
     "q18", "moves from Debby's Friday to Nina's Saturday at 7 AM and 1 AM by the clock alone"),
    ("D03 a former member's next day listed", DAYS, "JOIN app.memberships sm ON sm.club_id = c.id AND sm.state = 'active'", "JOIN app.memberships sm ON sm.club_id = c.id",
     "homedays", "holds a day whose star left a microsecond before its reveal, by leaving, a block or a deletion: never open, never next"),
    ("D04 a suspended club's next days", DAYS, "sm.state = 'active'\n     WHERE c.suspended_at IS NULL", "sm.state = 'active'\n     WHERE TRUE",
     "homedays", "gives nothing in a suspended club, and a paused club's days as its rows hold them"),
    ("D05 a former member reads next days", DAYS, "@@nextDaysByStar-viewer", "",
     "homedays", "gives a stranger, a former member, an account being deleted, an account with no club and an unknown account nothing"),
    ("D06 the policy's next is the club's", DAYS, "days: facts.days.filter((day) => day.starInterval === starInterval)", "days: facts.days",
     "homedays", "never mixes them: each club's days carry its own id, star and date, whatever the other's hold"),
    # The roster.
    ("L01 the roster for any membership row", MEM, "JOIN (${activeMemberships(sql, userId)}) am ON am.club_id = c.id",
     "JOIN (SELECT m.club_id, m.interval_id FROM app.memberships m WHERE m.user_id = ${userId}) am ON am.club_id = c.id", "members", STRANGER),
    ("L02 a member who left stays listed", MEM, "WHERE s.club_id = c.id AND s.state = 'active') AS members", "WHERE s.club_id = c.id) AS members",
     "members", "drops a member who has left from the list, keeps everyone else's position without a gap"),
    ("L03 everyone is next up", MEM, "nextUp: clubNext !== null && clubNext.star.membershipId === memberId,", "nextUp: clubNext !== null,", "members", FRI),
    ("L04 positions from 0", MEM, "position: index + 1,", "position: index,",
     "members", "lists every member in the order they joined, the confirmed with their first date, the others with none"),
    ("L05 the members by id, not by joining", MEM, 'ORDER BY s.joined_at, s.interval_id COLLATE "C"), \'[]\'', 'ORDER BY s.interval_id COLLATE "C"), \'[]\'',
     "members", "lists every member in the order they joined, the confirmed with their first date, the others with none"),
    ("L06 the first days never open", MEM, "AND p.reason = 'activation' AND p.state = 'open') AS first_days_open", "AND p.reason = 'activation' AND p.state = 'applied') AS first_days_open",
     "members", "keeps the order they joined whichever days are confirmed, so no row moves when a member confirms"),
    ("L07 a week in force before it starts", MEM, "    .filter((version) => version.effectiveFrom <= today)\n", "",
     "members", "follows the week in force on the club's own date: a later week moves the rows only from its start"),
    ("L08 the earliest week stays in force", MEM, "(a.effectiveFrom < b.effectiveFrom ? -1 : 1))\n    .at(-1);", "(a.effectiveFrom < b.effectiveFrom ? -1 : 1))\n    .at(0);",
     "members", "follows the week in force on the club's own date: a later week moves the rows only from its start"),
    ("L11 same-instant joiners in the reverse order", MEM, 'ORDER BY s.joined_at, s.interval_id COLLATE "C"), \'[]\'', 'ORDER BY s.joined_at, s.interval_id COLLATE "C" DESC), \'[]\'',
     "members", "lists them by their membership's id, in byte order, the same for every member and every time"),
    ("L09 the roster for any membership row, in the matrix", MEM, "JOIN (${activeMemberships(sql, userId)}) am ON am.club_id = c.id",
     "JOIN (SELECT m.club_id, m.interval_id FROM app.memberships m WHERE m.user_id = ${userId}) am ON am.club_id = c.id", "matrix", "answers the "),
    ("L10 everyone is next up, in the matrix", MEM, "nextUp: clubNext !== null && clubNext.star.membershipId === memberId,", "nextUp: clubNext !== null,", "matrix", "answers the "),
    # The route.
    ("A01 nobody next up in the body", API, "next_up: member.nextUp,", "next_up: false,", "api", "makes sunday_people field for field, but for the cover and the open revision"),
    ("A02 the instant with its fraction", API, "server_now: contractInstant(now),", "server_now: now.toString(),",
     "api", "sends the server's instant in whole seconds, rounded down"),
    ("A03 a null avatar sent", API, "...(member.person.avatarVersion === null ? {} : { avatar_version: member.person.avatarVersion }),", "avatar_version: member.person.avatarVersion,",
     "api", "sends no next day and no avatar where there is none, and nothing else of a member"),
    ("A04 a field outside the list", API, "position: member.position,", "position: member.position, joined: 1,", "api", "makes sunday_people field for field, but for the cover and the open revision"),
    ("A05 the body's field outside the list, in the matrix", API, "position: member.position,", "position: member.position, joined: 1,", "matrix", "answers the "),
    # The worker.
    ("W01 a stop sits out the wait", LOOP, "await Promise.race([tick, stop]);", "await tick;",
     "worker", "ends a wait at once when it is told to stop: it doesn't sit out the minute"),
    ("W02 a pass that throws ends the loop", LOOP, "      loop.failed(error);", "      throw error;", "worker", "reports a pass that throws and goes on to the next"),
    ("W03 a wait of zero", LOOP, "!Number.isFinite(loop.everyMs) || loop.everyMs <= 0", "!Number.isFinite(loop.everyMs)", "worker", "refuses a wait that isn't positive, which would spin"),
    ("W04 no first pass before a wait", LOOP, "@@loop-wait-first", "", "worker", "runs a pass at the start, before any wait"),
    ("W05 a failure's message reported", PASS, 'const name = error instanceof Error ? error.constructor.name : "a thrown value";', "const name = error instanceof Error ? error.message : String(error);",
     "worker", "is the error's class and its code, never what it says"),
    ("W06 any code reported", PASS, '/^[A-Za-z0-9_]{1,32}$/.test(code)', "code.length > 0", "worker", "drops a code that isn't a plain word, which could carry anything"),
    ("W07 a line for a pass that made nothing", PASS, "if (result.made > 0) out.push", "if (result.made >= 0) out.push", "worker", "says nothing when nothing was made and nothing failed"),
    ("W08 one club's failure ends the pass", PASS, "      failures.push(`${ID.test(id) ? id : \"a club with no id\"}: ${describeFailure(error)}`);", "      throw error;",
     "wgen", "goes on to the next club when one fails, and reports the failure by the error's class alone"),
    ("W09 the whole pass in one transaction", PASS, "@@pass-one-tx", "", "wgen", "commits each club on its own: a club made before one that waits is already there"),
    ("W10 the line names the club", PASS, "worker: made ${String(result.made)} ${result.made === 1 ? \"day\" : \"days\"}`", "worker: made ${String(result.made)} ${result.made === 1 ? \"day\" : \"days\"} in ${String(result.clubs)} clubs`",
     "worker", "says how many days were made, and nothing of which club or whose"),
    ("W11 SIGINT not handled", MAIN, 'for (const signal of ["SIGTERM", "SIGINT"] as const) {', 'for (const signal of ["SIGTERM"] as const) {', "startup", "stops on SIGINT with exit code 0, and says which"),
    ("W12 the started line before the handlers", MAIN, "@@main-line-first", "", "startup", "stops cleanly on a SIGTERM that comes as it writes its started line: its handlers are in place first"),
    ("W13 a lock limit of twenty seconds", PASS, "${`${String(LOCK_WAIT_MS)}ms`}", '${"20000ms"}',
     "wgen", "gives up on a club whose row stays held, names it by its id and Postgres's code, and makes the next club's days"),
    ("W14 a stop not seen between clubs", PASS, "    if (stopping()) break;\n", "", "wgen", "visits no further club once it is told to stop, and finishes the one it is on"),
    ("W15 no club visited when no list is given", PASS, "clubs: (sql: WorkerSql) => Promise<readonly string[]> = clubsWithAWeek,", "clubs: (sql: WorkerSql) => Promise<readonly string[]> = () => Promise.resolve([]),",
     "wgen", "visits every club with a week when it is given no list"),
    ("W16 the handlers taken down after one signal", MAIN, "      process.on(signal, () => {", "      process.once(signal, () => {",
     "startup", "finishes its stop when a second signal comes: the handlers stay, so the default action never ends it"),
    ("W17 Postgres's notices printed", CONN, "onnotice: () => undefined, ", "", "worker", "prints no notice Postgres sends: a notice can quote a row's values"),
    ("W18 a failed club's line on stdout", PASS, "return { out, err: result.failures.map((failure) => `worker: a club's days failed: ${failure}`) };", "return { out: [...out, ...result.failures], err: [] };",
     "worker", "gives each failed club one line, for the error stream, apart from the count"),
    ("W19 a failed club not named", PASS, '`${ID.test(id) ? id : "a club with no id"}: ${describeFailure(error)}`', "describeFailure(error)",
     "wgen", "gives up on a club whose row stays held, names it by its id and Postgres's code, and makes the next club's days"),
    ("W20 the pass's wait cut short", LOOP, "timer = setTimeout(resolve, loop.everyMs);", "timer = setTimeout(resolve, loop.everyMs / 10);",
     "worker", "waits its whole wait between the end of one pass and the start of the next"),
]


def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


def swap(text, old, new):
    assert text.count(old) == 1, (old[:60], text.count(old))
    return text.replace(old, new)


SPECIAL = {
    "D05": lambda t: swap(t, "AND sm.state = 'active'\n     WHERE c.suspended_at IS NULL\n       AND EXISTS (SELECT FROM app.memberships m JOIN app.users u ON u.id = m.user_id\n                    WHERE m.club_id = c.id AND m.user_id = ${viewer}::pg_catalog.text\n                      AND m.state = 'active' AND u.state = 'active')",
                          "AND sm.state = 'active'\n     WHERE c.suspended_at IS NULL\n       AND EXISTS (SELECT FROM app.memberships m JOIN app.users u ON u.id = m.user_id\n                    WHERE m.club_id = c.id AND m.user_id = ${viewer}::pg_catalog.text\n                      AND u.state = 'active')"),
    "W04": lambda t: swap(t, "  while (!stopping()) {\n    try {", "  while (!stopping()) {\n    await new Promise((resolve) => setTimeout(resolve, loop.everyMs));\n    try {"),
    "W09": lambda t: t[:t.index("  for (const id of ids) {\n")]
        + "  await sql.begin(async (tx) => {\n    for (const id of ids) {\n      visited += 1;\n      made += await makeDays(tx, clock, id);\n    }\n  });\n"
        + t[t.index("  return { clubs: visited, made, failures };"):],
    "M14": lambda t: swap(swap(t, "WHERE id = ${clubId} FOR UPDATE`;", "WHERE id = ${clubId}`;"),
                          "  // 4. The days.\n", "  await bound(tx)`SELECT FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;\n  // 4. The days.\n"),
    "W12": lambda t: swap(swap(t, '  process.stdout.write("worker: started, making days every minute\\n");\n', ""),
                          "  const stopped = new Promise<string>((resolve) => {", '  process.stdout.write("worker: started, making days every minute\\n");\n  await new Promise((resolve) => setTimeout(resolve, 300));\n  const stopped = new Promise<string>((resolve) => {'),
}


def edit(name, text, old, new):
    code = name.split()[0]
    if code in SPECIAL:
        return SPECIAL[code](text)
    changed = swap(text, old, new)
    if code == "M13":
        changed = swap(changed, "      ON CONFLICT (club_id, local_date) DO NOTHING\n", "")
    if code == "M02":
        lock = "  const [club] = await bound(tx)`SELECT timezone FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;"
        changed = swap(changed, lock, "  const BEFORE_LOCK = await clock.sample(tx);\n" + lock)
    return changed


def main():
    args = sys.argv[1:]
    if args == ["--check"]:
        bad = 0
        for name, path, old, new, suite, prefix in B:
            text = (ROOT / path).read_text()
            try:
                changed = edit(name, text, old, new)
                ok = changed != text and suite in SUITES and not prefix.startswith("@@")
            except AssertionError as e:
                ok = False
                print("  ", e)
            if not ok:
                bad += 1
                print("BAD", name)
        print(len(B), "entries,", bad, "bad")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for name, path, old, new, suite, prefix in B:
        code = name.split()[0]
        if args and code not in args:
            continue
        p = ROOT / path
        orig = p.read_text()
        try:
            p.write_text(edit(name, orig, old, new))
            (OUT / f"{code}.patch").write_text(run(["git", "diff"]).stdout)
            cwd, cmd = SUITES[suite]
            r = run(cmd, cwd=ROOT / cwd)
            out = r.stdout + r.stderr
            (OUT / f"{code}.txt").write_text(out)
            failed = sorted({l.strip()[2:].strip()[:170] for l in out.splitlines() if l.strip().startswith("×")})
            summary = [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")]
            caught = any(prefix[:105] in f for f in failed)
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
    print("restored:", repr(run(["git", "status", "--short"]).stdout), flush=True)


if __name__ == "__main__":
    main()
