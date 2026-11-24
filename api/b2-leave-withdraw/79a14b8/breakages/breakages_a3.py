"""Deliberate breakages of the outside audit's A3 fix on PR #121 (api/b2-leave-withdraw): a leave with withdraw
withdraws the leaving membership's drops in its transaction, and every leave gives back its live reservations.
Written for the set-based statements of the second commit (round 1 of the review); L20 and L21 came with it.
The third commit (round 2) finds the highlights from the interval's drops: L11's anchor follows it. Every
vitest run passes --fsModuleCache=false, so no transformed module is reused between breakages.

For each: change the one place, run the suite registered for it, and check that a test whose name holds the
pre-registered words fails. The file is restored after each. Run in a detached scratch worktree of the PR's last
head, never in the branch's own worktree; nothing else may use the database meanwhile.

  breakages_a3.py --check        count every anchor, change nothing
  breakages_a3.py L01 L02 ...    only these
"""

import difflib
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get("BREAK_ROOT", "/home/user/tadayo-a3-brk"))
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(os.environ.get("BREAK_OUT", SP + "/a3/brk"))
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
LEAVE = "packages/domain/src/clubs/leave-club.ts"

V = ["npx", "vitest", "run", "--fsModuleCache=false"]
SUITES = {
    "lw": ("tests", [*V, "--config", "vitest.db.config.ts", "src/db/leave-withdraw.test.ts"]),
    # One role's whole sweep, its leaves judged by contributionProblems (about two minutes).
    "matrix": (
        "tests",
        [*V, "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts", "-t",
         "answers the member in the audience as its account"],
    ),
}

T_AUDIT = "withdraws Ben's photo and link before the reveal: one leave removal each, the slots given back, and no read"
T_AFTER = "withdraws a drop in the opened day too, and gives back no slot after the reveal (T3, T18)"
T_REVEAL = "withdraws at the reveal's very instant as after it: no slot back, Ben's highlight cleared after the drop's end"
T_KEEP = "keeps Ben's drops for those who stay when Ben chooses keep, as before"
T_HELD = "withdraws a held drop as well, clears Ben's highlight on a withdrawn one, and lets its pending replacement go"
T_OWN = "withdraws Ana's own drops on her Saturday, which her leave holds, and leaves Ben's drop for that day as it was"
T_EVERY = "withdraws Ben's drops in every day of the club, and nobody else's, nor Ben's in another club"
T_EARLIER = "leaves a drop Ben kept under an earlier membership of the club as it was (FQ142's default)"
T_SLOTS_KEEP = "releases Ben's live slots at the leave with keep, settles a lapsed one as expired, and leaves a used one"
T_SLOTS_WD = "releases Ben's live slots at the leave with withdraw, settles a lapsed one as expired, and leaves a used one"
T_MATRIX = "answers the member in the audience as its account and its row say, and leaks nothing the scanner can find"

SKIP = '  if (contributions !== "withdraw") return;\n'
INS_FROM = "SELECT d.id, 'leave', ${interval}, ${at}::pg_catalog.timestamptz\n      FROM app.drops d\n     WHERE d.author_interval_id = ${interval} AND d.state IN ('active', 'held')`;"
UPD_WHERE = "     WHERE author_interval_id = ${interval} AND state IN ('active', 'held')`;"
FREE = '    for (const slot of live) await freeSlot(tx, day, text(slot["id"]), at);\n'
BEFORE = "AND o.reveal_at > ${at}::pg_catalog.timestamptz"
SETTLE = "    await settleLapsed(tx, day, at);\n"
EXTERNAL = "FILTER (WHERE d.media_class = 'external_video')"
HIGHLIGHT_WHERE = "     WHERE d.author_interval_id = ${interval} AND h.drop_id = d.id AND h.interval_id = ${interval}"


def ins(extra, actor="${interval}", who="d.author_interval_id = ${interval}"):
    return (
        "SELECT d.id, 'leave', " + actor + ", ${at}::pg_catalog.timestamptz\n      FROM app.drops d\n     WHERE "
        + who + " AND d.state IN ('active', 'held')" + extra + "`;"
    )


def upd(extra, who="author_interval_id = ${interval}"):
    return "     WHERE " + who + " AND state IN ('active', 'held')" + extra + "`;"


def highlight_first(text):
    a = text.index("  await bound(tx)`\n    UPDATE app.drops\n")
    b = text.index("  // The drops this leave withdrew")
    c = text.index("  // Before its day's reveal, its slot given back")
    return text[:a] + text[b:c] + text[a:b] + text[c:]


REVEALED = " AND EXISTS (SELECT FROM app.occurrences o WHERE o.id = {d}occurrence_id AND o.reveal_at <= ${{at}})"
UNREVEALED = " AND EXISTS (SELECT FROM app.occurrences o WHERE o.id = {d}occurrence_id AND o.reveal_at > ${{at}})"
NOT_OWN = " AND NOT EXISTS (SELECT FROM app.occurrences oo WHERE oo.id = {d}occurrence_id AND oo.star_interval_id = ${{interval}})"
SAME_ACCOUNT = (
    "{d}author_interval_id IN (SELECT e.interval_id FROM app.memberships e WHERE e.club_id = ${{club}}"
    " AND e.user_id = (SELECT f.user_id FROM app.memberships f WHERE f.interval_id = ${{interval}}))"
)

