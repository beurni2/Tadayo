"""Deliberate breakages of step (w), the commit (api/b2-spike-commit): docs/plans/api-b2-spike-commit.md section 5,
and the judge's own (tests/src/privacy/drop.ts). Built from the worker hardening's runner (v2brk1).

For each: change the one place, run the suite registered for it, and check that a test whose name holds the
pre-registered words fails. The file is restored after each. Nothing else may use the local database meanwhile.

  breakages.py --check        count every anchor, change nothing
  breakages.py C01 J02 ...    only these
"""

import difflib
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get("BREAK_ROOT", "/home/user/tadayo-commit"))
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(os.environ.get("BREAK_OUT", SP + "/wbrk/out"))
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
COMMIT = "packages/domain/src/drops/commit.ts"
ROUTE = "services/api/src/drops/drops.ts"
JUDGE = "tests/src/privacy/drop.ts"
OWNS = "packages/domain/src/authorization/upload.ts"

DB = ["npx", "vitest", "run", "--config", "vitest.db.config.ts"]
V = ["npx", "vitest", "run"]
SUITES = {
    "db": ("tests", [*DB, "src/db/create-drop.test.ts"]),
    "route": ("services/api", [*V, "src/drops/drops.test.ts"]),
    "pure": ("packages/domain", [*V, "src/drops/commit.test.ts"]),
    "judge": ("tests", [*V, "src/privacy/drop.test.ts"]),
    "matrix": ("tests", ["npx", "vitest", "run", "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts"]),
}

