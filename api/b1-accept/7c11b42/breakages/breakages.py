"""Deliberate breakages of B1's third clubs PR (api/b1-accept), one change each, in a scratch worktree.

For each: change the one place (a few entries change two places that only break together), run the suite
registered for it, and check that a test whose name holds the pre-registered words fails. The file is
restored after each. Nothing else may use the local database meanwhile.

  breakages.py --check        count every anchor, change nothing
  breakages.py F01 A03 ...    only these
"""

import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path("/home/user/tadayo-b1a-mut")
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(SP) / "b1a/brk/out"
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
FACTS = "packages/domain/src/clubs/invitation-facts.ts"
VIEW = "packages/domain/src/clubs/invitation-preview.ts"
ACC = "packages/domain/src/clubs/accept-invitation.ts"
DEC = "packages/domain/src/clubs/decide-roster.ts"
APPLY = "packages/domain/src/clubs/apply-roster.ts"
API = "services/api/src/clubs/invitation.ts"
JUDGE = "tests/src/privacy/invitation.ts"
RJUDGE = "tests/src/privacy/roster.ts"
SCAN = "tests/src/privacy/scanner.ts"

PRIV = ["npx", "vitest", "run", "--config", "vitest.privacy.config.ts"]
DB = ["npx", "vitest", "run", "--config", "vitest.db.config.ts"]
SUITES = {
    "db": ("tests", [*DB, "src/db/accept-roster.test.ts"]),
    "api": ("services/api", ["npx", "vitest", "run", "src/clubs/invitation.test.ts", "src/clubs/roster.test.ts"]),
    "judge": ("tests", [*PRIV, "src/privacy/invitation.test.ts", "src/privacy/roster.test.ts"]),
    "scanner": ("tests", [*PRIV, "src/privacy/scanner.test.ts"]),
    "matrix": ("tests", [*PRIV, "src/privacy/matrix.test.ts", "-t", "answers the (star|former member) as|a roster applied"]),
}

# Changes shown to change no answer (the README says why).
EQUIVALENT = {"A17", "D01"}

T_NOTHING = "names nothing when it is unknown, revoked, replaced or used by another account"
T_EXP = "is live until the instant it expires, and expired from then"
T_USEDEXP = "doesn't expire for the account that used it"
T_MEMBER = "opens the club for a member, whoever the link was for"
T_SUSP = "gives nothing of a suspended club, and nothing to an account that left after joining with the link"
T_FULL = "says full when the club has six members"
T_REFUSE = "refuses a revision that isn't the invitation's, a stale version, and a second place in the same club"
T_TOKEN = "keeps the token out of every row"
T_DEL = "refuses an account whose deletion has begun, and leaves the link unused (T27)"
T_FIRST = "joins the person who accepts, starts the club, opens its first days and carries"
T_PAGE = "shows the signed-out page the inviter's name, and the person signed in the exact roster"
T_JOIN = "joins the candidate on their acceptance once every member has approved, and not before"
T_WAIT = "keeps a candidate who accepted first waiting"
T_RENAME = "makes a revision under the account's own name"
T_CASE = "compares names as they are stored"
T_DROP = "drops the other candidates' acceptances with the old revision"
T_DECL = "ends the revision and its candidates, moves the versions once"
T_STANDS = "leaves a proposer's own proposal, a second approval, a decline after approving"
T_STALE = "refuses a stale version with the version now, and a replaced revision with the newest one's id"
T_DELAPPLY = "doesn't join an accepted account whose deletion has begun"
T_SEVEN = "refuses the approval that would bring a seventh member"
T_PROPGONE = "ends the candidates who hadn't accepted when the revision's proposer is no longer a member"
T_LEFT = "asks who is deciding again once it holds the club's row"
N_RENAMED = "joins nobody under a name changed after accepting"
N_KEY = "gives the neutral not-found for an ended proposal's unused link under a key the account has used"
N_SECOND = "gives it for a second place in the club whatever version or revision the request names"
N_OPENONLY = "holds another place only while the first candidate is open"
N_RETRYNF = "answers a retry with the neutral not-found once the link names nothing"
N_EXPFIRST = "says a link nobody used has expired before it says anything of the revision"
N_EXACT = "applies no roster whose members aren't exactly the club's active members"
N_PENDING = "takes no decision on an ended revision from a member who hadn't decided"
N_NAMELESS = "shows nothing when no member of the roster has a name to show"
N_PROFILE = "refuses an account with no profile name"
N_ONE = "dates a club's start, its members and its first days by one sample"
N_CLOCKA = "dates a membership by the clock as it reads once the row is the acceptance's"
N_CLOCKP = "dates a membership by the clock as it reads once the row is the last approval's"
N_CLOCKD = "dates a decline by the clock as it reads once the row is the decline's"

