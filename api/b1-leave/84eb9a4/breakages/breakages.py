"""Deliberate breakages of B1's fourth clubs PR (api/b1-leave), one change each, in a scratch worktree.

For each: change the one place (one entry changes two places that only break together), run the suite
registered for it, and check that a test whose name holds the pre-registered words fails. The file is
restored after each. Nothing else may use the local database meanwhile.

  breakages.py --check        count every anchor, change nothing
  breakages.py L01 A02 ...    only these
"""

import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path("/home/user/tadayo-b1l-mut")
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(SP) / "b1l/brk/out"
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
LEAVE = "packages/domain/src/clubs/leave-club.ts"
ACC = "packages/domain/src/clubs/accept-invitation.ts"
API = "services/api/src/clubs/leave.ts"
JUDGE = "tests/src/privacy/leave.ts"
IJUDGE = "tests/src/privacy/invitation.ts"

PRIV = ["npx", "vitest", "run", "--config", "vitest.privacy.config.ts"]
DB = ["npx", "vitest", "run", "--config", "vitest.db.config.ts"]
SUITES = {
    "db": ("tests", [*DB, "src/db/leave-club.test.ts"]),
    "api": ("services/api", ["npx", "vitest", "run", "src/clubs/leave.test.ts"]),
    "judge": ("tests", [*PRIV, "src/privacy/leave.test.ts", "src/privacy/invitation.test.ts"]),
    "matrix": ("tests", [*PRIV, "src/privacy/matrix.test.ts", "-t", "answers the star as"]),
}

# Changes shown to change no answer (the README says why).
EQUIVALENT = set()

T_ROW = "ends the member's interval at the clock's sample"
T_NOTHING = "gives the person who left nothing of the club, and the others a club without them"
T_CREATOR = "lets the creator leave a club that hasn't started"
T_CARRY = "ends the leaver's own candidates and carries the others into a revision of the members who stay"
T_LINK = "keeps a carried candidate's link good, to accept the new roster with"
T_PROPOSER = "ends the whole proposal when its proposer is the one leaving"
T_RETRY = "answers a retry after leaving with the first answer, byte for byte"
T_CHOICE = "gives the neutral not-found to another choice under the key of a leave, and keeps the first"
T_ALIKE = "reads a used key alike for a club nobody has, a club left and a suspended one the account is in"
T_REJOIN = "gives a member who joined again the neutral not-found for the key they left with"
T_CLOCK = "dates the leave by the clock as it reads once the row is the leave's"
T_RENAME = "carries a name nobody has approved as that, with no approval"
T_FORMER = "tells someone who joined by a link and left nothing through that link"
T_SUSP = "doesn't answer the key of an earlier leave to someone who joined again, once the club is suspended"
T_CLUBKEY = "keeps the club in the receipt: the key of a leave leaves no other club"
T_EMPTY = "ends a proposal with nothing left to carry, though its proposer stays"
T_SECOND = "gives the neutral not-found to a second leave behind the first"
H_WHOLE = "sends the instant in whole seconds, rounded down, and the choice as it was made"
H_KEY = "names the Idempotency-Key when it is missing or isn't a UUID"
H_FIELD = "names the choice when it is missing or isn't keep or withdraw"
H_MAP = "maps each refusal: the neutral not-found, and a key used for another request"
J_ROW = "catches each part of the membership's row that is wrong"
J_VERSION = "catches another member's interval ended, the leaver's own left active, and a version"
J_OPEN = "catches the leaver's candidate left open"
J_EACH = "catches each way the ended revision and the new one can be wrong"
J_NAME = "asks a name's revision to stay one, with no approval"
J_GONE = "carries nothing for a proposer who was no member before the leave"
K_NEWER = "tells a candidate nothing of a newer revision that doesn't list them, and a person who left nothing at all"
M_STAR = "answers the star"

RECHECK = '  if ((await activeMember(tx, userId, clubId)) !== asking) throw new Refused("NOT_FOUND");\n'