B = [
    # The command (plan section 5).
    ("C01 the clock sampled before the locks", COMMIT,
     "  const at = await clock.sample(tx);", "  const at = first;", "db",
     "waits for the counter's row, and reads the clock after it"),
    ("C02 the counter's lock dropped", COMMIT,
     "  await lockCounter(tx, key);\n", "", "db",
     "makes the second wait for the first's commit, then sees its drop"),
    ("C03 the upload's day not checked", COMMIT,
     "slotSeen !== null && slotSeen.day === key.day && slotSeen.interval", "slotSeen !== null && slotSeen.interval",
     "db", "moves nothing: an upload made for another day, or a reservation_id naming another slot"),
    ("C04 reservation_id not compared", COMMIT,
     " ||\n    (input.reservationId !== undefined && input.reservationId !== slotId)", "", "db",
     "moves nothing: an upload made for another day, or a reservation_id naming another slot"),
    ("C05 ownsUpload's lapse not checked", OWNS,
     "upload.owner === userId && Temporal.Instant.compare(now, upload.expiresAt) < 0", "upload.owner === userId",
     "db", "gives the neutral not-found for an upload that has lapsed, 24 hours after it began"),
    ("C06 a preparing upload taken", COMMIT,
     'if (upload.state !== "ready") throw', 'if (upload.state !== "ready" && upload.state !== "preparing") throw',
     "db", "answers MEDIA_NOT_READY for a pending, a preparing, a held and a rejected upload"),
    ("C07 the duplicate not checked", COMMIT,
     'if (typeof existing === "string") throw', 'if (typeof existing === "number") throw', "db",
     "refuses the same photo under a second slot with DUPLICATE_DROP and the first drop"),
    ("C08 the lapsed slot not settled", COMMIT,
     "const before = await settleLapsed(tx, key, at);",
     "const before = await settleLapsed(tx, key, at.subtract({ hours: 1000 }));", "db",
     "takes a free slot for a photo whose slot lapsed, the reservation left as it ended"),
    ("C09 a consumed slot also counted as a free one", COMMIT,
     "const row = live ? await consumeSlot(tx, key, slotId, dropId, at) : await takeSlot",
     "const row = live ? (await consumeSlot(tx, key, slotId, dropId, at), await takeSlot(tx, key, \"photo\")) : await takeSlot",
     "db", "adds Ben's photo: the receipt, the slot consumed, the counts, the drop"),
    ("C10 the limits not checked for an ended slot", COMMIT,
     "  if (!live) {", "  if (!live && live) {", "db",
     "refuses Ben's third photo with PHOTO_LIMIT, his own allowance and Ana's next day"),
    ("C11 the audience without the active filter", COMMIT,
     "WHERE m.club_id = ${key.club} AND m.state = 'active'", "WHERE m.club_id = ${key.club}", "db",
     "leaves out a member who left before, and Home at 07:00 shows the drop to its audience"),
    ("C12 the seal left out", COMMIT,
     "  await bound(tx)`UPDATE app.drops SET audience_sealed_at = ${at}::pg_catalog.timestamptz WHERE id = ${dropId}`;\n",
     "", "db", "adds Ben's photo: the receipt, the slot consumed, the counts, the drop"),
    ("C13 the receipt's allowance read before the write", COMMIT,
     "    allowance: allowanceOf(row, outcome.isStar),", "    allowance: allowanceOf(before, outcome.isStar),", "db",
     "adds Ben's photo: the receipt, the slot consumed, the counts, the drop"),
    ("C14 the held day not refused", COMMIT,
     '  if (outcome.kind === "held") throw new Refused("MEMBERSHIP_CHANGED");\n', "", "db",
     "answers MEMBERSHIP_CHANGED, with no facts, for a day whose star has left"),
    ("C17 a retry answers the receipt as kept, the star not named again", COMMIT,
     "    return withStar(stored.replay, render.star(star));", "    return stored.replay;", "db",
     "names the day's star in a retry as members see them then, and keeps no name in the receipt"),
    ("C18 the receipt keeps the star's name", COMMIT,
     "    withStar(body, { membership_id: outcome.target.star.membershipId }),", "    body,", "db",
     "names the day's star in a retry as members see them then, and keeps no name in the receipt"),
    ("C19 a retry with no star to name answers the receipt as kept", COMMIT,
     '    if (star === null) throw new Refused("MEMBERSHIP_CHANGED");', "    if (star === null) return stored.replay;",
     "db", "answers a retry MEMBERSHIP_CHANGED once the day's star has no name left to show"),
    ("C16 an upload another drop used taken", COMMIT,
     "  if ((await bound(tx)`SELECT 1 AS used FROM app.drops WHERE upload_id = ${uploadId}`).length > 0) {",
     "  if ((await bound(tx)`SELECT 1 AS used FROM app.drops WHERE upload_id = ${uploadId}`).length > 99) {", "db",
     "counts a held drop as the same photo, and not a withdrawn one, whose own upload is then not found"),
    # The route and the pure checks.
    ("R01 the key's form not checked", ROUTE,
     'if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {', 'if (typeof key !== "string") {', "route",
     "names the Idempotency-Key when it is missing or isn't a UUID"),
    ("R02 the serializer adds the caller's own drop to the highlight", ROUTE,
     "...(receipt.highlight.dropId === null ? {} : { drop_id: receipt.highlight.dropId }),",
     "drop_id: receipt.highlight.dropId ?? receipt.dropId,", "route",
     "makes it field for field, and no other"),
    ("P01 an empty caption kept", COMMIT,
     'return caption === undefined || caption === "" ? null : caption;',
     "return caption === undefined ? null : caption;", "pure",
     "keeps none for an absent or empty caption, and any other caption as it came"),
    ("P02 a day id that can't be one asks the database", COMMIT,
     '  if (!ID.test(occurrenceId)) throw new Refused("NOT_FOUND");\n', "", "pure",
     "names no day for an id that can't be one, the neutral not-found, asking the database nothing"),
    # The judge (tests/src/privacy/drop.ts).
    ("J01 the judge counts a withdrawn drop as a duplicate", JUDGE,
     '(drop.state === "active" || drop.state === "held") &&', 'drop.state !== "removed" &&', "judge",
     "answers DUPLICATE_DROP with the caller's earliest active or held drop of the same photo in the day"),
    ("J02 the judge picks a duplicate by id alone", JUDGE,
     "return Temporal.Instant.compare(at(a), at(b)) || byBytes(a, b);", "return byBytes(a, b) || at(a).epochNanoseconds.toString().length;",
     "judge", "answers DUPLICATE_DROP with the caller's earliest active or held drop of the same photo in the day"),
    ("J03 the judge doesn't compare reservation_id", JUDGE,
     " ||\n    (ask.reservation !== undefined && ask.reservation !== slotId)", "", "judge",
     "gives the neutral not-found unless the upload is the caller's own live photo"),
    ("J04 the judge's audience takes members who left", JUDGE,
     ".filter(([, member]) => member.club === club && member.leftAt === null)",
     ".filter(([, member]) => member.club === club)", "judge",
     "holds the rows of a drop added: one drop of the caller's"),
    ("J05 the judge lets anyone's lapsed slot be settled", JUDGE,
     "      was.interval === outcome.interval &&\n", "", "judge",
     "holds the slot consumed by the drop when live, and nothing else changed but the caller's own lapsed slots"),
    ("J06 the judge forgets QUOTA_FULL", JUDGE,
     "      allowance.added + allowance.reserved >= allowance.limit\n", "      false\n", "judge",
     "takes a free slot for an ended one, or refuses QUOTA_FULL, then PHOTO_LIMIT"),
    ("J07 the judge's receipt ignores the highlight", JUDGE,
     "        pointer === undefined\n          ? { version: 0 }", "        pointer !== null\n          ? { version: 0 }",
     "judge", "takes the receipt of the drop added, with the caller's allowance and highlight as they stand"),
    ("J08 the judge's unchanged rows ignore highlights", JUDGE,
     '    ...(highlightsSeen(after.rows) === highlightsSeen(previous.rows) ? [] : ["a highlight changed"]),\n', "",
     "judge", "holds that a refusal, a retry and another body under a key make and change nothing"),
    ("J09 the judge takes an upload another drop used", JUDGE,
     "  if ([...rows.drops.values()].some((drop) => drop.upload === uploadId))",
     "  if ([...rows.drops.values()].some((drop) => drop.upload === uploadId && drop.upload === null))", "judge",
     "gives the neutral not-found for an upload another drop already used"),
    ("J10 the judge takes a photo not ready", JUDGE,
     '  if (upload.state !== "ready") return', '  if (upload.state === "pending") return', "judge",
     "answers MEDIA_NOT_READY to the caller's own upload until it is ready"),
    ("J11 the judge lets a link through after the reveal", JUDGE,
     "  if (!before(now, theDay.revealAt))\n    return { kind: \"refused\", code: \"OCCURRENCE_CLOSED\"",
     "  if (ask.media.kind === \"photo\" && !before(now, theDay.revealAt))\n    return { kind: \"refused\", code: \"OCCURRENCE_CLOSED\"",
     "judge", "refuses from the reveal on with the day as it is then and the star's next day, whatever the body names"),
    ("J12 the judge's added rows ignore the dedupe key", JUDGE,
     "      dedupe: previous.rows.hashes.get(outcome.upload) ?? null,\n      submittedAt: outcome.now.toString(),",
     "      dedupe: row?.dedupe ?? null,\n      submittedAt: outcome.now.toString(),", "judge",
     "holds the rows of a drop added: one drop of the caller's"),
    ("J13 the judge's retry ignores the star as they are now", JUDGE,
     '  return said({ ...first, body: JSON.stringify({ ...body, occurrence: { ...body["occurrence"], star } }) });',
     "  return said(first);", "judge", "names a renamed star as members see them now"),
    ("J14 the judge's retry names a star with no name", JUDGE,
     '  if (!isObject(star) || typeof star["display_name"] !== "string") return MEMBERSHIP_CHANGED;',
     "  if (!isObject(star)) return MEMBERSHIP_CHANGED;", "judge",
     "is MEMBERSHIP_CHANGED once the star has no name left to show"),
    # Through the matrix (each a full run of matrix.test.ts, about ten minutes).
    ("M01 the audience without the active filter, through the matrix", COMMIT,
     "WHERE m.club_id = ${key.club} AND m.state = 'active'", "WHERE m.club_id = ${key.club}", "matrix",
     "answers the rejoined member, a new interval (T8) as its account and its row say"),
    ("M02 the route's receipt carrying the caption, through the matrix", ROUTE,
     "createDrop(tx, deps.clock, input, dropRender)",
     "createDrop(tx, deps.clock, input, { ...dropRender, receipt: (made) => ({ ...(dropReceiptBody(made) as object), caption: input.caption ?? null }) })",
     "matrix", "answers the author as its account and its row say"),
    ("M03 a retry answers the receipt as kept, through the matrix", COMMIT,
     "    return withStar(stored.replay, render.star(star));", "    return stored.replay;", "matrix",
     "answers the star as its account and its row say"),
]