# Each: (name, path, [(old, new) or a function of the text], suite, words).
B = [
    ("L01 the withdrawal skipped", LEAVE, [(SKIP, "  return;\n")], "lw", T_AUDIT),
    ("L02 the withdrawal skipped, seen by the matrix's judge", LEAVE, [(SKIP, "  return;\n")], "matrix", T_MATRIX),
    ("L03 withdraw on keep too", LEAVE, [(SKIP, "")], "lw", T_KEEP),
    ("L04 only revealed drops withdrawn", LEAVE,
     [(INS_FROM, ins(REVEALED.format(d="d."))), (UPD_WHERE, upd(REVEALED.format(d="app.drops.")))], "lw", T_AUDIT),
    ("L05 only unrevealed drops withdrawn", LEAVE,
     [(INS_FROM, ins(UNREVEALED.format(d="d."))), (UPD_WHERE, upd(UNREVEALED.format(d="app.drops.")))], "lw", T_AFTER),
    ("L06 a held drop left", LEAVE,
     [(INS_FROM, INS_FROM.replace("IN ('active', 'held')", "= 'active'")),
      (UPD_WHERE, UPD_WHERE.replace("IN ('active', 'held')", "= 'active'"))], "lw", T_HELD),
    ("L07 the removal's reason another", LEAVE,
     [(INS_FROM, INS_FROM.replace("SELECT d.id, 'leave',", "SELECT d.id, 'withdraw',"))], "lw", T_AUDIT),
    ("L08 the slot given back after the reveal too", LEAVE, [(BEFORE, "")], "lw", T_AFTER),
    ("L09 the slot not given back before the reveal", LEAVE, [(BEFORE, "AND false")], "lw", T_AUDIT),
    ("L10 a link's slot not given back as a link's", LEAVE, [(EXTERNAL, "FILTER (WHERE false)")], "lw", T_AUDIT),
    ("L11 the highlight left on the withdrawn drop", LEAVE,
     [(HIGHLIGHT_WHERE, HIGHLIGHT_WHERE.replace("WHERE d.author_interval_id", "WHERE false AND d.author_interval_id"))], "lw", T_HELD),
    ("L12 the pending replacement kept", LEAVE, [(", pending_upload_id = NULL", "")], "lw", T_HELD),
    ("L13 reservations left live on keep", LEAVE,
     [(FREE, '    if (contributions === "withdraw") for (const slot of live) await freeSlot(tx, day, text(slot["id"]), at);\n')],
     "lw", T_SLOTS_KEEP),
    ("L14 reservations left live on withdraw", LEAVE,
     [(FREE, '    if (contributions === "keep") for (const slot of live) await freeSlot(tx, day, text(slot["id"]), at);\n')],
     "lw", T_SLOTS_WD),
    ("L15 a lapsed reservation released instead of expired, seen by the matrix's judge", LEAVE, [(SETTLE, "")],
     "matrix", T_MATRIX),
    ("L16 a lapsed reservation released instead of expired", LEAVE, [(SETTLE, "")], "lw", T_SLOTS_KEEP),
    ("L17 every drop of the club withdrawn", LEAVE,
     [(INS_FROM, ins("", actor="d.author_interval_id", who="d.club_id = ${club}")),
      (UPD_WHERE, upd("", who="club_id = ${club}"))], "lw", T_EVERY),
    ("L18 the leaver's own held day left", LEAVE,
     [(INS_FROM, ins(NOT_OWN.format(d="d."))), (UPD_WHERE, upd(NOT_OWN.format(d="app.drops.")))], "lw", T_OWN),
    ("L19 the earlier interval's kept drops withdrawn too", LEAVE,
     [(INS_FROM, ins("", actor="d.author_interval_id", who=SAME_ACCOUNT.format(d="d."))),
      (UPD_WHERE, upd("", who=SAME_ACCOUNT.format(d="")))], "lw", T_EARLIER),
    ("L20 the highlight cleared before the drop's end", LEAVE, [highlight_first], "lw", T_REVEAL),
    ("L21 the slot given back at the reveal's very instant", LEAVE,
     [(BEFORE, "AND o.reveal_at >= ${at}::pg_catalog.timestamptz")], "lw", T_REVEAL),
]

def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


def swap(text, old, new):
    assert text.count(old) == 1, (old[:70], text.count(old))
    return text.replace(old, new)


def apply(text, changes):
    for change in changes:
        text = change(text) if callable(change) else swap(text, *change)
    return text


def main():
    args = sys.argv[1:]
    codes = [name.split()[0] for name, *_ in B]
    assert len(set(codes)) == len(codes), "a code used twice"
    if args == ["--check"]:
        bad = 0
        for name, path, changes, suite, words in B:
            text = (ROOT / path).read_text()
            try:
                ok = apply(text, changes) != text and suite in SUITES and len(words) > 6
            except AssertionError as e:
                ok = False
                print("  ", e)
            if not ok:
                bad += 1
                print("BAD", name)
        print(len(B), "entries,", bad, "bad")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for name, path, changes, suite, words in B:
        code = name.split()[0]
        if args and code not in args:
            continue
        p = ROOT / path
        orig = p.read_text()
        try:
            broken = apply(orig, changes)
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
