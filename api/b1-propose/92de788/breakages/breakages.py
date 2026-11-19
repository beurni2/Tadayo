"""Deliberate breakages of B1's second clubs PR (api/b1-propose), one change each, in a scratch worktree.

For each: change the one place (a few entries change two lines that only break together), run the suite
registered for it, and check that a test whose name holds the pre-registered words fails. The file is
restored after each. Nothing else may use the local database meanwhile.

  breakages.py --check        count every anchor, change nothing
  breakages.py R02 P03 ...    only these
"""

import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path("/home/user/tadayo-b1p-mut")
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(SP) / "b1p/brk/out"
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
REV = "packages/domain/src/clubs/roster-revision.ts"
PRO = "packages/domain/src/clubs/propose-roster.ts"
INV = "packages/domain/src/clubs/invitation.ts"
REC = "packages/domain/src/idempotency/receipt.ts"
API = "services/api/src/clubs/roster.ts"
APP = "services/api/src/app.ts"
JUDGE = "tests/src/privacy/roster.ts"
SCAN = "tests/src/privacy/scanner.ts"

PRIV = ["npx", "vitest", "run", "--config", "vitest.privacy.config.ts"]
DB = ["npx", "vitest", "run", "--config", "vitest.db.config.ts"]
SUITES = {
    "propose": ("tests", [*DB, "src/db/propose-roster.test.ts"]),
    "link": ("tests", [*DB, "src/db/invitation.test.ts"]),
    "db": ("tests", [*DB, "src/db/propose-roster.test.ts", "src/db/invitation.test.ts"]),
    "api": ("services/api", ["npx", "vitest", "run", "src/clubs/roster.test.ts", "src/app.test.ts"]),
    "judge": ("tests", [*PRIV, "src/privacy/roster.test.ts"]),
    "scanner": ("tests", [*PRIV, "src/privacy/scanner.test.ts"]),
    "matrix": ("tests", [*PRIV, "src/privacy/matrix.test.ts", "-t", "answers the (star|former member) as"]),
}

# Changes shown to change no answer (the README says why).
EQUIVALENT = {"R13", "I05", "N06"}

ACTIVE = "JOIN (${activeMemberships(sql, userId)}) am ON am.club_id = r.club_id"
EVER = "JOIN (SELECT m.club_id, m.interval_id FROM app.memberships m WHERE m.user_id = ${userId}::pg_catalog.text) am ON am.club_id = r.club_id"
NOBODY = "gives the neutral not-found to a stranger, a member of another club, a former member, a member who joined after it was made"
EXACT = "writes an exact, sealed roster at the clock's sample"
CARRY = "supersedes the open revision: its candidates carry over at their labels and in their order"
NAMELESS = "leaves out a member with no name to show, and serves no revision whose proposer or a candidate's proposer has none"
OTHERS = "says nothing of another member's decision or of an acceptance to a member who didn't propose the candidate"
TOKEN = "returns the token once, 256 random bits for the URL's fragment, and keeps only its SHA-256, with seven days"
WHO_LINK = "gives anyone but the candidate's proposer the neutral not-found, whatever the link's state, and leaves nothing"
WHO_REVOKE = "gives anyone but the candidate's proposer the neutral not-found, whatever the link's state (T14)"
ENDED = "gives the proposer the neutral not-found for a candidate who has ended or joined, once the proposer has left"
REVOKED = "ends the link at the clock's sample and nothing else"
STAR = "answers the star"
URLS = "catches a URL that isn't this link's own, in another answer, on another host or to someone else"
ELSE = "catches the link's id shown to anyone else"
STORED = "refuses another status, a body that isn't the revision, and one that may be stored"
STANDS = "says where the candidate's latest link stands"
BAD_URL = "refuses a URL that isn't the web page and a token of 43 characters, and a token its row's hash isn't of"
RELOCK = "  const proposer = await activeMember(tx, userId, clubId);\n  if (proposer !== asking) throw new Refused(\"NOT_FOUND\");\n\n  // "
SAME = "  if (proposer !== asking) throw new Refused(\"NOT_FOUND\");\n\n  // "
NULL = "  if (proposer === null) throw new Refused(\"NOT_FOUND\");\n\n  // "
SINCE = "  if (first !== null && !(await reservedSince(tx, receipt, interval))) throw new Refused(\"NOT_FOUND\");\n"
OTHER = "      if (!(await reservedSince(tx, receipt, interval))) throw new Refused(\"NOT_FOUND\");\n"
REJOINED = "gives a retry by someone who left and joined again the neutral not-found"
REJOINED_LINK = "gives a retry by a proposer who left and joined again the neutral not-found"


