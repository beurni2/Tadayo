"""Deliberate breakages of B1's first clubs PR (api/b1-create-club), one change each, in a scratch worktree.

For each: change the one place, run the suite registered for it, and check that a test whose name begins
with the pre-registered words fails. The file is restored after each. Nothing else may use the local
database meanwhile.

  breakages.py --check        count every anchor, change nothing
  breakages.py R02 C03 ...    only these
"""

import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path("/home/user/tadayo-b1-mut")
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(SP) / "b1/brk/out"
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
READ = "packages/domain/src/clubs/club.ts"
MAKE = "packages/domain/src/clubs/create-club.ts"
API = "services/api/src/clubs/club.ts"
JUDGE = "tests/src/privacy/club.ts"

PRIV = ["npx", "vitest", "run", "--config", "vitest.privacy.config.ts"]
SUITES = {
    "db": ("tests", ["npx", "vitest", "run", "--config", "vitest.db.config.ts", "src/db/create-club.test.ts"]),
    "api": ("services/api", ["npx", "vitest", "run", "src/clubs/club.test.ts", "src/app.test.ts"]),
    "judge": ("tests", [*PRIV, "src/privacy/club.test.ts"]),
    "matrix": ("tests", [*PRIV, "src/privacy/matrix.test.ts", "-t", "answers the (star|former member) as"]),
}

# Changes shown to change no answer (the README says why).
EQUIVALENT = {"A04"}

MEMBER = "gives a member the club, its state, its members counted, its next day, the roster's version and room to propose"
NOBODY = "gives nothing to a stranger, a former member, someone invited, an account being deleted, or for an id nobody has (T14)"
SIX = "names the open roster revision, and counts its open candidate towards six, never who accepted (A01, T33)"
MADE = "makes a proposed club of one, its creator, at the server clock's sample, and answers it as its creator reads it (T1, T7)"
RETRY = "answers a retry with the first club, as it was answered, makes no second, and gives the clock's sample of the retry (T1)"
A201 = "answers 201 with the club and the clock's sample of this request, for the caller alone (T1)"
BARE = "sends no day and no open revision where there is none, and nothing else of a club"
JOIN = "JOIN (${activeMemberships(sql, userId)}) am ON am.club_id = c.id"