def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


def swap(text, old, new):
    assert text.count(old) == 1, (old[:70], text.count(old))
    return text.replace(old, new)


def main():
    args = sys.argv[1:]
    codes = [name.split()[0] for name, *_ in B]
    assert len(set(codes)) == len(codes), "a code used twice"
    if args == ["--check"]:
        bad = 0
        for name, path, old, new, suite, words in B:
            text = (ROOT / path).read_text()
            try:
                ok = swap(text, old, new) != text and suite in SUITES and len(words) > 6
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
            broken = swap(orig, old, new)
            p.write_text(broken)
            (OUT / f"{code}.patch").write_text(
                "".join(difflib.unified_diff(orig.splitlines(True), broken.splitlines(True), f"a/{path}", f"b/{path}"))
            )
            cwd, cmd = SUITES[suite]
            r = run(cmd, cwd=ROOT / cwd)
            out = r.stdout + r.stderr
            (OUT / f"{code}.txt").write_text(out)
            failed = sorted({l.strip()[2:].strip()[:260] for l in out.splitlines() if l.strip().startswith("×")})
            summary = [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")]
            caught = any(words[:105] in f for f in failed)
            verdict = "CAUGHT" if caught else ("CAUGHT BY ANOTHER TEST" if failed else ("NO RESULT" if not summary else "NOT CAUGHT"))
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