# (name, file, old, new, suite, words a failing test's name must hold); `old` may be a list of pairs.
B = [
    # The command (leave-club.ts).
    ("L01 a retry after leaving finds nothing", LEAVE, "    return stored.replay;\n", '    throw new Refused("NOT_FOUND");\n', "db", T_RETRY),
    ("L02 an earlier leave's key is answered after the account joined again", LEAVE, '    if (since !== undefined) throw new Refused("NOT_FOUND");\n', "", "db", T_SUSP),
    ("L23 a later interval counts only while it is active", LEAVE, "AND m.joined_at >= r.created_at\n", "AND m.joined_at >= r.created_at AND m.state = 'active'\n", "db", T_REJOIN),
    ("L24 a used key is a conflict to someone who isn't a member", LEAVE, '      if (error instanceof Refused && error.code === "IDEMPOTENCY_CONFLICT") throw new Refused("NOT_FOUND");\n', "", "db", T_ALIKE),
    ("L03 an earlier interval's key is answered to a member who joined again", LEAVE, "await reserveAsMember(tx, receipt, await clock.sample(tx), asking)", "await reserveReceipt(tx, receipt, await clock.sample(tx))", "db", T_REJOIN),
    ("L04 the club's row isn't locked", LEAVE, "WHERE id = ${clubId} FOR UPDATE`;\n" + RECHECK, "WHERE id = ${clubId}`;\n" + RECHECK, "db", T_CLOCK),
    ("L05 who is asking isn't read again under the row", LEAVE, RECHECK, "", "db", T_SECOND),
    ("L06 the clock is read before the row is held", LEAVE, [("  // 3. The club's row, and who is asking, again.\n", "  const at = await clock.sample(tx);\n"), ("  // 4. The clock, after the lock.\n  const at = await clock.sample(tx);\n", "")], None, "db", T_CLOCK),
    ("L07 the choice kept is always keep", LEAVE, "contributions = ${contributions},", "contributions = 'keep',", "db", T_ROW),
    ("L08 the name kept isn't the person's", LEAVE, "ended_display_name = u.display_name", "ended_display_name = 'x' || u.display_name", "db", T_ROW),
    ("L09 the leaver's candidates stay open", LEAVE, "AND proposed_by_interval_id = ${asking} AND state = 'open'`;", "AND proposed_by_interval_id = ${asking} AND state = 'open' AND false`;", "db", T_CARRY),
    ("L10 every open candidate of the club ends", LEAVE, "WHERE club_id = ${clubId} AND proposed_by_interval_id = ${asking} AND state = 'open'`;", "WHERE club_id = ${clubId} AND state = 'open'`;", "db", T_CARRY),
    ("L11 a proposal is carried though its proposer left", LEAVE, 'if (carried.length > 0 && open["proposer_active"] === true) {', "if (carried.length > 0) {", "db", T_PROPOSER),
    ("L12 a proposal with nothing to carry is carried", LEAVE, 'if (carried.length > 0 && open["proposer_active"] === true) {', 'if (open["proposer_active"] === true) {', "db", T_EMPTY),
    ("L13 a name's revision is carried as a proposal", LEAVE, [("        origin,\n", '        origin: "proposal",\n'), ('implicit: origin === "proposal",', "implicit: false,")], None, "db", T_RENAME),
    ("L14 a carried revision always has its proposer's approval", LEAVE, [("        origin,\n", '        origin: "proposal",\n'), ('implicit: origin === "proposal",', "implicit: true,")], None, "db", T_RENAME),
    ("L15 a carried proposal has no approval", LEAVE, 'implicit: origin === "proposal",', "implicit: false,", "db", T_CARRY),
    ("L16 the ended revision doesn't name the new one", LEAVE, "SET state = 'superseded', version = version + 1, superseded_by_id = ${next},\n               ended_at", "SET state = 'did_not_go_ahead', version = version + 1,\n               ended_at", "db", T_CARRY),
    ("L17 the candidates are carried in the other order", LEAVE, "       ORDER BY rc.position`;", "       ORDER BY rc.position DESC`;", "db", T_LINK),
    ("L18 an ended proposal's candidates stay open", LEAVE, "rc.candidate_id = k.id AND k.state = 'open'`;", "rc.candidate_id = k.id AND k.state = 'open' AND false`;", "db", T_PROPOSER),
    ("L19 the roster's version doesn't move", LEAVE, "SET roster_version = roster_version + 1 WHERE id = ${clubId}`", "SET roster_version = roster_version WHERE id = ${clubId}`", "db", T_ROW),
    ("L20 the receipt doesn't hold the club", LEAVE, "path: { club_id: clubId }", "path: {}", "db", T_CLUBKEY),
    ("L21 the receipt doesn't hold the choice", LEAVE, "body: { contributions } }", "body: {} }", "db", T_CHOICE),
    ("L22 the leave ends nobody's interval but answers", LEAVE, "WHERE m.interval_id = ${asking} AND m.state = 'active' AND u.id = m.user_id\n    RETURNING m.interval_id`;\n  if (ended === undefined) throw", "WHERE m.interval_id = ${asking} AND m.state = 'active' AND u.id = m.user_id AND false\n    RETURNING m.interval_id`;\n  if (ended !== undefined) throw", "db", T_ROW),
    # What a leave asks of an acceptance (accept-invitation.ts).
    ("A01 someone who joined by a link and left is told the revision's version", ACC, '  if (facts.candidateState === "joined" && facts.membershipId === null) return { kind: "nothing" };\n', "", "db", T_FORMER),
    ("A02 a candidate a leave ended is told the roster that went on without them", ACC, '    if (listed === undefined) return { kind: "nothing" };\n    return { kind: "refused", facts, refusal: new Refused("ROSTER_CHANGED"', '    return { kind: "refused", facts, refusal: new Refused("ROSTER_CHANGED"', "db", T_CARRY),
    # The route (services/api/src/clubs/leave.ts).
    ("H01 the answer's instant keeps its fraction", API, "left_at: contractInstant(left.leftAt),", "left_at: left.leftAt.toString(),", "api", H_WHOLE),
    ("H02 a key that isn't a UUID reaches the command", API, 'if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {', 'if (typeof key !== "string") {', "api", H_KEY),
    ("H03 a wrong choice isn't named", API, 'named ? { field: "contributions" } : {}', "{}", "api", H_FIELD),
    ("H04 a refusal isn't mapped", API, "      if (error instanceof Refused) return refusal(reply, error);\n", "", "api", H_MAP),
    ("H05 the answer says keep whatever was chosen", API, "contributions: left.contributions,", 'contributions: "keep",', "api", H_WHOLE),
    # The matrix's judges (tests/src/privacy/leave.ts, invitation.ts).
    ("J01 the judge passes any choice kept", JUDGE, "  if (row.contributions !== choice)\n", "  if (row.contributions === undefined)\n", "judge", J_ROW),
    ("J02 the judge passes a roster version that didn't move", JUDGE, "versions[1] !== versions[0] + 1)", "versions[1] === undefined)", "judge", J_VERSION),
    ("J03 the judge passes the leaver's candidate left open", JUDGE, 'candidate.proposer === interval && candidate.state === "open")', 'candidate.proposer === interval && candidate.state === "none")', "judge", J_OPEN),
    ("J04 the judge passes a name's revision relabelled", JUDGE, "  if (next.origin !== was.origin) problems.push", "  if (next.origin === undefined) problems.push", "judge", J_NAME),
    ("J05 the judge passes an approval on a name's new revision", JUDGE, "  } else if (next.decisions.size !== 0) {", "  } else if (next.decisions.size > 9) {", "judge", J_NAME),
    ("J06 the judge carries for a proposer who was no member", JUDGE, "!stayed.includes(was.proposer)) {", "was.proposer === interval) {", "judge", J_GONE),
    ("J07 the judge carries a candidate ended before the leave", JUDGE, '(one) => one.proposer !== interval && before.roster.candidates.get(one.id)?.state === "open",', "(one) => one.proposer !== interval,", "judge", J_GONE),
    ("J08 the judge passes an acceptance carried", JUDGE, "next.candidates.some((one) => one.acceptedWith !== null)", "next.candidates.some((one) => one.acceptedWith === undefined)", "judge", J_EACH),
    ("J09 the judge passes other approvals on the new revision", JUDGE, 'if (next.decisions.size !== 1 || next.decisions.get(was.proposer) !== "approved")', 'if (next.decisions.get(was.proposer) !== "approved")', "judge", J_EACH),
    ("K01 the acceptance's judge tells a person who left the version", IJUDGE, '  if (state === "joined" && viewer === undefined) return NEUTRAL;\n', "", "judge", K_NEWER),
    ("K02 the acceptance's judge tells an ended candidate the newest roster", IJUDGE, "return still === true ? rosterChanged(newest) : NEUTRAL;", "return rosterChanged(newest);", "judge", K_NEWER),
    # The same rules against the privacy matrix (the star's cells).
    ("M01 the matrix: the choice kept is always keep", LEAVE, "contributions = ${contributions},", "contributions = 'keep',", "matrix", M_STAR),
    ("M02 the matrix: the roster's version doesn't move", LEAVE, "SET roster_version = roster_version + 1 WHERE id = ${clubId}`", "SET roster_version = roster_version WHERE id = ${clubId}`", "matrix", M_STAR),
    ("M03 the matrix: a retry after leaving finds nothing", LEAVE, "    return stored.replay;\n", '    throw new Refused("NOT_FOUND");\n', "matrix", M_STAR),
    ("M04 the matrix: the answer says keep whatever was chosen", API, "contributions: left.contributions,", 'contributions: "keep",', "matrix", M_STAR),
    ("M05 the matrix: a new key after leaving is answered like the first", LEAVE, "    if (stored === null) throw new Refused(\"NOT_FOUND\");", "    if (stored === null) return completeReceipt(tx, receipt, render({ clubId, leftAt: await clock.sample(tx), contributions }));", "matrix", M_STAR),
    ("M06 the matrix: the leaver still reads the club", "packages/domain/src/authorization/member.ts", "       AND m.state = 'active' AND u.state = 'active' AND c.suspended_at IS NULL`;", "       AND u.state = 'active' AND c.suspended_at IS NULL`;", "matrix", M_STAR),
]


def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


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
    for name, path, old, new, suite, words in B:
        code = name.split()[0]
        if args and code not in args:
            continue
        p = ROOT / path
        orig = p.read_text()
        try:
            p.write_text(edit(orig, old, new))
            (OUT / f"{code}.patch").write_text(run(["git", "diff"]).stdout)
            cwd, cmd = SUITES[suite]
            r = run(cmd, cwd=ROOT / cwd)
            out = r.stdout + r.stderr
            (OUT / f"{code}.txt").write_text(out)
            failed = sorted({l.strip()[2:].strip()[:230] for l in out.splitlines() if l.strip().startswith("×")})
            summary = [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")]
            caught = any(words[:105] in f for f in failed)
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