# (name, file, old, new, suite, the words a failing test's name must begin with)
B = [
    # The read.
    ("R01 anyone who ever had a membership reads the club", READ, JOIN,
     "JOIN (SELECT m.club_id, m.interval_id FROM app.memberships m WHERE m.user_id = ${userId}::pg_catalog.text) am ON am.club_id = c.id",
     "db", NOBODY),
    ("R02 the members' number counts those who left", READ, "WHERE a.club_id = c.id AND a.state = 'active'),", "WHERE a.club_id = c.id),",
     "db", "says paused under two active members, and counts only the active ones (FQ16)"),
    ("R03 a candidate no longer open still takes a place", READ, "WHERE k.club_id = c.id AND k.state = 'open') AS open_candidates", "WHERE k.club_id = c.id) AS open_candidates",
     "db", SIX),
    ("R04 a seventh person can be proposed", READ, 'count(row["open_candidates"]) < CLUB_SIZE', 'count(row["open_candidates"]) <= CLUB_SIZE',
     "db", SIX),
    ("R05 open candidates take no place", READ, 'club.memberCount + count(row["open_candidates"]) < CLUB_SIZE', "club.memberCount < CLUB_SIZE",
     "db", SIX),
    ("R06 a club of seven", READ, "export const CLUB_SIZE = 6;", "export const CLUB_SIZE = 7;",
     "db", SIX),
    ("R07 a closed revision named as open", READ, "WHERE r.club_id = c.id AND r.state = 'open') AS open_revision_id", "WHERE r.club_id = c.id ORDER BY r.id LIMIT 1) AS open_revision_id",
     "db", MEMBER),
    ("R08 any club of the caller's answers for any id", READ, "     WHERE c.id = ${clubId}::pg_catalog.text`;", "     LIMIT 1`;",
     "db", NOBODY),
    ("R09 the days read at the database's now, not the instant asked", READ, "LEFT JOIN (${daysByClub(sql, userId, now)}) h", "LEFT JOIN (${daysByClub(sql, userId, new Date().toISOString() as unknown as ServerNow)}) h",
     "db", "gives the open day while it is open, at the instant asked (T1, T5)"),
    ("R10 the roster's version always 0", READ, 'rosterVersion: count(row["roster_version"]),', "rosterVersion: 0,",
     "db", MEMBER),
    # The command.
    ("C01 a retry makes a second club", MAKE, "  if (first !== null) return { answer: first.replay, at };\n", "",
     "db", RETRY),
    ("C02 a retry answered with the club as it is now", MAKE, "  if (first !== null) return { answer: first.replay, at };",
     "  if (first !== null) {\n    const again = (first.replay as { club: { id: string } }).club.id;\n    const fresh = await readClub(tx, userId, again, at);\n    return { answer: fresh === null ? first.replay : render(fresh), at };\n  }",
     "db", "answers a retry with the first answer though the club has changed since"),
    ("C03 an account being deleted makes a club", MAKE, 'if (account === undefined || account["state"] !== "active") throw', "if (account === undefined) throw",
     "db", "refuses an account whose deletion has begun since the gate read it, as no session, and leaves nothing"),
    ("C04 an account with no name makes a club", MAKE, '  if (typeof account["display_name"] !== "string") throw new Refused("PROFILE_INCOMPLETE");\n', "",
     "db", "refuses an account with no name yet, as the gate does"),
    ("C05 the account's row read without its lock", MAKE, "WHERE id = ${userId} FOR NO KEY UPDATE`;", "WHERE id = ${userId}`;",
     "db", "waits for a deletion that holds the account's row, and is refused once it commits, with no club and no receipt (T27)"),
    ("C06 the zone stored as it was sent", MAKE, "    timezone = clubTimeZone(input.timezone);", "    clubTimeZone(input.timezone);\n    timezone = input.timezone;",
     "db", "stores the zone in the server's one spelling, whatever case it came in (T2, FQ19)"),
    ("C07 a zone the server can't resolve is a failure, not a refusal", MAKE, '    if (error instanceof RangeError) throw new Refused("INVALID_REQUEST", { field: "timezone" });\n', "",
     "db", "refuses a zone the server can't resolve that reaches the command, naming the field, and leaves nothing"),
    ("C08 the receipt stored as a 200", MAKE, "completeReceipt(tx, receipt, render(detail), 201)", "completeReceipt(tx, receipt, render(detail))",
     "db", "keeps the receipt with the club: completed, 201, at the same sample, and without the server's instant (T19)"),
    ("C09 the membership dated by the database, not the clock's sample", MAKE, "${userId}, 'creator', ${at}::pg_catalog.timestamptz)`;", "${userId}, 'creator', pg_catalog.clock_timestamp())`;",
     "db", MADE),
    ("C10 the club dated by the database, not the clock's sample", MAKE, "${intervalId}, ${at}::pg_catalog.timestamptz)`;", "${intervalId}, pg_catalog.clock_timestamp())`;",
     "db", MADE),
    ("C11 another zone under a used key is the same request", MAKE, "body: { name: input.name, timezone: input.timezone } },", "body: { name: input.name } },",
     "db", "refuses another name or another zone under a used key, and makes nothing"),
    ("C12 another name under a used key is the same request", MAKE, "body: { name: input.name, timezone: input.timezone } },", "body: { timezone: input.timezone } },",
     "db", "refuses another name or another zone under a used key, and makes nothing"),
    ("C13 the receipt reserved after the club is made", MAKE, "  const first = await reserveReceipt(tx, receipt, at);\n  if (first !== null) return { answer: first.replay, at };\n", "",
     "db", RETRY),
    ("C14 a retry refused once its sender has lost the club", MAKE, "  if (first !== null) return { answer: first.replay, at };",
     "  if (first !== null) {\n    const id = (first.replay as { club: { id: string } }).club.id;\n    if ((await readClub(tx, userId, id, at)) === null) throw new Refused(\"NOT_FOUND\");\n    return { answer: first.replay, at };\n  }",
     "db", "answers a retry with the first answer to its sender though the club is suspended or its creator has left"),
    # The routes.
    ("A01 the answer without the server's instant", API, "return created(reply, withServerNow(made.at, made.answer));", "return created(reply, made.answer);",
     "api", A201),
    ("A02 a new club answered 200", API, "return created(reply, withServerNow(made.at, made.answer));", "return ok(reply, withServerNow(made.at, made.answer));",
     "api", A201),
    ("A03 any Idempotency-Key taken", API, 'if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {', 'if (typeof key !== "string") {',
     "api", "names the Idempotency-Key when it is missing or isn't a UUID, whatever else is wrong"),
    ("A04 an unknown key of the body named back", API, 'if (typeof field === "string" && FIELDS.includes(field)) return field;', 'if (typeof field === "string") return field;',
     "api", "names the first bad field in the contract's order, never a value, and reads no database for it"),
    ("A05 a club nobody may read answered 200", API, 'return body === null ? problem(reply, "NOT_FOUND") : ok(reply, body);', "return ok(reply, body ?? {});",
     "api", "answers the neutral not-found when the read finds nothing, and never a 200 with an empty body (T14)"),
    ("A06 a field beyond the contract's", API, "    roster_version: detail.rosterVersion,", "    roster_version: detail.rosterVersion,\n    suspended: false,",
     "api", BARE),
    ("A07 a day sent as null where there is none", API, "...(club.openDay === null ? {} : { open_day: occurrenceBody(club.openDay) }),", "open_day: club.openDay === null ? null : occurrenceBody(club.openDay),",
     "api", BARE),
    ("A08 the instant with its fraction", API, "return { server_now: contractInstant(now), ...", "return { server_now: now.toString(), ...",
     "api", "sends the server's instant in whole seconds, rounded down, and keeps it out of what a receipt stores"),
    ("A09 a refusal becomes a failure", API, "      if (error instanceof Refused) return refusal(reply, error);\n", "",
     "api", "answers a refusal as the contract's error, with nothing of the request in it"),
    ("A10 the caller's membership id is the club's id", API, "my_membership_id: club.membershipId,", "my_membership_id: club.id,",
     "api", "makes sunday_people field for field"),
    ("A11 the receipt keeps the server's instant", API, "createClub(tx, deps.clock, input, clubDetailBody)", "createClub(tx, deps.clock, input, (d) => withServerNow(Temporal.Now.instant(), clubDetailBody(d)))",
     "matrix", "answers the star"),
    ("A12 the body read before the key", API, "    const parsed = CreateClubRequest.safeParse(request.body);\n    if (!parsed.success) {\n      const field = firstBadField(parsed.error.issues);\n      return problem(reply, \"INVALID_REQUEST\", field === undefined ? {} : { field });\n    }\n", "",
     "api", "names the first bad field in the contract's order, never a value, and reads no database for it"),
    ("A13 createClub takes the app's general body limit", "services/api/src/app.ts", "  createClub: 17 * 1024,\n", "",
     "api", "refuses a body past the route's limit unread, and takes the largest body the contract allows"),
    # Against the whole matrix.
    ("X07 anyone reads any club", READ, JOIN,
     "JOIN (SELECT m.club_id, m.interval_id FROM app.memberships m WHERE m.state = 'active') am ON am.club_id = c.id",
     "matrix", "answers the star"),
    ("X01 a former member reads the club", READ, JOIN,
     "JOIN (SELECT m.club_id, m.interval_id FROM app.memberships m WHERE m.user_id = ${userId}::pg_catalog.text) am ON am.club_id = c.id",
     "matrix", "answers the former member"),
    ("X02 a field beyond the contract's, in the matrix", API, "    roster_version: detail.rosterVersion,", "    roster_version: detail.rosterVersion,\n    suspended: false,",
     "matrix", "answers the star"),
    ("X03 a retry makes a second club, in the matrix", MAKE, "  if (first !== null) return { answer: first.replay, at };", "  if (first !== null && first === undefined) return { answer: first.replay, at };",
     "matrix", "answers the star"),
    ("X04 a new club answered 200, in the matrix", API, "return created(reply, withServerNow(made.at, made.answer));", "return ok(reply, withServerNow(made.at, made.answer));",
     "matrix", "answers the star"),
    ("X05 the zone stored as it was sent, in the matrix", MAKE, "    timezone = clubTimeZone(input.timezone);", "    clubTimeZone(input.timezone);\n    timezone = input.timezone;",
     "matrix", "answers the star"),
    # The matrix's own judges.
    ("J01 paused only with nobody", JUDGE, 'members < 2 ? "paused"', 'members < 1 ? "paused"',
     "judge", "says proposed until the club has started, paused under two active members, and active otherwise (FQ16)"),
    ("J02 a started club never proposed", JUDGE, '!roster.activated ? "proposed"', 'false ? "proposed"',
     "judge", "says proposed until the club has started, paused under two active members, and active otherwise (FQ16)"),
    ("J03 room for a seventh", JUDGE, "can_propose: members + roster.openCandidates < SIX,", "can_propose: members + roster.openCandidates <= SIX,",
     "judge", "has room to propose only under six, the candidates still open counted, and names the open revision"),
    ("J04 open candidates not counted", JUDGE, "can_propose: members + roster.openCandidates < SIX,", "can_propose: members < SIX,",
     "judge", "has room to propose only under six, the candidates still open counted, and names the open revision"),
    ("J05 any Cache-Control accepted", JUDGE, '    if (answer.headers["cache-control"] !== "private, no-store") return ["the club without private, no-store"];\n', "",
     "judge", "accepts the right answer whatever the order of its keys, and only with private, no-store"),
    ("J06 any status accepted", JUDGE, "    if (answer.status !== status) return [`status ${String(answer.status)}, not ${String(status)} with the club`];\n", "",
     "judge", "holds a 201 to the club's rows, value for value, and refuses a 200 with the same body"),
    ("J07 anything accepted for someone the club isn't for", JUDGE, "return want === undefined ? pinnedProblems(answer, NEUTRAL) : sameDetail(200, want)(answer);", "return want === undefined ? [] : sameDetail(200, want)(answer);",
     "judge", "holds anyone the club isn't for to the neutral not-found, byte for byte"),
    ("J08 the club expected for anyone", JUDGE, "if (viewer === undefined || row === undefined || roster === undefined) return undefined;", "if (row === undefined || roster === undefined) return undefined;",
     "judge", "is nothing for a stranger, a caller with no account, a former member, a deleting account, a suspended club and a club with no rows"),
    ("J09 a club's id read from any answer", JUDGE, "  if (answer.status !== 201) return undefined;\n", "",
     "judge", "reads the new club's id from a 201 and from nothing else"),
    ("J10 a new club with any number of members", JUDGE, '    ["member_count", club.member_count, 1],\n', "",
     "judge", "refuses two members"),
    ("J11 createClub not judged", JUDGE, 'new Set(["getClub", "createClub"])', 'new Set(["getClub"])',
     "judge", "judges getClub and createClub and nothing else"),
    ("J12 the retry under a key of its own", JUDGE, '{ name: "the same request again under its key", body: good, key, expected: "replay" },', '{ name: "the same request again under its key", body: good, key: fresh(), expected: "replay" },',
     "judge", "sends what the contract refuses first, then one club, its retry under the same key and another body under it"),
    ("J13 the instant rounded up", JUDGE, 'roundingMode: "floor"', 'roundingMode: "ceil"',
     "judge", "is the club for each member, with the viewer's own interval and the instant rounded down"),
    ("J14 the open revision never expected", JUDGE, "    ...(roster.openRevision === null ? {} : { open_revision_id: roster.openRevision }),\n", "",
     "judge", "has room to propose only under six, the candidates still open counted, and names the open revision"),
    ("J15 the body past the limit is under it", JUDGE, '"a".repeat(17 * 1024)', '"a".repeat(64)',
     "judge", "pins each refusal byte for byte, the unread body with its connection closed"),
]


def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


def swap(text, old, new):
    assert text.count(old) == 1, (old[:60], text.count(old))
    return text.replace(old, new)


def edit(name, text, old, new):
    return swap(text, old, new)


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