def early(after):
    return [
        ("  const first = await reserveAsMember(tx, receipt, await clock.sample(tx), asking);",
         "  const early = await clock.sample(tx);\n  const first = await reserveAsMember(tx, receipt, early, asking);"),
        ("  const at = await clock.sample(tx);\n" + after, "  const at = early;\n" + after),
    ]
LINK_RE = r"/^https:\/\/tadayo\.app\/i#([A-Za-z0-9_-]{43})$/"

# (name, file, old, new, suite, words a failing test's name must hold); `old` may be a list of pairs.
B = [
    # The read (readRevision).
    ("R01 a revision not sealed is served", REV, "       AND r.roster_sealed_at IS NOT NULL\n", "",
     "propose", "serves no revision that isn't sealed"),
    ("R02 a member who joined after it reads a revision", REV,
     "\n       AND EXISTS (SELECT FROM app.roster_revision_members mine\n                    WHERE mine.revision_id = r.id AND mine.interval_id = am.interval_id)`;", "`;",
     "propose", "gives a member who joined after a revision was made nothing of it (FQ119)"),
    ("R03 anyone who ever had a membership reads a revision", REV, ACTIVE, EVER, "propose", NOBODY),
    ("R04 every member is given a candidate's link", REV, "CASE WHEN k.proposed_by_interval_id = am.interval_id THEN", "CASE WHEN true THEN",
     "propose", OTHERS),
    ("R05 a link is never accepted", REV, "CASE WHEN rc.accepted_invitation_id = i.id THEN 'accepted'", "CASE WHEN false THEN 'accepted'",
     "link", "is accepted once the candidate accepted this revision with it, used on a newer revision"),
    ("R06 a link is never used", REV, "WHEN i.bound_user_id IS NOT NULL THEN 'used'", "WHEN false THEN 'used'",
     "link", "is accepted once the candidate accepted this revision with it, used on a newer revision"),
    ("R07 a link is live at the instant it expires", REV, "WHEN i.expires_at <= ${now}::pg_catalog.timestamptz THEN 'expired'", "WHEN i.expires_at < ${now}::pg_catalog.timestamptz THEN 'expired'",
     "link", "is live until the instant it expires, and expired from then"),
    ("R08 a revoked link is expired past its expiry", REV, "WHEN i.revoked_at IS NOT NULL THEN 'revoked'", "WHEN i.revoked_at IS NOT NULL AND i.expires_at > ${now}::pg_catalog.timestamptz THEN 'revoked'",
     "link", "is revoked once revoked, and stays revoked past its expiry"),
    ("R09 a replaced link is shown for the latest", REV, "WHERE i.candidate_id = k.id AND i.replaced_by_id IS NULL)", "WHERE i.candidate_id = k.id ORDER BY i.replaced_by_id NULLS LAST LIMIT 1)",
     "link", "replaces the candidate's earlier link with a new one, so one is the latest"),
    ("R10 the proposer's decision given as the caller's", REV, "WHERE a.revision_id = r.id AND a.interval_id = am.interval_id), 'pending')", "WHERE a.revision_id = r.id AND a.interval_id = r.proposed_by_interval_id), 'pending')",
     "propose", "gives each member the revision lists the same roster, with their own decision"),
    ("R11 members who joined at one instant in the other order", REV, 'ORDER BY s.joined_at, s.interval_id COLLATE "C")', 'ORDER BY s.joined_at, s.interval_id COLLATE "C" DESC)',
     "propose", "lists members who joined at the same instant by their membership's id"),
    ("R12 candidates in the other order", REV, "END) ORDER BY rc.position)", "END) ORDER BY rc.position DESC)",
     "propose", EXACT),
    ("R13 a revision whose proposer has no name is served", REV, "  if (proposedBy === null) return null;\n", "",
     "propose", NAMELESS),
    ("R14 a member with no name is sent", REV, "    return who === null ? [] : [who];", "    return [who as SchedulePerson];",
     "propose", NAMELESS),
    ("R15 a revision whose candidate's proposer has no name is served", REV, "    if (proposer.person === null) return null;\n", "",
     "propose", NAMELESS),
    # proposeRoster.
    ("P01 a retry answered to someone who left and joined again", REC, SINCE, "",
     "propose", REJOINED),
    ("P02 the proposer not asked again under the club's row", PRO, RELOCK + "4.", "  const proposer = asking;\n\n  // 4.",
     "propose", "asks who is proposing again once it holds the club's row"),
    ("P19 an interval begun while the request waited proposes", PRO, SAME + "4.", NULL + "4.",
     "propose", "proposes nothing for a member who left and joined again while it waited for the club's row"),
    ("P03 the club's row read without its lock", PRO, "WHERE id = ${clubId} FOR UPDATE`;", "WHERE id = ${clubId}`;",
     "propose", "lets one of two members who propose at once on the same version through"),
    ("P04 any roster version taken", PRO, '  if (version !== input.expectedRosterVersion) throw new Refused("VERSION_CONFLICT", { current_version: version });\n', "",
     "propose", "refuses a proposal made on another roster version with the version now"),
    ("P05 a seventh person", PRO, "+ input.add.length > CLUB_SIZE) {", "+ input.add.length > CLUB_SIZE + 1) {",
     "propose", "proposed: CLUB_FULL"),
    ("P06 full at five", PRO, "+ input.add.length > CLUB_SIZE) {", "+ input.add.length >= CLUB_SIZE) {",
     "propose", "proposed: proposed"),
    ("P07 open candidates take no place", PRO, 'count(roster["members"]) + count(roster["open_candidates"]) + input.add.length', 'count(roster["members"]) + input.add.length',
     "propose", "proposed: CLUB_FULL"),
    ("P08 a candidate who joined or ended still takes a place", PRO, "WHERE k.club_id = c.id AND k.state = 'open') AS open_candidates", "WHERE k.club_id = c.id) AS open_candidates",
     "propose", "counts a candidate who has joined no longer"),
    ("P09 the revision dated at the receipt's sample, before the lock", PRO, early("\n  // 7."), None,
     "propose", "dates the revision, its seal and the proposer's approval at the sample taken after the lock"),
    ("P10 the earlier revision not told what superseded it", PRO, " superseded_by_id = ${revisionId},", "",
     "propose", CARRY),
    ("P11 an ended candidate carried over", PRO, "WHERE rc.revision_id = ${earlier} AND k.state = 'open'", "WHERE rc.revision_id = ${earlier}",
     "propose", "counts a candidate who has ended no longer, and carries none but the open ones"),
    ("P12 carried candidates in the other order", PRO, "OVER (ORDER BY rc.position))", "OVER (ORDER BY rc.position DESC))",
     "propose", CARRY),
    ("P13 the proposer's approval not marked as by proposing", PRO, "${proposer}, 'approved', true,", "${proposer}, 'approved', false,",
     "propose", EXACT),
    ("P14 the roster's version not moved", PRO, "  await bound(tx)`UPDATE app.clubs SET roster_version = roster_version + 1 WHERE id = ${clubId}`;\n", "",
     "propose", "refuses a second member's proposal made on the version the first one moved"),
    ("P15 the receipt stored as a 200", PRO, "render(revision), 201)", "render(revision))",
     "propose", "stores the answer in its receipt with 201"),
    ("P16 other people under a used key are the same request", PRO, "        add: input.add.map(({ label }) => ({ label })),\n      },\n    },\n  };", "        add: [],\n      },\n    },\n  };",
     "propose", "refuses another request under a used key"),
    ("P17 a retry makes a second revision", PRO, "  if (first !== null) return first.replay;\n", "",
     "propose", "answers a retry with the first answer, at a later clock and though the roster has changed since"),
    ("P18 the earlier revision's version not moved", PRO, "SET state = 'superseded', version = version + 1,", "SET state = 'superseded',",
     "propose", CARRY),
    # reservedSince.
    ("S01 a receipt made at the instant its interval began isn't its own", REC, "AND r.created_at >= m.joined_at`;", "AND r.created_at > m.joined_at`;",
     "propose", "answers a retry of a request made at the very instant its sender's membership began"),
    ("S02 a receipt made before the caller's interval began is its own", REC, "::pg_catalog.uuid AND r.created_at >= m.joined_at`;", "::pg_catalog.uuid`;",
     "db", "gives a retry by"),
    ("S03 another request under an earlier interval's key told the key was used (proposal)", REC, OTHER, "",
     "propose", REJOINED),
    ("S04 another request under an earlier interval's key told the key was used (link)", REC, OTHER, "",
     "link", REJOINED_LINK),
    # createInvitation.
    ("I01 a link's retry answered to a proposer who left and joined again", REC, SINCE, "",
     "link", REJOINED_LINK),
    ("I02 the proposer not asked again under the club's row", INV, RELOCK + "3.", "  const proposer = asking;\n\n  // 3.",
     "link", "asks who is making the link again once it holds the club's row"),
    ("I03 any member makes a candidate's link", INV, "AND k.state = 'open'\n       AND k.proposed_by_interval_id = ${proposer}`;", "AND k.state = 'open'`;",
     "link", WHO_LINK),
    ("I04 a link for a candidate who has ended or joined", INV, "AND k.club_id = ${clubId} AND k.state = 'open'", "AND k.club_id = ${clubId}",
     "link", ENDED),
    ("I05 a link for another club's candidate, asked through the caller's club", INV, "WHERE k.id = ${candidateId} AND k.club_id = ${clubId} AND", "WHERE k.id = ${candidateId} AND",
     "link", WHO_LINK),
    ("I06 a link on a revision that is no longer open", INV, "ON r.id = rc.revision_id AND r.state = 'open'", "ON r.id = rc.revision_id",
     "link", ENDED),
    ("I07 a new link after the candidate accepted", INV, '  if (latest !== undefined && latest["bound_user_id"] !== null) throw new Refused("NOT_ALLOWED");\n', "",
     "link", "refuses a new link once the candidate has accepted with the latest one"),
    ("I08 the expiry keeps the sample's fraction", INV, "const expiresAt = wholeSecond(at).add(", "const expiresAt = at.add(",
     "link", TOKEN),
    ("I09 six days", INV, "export const INVITATION_DAYS = 7;", "export const INVITATION_DAYS = 6;",
     "link", TOKEN),
    ("I10 a token of 128 bits", INV, "randomBytes(32)", "randomBytes(16)",
     "link", TOKEN),
    ("I11 the hash of the token's bytes, not of its text", INV, 'createHash("sha256").update(token).digest("hex")', 'createHash("sha256").update(Buffer.from(token, "base64url")).digest("hex")',
     "link", TOKEN),
    ("I12 the earlier link not replaced", INV, "    await bound(tx)`UPDATE app.invitations SET replaced_by_id = ${invitationId} WHERE id = ${earlier}`;\n", "",
     "link", "replaces the candidate's earlier link with a new one, so one is the latest"),
    ("I13 a retry given a token", INV, "return { answer: first.replay, token: null };", 'return { answer: first.replay, token: randomBytes(32).toString("base64url") };',
     "link", "answers a retry under the same key with the first answer and no token"),
    ("I14 the link dated at the receipt's sample, before the lock", INV, early("  const expiresAt"), None,
     "link", "dates a link and its expiry from the sample taken after the lock"),
    ("I15 the club's row read without its lock, and the latest link too", INV,
     [("  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;\n  // The same interval still", "  // The same interval still"),
      ("AND replaced_by_id IS NULL FOR UPDATE`;", "AND replaced_by_id IS NULL`;")], None,
     "link", "keeps one latest link when two requests for one candidate arrive at once"),
    ("I16 a retry makes a second link", INV, "  if (first !== null) return { answer: first.replay, token: null };\n", "",
     "link", "answers a retry under the same key with the first answer and no token"),
    ("I17 the link's receipt stored as a 200", INV, "render({ invitationId, candidateId, expiresAt }), 201)", "render({ invitationId, candidateId, expiresAt }))",
     "link", TOKEN),
    # revokeInvitation.
    ("V01 any member revokes a link", INV, "WHERE i.id = ${invitationId} AND k.proposed_by_interval_id = ${proposer}", "WHERE i.id = ${invitationId}",
     "link", WHO_REVOKE),
    ("V02 a link the candidate accepted with is revoked", INV, '  if (link["bound_user_id"] !== null) throw new Refused("NOT_ALLOWED");\n', "",
     "link", "refuses to revoke a link the candidate accepted with"),
    ("V03 a repeat dates the link again", INV, 'if (link["revoked_at"] === null) {', "if (link !== undefined) {",
     "link", REVOKED),
    ("V04 the link revoked at the database's now, not the clock's sample", INV, "SET revoked_at = ${at}::pg_catalog.timestamptz", "SET revoked_at = pg_catalog.clock_timestamp()",
     "link", REVOKED),
    ("V05 the proposer not asked again under the club's row", INV,
     [("  if ((await activeMember(tx, userId, clubId)) === null) throw new Refused(\"NOT_FOUND\");\n", "  const asking = await activeMember(tx, userId, clubId);\n  if (asking === null) throw new Refused(\"NOT_FOUND\");\n"),
      ("  const proposer = await activeMember(tx, userId, clubId);\n  if (proposer === null) throw new Refused(\"NOT_FOUND\");\n  const [link]", "  const proposer = asking;\n  const [link]")], None,
     "link", "asks who is revoking again once it holds the club's row"),
    # The routes.
    ("A01 a revision nobody may read answered 200", API, 'return body === null ? problem(reply, "NOT_FOUND") : ok(reply, body);', "return ok(reply, body ?? {});",
     "api", "answers the neutral not-found when the read finds no revision, and never a 200 with an empty body"),
    ("A02 any Idempotency-Key taken for a proposal", API,
     "nothing here echoes a value.\n    const key = request.headers[\"idempotency-key\"];\n    if (typeof key !== \"string\" || !IDEMPOTENCY_KEY.test(key)) {",
     "nothing here echoes a value.\n    const key = request.headers[\"idempotency-key\"];\n    if (typeof key !== \"string\") {",
     "api", "names the Idempotency-Key when it is missing or isn't a UUID, whatever else is wrong"),
    ("A03 any Idempotency-Key taken for a link", API,
     "export function createInvitationHandler(deps: Deps): Handler {\n  return async (request, reply) => {\n    const account = signedIn(request);\n    const key = request.headers[\"idempotency-key\"];\n    if (typeof key !== \"string\" || !IDEMPOTENCY_KEY.test(key)) {",
     "export function createInvitationHandler(deps: Deps): Handler {\n  return async (request, reply) => {\n    const account = signedIn(request);\n    const key = request.headers[\"idempotency-key\"];\n    if (typeof key !== \"string\") {",
     "api", "names the Idempotency-Key when it is missing or isn't a UUID, whatever else is wrong"),
    ("A04 a proposal answered 200", API, "    return created(reply, response);", "    return ok(reply, response);",
     "api", "answers a proposal with 201 and the revision as the command gave it"),
    ("A05 a replay answered with a URL", API, "token === null ? stored : { ...stored, url: invitationUrl(token) }", '{ ...stored, url: invitationUrl(token ?? "again") }',
     "api", "answers a first link with 201 and its URL, a replay without one"),
    ("A06 the token in the query, which reaches the server", API, "return `https://tadayo.app/i#${token}`;", "return `https://tadayo.app/i?t=${token}`;",
     "api", "puts the token in the fragment, which reaches no server"),
    ("A07 a field beyond the contract's", API, "    my_decision: revision.myDecision,", "    my_decision: revision.myDecision,\n    approvals: 1,",
     "api", "field for field"),
    ("A08 a link sent as null where there is none", API, "      ...(candidate.invitation === null\n        ? {}", "      ...(candidate.invitation === null\n        ? { invitation: null }",
     "api", "sends a link's expiry in whole seconds, rounded down, and no link, no avatar and no successor"),
    ("A09 a link's expiry with its fraction", API, "expires_at: contractInstant(candidate.invitation.expiresAt),", "expires_at: candidate.invitation.expiresAt.toString(),",
     "api", "sends a link's expiry in whole seconds, rounded down"),
    ("A10 a proposal's refusal becomes a failure", API,
     "proposeRoster(tx, deps.clock, input, rosterRevisionBody));\n    } catch (error) {\n      if (error instanceof Refused) return refusal(reply, error);\n",
     "proposeRoster(tx, deps.clock, input, rosterRevisionBody));\n    } catch (error) {\n",
     "api", "answers each refusal as the contract's error, with nothing of the request in it"),
    ("A11 proposeRoster takes the app's general body limit", APP, "  proposeRoster: 80 * 1024,\n", "",
     "api", "refuses a body past each route's limit unread, and takes the largest body the contract allows"),
    ("A12 createInvitation takes the app's general body limit", APP, "  createInvitation: 1024,\n", "",
     "api", "refuses a body past each route's limit unread, and takes the largest body the contract allows"),
    ("A13 a revoke answered as live", API, 'state: "revoked" });', 'state: "live" });',
     "api", "answers a revoke with 200 and the link's id"),
    ("A14 a link's body read before nothing: its fields unchecked", API,
     "    const parsed = CreateInvitationRequest.safeParse(request.body);\n    if (!parsed.success) {\n      const field = firstBadField([\"candidate_id\"], parsed.error.issues);\n      return problem(reply, \"INVALID_REQUEST\", field === undefined ? {} : { field });\n    }\n",
     "    const parsed = { data: (request.body ?? {}) as { candidate_id: string } };\n",
     "api", "names a link request's bad candidate, never its value, and reads no database for it"),
    ("A15 a link's stored answer keeps the URL's place: the expiry with its fraction", API, "    expires_at: contractInstant(made.expiresAt),", "    expires_at: made.expiresAt.toString(),",
     "api", "stores the answer without the link, which is the contract's replay"),
    # Against the matrix.
    ("X01 a member of a suspended club reads a revision (anyone who ever had a membership does)", REV, ACTIVE, EVER, "matrix", STAR),
    ("X02 every member is given a candidate's link, in the matrix", REV, "CASE WHEN k.proposed_by_interval_id = am.interval_id THEN", "CASE WHEN true THEN",
     "matrix", STAR),
    ("X03 any member makes a candidate's link, in the matrix", INV, "AND k.state = 'open'\n       AND k.proposed_by_interval_id = ${proposer}`;", "AND k.state = 'open'`;",
     "matrix", STAR),
    ("X04 any member revokes a link, in the matrix", INV, "WHERE i.id = ${invitationId} AND k.proposed_by_interval_id = ${proposer}", "WHERE i.id = ${invitationId}",
     "matrix", STAR),
    ("X05 a retry given a token, in the matrix", INV, "return { answer: first.replay, token: null };", 'return { answer: first.replay, token: randomBytes(32).toString("base64url") };',
     "matrix", STAR),
    ("X06 a field beyond the contract's, in the matrix", API, "    my_decision: revision.myDecision,", "    my_decision: revision.myDecision,\n    approvals: 1,",
     "matrix", STAR),
    ("X07 the hash of the token's bytes, in the matrix", INV, 'createHash("sha256").update(token).digest("hex")', 'createHash("sha256").update(Buffer.from(token, "base64url")).digest("hex")',
     "matrix", STAR),
    ("X08 a retry makes a second revision, in the matrix", PRO, "  if (first !== null) return first.replay;\n", "",
     "matrix", STAR),
    ("X09 the token in the query, in the matrix", API, "return `https://tadayo.app/i#${token}`;", "return `https://tadayo.app/i?t=${token}`;",
     "matrix", STAR),
    ("X10 the proposer's decision given as the caller's, in the matrix", REV, "WHERE a.revision_id = r.id AND a.interval_id = am.interval_id), 'pending')", "WHERE a.revision_id = r.id AND a.interval_id = r.proposed_by_interval_id), 'pending')",
     "matrix", STAR),
    # The matrix's own judges.
    ("J01 a revision not sealed expected", JUDGE, "if (revision === undefined || !revision.sealed) return undefined;", "if (revision === undefined) return undefined;",
     "judge", "is nothing to anyone the revision doesn't list as an active member (FQ119), or of a revision not sealed"),
    ("J02 a revision expected for a member it doesn't list", JUDGE, "|| club === undefined || !revision.members.includes(viewer)) return undefined;", "|| club === undefined) return undefined;",
     "judge", "is nothing to anyone the revision doesn't list as an active member (FQ119), or of a revision not sealed"),
    ("J03 a link expected for every member", JUDGE, "      candidate.proposer === viewer\n        ? [...roster.links.values()]", "      revision.sealed\n        ? [...roster.links.values()]",
     "judge", "shows each member only the link of a candidate that member proposed"),
    ("J04 live at the instant of expiry", JUDGE, "Temporal.Instant.compare(link.expiresAt, now) <= 0", "Temporal.Instant.compare(link.expiresAt, now) < 0",
     "judge", STANDS),
    ("J05 never accepted", JUDGE, '  if (acceptedWith === link.id) return "accepted";\n', "",
     "judge", STANDS),
    ("J06 revoked after expired", JUDGE, '  if (link.revoked) return "revoked";\n  return Temporal.Instant.compare(link.expiresAt, now) <= 0 ? "expired" : "live";',
     '  if (Temporal.Instant.compare(link.expiresAt, now) <= 0) return "expired";\n  return link.revoked ? "revoked" : "live";',
     "judge", STANDS),
    ("J07 any Cache-Control accepted", JUDGE, '    if (answer.headers["cache-control"] !== "private, no-store") return [`${what} without private, no-store`];\n', "",
     "judge", STORED),
    ("J08 any status accepted", JUDGE, "    if (answer.status !== status) return [`status ${String(answer.status)}, not ${String(status)} with ${what}`];\n", "",
     "judge", STORED),
    ("J09 anything accepted for someone the revision isn't for", JUDGE, 'return want === undefined ? pinnedProblems(answer, NEUTRAL) : sameAnswer("the roster revision", 200, want)(answer);', 'return want === undefined ? [] : sameAnswer("the roster revision", 200, want)(answer);',
     "judge", "holds everyone else to the neutral not-found, byte for byte"),
    ("J10 room for a seventh", JUDGE, "return members + roster.openCandidates + count > SIX ? FULL", "return members + roster.openCandidates + count > SIX + 1 ? FULL",
     "judge", "holds the version to the club's first, then six to its members and open candidates"),
    ("J11 open candidates not counted", JUDGE, "return members + roster.openCandidates + count > SIX ? FULL", "return members + count > SIX ? FULL",
     "judge", "holds the version to the club's first, then six to its members and open candidates"),
    ("J12 a proposal expected of anyone", JUDGE, "  if (viewerIn(world, club, account) === undefined || roster === undefined) return NEUTRAL;", "  if (roster === undefined) return NEUTRAL;",
     "judge", "is the neutral not-found to anyone who isn't an active member, whatever the version"),
    ("J13 any member expected to revoke", JUDGE, "  if (viewer === undefined || viewer !== link.proposer) return NEUTRAL;", "  if (viewer === undefined) return NEUTRAL;",
     "judge", "lets only that member revoke it, whatever its state, and never one an account accepted with"),
    ("J14 an accepted link expected revoked", JUDGE, 'return link.bound ? NOT_ALLOWED : "revoked";', 'return "revoked";',
     "judge", "lets only that member revoke it, whatever its state, and never one an account accepted with"),
    ("J15 any member expected to make a link", JUDGE, "  if (listed === undefined || listed.proposer !== viewer) return NEUTRAL;", "  if (listed === undefined) return NEUTRAL;",
     "judge", "lets only the member who proposed the candidate make its link, on the open revision"),
    ("J16 a link expected on a revision no longer open", JUDGE, 'revision.club === club && revision.state === "open");', "revision.club === club);",
     "judge", "lets only the member who proposed the candidate make its link, on the open revision"),
    ("J17 a token its row's hash isn't of", JUDGE, "  else if (createHash(\"sha256\").update(token).digest(\"hex\") !== latest.hash)\n    problems.push(\"the link's token doesn't hash to its row's hash\");\n", "",
     "judge", BAD_URL),
    ("J18 a URL on any host", JUDGE, "const token = " + LINK_RE, "const token = /#([A-Za-z0-9_-]{43})$/",
     "judge", BAD_URL),
    ("J19 eight days", JUDGE, "const LINK_DAYS = 7;", "const LINK_DAYS = 8;",
     "judge", "passes the candidate's latest link, seven days from the second it was made in"),
    ("J20 a row that expires at another instant", JUDGE, "  if (second(latest.expiresAt) !== expires) problems.push(\"the link's row expires at another instant than its answer\");\n", "",
     "judge", "refuses another link, candidate or expiry, a row that expires at another instant"),
    ("J21 the retry under a key of its own", JUDGE, '{ name: "the same request again under its key", body: good, key, expected: "replay" },', '{ name: "the same request again under its key", body: good, key: fresh(), expected: "replay" },',
     "judge", "sends what the contract refuses, a stale version, the proposal, its retry and another body under its key"),
    ("J22 revokeInvitation not judged", JUDGE, '  "revokeInvitation",\n]);', "]);",
     "judge", "judges the four routes of the roster"),
    ("J23 a retry's link compared with nothing", JUDGE, "return canonical(now) === canonical(rest) ? [] :", "return canonical(now) !== undefined ? [] :",
     "judge", "holds a retry to the first answer without its url, and nothing else"),
    ("J24 a link any Cache-Control", JUDGE, '  if (answer.headers["cache-control"] !== "private, no-store") problems.push("a link without private, no-store");\n', "",
     "judge", "refuses another link, candidate or expiry, a row that expires at another instant, and an answer that may be stored"),
    # The leak scanner's rule for a link.
    ("N01 a link's id passed to anyone", SCAN, "if (!context.viewer.intervals.has(invitation.proposedBy) || proposer?.leftAt !== null) {", "if (invitation === undefined) {",
     "scanner", ELSE),
    ("N02 a link's id passed to the former member who made it", SCAN, "if (!context.viewer.intervals.has(invitation.proposedBy) || proposer?.leftAt !== null) {", "if (!context.viewer.intervals.has(invitation.proposedBy)) {",
     "scanner", ELSE),
    ("N03 a suspended club's link passed", SCAN, 'if (world.clubs.get(invitation.club)?.suspendedAt !== null || account?.state !== "active") {', 'if (account?.state !== "active") {',
     "scanner", "catches a link of a suspended club, and one shown to an account that isn't active"),
    ("N04 a link passed to an account that isn't active", SCAN, 'if (world.clubs.get(invitation.club)?.suspendedAt !== null || account?.state !== "active") {', "if (world.clubs.get(invitation.club)?.suspendedAt !== null) {",
     "scanner", "catches a link of a suspended club, and one shown to an account that isn't active"),
    ("N05 a link passed beside another candidate", SCAN, "if (invitation !== undefined && invitation.candidate !== node.id)", "if (invitation === undefined && node.id === undefined)",
     "scanner", "catches a link beside a candidate it isn't for, though the viewer proposed both"),
    ("N06 a link's URL passed in any answer", SCAN, 'if (operation.id !== "createInvitation" || answer.status !== 201)', "if (answer.status === 0)",
     "scanner", URLS),
    ("N07 a URL passed whose token isn't the link's", SCAN, 'else if (createHash("sha256").update(token).digest("hex") !== invitation.tokenSha256)', "else if (token.length === 0)",
     "scanner", URLS),
    ("N08 a URL passed on any host", SCAN, "const LINK_URL = " + LINK_RE + ";", "const LINK_URL = /#([A-Za-z0-9_-]{43})$/;",
     "scanner", URLS),
    ("N09 every url key passed", SCAN, '!== "HighlightPointer" && !ownLinkUrls.has(path))', '!== "HighlightPointer" && !path.endsWith(".url"))',
     "scanner", "catches"),
    ("N10 a revoked link's id not judged as a link", SCAN, '    if (kind === "RevokedInvitation") proposersLink(node.invitation_id, `${at}.invitation_id`);\n', "",
     "scanner", "the link's id"),
    ("N11 a candidate's link's id not judged as a link", SCAN, '    if (kind === "CandidateInvitation") proposersLink(node.id, `${at}.id`);\n', "",
     "scanner", "the link's id"),
    ("N12 a link passed with another candidate's id", SCAN, "if (invitation !== undefined && node.candidate_id !== invitation.candidate)", "if (invitation === undefined && node.candidate_id === undefined)",
     "scanner", "catches"),
    ("N13 a link in a URL's place passed anywhere", SCAN, "      if (!ownLinkUrls.has(at)) noLinks(value, at);", "      if (!at.endsWith(\".url\")) noLinks(value, at);",
     "scanner", "catches"),
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