NOTHING_PRE = '  if (before.kind === "nothing") throw new Refused("NOT_FOUND");\n  const clubId = before.facts.club.id;\n  const invitationId = before.facts.invitationId;\n'
REPLAY = "  if (first !== null) return first.replay;\n  const [account]"
EXPIRY = '  if (!mine && facts.pastExpiry) return { kind: "refused", facts, refusal: new Refused("INVITATION_EXPIRED") };\n'
ANOTHER = '  if (facts.holdsAnother) return { kind: "nothing" };\n'
SIX = "  // e. Six.\n"
ACC_LOCK = "  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;\n  await bound(tx)`SELECT id FROM app.invitations"
ACC_AT = "  const at = await clock.sample(tx);\n  const standing = await standingOf(tx, input, hash, at);"
DEC_LOCK = "  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;\n\n  // 3. Who is asking"
DEC_AT = "  // 6. The clock, after the lock.\n  const at = await clock.sample(tx);\n"
NAMED_SQL = "'accepted', rc.accepted_invitation_id IS NOT DISTINCT FROM i.id\n                                 AND EXISTS (SELECT FROM app.users bu\n                                              WHERE bu.id = i.bound_user_id AND bu.display_name = rc.label),"

# (name, file, old, new, suite, words a failing test's name must hold); `old` may be a list of pairs.
B = [
    # What a token names (invitation-facts.ts).
    ("F01 a revoked link still names its roster", FACTS, "facts.revoked || facts.replaced ||", "facts.replaced ||", "db", T_NOTHING),
    ("F02 a replaced link still names its roster", FACTS, "facts.revoked || facts.replaced ||", "facts.revoked ||", "db", T_NOTHING),
    ("F03 a suspended club's link still names its roster", FACTS, "facts.replaced || facts.suspended ||", "facts.replaced ||", "db", T_SUSP),
    ("F04 a link another account used still names its roster", FACTS, "(facts.boundUserId !== null && facts.boundUserId !== userId)", "false", "db", T_NOTHING),
    ("F05 a link is live at the instant it expires", FACTS, "i.expires_at <= ${now}::pg_catalog.timestamptz AS past_expiry", "i.expires_at < ${now}::pg_catalog.timestamptz AS past_expiry", "db", T_EXP),
    ("F06 another place is held by an ended candidate too", FACTS, "AND ok.state = 'open' AND ok.id <> k.id", "AND ok.id <> k.id", "db", N_OPENONLY),
    ("F07 an acceptance stands whatever the account's name now", FACTS, NAMED_SQL, "'accepted', rc.accepted_invitation_id IS NOT DISTINCT FROM i.id,", "db", N_RENAMED),
    ("F08 the roster's members in the other order", FACTS, 'jsonb_agg(su.display_name ORDER BY s.joined_at, s.interval_id COLLATE "C")', 'jsonb_agg(su.display_name ORDER BY s.joined_at DESC, s.interval_id COLLATE "C" DESC)', "db", T_WAIT),
    ("F09 the roster's candidates in the other order", FACTS, "ORDER BY x.position)", "ORDER BY x.position DESC)", "db", T_PAGE),
    ("F10 a token is hashed with another digest", FACTS, 'createHash("sha256").update(token)', 'createHash("sha512").update(token)', "db", T_PAGE),
    # The preview (invitation-preview.ts).
    ("V01 a member isn't told they joined", VIEW, "  if (facts.membershipId !== null) {\n", "  if (facts.membershipId === undefined) {\n", "db", T_MEMBER),
    ("V02 a link whose candidate joined shows a roster to an account that left", VIEW, '  if (facts.candidateState === "joined") return null;\n', "", "db", T_SUSP),
    ("V03 an ended proposal is told to anyone", VIEW, 'return mine ? { state: "did_not_go_ahead" } : null;', 'return { state: "did_not_go_ahead" };', "db", N_KEY),
    ("V04 a used link expires for its own account", VIEW, "  if (!mine && facts.pastExpiry) {", "  if (facts.pastExpiry) {", "db", T_USEDEXP),
    ("V05 a second place is previewed", VIEW, "  if (!mine && facts.holdsAnother) return null;\n", "", "db", T_REFUSE),
    ("V06 a roster with no named member is shown", VIEW, " || roster.members.length === 0", "", "db", N_NAMELESS),
    ("V07 full only past six", VIEW, 'if (facts.members >= CLUB_SIZE) return { state: "full" };', 'if (facts.members > CLUB_SIZE) return { state: "full" };', "db", T_FULL),
    ("V08 waiting is never said", VIEW, '  if (roster.accepted && !roster.ready) return { state: "waiting", ...shown };\n', "", "db", T_WAIT),
    ("R01 waiting is said of a roster every member approved", VIEW, "if (roster.accepted && !roster.ready)", "if (roster.accepted)", "db", "shows the roster to accept again, and joins on that"),
    ("R02 an accepted, renamed account being deleted is carried", APPLY, "    if (gone(candidate)) {", "    if (standing(candidate) && !candidate.active) {", "db", "ends an accepted candidate whose account is being deleted when the roster is applied"),
    ("R03 the judge says waiting of a roster every member approved", JUDGE, "link.boundName === listed.label && !ready;", "link.boundName === listed.label;", "judge", "says waiting, with no expiry, once the candidate accepted this roster with the link"),
    ("R04 the scanner passes an acceptance's id through a dead link", SCAN, 'kind === "InvitationAcceptance" ? held.shown : held.roster', 'kind === "InvitationAcceptance" || held.roster', "scanner", "passes a waiting and a changed roster, and an acceptance, only as the account's own link"),
    ("V09 changed is said as open", VIEW, 'state: mine ? "changed" : "open"', 'state: "open"', "db", N_RENAMED),
    ("V10 the page names the inviter of a used link", VIEW, " AND i.bound_user_id IS NULL\n", "\n", "db", T_NOTHING),
    ("V11 the page names the inviter at the expiry", VIEW, "AND i.expires_at > ${now}::pg_catalog.timestamptz", "AND i.expires_at >= ${now}::pg_catalog.timestamptz", "db", T_EXP),
    ("V12 the page names the inviter of a suspended club", VIEW, "AND k.state = 'open' AND c.suspended_at IS NULL`;", "AND k.state = 'open'`;", "db", T_SUSP),
    ("V13 the page names the inviter of a revoked link", VIEW, "AND i.revoked_at IS NULL AND", "AND", "db", T_NOTHING),
    # acceptInvitation.
    ("A01 the receipt is looked at before what names nothing", ACC, [(NOTHING_PRE, ""), (REPLAY, "  if (first !== null) return first.replay;\n" + NOTHING_PRE + "  const [account]")], None, "db", N_RETRYNF),
    ("A02 a member accepts with a link that isn't theirs", ACC, '  if (facts.membershipId !== null && !(mine && facts.candidateState === "joined")) return { kind: "nothing" };\n', "", "db", T_TOKEN),
    ("A03 an ended candidate's unused link isn't nothing", ACC, '  if (facts.candidateState === "ended" && !mine) return { kind: "nothing" };\n', "", "db", N_KEY),
    ("A04 a used link expires for its own account", ACC, "  if (!mine && facts.pastExpiry) return", "  if (facts.pastExpiry) return", "db", T_USEDEXP),
    ("A05 the expiry is said after the revision and the version", ACC, [(EXPIRY, ""), (SIX, EXPIRY + SIX)], None, "db", N_EXPFIRST),
    ("A06 a second place is accepted", ACC, ANOTHER, "", "db", T_REFUSE),
    ("A07 a second place is refused only after the version", ACC, [(ANOTHER, ""), (SIX, ANOTHER + SIX)], None, "db", N_SECOND),
    ("A08 a replaced revision isn't named", ACC, '  if (state === "superseded") {\n    const refusal', '  if (state === "nothing") {\n    const refusal', "db", T_RENAME),
    ("A09 the version isn't held", ACC, "  if (version !== input.expectedVersion) {\n    return { kind", "  if (version < 0) {\n    return { kind", "db", T_REFUSE),
    ("A10 a seventh member accepts", ACC, "if (facts.members >= CLUB_SIZE) return { kind", "if (facts.members > CLUB_SIZE) return { kind", "db", T_FULL),
    ("A11 the clock is read before the club's row is held", ACC, [(ACC_AT, "  const standing = await standingOf(tx, input, hash, at);"), (ACC_LOCK, "  const at = await clock.sample(tx);\n" + ACC_LOCK)], None, "db", N_CLOCKA),
    ("A12 names compared without their case", ACC, "  if (profileName !== label) {", "  if (profileName.toLowerCase() !== label.toLowerCase()) {", "db", T_CASE),
    ("A13 a rename's revision keeps the proposer's approval", ACC, "      candidates,\n      implicit: false,", "      candidates,\n      implicit: true,", "db", T_RENAME),
    ("A14 the link isn't bound", ACC, "  if (!mine) {\n    await bound(tx)`\n      UPDATE app.invitations SET bound_user_id", "  if (mine) {\n    await bound(tx)`\n      UPDATE app.invitations SET bound_user_id", "db", T_WAIT),
    ("A15 an account being deleted accepts", ACC, 'account === undefined || account["state"] !== "active"', "account === undefined", "db", T_DEL),
    ("A16 an account with no name is told not found", ACC, 'if (typeof profileName !== "string") throw new Refused("PROFILE_INCOMPLETE");', 'if (typeof profileName !== "string") throw new Refused("NOT_FOUND");', "db", N_PROFILE),
    ("A17 the receipt keeps the token", ACC, "body: { token_sha256: hash,", "body: { token_sha256: input.token,", "db", T_TOKEN),
    ("A18 the rename's revision keeps the old label", ACC, "label: candidateId === facts.candidateId ? profileName : shown", "label: shown", "db", T_RENAME),
    ("A19 the acceptance isn't written", ACC, "AND candidate_id = ${facts.candidateId} AND accepted_invitation_id IS NULL`;", "AND candidate_id = ${facts.candidateId} AND false`;", "db", T_WAIT),
    # approveRoster and declineRoster.
    ("D01 the member isn't asked again under the club's row", DEC, '  if ((await activeMember(tx, userId, clubId)) !== asking) throw new Refused("NOT_FOUND");\n', "", "db", T_LEFT),
    ("D02 a replaced revision isn't named", DEC, '  if (before.state === "superseded") {', '  if (before.state === "nothing") {', "db", T_STALE),
    ("D03 the version isn't held", DEC, "  if (before.version !== input.expectedVersion) {", "  if (before.version < 0) {", "db", T_STALE),
    ("D04 an ended revision takes a decision", DEC, '  if (before.state === "open" && before.myDecision === "pending") {', '  if (before.myDecision === "pending") {', "db", N_PENDING),
    ("D05 a member decides twice", DEC, '  if (before.state === "open" && before.myDecision === "pending") {', '  if (before.state === "open") {', "db", T_STANDS),
    ("D06 a decline leaves the club's roster version", DEC, "      await bound(tx)`UPDATE app.clubs SET roster_version = roster_version + 1 WHERE id = ${clubId}`;\n", "", "db", T_DECL),
    ("D07 a decline leaves its candidates open", DEC, "AND rc.candidate_id = k.id AND k.state = 'open'`;", "AND rc.candidate_id = k.id AND false`;", "db", T_DECL),
    ("D08 the clock is read before the club's row is held", DEC, [(DEC_AT, ""), (DEC_LOCK, "  const at = await clock.sample(tx);\n" + DEC_LOCK)], None, "db", N_CLOCKD),
    ("D09 an approval is written as a decline", DEC, 'operation === "approveRoster" ? "approved" : "declined"', 'operation === "approveRoster" ? "declined" : "approved"', "db", T_JOIN),
    ("D10 a decision is written as implicit", DEC, "${decision}, false,", "${decision}, true,", "db", T_JOIN),
    ("D11 an approval never applies the roster", DEC, "      await applyIfReady(tx, at, clubId, revisionId);\n", "", "db", N_CLOCKP),
    # The roster applied.
    ("Y01 a roster applies before every member approved", APPLY, 'if (!flag(row["approved"]) || !flag(row["exact"]) ||', 'if (!flag(row["exact"]) ||', "db", T_WAIT),
    ("Y02 a roster applies whose members aren't the club's", APPLY, '!flag(row["approved"]) || !flag(row["exact"]) ||', '!flag(row["approved"]) ||', "db", N_EXACT),
    ("Y03 an account joins under a name changed after accepting", APPLY, "candidate.open && candidate.accepted && candidate.named;", "candidate.open && candidate.accepted;", "db", N_RENAMED),
    ("Y04 a seventh member joins", APPLY, "  if (members + joining.length > CLUB_SIZE)", "  if (members + joining.length > CLUB_SIZE + 1)", "db", T_SEVEN),
    ("Y05 the applied revision keeps its version", APPLY, "SET state = 'applied', version = version + 1,", "SET state = 'applied',", "db", T_JOIN),
    ("Y06 an account being deleted joins", APPLY, "standing(candidate) && candidate.active);", "standing(candidate));", "db", T_DELAPPLY),
    ("Y07 the club's roster version doesn't move", APPLY, "       SET roster_version = roster_version + 1,\n           activated_at", "       SET activated_at", "db", T_JOIN),
    ("Y08 a club starts with no first days", APPLY, "  if (started) await openFirstDays(", "  if (!started) await openFirstDays(", "db", T_FIRST),
    ("Y09 the first days are dated by another instant", APPLY, "{ sample: () => Promise.resolve(at) }", "{ sample: () => Promise.resolve(at.add({ seconds: 1 }) as ServerNow) }", "db", N_ONE),
    ("Y10 the people who hadn't accepted are dropped", APPLY, "  if (left.length > 0) {", "  if (left.length > 99) {", "db", T_FIRST),
    ("Y11 candidates are carried for a proposer who left", APPLY, '    if (row["proposer_active"] === true) {', '    if (row["proposer_active"] !== undefined) {', "db", T_PROPGONE),
    ("Y12 the carried revision loses the proposer's approval", APPLY, "        candidates: left.map(({ candidateId, label }) => ({ candidateId, label })),\n        implicit: true,", "        candidates: left.map(({ candidateId, label }) => ({ candidateId, label })),\n        implicit: false,", "db", T_FIRST),
    # The routes.
    ("H01 a waiting preview sends an expiry", API, '...(sight.state === "waiting" ? {} : { expires_at: contractInstant(sight.expiresAt) }),', "expires_at: contractInstant((sight as { expiresAt: Temporal.Instant }).expiresAt ?? Temporal.Instant.from('2026-01-01T00:00:00Z')),", "api", "makes waiting field for field"),
    ("H02 a roster entry sends its kind as its name", API, "roster: sight.roster.map((entry) => ({ name: entry.name, kind: entry.kind, is_you: entry.isYou })),", "roster: sight.roster.map((entry) => ({ name: entry.kind, kind: entry.kind, is_you: entry.isYou })),", "api", "makes open field for field"),
    ("H03 the page's bad token is unnamed", API, 'const field = firstBadField(["token"], parsed.error.issues);\n      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });\n    }\n    const { token } = parsed.data;\n    // Read only, the server\'s instant first', 'const field = undefined as string | undefined;\n      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });\n    }\n    const { token } = parsed.data;\n    // Read only, the server\'s instant first', "api", "names a bad token, never its value"),
    ("H04 an acceptance's key isn't asked for", API, '    if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {\n      return problem(reply, "INVALID_REQUEST", { field: "Idempotency-Key" });\n    }\n    const parsed = AcceptInvitationRequest', '    if (typeof key !== "string") {\n      return problem(reply, "INVALID_REQUEST", { field: "Idempotency-Key" });\n    }\n    const parsed = AcceptInvitationRequest', "api", "names the Idempotency-Key of an acceptance or a decision"),
    ("H05 the page's not-found is a 200 with no name", API, 'return found === null ? problem(reply, "NOT_FOUND") : ok(reply, { inviter_name: found.inviterName });', 'return ok(reply, { inviter_name: found?.inviterName ?? "" });', "api", "answers the neutral not-found when a token names nothing"),
    # The judges (tests/src/privacy/invitation.ts, roster.ts).
    ("J01 the judge names a revoked link's roster", JUDGE, "link === undefined || link.revoked || link.replaced", "link === undefined || link.replaced", "judge", "names nothing once the link is revoked, to its holder and to a member alike"),
    ("J02 the judge names a suspended club's link", JUDGE, "  if (world.clubs.get(link.club)?.suspended !== false) return undefined;\n", "", "judge", "names nothing of a suspended club (FQ80)"),
    ("J03 the judge lets a used link expire for its account", JUDGE, "  if (!mine && Temporal.Instant.compare(link.expiresAt, now) <= 0) {", "  if (Temporal.Instant.compare(link.expiresAt, now) <= 0) {", "judge", "says expired, with the inviter's name, from the link's expiry"),
    ("J04 the judge says waiting whatever the account's name", JUDGE, "listed?.acceptedWith === link.id && link.boundName === listed.label && !ready;", "listed?.acceptedWith === link.id && !ready;", "judge", "says waiting, with no expiry, once the candidate accepted this roster with the link"),
    ("J05 the judge holds a second place after the version", JUDGE, [("  if (holdsAnother(roster, link, account)) return NEUTRAL;\n  if (rows.state === \"superseded\")", "  if (rows.state === \"superseded\")"), ("  if (activeMembers(world, link.club) >= SIX) return CLUB_FULL;", "  if (holdsAnother(roster, link, account)) return NEUTRAL;\n  if (activeMembers(world, link.club) >= SIX) return CLUB_FULL;")], None, "judge", "gives one account one place, and no place in a club of six"),
    ("J06 the judge puts the version before the expiry", JUDGE, [("  if (!mine && Temporal.Instant.compare(link.expiresAt, now) <= 0) return EXPIRED;\n", ""), ("  if (rows.version !== expected) return versionConflict(rows.version);\n", "  if (rows.version !== expected) return versionConflict(rows.version);\n  if (!mine && Temporal.Instant.compare(link.expiresAt, now) <= 0) return EXPIRED;\n")], None, "judge", "refuses in the contract's order: expired, then a newer revision, then the version"),
    ("J07 the judge joins before every member approved", JUDGE, 'rows.members.every((interval) => rows.decisions.get(interval) === "approved")', 'rows.members.some((interval) => rows.decisions.get(interval) === "approved")', "judge", "waits while a member hasn't approved, and joins once every member the revision lists has"),
    ("J08 the judge shows the page a used link's inviter", JUDGE, "  const link = named(world, roster, token, null);", "  const link = linkOf(roster, token);", "judge", "is nothing for a link an account has used, at its expiry, or whose candidate ended or joined"),
    # The leak scanner's rule for a link's holder.
    ("S01 the scanner passes the roster with no token", SCAN, "  if (presented === undefined || !HOLDER_OPERATIONS.has(context.operation.id)) return undefined;", "  if (presented === undefined) return undefined;", "scanner", "catches it through an operation that takes no token"),
    ("S02 the scanner passes a dead link's names", SCAN, "  const names = !invitation.dead && world.clubs", "  const names = world.clubs", "scanner", "catches"),
    ("S03 the scanner passes a suspended club's names", SCAN, "world.clubs.get(invitation.club)?.suspendedAt === null;\n  const unexpired", "true;\n  const unexpired", "scanner", "catches it of a suspended club (FQ80)"),
    ("S04 the scanner passes the page a used link's inviter", SCAN, "const live = names && invitation.boundTo === null && unexpired", "const live = names && unexpired", "scanner", "catches"),
    ("S05 the scanner passes the page's name once the proposal ended", SCAN, "unexpired && invitation.roster !== null;", "unexpired;", "scanner", "catches the page's name, and the roster, once the candidate is on no open revision"),
    ("S06 the scanner passes the app's name once the proposal ended", SCAN, "const readable = shown && invitation.roster !== null;", "const readable = shown;", "scanner", "catches the inviter's name told in the app for a link nobody used"),
    ("S07 the scanner passes an expired unused link's roster", SCAN, "roster: readable && (theirs || unexpired) };", "roster: readable };", "scanner", "catches the roster through an unused link from its expiry"),
    ("S08 the scanner passes another account's link", SCAN, "const shown = names && (invitation.boundTo === null || theirs);", "const shown = names;", "scanner", "catches"),
    # The matrix: the product broken, the cells must see it.
    ("M01 the matrix: a preview that names the roster's members by their kind", API, "roster: sight.roster.map((entry) => ({ name: entry.name, kind: entry.kind, is_you: entry.isYou })),", "roster: sight.roster.map((entry) => ({ name: entry.name, kind: entry.kind, is_you: !entry.isYou })),", "matrix", "answers the star"),
    ("M02 the matrix: a second approval is written", DEC, '  if (before.state === "open" && before.myDecision === "pending") {', '  if (before.state === "open") {', "matrix", "answers the star"),
    ("M03 the matrix: a member is shown the roster instead of joined", VIEW, "  if (facts.membershipId !== null) {\n", "  if (facts.membershipId === undefined) {\n", "matrix", "answers the star"),
    ("M04 the matrix: an ended proposal is never told to its own account", VIEW, 'return mine ? { state: "did_not_go_ahead" } : null;', 'return null;', "matrix", "answers the star"),
    ("M05 the matrix: a roster applies before every member approved", APPLY, 'if (!flag(row["approved"]) || !flag(row["exact"]) ||', 'if (!flag(row["exact"]) ||', "matrix", "joins the person who accepted once the last member approves"),
    ("M06 the matrix: the page names a used link's inviter", VIEW, " AND i.bound_user_id IS NULL\n", "\n", "matrix", "answers the star"),
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
